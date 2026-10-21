import { ENEMIES } from '../data/enemies';
import { TOWERS } from '../data/towers';
import type { BattleEvent, BattleState, Projectile } from '../types';
import { damageEnemy } from './damage';
import { distance, getPath, positionAt } from './path';
import { allocateId, enemyPosition, slotPosition } from './state';
import { findFirstTarget } from './targeting';

const EPSILON = 1e-6;

/** 冷卻完成的塔尋找目標並發射 */
export function updateTowers(state: BattleState, dt: number, events: BattleEvent[]): void {
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    if (tower.cooldown > EPSILON) continue;

    const def = TOWERS[tower.type];
    const stats = def.tiers[tower.tier];
    const from = slotPosition(state, tower.slot);
    const target = findFirstTarget(state, { from, range: stats.range, canHitFlying: def.canHitFlying });
    if (!target) continue;

    if (def.attack === 'arrow') {
      state.projectiles.push({
        id: allocateId(state),
        kind: 'arrow',
        towerId: tower.id,
        targetId: target.id,
        pos: { ...from },
        speed: def.projectileSpeed ?? 600,
        damage: stats.damage,
        damageType: def.damageType,
      });
    } else {
      // 砲彈飛向「飛行時間後敵人會在的位置」，快速敵人中途轉彎就可能閃過
      const flightTime = def.flightTime ?? 0.7;
      const path = getPath(state.mapId);
      const lead = Math.min(path.length, target.distance + ENEMIES[target.type].speed * flightTime);
      state.projectiles.push({
        id: allocateId(state),
        kind: 'shell',
        towerId: tower.id,
        from: { ...from },
        to: positionAt(path, lead),
        pos: { ...from },
        elapsed: 0,
        flightTime,
        damage: stats.damage,
        damageType: def.damageType,
        radius: stats.splashRadius ?? 0,
      });
    }
    tower.cooldown = stats.interval;
    events.push({ type: 'towerFired', towerId: tower.id });
  }
}

/** 推進所有投射物；命中或落地時造成傷害 */
export function updateProjectiles(state: BattleState, dt: number, events: BattleEvent[]): void {
  const remaining: Projectile[] = [];
  for (const p of state.projectiles) {
    if (p.kind === 'arrow') {
      const target = state.enemies.find((e) => e.id === p.targetId && e.hp > 0);
      if (!target) continue; // 目標已死或已漏過，箭消失
      const targetPos = enemyPosition(state, target);
      const dist = distance(p.pos, targetPos);
      const travel = p.speed * dt;
      if (dist <= travel) {
        damageEnemy(state, target, p.damage, p.damageType, p.towerId, events);
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
        if (distance(p.to, enemyPosition(state, enemy)) <= p.radius) {
          damageEnemy(state, enemy, p.damage, p.damageType, p.towerId, events);
        }
      }
      events.push({ type: 'explosion', pos: p.to, radius: p.radius });
    }
  }
  state.projectiles = remaining;
}
