// 戰鬥共通規則的數值（DESIGN.md §4）

/** 固定時間步長（秒） */
export const STEP_DT = 1 / 30;

export const BATTLE_RULES = {
  startGold: 250,
  coreHp: 20,
  /** 每波出完後到下一波的倒數秒數 */
  waveCountdown: 20,
  /** 提早呼叫：每剩 1 秒給的金幣 */
  earlyCallGoldPerSecond: 1,
  /** 賣塔退還總花費的比例 */
  sellRefundRatio: 0.6,
  /** 物理傷害扣護甲後的最低傷害 */
  minPhysicalDamage: 1,
} as const;

/** 星級門檻：剩餘耐久達到這個值以上（DESIGN.md §4.3） */
export const STAR_THRESHOLDS = {
  twoStars: 10,
  threeStars: 18,
} as const;
