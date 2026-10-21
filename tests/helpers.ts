import { STEP_DT } from '../src/core/data/battle';
import { ENEMIES } from '../src/core/data/enemies';
import { createBattle } from '../src/core/battle/state';
import { step } from '../src/core/battle/step';
import type { BattleEvent, BattleState, EnemyInstance, EnemyTypeId } from '../src/core/types';

export function newBattle(): BattleState {
  return createBattle('stage-1', 1);
}

/** 直接在路線上放一隻敵人（測試用） */
export function addEnemy(state: BattleState, type: EnemyTypeId, distance: number): EnemyInstance {
  const def = ENEMIES[type];
  const enemy = { id: state.nextId++, type, hp: def.hp, maxHp: def.hp, distance };
  state.enemies.push(enemy);
  return enemy;
}

/** 推進 seconds 秒，回傳期間所有事件 */
export function runFor(state: BattleState, seconds: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  const steps = Math.round(seconds / STEP_DT);
  for (let i = 0; i < steps; i++) events.push(...step(state, STEP_DT));
  return events;
}
