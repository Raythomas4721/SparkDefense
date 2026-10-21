// 畫面用的顏色。數字給 Graphics／Shape 用，字串給 Text 用。

export const COLORS = {
  ground: 0x121625,
  pathEdge: 0x323a58,
  path: 0x232940,
  slotFill: 0x1a1f31,
  slotStroke: 0x4a5480,
  selection: 0xffd166,
  rift: 0x7c5cff,
  riftGlow: 0xb9a6ff,
  core: 0x7c5cff,
  coreGlow: 0xb9a6ff,

  panel: 0x111522,
  panelBorder: 0x2a3150,
  card: 0x181d2e,

  buttonPrimary: 0x4c6ef5,
  buttonNormal: 0x2c3454,
  buttonDanger: 0x9a3412,
  buttonDisabled: 0x232838,

  archerFill: 0x2f6b4f,
  archerStroke: 0x7dd3a0,
  cannonFill: 0x7a4a24,
  cannonStroke: 0xf4a261,

  grunt: 0xa3abc2,
  runner: 0x4fd1c5,
  brute: 0xc08457,
  bruteArmor: 0x5b3a1e,

  arrow: 0xe9f5db,
  shell: 0x30343f,
  explosion: 0xffb35c,
  hpBack: 0x000000,
  hpHigh: 0x6ee7a0,
  hpLow: 0xff6b6b,
} as const;

export const TEXT = {
  normal: '#e8ebf7',
  dim: '#8a93b8',
  disabled: '#5c6485',
  gold: '#ffd166',
  hp: '#ff8080',
  good: '#7ee2a8',
  warn: '#ffb35c',
} as const;
