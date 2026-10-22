import type { SpawnGroup, StageDefinition } from '../types';

/** 霧團群落：count 群，每群 6 隻緊密出現，群與群之間隔 gap 秒 */
function mistSwarms(count: number, gap: number, delay = 0): SpawnGroup[] {
  return Array.from({ length: count }, (_, i) => ({
    enemy: 'mist' as const,
    count: 6,
    interval: 0.25,
    delay: delay + i * gap,
  }));
}

// DESIGN.md §9.2
export const STAGES: Record<string, StageDefinition> = {
  'stage-1': {
    id: 'stage-1',
    name: '裂隙初現',
    mapId: 'rift',
    waves: [
      // 1：蓋塔
      {
        groups: [{ enemy: 'grunt', count: 10, interval: 1.2 }],
        clearBonus: 20,
      },
      // 2：升級、提早呼叫
      {
        groups: [
          { enemy: 'grunt', count: 12, interval: 1.0 },
          { enemy: 'runner', count: 6, interval: 0.8, delay: 6 },
        ],
        clearBonus: 20,
      },
      // 3：飛行，砲塔打不到
      {
        groups: [
          { enemy: 'grunt', count: 10, interval: 1.0 },
          { enemy: 'bat', count: 6, interval: 1.2, delay: 4 },
        ],
        clearBonus: 20,
      },
      // 4：護甲，要靠魔法與砲塔
      {
        groups: [
          { enemy: 'brute', count: 4, interval: 3.0 },
          { enemy: 'grunt', count: 10, interval: 1.0, delay: 2 },
        ],
        clearBonus: 25,
      },
      // 5：範圍攻擊
      {
        groups: [...mistSwarms(5, 4), { enemy: 'runner', count: 8, interval: 0.7, delay: 6 }],
        clearBonus: 25,
      },
      // 6：首領
      {
        groups: [
          { enemy: 'colossus', count: 1, interval: 0 },
          { enemy: 'grunt', count: 10, interval: 1.2, delay: 4 },
        ],
        clearBonus: 0,
      },
    ],
  },
};
