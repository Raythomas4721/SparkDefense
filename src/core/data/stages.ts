import type { StageDefinition } from '../types';

// 關卡 1 的 Phase 1 暫定版：只用 Phase 1 已有的三種敵人，共 5 波。
// Phase 2 加入灰翼蝠、霧團群落、裂隙巨像後，改成 DESIGN.md §9.2 的六波版本。
export const STAGES: Record<string, StageDefinition> = {
  'stage-1': {
    id: 'stage-1',
    name: '裂隙初現',
    mapId: 'rift',
    waves: [
      {
        groups: [{ enemy: 'grunt', count: 10, interval: 1.2 }],
        clearBonus: 20,
      },
      {
        groups: [
          { enemy: 'grunt', count: 12, interval: 1.0 },
          { enemy: 'runner', count: 6, interval: 0.8, delay: 6 },
        ],
        clearBonus: 20,
      },
      {
        groups: [
          { enemy: 'brute', count: 3, interval: 3.0 },
          { enemy: 'grunt', count: 10, interval: 1.0, delay: 2 },
        ],
        clearBonus: 25,
      },
      {
        groups: [
          { enemy: 'grunt', count: 14, interval: 0.8 },
          { enemy: 'runner', count: 10, interval: 0.6, delay: 4 },
        ],
        clearBonus: 25,
      },
      {
        groups: [
          { enemy: 'brute', count: 6, interval: 2.5 },
          { enemy: 'grunt', count: 14, interval: 0.9, delay: 3 },
          { enemy: 'runner', count: 10, interval: 0.7, delay: 8 },
        ],
        clearBonus: 0,
      },
    ],
  },
};
