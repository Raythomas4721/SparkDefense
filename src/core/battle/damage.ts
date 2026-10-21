import { BATTLE_RULES } from '../data/battle';
import { ENEMIES } from '../data/enemies';
import type { BattleEvent, BattleState, DamageType, EnemyInstance } from '../types';
import { enemyPosition, findTower } from './state';

/** 扣護甲後的實際傷害（DESIGN.md §4.4）：物理扣護甲、最低 1；魔法無視護甲 */
export function mitigatedDamage(amount: number, type: DamageType, armor: number): number {
  if (type === 'magic') return amount;
  return Math.max(BATTLE_RULES.minPhysicalDamage, amount - armor);
}

/**
 * 對敵人造成傷害。生命歸零時給金幣並送出擊殺事件；
 * 敵人會留在陣列中（hp ≤ 0），由 removeDeadEnemies() 統一移除。
 */
export function damageEnemy(
  state: BattleState,
  enemy: EnemyInstance,
  amount: number,
  type: DamageType,
  towerId: number,
  events: BattleEvent[],
): void {
  if (enemy.hp <= 0) return;
  const def = ENEMIES[enemy.type];
  const dealt = Math.min(mitigatedDamage(amount, type, def.armor), enemy.hp);
  enemy.hp -= dealt;

  const tower = findTower(state, towerId);
  if (tower) tower.damageDealt += dealt;

  if (enemy.hp <= 0) {
    state.gold += def.gold;
    state.stats.goldEarned += def.gold;
    state.stats.kills++;
    events.push({
      type: 'enemyKilled',
      enemyId: enemy.id,
      enemyType: enemy.type,
      pos: enemyPosition(state, enemy),
      gold: def.gold,
    });
  }
}

export function removeDeadEnemies(state: BattleState): void {
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}
