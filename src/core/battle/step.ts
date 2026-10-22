import { ENEMIES } from '../data/enemies';
import type { BattleEvent, BattleState, EnemyInstance } from '../types';
import { updateBlocking } from './blocking';
import { removeDeadEnemies } from './damage';
import { enemySpeed, updateStatuses } from './elements';
import { updateHero } from './heroes';
import { getPath } from './path';
import { isLastWave, spawnEnemy } from './state';
import { updateProjectiles, updateTowers } from './towers';
import { advanceWaves } from './waves';

/** 召喚出的敵人排在召喚者身後的間距 */
const SUMMON_SPACING = 18;

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
  updateStatuses(state, dt, events);
  updateSummons(state, dt, events);
  updateBlocking(state, dt, events);
  moveEnemies(state, dt, events);
  if (state.result !== 'playing') return events;

  updateHero(state, dt, events);

  updateTowers(state, dt, events);
  updateProjectiles(state, dt, events);
  removeDeadEnemies(state);
  checkVictory(state, events);
  return events;
}

function updateSummons(state: BattleState, dt: number, events: BattleEvent[]): void {
  // 先複製一份，避免迭代時加入的新敵人也被處理
  for (const enemy of [...state.enemies]) {
    const summon = ENEMIES[enemy.type].summon;
    if (!summon || enemy.hp <= 0) continue;
    enemy.summonCooldown -= dt;
    if (enemy.summonCooldown > 1e-9) continue;
    enemy.summonCooldown += summon.interval;
    for (let k = 1; k <= summon.count; k++) {
      const minion = spawnEnemy(state, summon.enemy, Math.max(0, enemy.distance - k * SUMMON_SPACING));
      events.push({ type: 'enemySpawned', enemyId: minion.id });
    }
  }
}

function moveEnemies(state: BattleState, dt: number, events: BattleEvent[]): void {
  const pathLength = getPath(state.mapId).length;
  const stillOnPath: EnemyInstance[] = [];
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) {
      stillOnPath.push(enemy); // 被灼燒打死的，交給 removeDeadEnemies 處理
      continue;
    }
    enemy.distance += enemySpeed(enemy) * dt;
    if (enemy.distance < pathLength) {
      stillOnPath.push(enemy);
      continue;
    }
    const def = ENEMIES[enemy.type];
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
