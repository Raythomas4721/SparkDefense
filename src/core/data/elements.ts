import type { Element, ReactionId } from '../types';

// 元素印記與反應（DESIGN.md §5.4、§5.5）

export const ELEMENTS: readonly Element[] = ['fire', 'water', 'wood'];

export const ELEMENT_NAMES: Record<Element, string> = {
  fire: '炎',
  water: '潮',
  wood: '森',
};

export const MARK_NAMES: Record<Element, string> = {
  fire: '灼燒',
  water: '潮濕',
  wood: '纏藤',
};

export const MARK_RULES = {
  /** 印記持續秒數 */
  duration: 3,
  /** 灼燒每秒魔法傷害 */
  burnDps: 4,
  /** 潮濕的緩速比例 */
  wetSlow: 0.1,
  /** 所有緩速加總的上限 */
  slowCap: 0.5,
} as const;

export const REACTION_RULES = {
  vaporize: { multiplier: 1.6 },
  bind: { duration: 0.8, bossFactor: 0.5, immunity: 4 },
  wildfire: { radius: 60, damage: 18 },
} as const;

export const REACTION_NAMES: Record<ReactionId, string> = {
  vaporize: '蒸發',
  bind: '束縛',
  wildfire: '野火',
};

/** 兩種不同元素會觸發哪種反應（順序不影響） */
export function reactionBetween(a: Element, b: Element): ReactionId | null {
  if (a === b) return null;
  const pair = new Set([a, b]);
  if (pair.has('fire') && pair.has('water')) return 'vaporize';
  if (pair.has('water') && pair.has('wood')) return 'bind';
  return 'wildfire';
}
