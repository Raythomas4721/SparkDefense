import { STEP_DT } from '../data/battle';
import { TOWERS } from '../data/towers';
import { buildTower, startNextWave, upgradeCost, upgradeTower } from '../battle/commands';
import { starsFor } from '../battle/rating';
import { createBattle, towerAtSlot } from '../battle/state';
import { step } from '../battle/step';
import type { BattleResult, BattleState, TowerTypeId } from '../types';

// 無頭模擬（DESIGN.md §11.6）：照「建造腳本」自動下指令，跑完一整場戰鬥。

export type PlanAction =
  | { kind: 'build'; slot: number; tower: TowerTypeId }
  | { kind: 'upgrade'; slot: number };

export interface BuildPlan {
  id: string;
  name: string;
  /** 倒數中是否立刻提早呼叫下一波 */
  callEarly: boolean;
  /** 依序執行；錢不夠就等，錢夠了才執行下一個 */
  actions: readonly PlanAction[];
}

export interface TowerReport {
  slot: number;
  type: TowerTypeId;
  tier: number;
  damage: number;
}

export interface SimReport {
  planId: string;
  result: BattleResult;
  stars: number;
  coreHp: number;
  /** 到達的波次（1 起算） */
  waveReached: number;
  time: number;
  kills: number;
  leaks: number;
  goldEarned: number;
  goldSpent: number;
  unspentGold: number;
  actionsDone: number;
  actionsTotal: number;
  towers: TowerReport[];
}

function actionCost(state: BattleState, action: PlanAction): number | null {
  if (action.kind === 'build') return TOWERS[action.tower].costs[0];
  const tower = towerAtSlot(state, action.slot);
  return tower ? upgradeCost(tower) : null;
}

/** 盡量執行腳本中的下一個動作；回傳新的進度 */
function runActions(state: BattleState, plan: BuildPlan, next: number): number {
  while (next < plan.actions.length) {
    const action = plan.actions[next]!;
    const cost = actionCost(state, action);
    if (cost === null) {
      next++; // 動作已不成立（例如塔位沒有塔可升級），跳過
      continue;
    }
    if (state.gold < cost) break;
    const result =
      action.kind === 'build' ? buildTower(state, action.slot, action.tower) : upgradeTower(state, towerAtSlot(state, action.slot)!.id);
    if (!result.ok && result.reason === 'not-enough-gold') break;
    next++;
  }
  return next;
}

export function runPlan(stageId: string, plan: BuildPlan, seed = 1, maxSeconds = 1800): SimReport {
  const state = createBattle(stageId, seed);
  let next = 0;

  while (state.result === 'playing' && state.time < maxSeconds) {
    next = runActions(state, plan, next);
    if (state.waveIndex === -1 || (plan.callEarly && state.countdown !== null)) startNextWave(state);
    step(state, STEP_DT);
  }

  return {
    planId: plan.id,
    result: state.result,
    stars: starsFor(state),
    coreHp: state.coreHp,
    waveReached: state.waveIndex + 1,
    time: Math.round(state.time),
    kills: state.stats.kills,
    leaks: state.stats.leaks,
    goldEarned: state.stats.goldEarned,
    goldSpent: state.stats.goldSpent,
    unspentGold: state.gold,
    actionsDone: next,
    actionsTotal: plan.actions.length,
    towers: state.towers.map((t) => ({ slot: t.slot, type: t.type, tier: t.tier + 1, damage: Math.round(t.damageDealt) })),
  };
}
