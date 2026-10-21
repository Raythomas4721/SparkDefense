import type { TowerDefinition, TowerTypeId } from '../types';

// DESIGN.md §5.2。Phase 1 只有弓兵塔與砲塔。
export const TOWERS: Record<TowerTypeId, TowerDefinition> = {
  archer: {
    id: 'archer',
    name: '弓兵塔',
    summary: '單體、攻速快、可打飛行；怕高護甲',
    costs: [70, 60, 100],
    tiers: [
      { damage: 10, interval: 0.6, range: 160 },
      { damage: 15, interval: 0.6, range: 175 },
      { damage: 22, interval: 0.6, range: 190 },
    ],
    damageType: 'physical',
    canHitFlying: true,
    attack: 'arrow',
    projectileSpeed: 600,
  },
  cannon: {
    id: 'cannon',
    name: '砲塔',
    summary: '範圍爆炸、攻速慢；打不到飛行',
    costs: [120, 90, 140],
    tiers: [
      { damage: 25, interval: 2.2, range: 170, splashRadius: 55 },
      { damage: 38, interval: 2.2, range: 180, splashRadius: 60 },
      { damage: 55, interval: 2.2, range: 190, splashRadius: 65 },
    ],
    damageType: 'physical',
    canHitFlying: false,
    attack: 'shell',
    flightTime: 0.7,
  },
};

export const TOWER_ORDER: readonly TowerTypeId[] = ['archer', 'cannon'];
