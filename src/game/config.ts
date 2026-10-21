// 遊戲畫面的邏輯解析度（16:9），實際顯示由 Scale.FIT 縮放
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** 左側戰場寬度；右側是介面面板 */
export const MAP_WIDTH = 1040;
export const PANEL_X = MAP_WIDTH;
export const PANEL_WIDTH = GAME_WIDTH - MAP_WIDTH;

export const FONT_FAMILY = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

export const DEPTH = {
  map: 0,
  selection: 1,
  towers: 2,
  enemies: 3,
  projectiles: 4,
  effects: 5,
  panel: 10,
  overlay: 20,
} as const;
