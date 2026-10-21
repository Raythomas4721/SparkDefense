import { ENEMIES } from '../data/enemies';
import type { BattleEvent, BattleState, EnemyInstance } from '../types';
import { removeDeadEnemies } from './damage';
import { getPath } from './path';
import { isLastWave } from './state';
import { updateProjectiles, updateTowers } from './towers';
import { advanceWaves } from './waves';

/**
 * 推進戰鬥 dt 秒（應傳入固定的 STEP_DT）。
 * 直接修改 state，回傳這一步發生的事件給畫面做特效。
 * 戰鬥結束後呼叫不會有任何效果。
 */
export function step(state: BattleState, dt: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (state.result !== 'playing') return events;

  state.time += dt;
  advanceWaves(state, dt, events);
  moveEnemies(state, dt, events);
  if (state.result !== 'playing') return events;

  updateTowers(state, dt, events);
  updateProjectiles(state, dt, events);
  removeDeadEnemies(state);
  checkVictory(state, events);
  return events;
}

function moveEnemies(state: BattleState, dt: number, events: BattleEvent[]): void {
  const pathLength = getPath(state.mapId).length;
  const stillOnPath: EnemyInstance[] = [];
  for (const enemy of state.enemies) {
    const def = ENEMIES[enemy.type];
    enemy.distance += def.speed * dt;
    if (enemy.distance < pathLength) {
      stillOnPath.push(enemy);
      continue;
    }
    state.coreHp = Math.max(0, state.coreHp - def.leakDamage);
    state.stats.leaks++;
    events.push({ type: 'enemyLeaked', enemyId: enemy.id, damage: def.leakDamage });
    if (state.coreHp === 0) {
      state.result = 'defeat';
      state.countdown = null;
      state.pendingSpawns = [];
      state.spawning = false;
      events.push({ type: 'defeat' });
      break;
    }
  }
  state.enemies = state.result === 'defeat' ? [] : stillOnPath;
}

function checkVictory(state: BattleState, events: BattleEvent[]): void {
  if (isLastWave(state) && !state.spawning && state.enemies.length === 0) {
    state.result = 'victory';
    events.push({ type: 'victory' });
  }
}
