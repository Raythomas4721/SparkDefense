import type { EnemyDefinition, EnemyTypeId } from '../types';

// DESIGN.md §9.1。Phase 1 只有前三種；攻擊數值在 Phase 3（阻擋）加入。
export const ENEMIES: Record<EnemyTypeId, EnemyDefinition> = {
  grunt: { id: 'grunt', name: '灰霧小獸', hp: 50, armor: 0, speed: 60, gold: 5, leakDamage: 1, tags: [] },
  runner: { id: 'runner', name: '裂隙疾行者', hp: 30, armor: 0, speed: 110, gold: 5, leakDamage: 1, tags: [] },
  brute: { id: 'brute', name: '重甲石裔', hp: 300, armor: 8, speed: 35, gold: 15, leakDamage: 2, tags: ['heavy'] },
};
