import { ENEMIES } from '../data/enemies';
import { HERO_RULES, HEROES } from '../data/heroes';
import { TOWERS } from '../data/towers';
import type { BattleEvent, BattleState, Projectile, TowerInstance } from '../types';
import { enemySpeed, hitEnemy } from './elements';
import { distance, getPath, positionAt } from './path';
import { allocateId, enemyPosition, slotPosition } from './state';
import { findFirstTarget } from './targeting';

const EPSILON = 1e-6;

/** 塔的攻速加成：莉亞的光環＋生命之芽的區域（DESIGN.md §6.2） */
export function towerHaste(state: BattleState, tower: TowerInstance): number {
  const pos = slotPosition(state, tower.slot);
  let haste = 0;
  const hero = state.hero;
  if (hero?.alive) {
    const passive = HEROES[hero.heroId].passive;
    if (passive.kind === 'towerHaste' && distance(pos, hero.pos) <= passive.radius) haste += passive.amount;
  }
  for (const zone of state.hasteZones) {
    if (distance(pos, zone.pos) <= zone.radius) haste += zone.amount;
  }
  return haste;
}

/** 塔的傷害倍率：英雄附近同元素的法師塔 +15%（元素加持，DESIGN.md §6.1） */
export function towerDamageMultiplier(state: BattleState, tower: TowerInstance): number {
  const hero = state.hero;
  if (!hero?.alive || !tower.element || HEROES[hero.heroId].element !== tower.element) return 1;
  return distance(slotPosition(state, tower.slot), hero.pos) <= HERO_RULES.auraRadius ? 1 + HERO_RULES.auraBonus : 1;
}

/** 冷卻完成的塔尋找目標並發射（兵營由 blocking.ts 處理） */
export function updateTowers(state: BattleState, dt: number, events: BattleEvent[]): void {
  for (const tower of state.towers) {
    const def = TOWERS[tower.type];
    if (def.attack === 'barracks') continue;
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > EPSILON) continue;

    const stats = def.tiers[tower.tier];
    const from = slotPosition(state, tower.slot);
    const target = findFirstTarget(state, { from, range: stats.range, canHitFlying: def.canHitFlying });
    if (!target) continue;

    const damage = stats.damage * towerDamageMultiplier(state, tower);
    if (def.attack === 'arrow') {
      state.projectiles.push({
        id: allocateId(state),
        kind: 'arrow',
        sourceId: tower.id,
        targetId: target.id,
        pos: { ...from },
        speed: def.projectileSpeed ?? 600,
        damage,
        damageType: def.damageType,
        element: tower.element,
      });
    } else {
      // 砲彈飛向「飛行時間後敵人會在的位置」，快速敵人中途轉彎就可能閃過
      const flightTime = def.flightTime ?? 0.7;
      const path = getPath(state.mapId);
      const lead = Math.min(path.length, target.distance + enemySpeed(target) * flightTime);
      state.projectiles.push({
        id: allocateId(state),
        kind: 'shell',
        sourceId: tower.id,
        from: { ...from },
        to: positionAt(path, lead),
        pos: { ...from },
        elapsed: 0,
        flightTime,
        damage,
        damageType: def.damageType,
        element: null,
        radius: stats.splashRadius ?? 0,
      });
    }
    tower.cooldown = stats.interval / (1 + towerHaste(state, tower));
    events.push({ type: 'towerFired', towerId: tower.id });
  }
}

/** 推進所有投射物；命中或落地時造成傷害 */
export function updateProjectiles(state: BattleState, dt: number, events: BattleEvent[]): void {
  const remaining: Projectile[] = [];
  for (const p of state.projectiles) {
    const { damage, damageType, element, sourceId, burnMultiplier, markDurationMultiplier, slow, burningKillBlast } = p;
    const hit = { damage, damageType, element, sourceId, burnMultiplier, markDurationMultiplier, slow, burningKillBlast };

    if (p.kind === 'arrow') {
      const target = state.enemies.find((e) => e.id === p.targetId && e.hp > 0);
      if (!target) continue; // 目標已死或已漏過，投射物消失
      const targetPos = enemyPosition(state, target);
      const dist = distance(p.pos, targetPos);
      const travel = p.speed * dt;
      if (dist <= travel) {
        hitEnemy(state, target, hit, events);
        events.push({ type: 'arrowHit', pos: targetPos });
        continue;
      }
      p.pos = {
        x: p.pos.x + ((targetPos.x - p.pos.x) / dist) * travel,
        y: p.pos.y + ((targetPos.y - p.pos.y) / dist) * travel,
      };
      remaining.push(p);
    } else {
      p.elapsed += dt;
      const t = Math.min(1, p.elapsed / p.flightTime);
      p.pos = { x: p.from.x + (p.to.x - p.from.x) * t, y: p.from.y + (p.to.y - p.from.y) * t };
      if (t < 1) {
        remaining.push(p);
        continue;
      }
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || ENEMIES[enemy.type].tags.includes('flying')) continue;
        if (distance(p.to, enemyPosition(state, enemy)) <= p.radius) hitEnemy(state, enemy, hit, events);
      }
      events.push({ type: 'explosion', pos: p.to, radius: p.radius, element: p.element });
    }
  }
  state.projectiles = remaining;
}
