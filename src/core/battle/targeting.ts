import { ENEMIES } from '../data/enemies';
import type { BattleState, EnemyInstance, Vec2 } from '../types';
import { distance } from './path';
import { enemyPosition } from './state';

export interface TargetQuery {
  from: Vec2;
  range: number;
  canHitFlying: boolean;
}

/** 目標優先 first：射程內路線進度最多（最接近終點）的敵人 */
export function findFirstTarget(state: BattleState, query: TargetQuery): EnemyInstance | undefined {
  let best: EnemyInstance | undefined;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (!query.canHitFlying && ENEMIES[enemy.type].tags.includes('flying')) continue;
    if (distance(query.from, enemyPosition(state, enemy)) > query.range) continue;
    if (!best || enemy.distance > best.distance) best = enemy;
  }
  return best;
}
