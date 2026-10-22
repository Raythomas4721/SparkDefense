import type { TowerDefinition, TowerTypeId } from '../types';

// DESIGN.md §5.2
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
  barracks: {
    id: 'barracks',
    name: '兵營',
    summary: '派 3 名士兵擋在路上；擋不住飛行',
    costs: [80, 70, 110],
    tiers: [
      { damage: 4, interval: 1.0, range: 110 },
      { damage: 6, interval: 1.0, range: 110 },
      { damage: 9, interval: 1.0, range: 110 },
    ],
    damageType: 'physical',
    canHitFlying: false,
    attack: 'barracks',
    soldier: { count: 3, hp: [60, 100, 150], armor: [0, 2, 4], respawn: 10 },
  },
  mage: {
    id: 'mage',
    name: '法師塔',
    summary: '魔法無視護甲；可觸發元素反應',
    costs: [100, 80, 120],
    tiers: [
      { damage: 20, interval: 1.4, range: 150 },
      { damage: 30, interval: 1.4, range: 160 },
      { damage: 45, interval: 1.4, range: 170 },
    ],
    damageType: 'magic',
    canHitFlying: true,
    elemental: true,
    attack: 'arrow',
    projectileSpeed: 450,
  },
};

export const TOWER_ORDER: readonly TowerTypeId[] = ['archer', 'barracks', 'cannon', 'mage'];
