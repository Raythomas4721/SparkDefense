import Phaser from 'phaser';
import { FONT_FAMILY } from '../config';
import { COLORS, TEXT } from '../theme';

export type ButtonVariant = 'primary' | 'normal' | 'danger';

export interface ButtonConfig {
  /** 左上角座標 */
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  variant?: ButtonVariant;
  /** 指定底色，取代 variant 的顏色（例如元素按鈕） */
  color?: number;
  onClick: () => void;
  /** 按到停用中的按鈕時呼叫，用來告訴玩家為什麼不能按 */
  onDisabledClick?: () => void;
}

const VARIANT_COLOR: Record<ButtonVariant, number> = {
  primary: COLORS.buttonPrimary,
  normal: COLORS.buttonNormal,
  danger: COLORS.buttonDanger,
};

/** 只靠點擊操作的按鈕（不依賴 hover，觸控也能用） */
export class Button {
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly text: Phaser.GameObjects.Text;
  private enabled = true;
  private readonly color: number;

  constructor(scene: Phaser.Scene, private readonly config: ButtonConfig, container?: Phaser.GameObjects.Container) {
    const { x, y, width, height } = config;
    this.color = config.color ?? VARIANT_COLOR[config.variant ?? 'normal'];
    this.bg = scene.add.rectangle(x, y, width, height, this.color).setOrigin(0, 0);
    this.bg.setInteractive({ useHandCursor: true });
    this.text = scene.add
      .text(x + width / 2, y + height / 2, config.label, {
        fontFamily: FONT_FAMILY,
        fontSize: `${config.fontSize ?? 16}px`,
        color: TEXT.normal,
        align: 'center',
      })
      .setOrigin(0.5);

    this.bg.on('pointerdown', () => {
      if (this.enabled) this.config.onClick();
      else this.config.onDisabledClick?.();
    });

    container?.add([this.bg, this.text]);
  }

  setEnabled(enabled: boolean): this {
    if (enabled === this.enabled) return this;
    this.enabled = enabled;
    this.bg.setFillStyle(enabled ? this.color : COLORS.buttonDisabled);
    this.text.setColor(enabled ? TEXT.normal : TEXT.disabled);
    return this;
  }

  setLabel(label: string): this {
    if (this.text.text !== label) this.text.setText(label);
    return this;
  }

  setVisible(visible: boolean): this {
    this.bg.setVisible(visible);
    this.text.setVisible(visible);
    return this;
  }

  setDepth(depth: number): this {
    this.bg.setDepth(depth);
    this.text.setDepth(depth);
    return this;
  }

  destroy(): void {
    this.bg.destroy();
    this.text.destroy();
  }
}
