import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from '../config';

// Phase 0 的佔位畫面：確認 Phaser 能啟動、畫面會依視窗縮放。
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // 外框：方便看出邏輯畫面的邊界與縮放是否正確
    this.add.rectangle(cx, cy, GAME_WIDTH - 8, GAME_HEIGHT - 8).setStrokeStyle(2, 0x3a4466);

    const rift = this.add.circle(cx, cy - 90, 36, 0x7c5cff, 0.35).setStrokeStyle(3, 0xb9a6ff);
    this.tweens.add({
      targets: rift,
      scale: { from: 0.9, to: 1.1 },
      alpha: { from: 0.7, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(cx, cy + 10, '星火防線：裂隙守望', {
        fontFamily: FONT_FAMILY,
        fontSize: '48px',
        color: '#f2f4ff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 70, 'Phase 0：專案骨架', {
        fontFamily: FONT_FAMILY,
        fontSize: '22px',
        color: '#8a93b8',
      })
      .setOrigin(0.5);
  }
}
