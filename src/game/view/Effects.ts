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

  explosion(x: number, y: number, radius: number, color: number = COLORS.explosion): void {
    const ring = this.scene.add.circle(x, y, radius, color, 0.45).setDepth(DEPTH.effects);
    ring.setStrokeStyle(2, color, 0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.3, to: 1 },
      alpha: { from: 1, to: 0 },
      duration: 280,
      onComplete: () => ring.destroy(),
    });
  }

  /** 擴散的圓環（技能範圍） */
  ring(x: number, y: number, radius: number, color: number, duration = 450): void {
    const ring = this.scene.add.circle(x, y, radius, color, 0.18).setDepth(DEPTH.effects);
    ring.setStrokeStyle(3, color, 0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.5, to: 1 },
      alpha: { from: 1, to: 0 },
      duration,
      onComplete: () => ring.destroy(),
    });
  }

  /** 延遲爆炸的預警圈（隕火），時間到消失 */
  warning(x: number, y: number, radius: number, color: number, seconds: number): void {
    const ring = this.scene.add.circle(x, y, radius, color, 0.12).setDepth(DEPTH.effects);
    ring.setStrokeStyle(2, color, 0.9);
    this.scene.tweens.add({ targets: ring, alpha: { from: 0.5, to: 1 }, duration: 200, yoyo: true, repeat: -1 });
    this.scene.time.delayedCall(seconds * 1000, () => ring.destroy());
  }

  /** 直線光束（穿透攻擊、潮汐穿心） */
  beam(from: { x: number; y: number }, to: { x: number; y: number }, color: number, width: number, duration = 250): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.effects);
    g.lineStyle(width, color, 0.9).lineBetween(from.x, from.y, to.x, to.y);
    this.scene.tweens.add({ targets: g, alpha: 0, duration, onComplete: () => g.destroy() });
  }

  /** 近戰揮砍的扇形閃光 */
  slash(from: { x: number; y: number }, to: { x: number; y: number }, radius: number, angleDeg: number, color: number): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.effects);
    const facing = Math.atan2(to.y - from.y, to.x - from.x);
    const half = (angleDeg / 2) * (Math.PI / 180);
    g.fillStyle(color, 0.35);
    g.slice(from.x, from.y, radius, facing - half, facing + half, false);
    g.fillPath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });
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
