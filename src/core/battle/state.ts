import { BATTLE_RULES } from '../data/battle';
import { ENEMIES } from '../data/enemies';
import { MAPS } from '../data/map';
import { STAGES } from '../data/stages';
import { createRng } from '../rng';
import type {
  BattleState,
  EnemyInstance,
  EnemyTypeId,
  MapDefinition,
  StageDefinition,
  TowerInstance,
  Vec2,
} from '../types';
import { getPath, positionAt } from './path';

export function getStage(stageId: string): StageDefinition {
  const stage = STAGES[stageId];
  if (!stage) throw new Error(`找不到關卡：${stageId}`);
  return stage;
}

export function getMap(state: BattleState): MapDefinition {
  const map = MAPS[state.mapId];
  if (!map) throw new Error(`找不到地圖：${state.mapId}`);
  return map;
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
    soldiers: [],
    hero: null,
    enemies: [],
    projectiles: [],
    hasteZones: [],
    delayedBlasts: [],
    nextId: 1,
    rng: createRng(seed),
    result: 'playing',
    stats: {
      kills: 0,
      leaks: 0,
      goldEarned: 0,
      goldSpent: 0,
      earlyCallGold: 0,
      reactions: { vaporize: 0, bind: 0, wildfire: 0 },
    },
  };
}

export function allocateId(state: BattleState): number {
  return state.nextId++;
}

/** 在路線上 distance 的位置生成一隻敵人，加入戰場並回傳 */
export function spawnEnemy(state: BattleState, type: EnemyTypeId, distance = 0): EnemyInstance {
  const def = ENEMIES[type];
  const enemy: EnemyInstance = {
    id: allocateId(state),
    type,
    hp: def.hp,
    maxHp: def.hp,
    distance,
    mark: null,
    slow: null,
    rooted: 0,
    rootImmunity: 0,
    blockedBy: null,
    attackCooldown: 0,
    summonCooldown: def.summon?.interval ?? 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function slotPosition(state: BattleState, slot: number): Vec2 {
  const pos = getMap(state).slots[slot];
  if (!pos) throw new Error(`找不到塔位：${slot}`);
  return pos;
}

export function slotCount(state: BattleState): number {
  return MAPS[state.mapId]?.slots.length ?? 0;
}

export function enemyPosition(state: BattleState, enemy: EnemyInstance): Vec2 {
  return positionAt(getPath(state.mapId), enemy.distance);
}

export function findEnemy(state: BattleState, enemyId: number): EnemyInstance | undefined {
  return state.enemies.find((e) => e.id === enemyId && e.hp > 0);
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
