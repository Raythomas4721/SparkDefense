import { BATTLE_RULES } from '../data/battle';
import { ENEMIES } from '../data/enemies';
import { HERO_RULES } from '../data/heroes';
import { TOWERS } from '../data/towers';
import type { BattleEvent, BattleState, EnemyInstance, HeroInstance, SoldierInstance, TowerInstance, Vec2 } from '../types';
import { hitEnemy } from './elements';
import { distance, getPath, nearestOnPath, tangentAt } from './path';
import { allocateId, enemyPosition, findEnemy, findTower } from './state';

// 阻擋規則（DESIGN.md §5.3）。阻擋者包含兵營的士兵與英雄：
// - 敵人走到阻擋者 blockRadius 內，會被一名空閒的阻擋者擋下並停住
// - 每名阻擋者同時只擋 1 名敵人；被擋住的敵人會攻擊阻擋者
// - 阻擋者陣亡後，被擋住的敵人繼續前進
// - 飛行敵人不會被擋住

type Blocker = SoldierInstance | HeroInstance;

function findBlocker(state: BattleState, id: number): Blocker | undefined {
  if (state.hero?.id === id) return state.hero;
  return state.soldiers.find((s) => s.id === id);
}

/** 阻擋者用來判斷「敵人是否走到面前」的位置 */
function blockerAnchor(blocker: Blocker): Vec2 {
  return 'home' in blocker ? blocker.home : blocker.pos;
}

/** 英雄移動中不阻擋 */
function canBlock(blocker: Blocker): boolean {
  return blocker.alive && blocker.engagedEnemyId === null && !('moveTarget' in blocker && blocker.moveTarget);
}

export function releaseBlockedBy(state: BattleState, blockerId: number): void {
  for (const enemy of state.enemies) if (enemy.blockedBy === blockerId) enemy.blockedBy = null;
}

export function updateBlocking(state: BattleState, dt: number, events: BattleEvent[]): void {
  respawnSoldiers(state, dt);
  clearStaleEngagements(state);
  engageEnemies(state);
  soldiersAttack(state, dt, events);
  enemiesAttack(state, dt, events);
}

function respawnSoldiers(state: BattleState, dt: number): void {
  for (const soldier of state.soldiers) {
    if (soldier.alive) continue;
    soldier.respawn -= dt;
    if (soldier.respawn > 1e-9) continue;
    soldier.alive = true;
    soldier.hp = soldier.maxHp;
    soldier.cooldown = 0;
    soldier.engagedEnemyId = null;
  }
}

/** 清掉已經不成立的阻擋關係（任一方死亡、英雄開始移動等） */
function clearStaleEngagements(state: BattleState): void {
  for (const enemy of state.enemies) {
    if (enemy.blockedBy === null) continue;
    const blocker = findBlocker(state, enemy.blockedBy);
    if (!blocker || !blocker.alive || blocker.engagedEnemyId !== enemy.id || enemy.hp <= 0) enemy.blockedBy = null;
  }
  const blockers: Blocker[] = [...state.soldiers, ...(state.hero ? [state.hero] : [])];
  for (const blocker of blockers) {
    if (blocker.engagedEnemyId === null) continue;
    const enemy = findEnemy(state, blocker.engagedEnemyId);
    if (!blocker.alive || !enemy || enemy.blockedBy !== blocker.id) blocker.engagedEnemyId = null;
  }
}

function engageEnemies(state: BattleState): void {
  const blockers: Blocker[] = [...state.soldiers, ...(state.hero ? [state.hero] : [])];
  for (const blocker of blockers) {
    if (!canBlock(blocker)) continue;
    const anchor = blockerAnchor(blocker);
    let best: EnemyInstance | undefined;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || enemy.blockedBy !== null || ENEMIES[enemy.type].tags.includes('flying')) continue;
      if (distance(anchor, enemyPosition(state, enemy)) > BATTLE_RULES.blockRadius) continue;
      if (!best || enemy.distance > best.distance) best = enemy;
    }
    if (best) {
      best.blockedBy = blocker.id;
      blocker.engagedEnemyId = best.id;
    }
  }
}

