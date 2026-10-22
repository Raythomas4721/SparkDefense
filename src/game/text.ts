import type { CommandResult } from '../core/battle/commands';

/** 指令失敗時給玩家看的原因 */
export function failureMessage(result: CommandResult): string {
  if (result.ok) return '';
  switch (result.reason) {
    case 'not-enough-gold':
      return `金幣不足，還差 ${result.shortBy ?? 0}`;
    case 'slot-occupied':
      return '這個塔位已經有塔了';
    case 'invalid-slot':
      return '這裡不能蓋塔';
    case 'element-required':
      return '請先選擇法師塔的元素';
    case 'tower-not-found':
      return '找不到這座塔';
    case 'max-tier':
      return '已經是最高階了';
    case 'not-barracks':
      return '只有兵營可以設定集結點';
    case 'not-on-path':
      return '集結點要設在路上';
    case 'rally-out-of-range':
      return '太遠了，集結點要在兵營附近';
    case 'no-hero':
      return '這場沒有英雄';
    case 'hero-dead':
      return '英雄正在復活中';
    case 'skill-cooldown':
      return '技能還在冷卻';
    case 'wave-in-progress':
      return '這一波還在出怪，出完後才能提早呼叫下一波';
    case 'no-more-waves':
      return '已經是最後一波了';
    case 'battle-ended':
      return '戰鬥已經結束';
  }
}

export const TIER_LABEL = ['I', 'II', 'III'] as const;

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
