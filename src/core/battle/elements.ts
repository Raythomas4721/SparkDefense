import { ENEMIES } from '../data/enemies';
import { MARK_RULES, REACTION_RULES, reactionBetween } from '../data/elements';
import type { BattleEvent, BattleState, Element, EnemyInstance, HitExtras, Vec2 } from '../types';
import { damageEnemy } from './damage';
import { distance } from './path';
import { enemyPosition } from './state';

/** 一次命中的內容 */
export interface Hit extends HitExtras {
  damage: number;
  damageType: 'physical' | 'magic';
  element: Element | null;
  /** 傷害來源（塔或英雄） */
  sourceId: number;
}

/**
 * 命中敵人：先處理元素（附加印記或觸發反應），再造成傷害。回傳是否擊殺。
 * 敵人身上已有不同元素的印記時觸發反應；反應會消耗舊印記，這次命中不會留下新印記。
 */
export function hitEnemy(state: BattleState, enemy: EnemyInstance, hit: Hit, events: BattleEvent[]): boolean {
  if (enemy.hp <= 0) return false;
  let damage = hit.damage;
  let damageType = hit.damageType;
  let wildfire = false;
  const wasBurning = enemy.mark?.element === 'fire';

  if (hit.element) {
    const reaction = enemy.mark ? reactionBetween(enemy.mark.element, hit.element) : null;
    if (reaction) {
      enemy.mark = null;
      state.stats.reactions[reaction]++;
      if (reaction !== 'wildfire') events.push({ type: 'reaction', reaction, pos: enemyPosition(state, enemy) });
      if (reaction === 'vaporize') {
        damage *= REACTION_RULES.vaporize.multiplier;
        damageType = 'magic';
      } else if (reaction === 'bind') {
        bind(enemy);
      } else {
        wildfire = true;
      }
    } else {
      applyMark(enemy, hit.element, hit.sourceId, {
        burnMultiplier: hit.burnMultiplier,
        durationMultiplier: hit.markDurationMultiplier,
      });
    }
  }
  if (hit.slow) applySlow(enemy, hit.slow.amount, hit.slow.duration);

  // 爆炸類效果的位置要在傷害前取得（目標可能被這次命中打死）
  const pos = enemyPosition(state, enemy);
  const killed = damageEnemy(state, enemy, damage, damageType, hit.sourceId, events);
  if (wildfire) igniteWildfire(state, pos, hit.sourceId, events);
  if (killed && wasBurning && hit.burningKillBlast) {
    const { damage: blast, radius } = hit.burningKillBlast;
    events.push({ type: 'explosion', pos, radius, element: 'fire' });
    for (const other of enemiesWithin(state, pos, radius)) damageEnemy(state, other, blast, 'magic', hit.sourceId, events);
  }
  return killed;
}

export interface MarkOptions {
  burnMultiplier?: number;
  durationMultiplier?: number;
}

/** 附加或刷新印記：同種印記只刷新時間，強度取較高者 */
export function applyMark(enemy: EnemyInstance, element: Element, sourceId: number, options: MarkOptions = {}): void {
  const dps = element === 'fire' ? MARK_RULES.burnDps * (options.burnMultiplier ?? 1) : 0;
  const duration = MARK_RULES.duration * (options.durationMultiplier ?? 1);
  if (enemy.mark && enemy.mark.element === element) {
    enemy.mark.remaining = Math.max(enemy.mark.remaining, duration);
    if (dps > enemy.mark.burnDps) {
      enemy.mark.burnDps = dps;
      enemy.mark.sourceId = sourceId;
    }
    return;
  }
  enemy.mark = { element, remaining: duration, burnDps: dps, sourceId };
}

/** 印記以外的緩速；同時只保留一個，取較強的 */
export function applySlow(enemy: EnemyInstance, amount: number, duration: number): void {
  if (!enemy.slow || amount >= enemy.slow.amount) enemy.slow = { amount, remaining: duration };
  else enemy.slow.remaining = Math.max(enemy.slow.remaining, duration);
}

/** 定身（技能用）：不受束縛免疫影響，首領時間減半 */
export function rootEnemy(enemy: EnemyInstance, duration: number, bossFactor: number): void {
  const isBoss = ENEMIES[enemy.type].tags.includes('boss');
  enemy.rooted = Math.max(enemy.rooted, duration * (isBoss ? bossFactor : 1));
}

function bind(enemy: EnemyInstance): void {
  if (enemy.rootImmunity > 0) return;
  const rules = REACTION_RULES.bind;
  rootEnemy(enemy, rules.duration, rules.bossFactor);
  enemy.rootImmunity = rules.immunity;
}

export function enemiesWithin(state: BattleState, center: Vec2, radius: number, includeFlying = true): EnemyInstance[] {
  return state.enemies.filter(
    (e) =>
      e.hp > 0 &&
      (includeFlying || !ENEMIES[e.type].tags.includes('flying')) &&
      distance(center, enemyPosition(state, e)) <= radius,
  );
}

/**
 * 野火：半徑內所有敵人受到魔法傷害，並附加灼燒。
 * 反應附加的灼燒不會觸發新的反應，所以已有其他印記的敵人只受傷、不換印記。
 */
function igniteWildfire(state: BattleState, center: Vec2, sourceId: number, events: BattleEvent[]): void {
  const { radius, damage } = REACTION_RULES.wildfire;
  events.push({ type: 'reaction', reaction: 'wildfire', pos: center, radius });
  for (const other of enemiesWithin(state, center, radius)) {
    damageEnemy(state, other, damage, 'magic', sourceId, events);
    if (other.hp > 0 && (!other.mark || other.mark.element === 'fire')) applyMark(other, 'fire', sourceId);
  }
}

/** 推進印記、灼燒、緩速、定身與免疫的時間 */
export function updateStatuses(state: BattleState, dt: number, events: BattleEvent[]): void {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.rooted = Math.max(0, enemy.rooted - dt);
    enemy.rootImmunity = Math.max(0, enemy.rootImmunity - dt);
    if (enemy.slow) {
      enemy.slow.remaining -= dt;
      if (enemy.slow.remaining <= 1e-9) enemy.slow = null;
    }

    const mark = enemy.mark;
    if (!mark) continue;
    const active = Math.min(dt, mark.remaining);
    if (mark.burnDps > 0) damageEnemy(state, enemy, mark.burnDps * active, 'magic', mark.sourceId, events);
    mark.remaining -= dt;
    if (mark.remaining <= 1e-9) enemy.mark = null;
  }
}

/** 敵人目前的移動速度：被擋住或定身為 0，緩速加總有上限 */
export function enemySpeed(enemy: EnemyInstance): number {
  if (enemy.rooted > 0 || enemy.blockedBy !== null) return 0;
  const wet = enemy.mark?.element === 'water' ? MARK_RULES.wetSlow : 0;
  const slow = wet + (enemy.slow?.amount ?? 0);
  return ENEMIES[enemy.type].speed * (1 - Math.min(MARK_RULES.slowCap, slow));
}