function soldiersAttack(state: BattleState, dt: number, events: BattleEvent[]): void {
  for (const soldier of state.soldiers) {
    if (!soldier.alive) continue;
    soldier.cooldown = Math.max(0, soldier.cooldown - dt);
    if (soldier.engagedEnemyId === null || soldier.cooldown > 1e-6) continue;
    const enemy = findEnemy(state, soldier.engagedEnemyId);
    const tower = findTower(state, soldier.towerId);
    if (!enemy || !tower) continue;
    const stats = TOWERS.barracks.tiers[tower.tier];
    hitEnemy(state, enemy, { damage: stats.damage, damageType: 'physical', element: null, sourceId: tower.id }, events);
    soldier.cooldown = stats.interval;
  }
}

function enemiesAttack(state: BattleState, dt: number, events: BattleEvent[]): void {
  for (const enemy of state.enemies) {
    const attack = ENEMIES[enemy.type].attack;
    if (enemy.hp <= 0 || enemy.blockedBy === null || !attack) continue;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    if (enemy.attackCooldown > 1e-6) continue;
    const blocker = findBlocker(state, enemy.blockedBy);
    if (!blocker) continue;
    blocker.hp -= Math.max(BATTLE_RULES.minPhysicalDamage, attack.damage - blocker.armor);
    enemy.attackCooldown = attack.interval;
    if (blocker.hp <= 0) killBlocker(state, blocker, events);
  }
}

function killBlocker(state: BattleState, blocker: Blocker, events: BattleEvent[]): void {
  blocker.hp = 0;
  blocker.alive = false;
  blocker.engagedEnemyId = null;
  releaseBlockedBy(state, blocker.id);
  if ('towerId' in blocker) {
    blocker.respawn = TOWERS.barracks.soldier!.respawn;
    events.push({ type: 'soldierDied', soldierId: blocker.id });
  } else {
    blocker.respawn = HERO_RULES.respawn;
    blocker.moveTarget = null;
    events.push({ type: 'heroDied' });
  }
}

// ── 兵營的士兵 ─────────────────────────────────────────

/** 兵營預設的集結點：離塔位最近的路線位置 */
export function defaultRally(state: BattleState, slotPos: Vec2): Vec2 {
  return nearestOnPath(getPath(state.mapId), slotPos).pos;
}

/** 士兵在集結點附近的站位：沿路線前後錯開 */
function soldierHome(state: BattleState, rally: Vec2, index: number): Vec2 {
  const path = getPath(state.mapId);
  const dir = tangentAt(path, nearestOnPath(path, rally).along);
  const along = [0, -16, 16, -32][index] ?? 0;
  const side = [0, 8, -8, 0][index] ?? 0;
  return { x: rally.x + dir.x * along - dir.y * side, y: rally.y + dir.y * along + dir.x * side };
}

export function createSoldiers(state: BattleState, tower: TowerInstance): void {
  const spec = TOWERS.barracks.soldier!;
  for (let index = 0; index < spec.count; index++) {
    state.soldiers.push({
      id: allocateId(state),
      towerId: tower.id,
      index,
      hp: spec.hp[tower.tier],
      maxHp: spec.hp[tower.tier],
      armor: spec.armor[tower.tier],
      alive: true,
      respawn: 0,
      home: soldierHome(state, tower.rally!, index),
      cooldown: 0,
      engagedEnemyId: null,
    });
  }
}

/** 升階後套用新數值；活著的士兵補滿血 */
export function refreshSoldiers(state: BattleState, tower: TowerInstance): void {
  const spec = TOWERS.barracks.soldier!;
  for (const soldier of state.soldiers) {
    if (soldier.towerId !== tower.id) continue;
    soldier.maxHp = spec.hp[tower.tier];
    soldier.armor = spec.armor[tower.tier];
    if (soldier.alive) soldier.hp = soldier.maxHp;
  }
}

/** 集結點改變：士兵回到新位置，原本擋住的敵人放行 */
export function moveSoldiers(state: BattleState, tower: TowerInstance): void {
  for (const soldier of state.soldiers) {
    if (soldier.towerId !== tower.id) continue;
    soldier.home = soldierHome(state, tower.rally!, soldier.index);
    soldier.engagedEnemyId = null;
    releaseBlockedBy(state, soldier.id);
  }
}

export function removeSoldiers(state: BattleState, towerId: number): void {
  for (const soldier of state.soldiers) if (soldier.towerId === towerId) releaseBlockedBy(state, soldier.id);
  state.soldiers = state.soldiers.filter((s) => s.towerId !== towerId);
}
