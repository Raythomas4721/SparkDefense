import { STAR_THRESHOLDS } from '../data/battle';
import type { BattleState } from '../types';

/** 星級評價（DESIGN.md §4.3）；未通關為 0 */
export function starsFor(state: BattleState): 0 | 1 | 2 | 3 {
  if (state.result !== 'victory') return 0;
  if (state.coreHp >= STAR_THRESHOLDS.threeStars) return 3;
  if (state.coreHp >= STAR_THRESHOLDS.twoStars) return 2;
  return 1;
}
