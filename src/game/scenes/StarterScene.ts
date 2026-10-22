import Phaser from 'phaser';
import { ELEMENT_NAMES } from '../../core/data/elements';
import { HEROES, STARTERS } from '../../core/data/heroes';
import type { HeroId } from '../../core/types';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { debugHero, forceStarterSelect, loadStarter, saveStarter } from '../storage';
import { COLORS, ELEMENT_COLORS, TEXT } from '../theme';
import { Button } from '../ui/Button';

const CARD_W = 340;
const CARD_H = 400;
const GAP = 36;

/** 第一次開啟遊戲：御三家 3 選 1（DESIGN.md §3.2）。選過就直接進戰鬥 */
export class StarterScene extends Phaser.Scene {
  constructor() {
    super('Starter');
  }

  create(): void {
    const chosen = debugHero() ?? loadStarter();
    if (chosen && !forceStarterSelect()) {
      this.scene.start('Battle', { heroId: chosen });
      return;
    }

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.ground).setOrigin(0, 0);
    this.add
      .text(GAME_WIDTH / 2, 64, '守望者，選擇你的第一位夥伴', { fontFamily: FONT_FAMILY, fontSize: '34px', color: TEXT.normal })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 110, '裂隙裡的灰霧怪物正湧向星核。另外兩位之後可以在祭壇召喚到。', {
        fontFamily: FONT_FAMILY,
        fontSize: '17px',
        color: TEXT.dim,
      })
      .setOrigin(0.5);

    const left = (GAME_WIDTH - (CARD_W * 3 + GAP * 2)) / 2;
    STARTERS.forEach((id, i) => this.card(id, left + i * (CARD_W + GAP), 160));
  }

  private card(id: HeroId, x: number, y: number): void {
    const def = HEROES[id];
    const color = ELEMENT_COLORS[def.element];
    this.add.rectangle(x, y, CARD_W, CARD_H, COLORS.card).setOrigin(0, 0).setStrokeStyle(3, color);

    const cx = x + CARD_W / 2;
    const portrait = this.add.circle(cx, y + 74, 44, COLORS.panel).setStrokeStyle(5, color);
    this.tweens.add({ targets: portrait, scale: { from: 0.96, to: 1.04 }, duration: 1100, yoyo: true, repeat: -1 });
    this.add.text(cx, y + 74, def.name[0]!, { fontFamily: FONT_FAMILY, fontSize: '40px', color: TEXT.normal }).setOrigin(0.5);

    const add = (dy: number, content: string, size: number, fill: string) =>
      this.add
        .text(x + 24, y + dy, content, {
          fontFamily: FONT_FAMILY,
          fontSize: `${size}px`,
          color: fill,
          wordWrap: { width: CARD_W - 48, useAdvancedWrap: true },
          lineSpacing: 4,
        })
        .setOrigin(0, 0);

    add(136, `${def.name}・${def.title}`, 24, TEXT.normal);
    add(172, `${ELEMENT_NAMES[def.element]}元素・${def.role}`, 16, `#${color.toString(16).padStart(6, '0')}`);
    add(204, def.summary, 15, TEXT.dim);
    add(256, `被動：${def.passiveText}`, 14, TEXT.dim);
    add(298, `技能：${def.skill.name}`, 15, TEXT.good);

    new Button(this, {
      x: x + 24,
      y: y + CARD_H - 70,
      width: CARD_W - 48,
      height: 48,
      label: `選擇${def.name}`,
      fontSize: 19,
      color,
      onClick: () => {
        saveStarter(id);
        this.scene.start('Battle', { heroId: id });
      },
    });
  }
}
