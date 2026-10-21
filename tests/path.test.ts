import { describe, expect, it } from 'vitest';
import { buildPath, getPath, positionAt, tangentAt } from '../src/core/battle/path';
import { MAPS } from '../src/core/data/map';

const L = buildPath([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
]);

describe('path', () => {
  it('總長度是各段長度相加', () => {
    expect(L.length).toBe(150);
  });

  it('positionAt 沿著路線內插', () => {
    expect(positionAt(L, 0)).toEqual({ x: 0, y: 0 });
    expect(positionAt(L, 40)).toEqual({ x: 40, y: 0 });
    expect(positionAt(L, 100)).toEqual({ x: 100, y: 0 });
    expect(positionAt(L, 125)).toEqual({ x: 100, y: 25 });
  });

  it('超出範圍時夾在起點或終點', () => {
    expect(positionAt(L, -10)).toEqual({ x: 0, y: 0 });
    expect(positionAt(L, 999)).toEqual({ x: 100, y: 50 });
  });

  it('tangentAt 回傳該段的前進方向', () => {
    expect(tangentAt(L, 10)).toEqual({ x: 1, y: 0 });
    expect(tangentAt(L, 120)).toEqual({ x: 0, y: 1 });
  });

  it('第一張地圖有 10 個塔位，路線長度合理', () => {
    expect(MAPS.rift!.slots).toHaveLength(10);
    const length = getPath('rift').length;
    expect(length).toBeGreaterThan(1500);
    expect(length).toBeLessThan(2000);
  });

  it('塔位不壓在路上（離路線中心至少 45 像素）', () => {
    const path = getPath('rift');
    for (const slot of MAPS.rift!.slots) {
      let nearest = Infinity;
      for (let d = 0; d <= path.length; d += 2) {
        const p = positionAt(path, d);
        nearest = Math.min(nearest, Math.hypot(p.x - slot.x, p.y - slot.y));
      }
      expect(nearest).toBeGreaterThanOrEqual(45);
    }
  });
});
