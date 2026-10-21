import Phaser from 'phaser';
import { starsFor } from '../../core/battle/rating';
import type { BattleState } from '../../core/types';
import { Button } from '../ui/Button';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, MAP_WIDTH } from '../config';
import { formatTime } from '../text';
import { COLORS, TEXT } from '../theme';

/** 勝利／失敗結算畫面，蓋在戰場上 */
export function showResultOverlay(scene: Phaser.Scene, state: BattleState, onRetry: () => void): void {
  const cx = MAP_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const container = scene.add.container(0, 0).setDepth(DEPTH.overlay);

  // 半透明遮罩，並擋住對戰場的點擊
  const shade = scene.add.rectangle(0, 0, MAP_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0, 0).setInteractive();
  const box = scene.add.rectangle(cx, cy, 420, 320, COLORS.card).setStrokeStyle(2, COLORS.panelBorder);
  container.add([shade, box]);

  const victory = state.result === 'victory';
  const add = (y: number, content: string, size: number, color: string) => {
    const t = scene.add
      .text(cx, y, content, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, align: 'center' })
      .setOrigin(0.5);
    container.add(t);
    return t;
  };

  add(cy - 118, victory ? '防線守住了！' : '防線失守', 34, victory ? TEXT.gold : TEXT.hp);
  if (victory) {
    const stars = starsFor(state);
    add(cy - 66, '★'.repeat(stars) + '☆'.repeat(3 - stars), 40, TEXT.gold);
  } else {
    add(cy - 66, `撐到第 ${state.waveIndex + 1} / ${state.waveCount} 波`, 20, TEXT.normal);
  }
  add(cy - 12, `剩餘耐久 ${state.coreHp} / ${state.maxCoreHp}`, 18, TEXT.normal);
  add(cy + 18, `擊殺 ${state.stats.kills}　漏怪 ${state.stats.leaks}`, 18, TEXT.normal);
  add(cy + 48, `用時 ${formatTime(state.time)}　提早呼叫獲得 ${state.stats.earlyCallGold} 金`, 15, TEXT.dim);

  new Button(
    scene,
    {
      x: cx - 90,
      y: cy + 86,
      width: 180,
      height: 48,
      label: '再玩一次',
      fontSize: 18,
      variant: 'primary',
      onClick: onRetry,
    },
    container,
  );

  container.setAlpha(0);
  scene.tweens.add({ targets: container, alpha: 1, duration: 300 });
}
