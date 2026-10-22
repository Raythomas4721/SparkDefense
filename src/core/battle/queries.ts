import { TOWERS } from '../data/towers';
import type { BattleState, Element, Vec2 } from '../types';
import { distance, getPath, positionAt } from './path';
import { slotPosition } from './state';

/** 反應熱區的取樣間距（像素） */
const SAMPLE_STEP = 12;

export interface CoveragePoint {
  pos: Vec2;
  /** 同時涵蓋這個點的「其他」法師塔元素 */
  elements: Element[];
}

/**
 * 找出路線上同時落在 (center, range) 與其他法師塔射程內的點。
 * 用來畫反應熱區：選取塔位時預覽、選取法師塔時顯示與誰重疊。
 */
export function mageCoverage(state: BattleState, center: Vec2, range: number, excludeTowerId?: number): CoveragePoint[] {
  const mages = state.towers
    .filter((t) => t.element && t.id !== excludeTowerId)
    .map((t) => ({
      element: t.element!,
      pos: slotPosition(state, t.slot),
      range: TOWERS[t.type].tiers[t.tier].range,
    }));
  if (mages.length === 0) return [];

  const path = getPath(state.mapId);
  const points: CoveragePoint[] = [];
  for (let d = 0; d <= path.length; d += SAMPLE_STEP) {
    const pos = positionAt(path, d);
    if (distance(pos, center) > range) continue;
    const elements = [...new Set(mages.filter((m) => distance(pos, m.pos) <= m.range).map((m) => m.element))];
    if (elements.length > 0) points.push({ pos, elements });
  }
  return points;
}

/** 在這個塔位蓋法師塔（階 I）時，射程會與哪些元素的法師塔重疊 */
export function nearbyMageElements(state: BattleState, slot: number): Element[] {
  const range = TOWERS.mage.tiers[0].range;
  const found = new Set<Element>();
  for (const point of mageCoverage(state, slotPosition(state, slot), range)) {
    for (const e of point.elements) found.add(e);
  }
  return [...found];
}
