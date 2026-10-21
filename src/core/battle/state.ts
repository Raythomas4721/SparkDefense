import { BATTLE_RULES } from '../data/battle';
import { MAPS } from '../data/map';
import { STAGES } from '../data/stages';
import { createRng } from '../rng';
import type { BattleState, EnemyInstance, StageDefinition, TowerInstance, Vec2 } from '../types';
import { getPath, positionAt } from './path';

export function getStage(stageId: string): StageDefinition {
  const stage = STAGES[stageId];
  if (!stage) throw new Error(`找不到關卡：${stageId}`);
  return stage;
}

export function createBattle(stageId: string, seed: number): BattleState {
  const stage = getStage(stageId);
  return {
    stageId,
    mapId: stage.mapId,
    time: 0,
    gold: BATTLE_RULES.startGold,
    coreHp: BATTLE_RULES.coreHp,
    maxCoreHp: BATTLE_RULES.coreHp,
    waveIndex: -1,
    waveCount: stage.waves.length,
    spawning: false,
    pendingSpawns: [],
    countdown: null,
    towers: [],
    enemies: [],
    projectiles: [],
    nextId: 1,
    rng: createRng(seed),
    result: 'playing',
    stats: { kills: 0, leaks: 0, goldEarned: 0, goldSpent: 0, earlyCallGold: 0 },
  };
}

export function allocateId(state: BattleState): number {
  return state.nextId++;
}

export function slotPosition(state: BattleState, slot: number): Vec2 {
  const pos = MAPS[state.mapId]?.slots[slot];
  if (!pos) throw new Error(`找不到塔位：${slot}`);
  return pos;
}

export function slotCount(state: BattleState): number {
  return MAPS[state.mapId]?.slots.length ?? 0;
}

export function enemyPosition(state: BattleState, enemy: EnemyInstance): Vec2 {
  return positionAt(getPath(state.mapId), enemy.distance);
}

export function towerAtSlot(state: BattleState, slot: number): TowerInstance | undefined {
  return state.towers.find((t) => t.slot === slot);
}

export function findTower(state: BattleState, towerId: number): TowerInstance | undefined {
  return state.towers.find((t) => t.id === towerId);
}

export function isLastWave(state: BattleState): boolean {
  return state.waveIndex === state.waveCount - 1;
}
