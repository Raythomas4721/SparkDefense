import { BATTLE_RULES } from '../data/battle';
import { TOWERS } from '../data/towers';
import type { BattleState, Element, TierIndex, TowerInstance, TowerTypeId, Vec2 } from '../types';
import { createSoldiers, defaultRally, moveSoldiers, refreshSoldiers, removeSoldiers } from './blocking';
import { distance, getPath, nearestOnPath } from './path';
import { allocateId, findTower, slotCount, slotPosition, towerAtSlot } from './state';
import { startWave } from './waves';

export type CommandFailure =
  | 'battle-ended'
  | 'invalid-slot'
  | 'element-required'
  | 'slot-occupied'
  | 'not-enough-gold'
  | 'tower-not-found'
  | 'max-tier'
  | 'not-barracks'
  | 'not-on-path'
  | 'rally-out-of-range'
  | 'wave-in-progress'
  | 'no-more-waves'
  | 'no-hero'
  | 'hero-dead'
  | 'skill-cooldown';

export type CommandResult =
  | { ok: true; gold?: number }
  | { ok: false; reason: CommandFailure; /** 金幣不足時還差多少 */ shortBy?: number };

export function fail(reason: CommandFailure, shortBy?: number): CommandResult {
  return shortBy === undefined ? { ok: false, reason } : { ok: false, reason, shortBy };
}

/** 點地圖時，離路線多遠以內算點到路上 */
const PATH_TAP_TOLERANCE = 40;

/** 蓋塔。法師塔必須指定元素；其他塔會忽略 element */
export function buildTower(state: BattleState, slot: number, type: TowerTypeId, element?: Element): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount(state)) return fail('invalid-slot');
  if (towerAtSlot(state, slot)) return fail('slot-occupied');
  const def = TOWERS[type];
  if (def.elemental && !element) return fail('element-required');
  const cost = def.costs[0];
  if (state.gold < cost) return fail('not-enough-gold', cost - state.gold);

  state.gold -= cost;
  state.stats.goldSpent += cost;
  const tower: TowerInstance = {
    id: allocateId(state),
    type,
    slot,
    tier: 0,
    element: def.elemental ? element! : null,
    rally: def.attack === 'barracks' ? defaultRally(state, slotPosition(state, slot)) : null,
    cooldown: 0,
    spent: cost,
    damageDealt: 0,
  };
  state.towers.push(tower);
  if (def.attack === 'barracks') createSoldiers(state, tower);
  return { ok: true };
}

/** 升到下一階的費用；已是最高階時回傳 null */
export function upgradeCost(tower: TowerInstance): number | null {
  if (tower.tier >= 2) return null;
  return TOWERS[tower.type].costs[tower.tier + 1]!;
}

export function upgradeTower(state: BattleState, towerId: number): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  const tower = findTower(state, towerId);
  if (!tower) return fail('tower-not-found');
  const cost = upgradeCost(tower);
  if (cost === null) return fail('max-tier');
  if (state.gold < cost) return fail('not-enough-gold', cost - state.gold);

  state.gold -= cost;
  state.stats.goldSpent += cost;
  tower.spent += cost;
  tower.tier = (tower.tier + 1) as TierIndex;
  if (tower.type === 'barracks') refreshSoldiers(state, tower);
  return { ok: true };
}

export function sellValue(tower: TowerInstance): number {
  return Math.floor(tower.spent * BATTLE_RULES.sellRefundRatio);
}

export function sellTower(state: BattleState, towerId: number): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  const tower = findTower(state, towerId);
  if (!tower) return fail('tower-not-found');

  const refund = sellValue(tower);
  state.gold += refund;
  state.towers = state.towers.filter((t) => t.id !== towerId);
  if (tower.type === 'barracks') removeSoldiers(state, towerId);
  return { ok: true, gold: refund };
}

/** 把兵營的集結點移到 point 附近的路上；必須在集結範圍內 */
export function setRallyPoint(state: BattleState, towerId: number, point: Vec2): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  const tower = findTower(state, towerId);
  if (!tower) return fail('tower-not-found');
  if (tower.type !== 'barracks') return fail('not-barracks');
  const nearest = nearestOnPath(getPath(state.mapId), point);
  if (nearest.offset > PATH_TAP_TOLERANCE) return fail('not-on-path');
  if (distance(nearest.pos, slotPosition(state, tower.slot)) > TOWERS.barracks.tiers[tower.tier].range) {
    return fail('rally-out-of-range');
  }
  tower.rally = nearest.pos;
  moveSoldiers(state, tower);
  return { ok: true };
}

/** 現在提早呼叫可以拿到的金幣；不在倒數中時為 0 */
export function earlyCallBonus(state: BattleState): number {
  if (state.countdown === null) return 0;
  return Math.floor(state.countdown) * BATTLE_RULES.earlyCallGoldPerSecond;
}

/** 開始第一波，或在倒數中提早呼叫下一波 */
export function startNextWave(state: BattleState): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  if (state.waveIndex === -1) {
    startWave(state, 0);
    return { ok: true, gold: 0 };
  }
  if (state.countdown === null) {
    return fail(state.waveIndex >= state.waveCount - 1 ? 'no-more-waves' : 'wave-in-progress');
  }
  const bonus = earlyCallBonus(state);
  state.gold += bonus;
  state.stats.goldEarned += bonus;
  state.stats.earlyCallGold += bonus;
  startWave(state, state.waveIndex + 1);
  return { ok: true, gold: bonus };
}
