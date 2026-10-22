import { STEP_DT } from '../data/battle';
import { ENEMIES } from '../data/enemies';
import { HEROES } from '../data/heroes';
import { TOWERS } from '../data/towers';
import { buildTower, setRallyPoint, startNextWave, upgradeCost, upgradeTower, type CommandResult } from '../battle/commands';
import { starsFor } from '../battle/rating';
import { enemiesWithin } from '../battle/elements';
import { addHero, castSkill } from '../battle/heroes';
import { createBattle, enemyPosition, towerAtSlot } from '../battle/state';
import { step } from '../battle/step';
import type { BattleResult, BattleState, Element, HeroId, ReactionId, TowerTypeId, Vec2 } from '../types';

// 無頭模擬（DESIGN.md §11.6）：照「建造腳本」自動下指令，跑完一整場戰鬥。

export type PlanAction =
  | { kind: 'build'; slot: number; tower: TowerTypeId; element?: Element }
  | { kind: 'upgrade'; slot: number }
  | { kind: 'rally'; slot: number; point: Vec2 };

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
  heroId: HeroId | null;
  heroDamage: number;
  /** 英雄傷害佔全場（塔＋英雄）的比例 */
  heroShare: number;
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
  reactions: Record<ReactionId, number>;
  towers: TowerReport[];
}

function actionCost(state: BattleState, action: PlanAction): number | null {
  if (action.kind === 'build') return TOWERS[action.tower].costs[0];
  const tower = towerAtSlot(state, action.slot);
  if (action.kind === 'rally') return tower ? 0 : null;
  return tower ? upgradeCost(tower) : null;
}

function runAction(state: BattleState, action: PlanAction): CommandResult {
  if (action.kind === 'build') return buildTower(state, action.slot, action.tower, action.element);
  const tower = towerAtSlot(state, action.slot)!;
  if (action.kind === 'rally') return setRallyPoint(state, tower.id, action.point);
  return upgradeTower(state, tower.id);
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
    const result = runAction(state, action);
    if (!result.ok && result.reason === 'not-enough-gold') break;
    next++;
  }
  return next;
}

/** 英雄出場時，技能目標附近至少要有幾名敵人才施放 */
const SKILL_MIN_TARGETS = 3;

/**
 * 模擬用的英雄 AI：站在起始位置不動；技能好了就施放。
 * 範圍技能對準敵人最密集的地方，至少 3 名敵人或有首領時才放。
 */
function heroAi(state: BattleState): void {
  const hero = state.hero;
  if (!hero?.alive || hero.skillCooldown > 0 || state.enemies.length === 0) return;
  const skill = HEROES[hero.heroId].skill;
  const effect = skill.effect;
  const radius = 'radius' in effect ? effect.radius : effect.width * 2;

  if (skill.targeting === 'self') {
    const reach = effect.kind === 'bloom' ? 250 : radius;
    if (enemiesWithin(state, hero.pos, reach).length >= SKILL_MIN_TARGETS) castSkill(state, null);
    return;
  }
  let best: { pos: Vec2; count: number; boss: boolean } | null = null;
  for (const enemy of state.enemies) {
    const pos = enemyPosition(state, enemy);
    const count = enemiesWithin(state, pos, radius).length;
    const boss = ENEMIES[enemy.type].tags.includes('boss');
    if (!best || (boss && !best.boss) || (boss === best.boss && count > best.count)) best = { pos, count, boss };
  }
  if (best && (best.boss || best.count >= SKILL_MIN_TARGETS)) castSkill(state, best.pos);
}

export function runPlan(stageId: string, plan: BuildPlan, seed = 1, heroId: HeroId | null = null, maxSeconds = 1800): SimReport {
  const state = createBattle(stageId, seed);
  if (heroId) addHero(state, heroId);
  let next = 0;

  while (state.result === 'playing' && state.time < maxSeconds) {
    next = runActions(state, plan, next);
    if (state.waveIndex === -1 || (plan.callEarly && state.countdown !== null)) startNextWave(state);
    heroAi(state);
    step(state, STEP_DT);
  }

  const towerDamage = state.towers.reduce((sum, t) => sum + t.damageDealt, 0);
  const heroDamage = state.hero?.damageDealt ?? 0;
  return {
    heroId,
    heroDamage: Math.round(heroDamage),
    heroShare: heroDamage + towerDamage > 0 ? heroDamage / (heroDamage + towerDamage) : 0,
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
    reactions: { ...state.stats.reactions },
    towers: state.towers.map((t) => ({ slot: t.slot, type: t.type, tier: t.tier + 1, damage: Math.round(t.damageDealt) })),
  };
}
