import Phaser from 'phaser';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, MAP_WIDTH } from '../config';
import { COLORS, TEXT } from '../theme';

/** 一次性的特效與提示文字 */
export class Effects {
  private toastText?: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene) {}

  floatText(x: number, y: number, message: string, color: string, size = 15): void {
    const text = this.scene.add
      .text(x, y, message, {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.effects);
    this.scene.tweens.add({
      targets: text,
      y: y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  explosion(x: number, y: number, radius: number): void {
    const ring = this.scene.add.circle(x, y, radius, COLORS.explosion, 0.45).setDepth(DEPTH.effects);
    ring.setStrokeStyle(2, COLORS.explosion, 0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.3, to: 1 },
      alpha: { from: 1, to: 0 },
      duration: 280,
      onComplete: () => ring.destroy(),
    });
  }

  pulse(target: Phaser.GameObjects.GameObject): void {
    this.scene.tweens.add({ targets: target, scale: { from: 1.35, to: 1 }, duration: 250 });
  }

  banner(message: string, sub?: string): void {
    const cx = MAP_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 40;
    const title = this.scene.add
      .text(cx, cy, message, {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        color: TEXT.normal,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.effects);
    const parts: Phaser.GameObjects.Text[] = [title];
    if (sub) {
      parts.push(
        this.scene.add
          .text(cx, cy + 40, sub, {
            fontFamily: FONT_FAMILY,
            fontSize: '18px',
            color: TEXT.gold,
            stroke: '#000000',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(DEPTH.effects),
      );
    }
    this.scene.tweens.add({
      targets: parts,
      alpha: { from: 1, to: 0 },
      delay: 900,
      duration: 500,
      onComplete: () => parts.forEach((p) => p.destroy()),
    });
  }

  /** 地圖上方的提示列；新的提示會取代舊的 */
  toast(message: string): void {
    this.toastTimer?.remove();
    this.toastText?.destroy();
    this.toastText = this.scene.add
      .text(MAP_WIDTH / 2, 28, message, {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        color: TEXT.warn,
        backgroundColor: '#0b0d14cc',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.effects);
    this.toastTimer = this.scene.time.delayedCall(2000, () => {
      this.toastText?.destroy();
      this.toastText = undefined;
    });
  }
}
