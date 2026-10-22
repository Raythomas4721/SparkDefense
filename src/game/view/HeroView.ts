import Phaser from 'phaser';
import { getMap } from '../../core/battle/state';
import { HEROES } from '../../core/data/heroes';
import type { BattleState } from '../../core/types';
import { DEPTH, FONT_FAMILY } from '../config';
import { COLORS, ELEMENT_COLORS, TEXT } from '../theme';

export const HERO_RADIUS = 15;

/** 地圖上的英雄：本體、血條、移動目的地、陣亡時的復活倒數 */
export class HeroView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly initial: Phaser.GameObjects.Text;
  private readonly respawnText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.enemies);
    this.initial = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '15px', color: TEXT.normal })
      .setOrigin(0.5)
      .setDepth(DEPTH.enemies);
    this.respawnText = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '13px', color: TEXT.dim, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(DEPTH.enemies);
  }

  draw(state: BattleState, selected: boolean): void {
    const g = this.g.clear();
    const hero = state.hero;
    if (!hero) {
      this.initial.setVisible(false);
      this.respawnText.setVisible(false);
      return;
    }
    const def = HEROES[hero.heroId];
    const color = ELEMENT_COLORS[def.element];
    this.initial.setText(def.name[0]!);

    if (!hero.alive) {
      // 在起始位置顯示半透明的身影與復活倒數
      const start = getMap(state).heroStart;
      g.fillStyle(color, 0.15).fillCircle(start.x, start.y, HERO_RADIUS);
      g.lineStyle(2, color, 0.4).strokeCircle(start.x, start.y, HERO_RADIUS);
      this.initial.setVisible(true).setPosition(start.x, start.y).setAlpha(0.4);
      this.respawnText.setVisible(true).setPosition(start.x, start.y + 26).setText(`復活 ${Math.ceil(hero.respawn)}`);
      return;
    }
    this.respawnText.setVisible(false);

    const { x, y } = hero.pos;
    if (hero.moveTarget) {
      const t = hero.moveTarget;
      g.lineStyle(2, color, 0.5).lineBetween(x, y, t.x, t.y);
      g.lineStyle(3, color, 0.9).lineBetween(t.x - 6, t.y - 6, t.x + 6, t.y + 6).lineBetween(t.x - 6, t.y + 6, t.x + 6, t.y - 6);
    }
    if (selected) g.lineStyle(3, COLORS.selection, 1).strokeCircle(x, y, HERO_RADIUS + 6);
    g.fillStyle(0x000000, 0.35).fillEllipse(x, y + HERO_RADIUS - 2, 26, 8);
    g.fillStyle(COLORS.panel, 1).fillCircle(x, y, HERO_RADIUS);
    g.lineStyle(3, color, 1).strokeCircle(x, y, HERO_RADIUS);
    this.initial.setVisible(true).setPosition(x, y).setAlpha(1);

    const ratio = Math.max(0, hero.hp / hero.maxHp);
    g.fillStyle(COLORS.hpBack, 0.7).fillRect(x - 17, y - HERO_RADIUS - 10, 34, 5);
    g.fillStyle(ratio > 0.4 ? COLORS.hpHigh : COLORS.hpLow, 1).fillRect(x - 16, y - HERO_RADIUS - 9, 32 * ratio, 3);
  }
}
