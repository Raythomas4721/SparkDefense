import Phaser from 'phaser';
import { HEROES } from '../../core/data/heroes';
import type { BattleState } from '../../core/types';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT } from '../config';
import { COLORS, ELEMENT_COLORS, TEXT } from '../theme';
import { Button } from '../ui/Button';

export interface HeroHudActions {
  selectHero(): void;
  skill(): void;
}

const PORTRAIT = { x: 46, y: GAME_HEIGHT - 46, r: 30 };

/** 戰場左下角：英雄頭像（點了選取英雄）與技能按鈕（冷卻時顯示秒數） */
export class HeroHud {
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly skillButton: Button;

  constructor(scene: Phaser.Scene, state: BattleState, actions: HeroHudActions) {
    const def = state.hero ? HEROES[state.hero.heroId] : null;
    this.ring = scene.add.graphics().setDepth(DEPTH.panel);
    const portrait = scene.add
      .circle(PORTRAIT.x, PORTRAIT.y, PORTRAIT.r, COLORS.panel)
      .setDepth(DEPTH.panel)
      .setInteractive({ useHandCursor: true });
    portrait.on('pointerdown', () => actions.selectHero());
    scene.add
      .text(PORTRAIT.x, PORTRAIT.y, def?.name[0] ?? '', { fontFamily: FONT_FAMILY, fontSize: '24px', color: TEXT.normal })
      .setOrigin(0.5)
      .setDepth(DEPTH.panel);

    this.skillButton = new Button(scene, {
      x: PORTRAIT.x + PORTRAIT.r + 12,
      y: PORTRAIT.y - 26,
      width: 150,
      height: 52,
      label: '',
      fontSize: 15,
      color: def ? ELEMENT_COLORS[def.element] : COLORS.buttonPrimary,
      onClick: () => actions.skill(),
      onDisabledClick: () => actions.skill(),
    }).setDepth(DEPTH.panel);

    if (!def) {
      portrait.setVisible(false);
      this.skillButton.setVisible(false);
    }
  }

  update(state: BattleState, targeting: boolean): void {
    const hero = state.hero;
    if (!hero) return;
    const def = HEROES[hero.heroId];
    const g = this.ring.clear();

    // 頭像外圈：生命比例
    const ratio = hero.alive ? hero.hp / hero.maxHp : 0;
    g.lineStyle(5, COLORS.hpBack, 0.6).strokeCircle(PORTRAIT.x, PORTRAIT.y, PORTRAIT.r + 3);
    g.lineStyle(5, ratio > 0.4 ? COLORS.hpHigh : COLORS.hpLow, 1);
    g.beginPath();
    g.arc(PORTRAIT.x, PORTRAIT.y, PORTRAIT.r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    g.strokePath();

    let status: string;
    if (!hero.alive) status = `復活中 ${Math.ceil(hero.respawn)}`;
    else if (targeting) status = '點地圖施放（再按取消）';
    else if (hero.skillCooldown > 0) status = `冷卻 ${Math.ceil(hero.skillCooldown)} 秒`;
    else status = '就緒！';
    const ready = hero.alive && hero.skillCooldown <= 0;
    this.skillButton.setLabel(`${def.skill.name}\n${status}`).setEnabled(ready || targeting);
  }
}
