// 可設定種子的亂數產生器（mulberry32）。
// 狀態是一個純資料物件，可以直接放進 BattleState 或存檔，
// 相同種子＋相同呼叫順序＝相同結果。

export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** 回傳 [0, 1) 的浮點數，並推進狀態。 */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 回傳 [min, maxExclusive) 的整數。 */
export function nextInt(rng: RngState, min: number, maxExclusive: number): number {
  return min + Math.floor(nextFloat(rng) * (maxExclusive - min));
}

/** 從陣列中隨機挑一個元素；陣列不可為空。 */
export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() 不能用在空陣列');
  return items[nextInt(rng, 0, items.length)]!;
}
