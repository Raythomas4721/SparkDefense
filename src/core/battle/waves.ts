import { BATTLE_RULES } from '../data/battle';
import { ENEMIES } from '../data/enemies';
import type { BattleEvent, BattleState, PendingSpawn } from '../types';
import { allocateId, getStage, isLastWave } from './state';

/** 開始第 index 波：排好這波所有怪物的出現時間 */
export function startWave(state: BattleState, index: number, events?: BattleEvent[]): void {
  const wave = getStage(state.stageId).waves[index];
  if (!wave) throw new Error(`第 ${index + 1} 波不存在`);

  const spawns: PendingSpawn[] = [];
  for (const group of wave.groups) {
    for (let k = 0; k < group.count; k++) {
      spawns.push({ at: state.time + (group.delay ?? 0) + k * group.interval, enemy: group.enemy });
    }
  }
  // 時間相同時維持資料中的順序（sort 是穩定排序）
  spawns.sort((a, b) => a.at - b.at);

  state.waveIndex = index;
  state.countdown = null;
  state.spawning = true;
  state.pendingSpawns = spawns;
  events?.push({ type: 'waveStarted', waveIndex: index });
}

/** 推進倒數、生成到時間的怪物；這波出完時給波次獎勵並開始倒數 */
export function advanceWaves(state: BattleState, dt: number, events: BattleEvent[]): void {
  if (state.countdown !== null) {
    state.countdown -= dt;
    if (state.countdown <= 1e-9) startWave(state, state.waveIndex + 1, events);
  }

  while (state.pendingSpawns.length > 0 && state.pendingSpawns[0]!.at <= state.time + 1e-9) {
    const spawn = state.pendingSpawns.shift()!;
    const def = ENEMIES[spawn.enemy];
    const id = allocateId(state);
    state.enemies.push({ id, type: spawn.enemy, hp: def.hp, maxHp: def.hp, distance: 0 });
    events.push({ type: 'enemySpawned', enemyId: id });
  }

  if (state.spawning && state.pendingSpawns.length === 0) {
    state.spawning = false;
    const bonus = getStage(state.stageId).waves[state.waveIndex]!.clearBonus;
    state.gold += bonus;
    state.stats.goldEarned += bonus;
    events.push({ type: 'waveSpawned', waveIndex: state.waveIndex, bonus });
    if (!isLastWave(state)) state.countdown = BATTLE_RULES.waveCountdown;
  }
}
