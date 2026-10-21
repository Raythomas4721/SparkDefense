import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, pick } from '../src/core/rng';

const take = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => nextFloat(rng));
};

describe('rng', () => {
  it('相同種子產生相同序列', () => {
    expect(take(123, 20)).toEqual(take(123, 20));
  });

  it('不同種子產生不同序列', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('nextFloat 落在 [0, 1)', () => {
    for (const x of take(7, 10_000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('nextInt 落在 [min, max) 且每個值都會出現', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = nextInt(rng, 3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(8);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('複製狀態後可以從同一點繼續，結果一致（存檔與模擬需要）', () => {
    const a = createRng(5);
    nextFloat(a);
    nextFloat(a);
    const b = { ...a };
    expect([nextFloat(a), nextFloat(a)]).toEqual([nextFloat(b), nextFloat(b)]);
  });

  it('pick 空陣列會丟錯', () => {
    expect(() => pick(createRng(1), [])).toThrow();
  });
});
