import { HEROES } from '../core/data/heroes';
import type { HeroId } from '../core/types';

// 瀏覽器儲存。完整的存檔系統在 Phase 5（core/meta/save.ts）；
// 目前只記住第一次選的御三家。所有存取都包在 try/catch 裡，私密瀏覽或被封鎖時照樣能玩。

const STARTER_KEY = 'sparkdefense.starter';

function isHeroId(value: string | null): value is HeroId {
  return value !== null && value in HEROES;
}

export function loadStarter(): HeroId | null {
  try {
    const value = localStorage.getItem(STARTER_KEY);
    return isHeroId(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveStarter(heroId: HeroId): void {
  try {
    localStorage.setItem(STARTER_KEY, heroId);
  } catch {
    // 存不了就算了：這次照樣能玩，下次開啟會再問一次
  }
}

/**
 * 開發用網址參數：
 * - `?hero=ni`：這場改用指定英雄（包含還不能召喚的霓、沫、莉亞）
 * - `?starter`：重新顯示御三家選擇畫面
 */
export function debugHero(): HeroId | null {
  const value = new URLSearchParams(window.location.search).get('hero');
  return isHeroId(value) ? value : null;
}

export function forceStarterSelect(): boolean {
  return new URLSearchParams(window.location.search).has('starter');
}
