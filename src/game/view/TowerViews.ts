import Phaser from 'phaser';
import { slotPosition } from '../../core/battle/state';
import type { BattleState, TowerInstance } from '../../core/types';
import { DEPTH, FONT_FAMILY } from '../config';
import { TIER_LABEL } from '../text';
import { ELEMENT_NAMES } from '../../core/data/elements';
import { COLORS, ELEMENT_COLORS, TEXT } from '../theme';

interface TowerSprite {
  container: Phaser.GameObjects.Container;
  tierText: Phaser.GameObjects.Text;
  tier: number;
}

const LABEL: Record<TowerInstance['type'], string> = { archer: '弓', barracks: '兵', cannon: '砲', mage: '法' };

/** 六角形的頂點（法師塔底座） */
function hexagon(radius: number): Phaser.Geom.Point[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return new Phaser.Geom.Point(Math.cos(a) * radius, Math.sin(a) * radius);
  });
}

/** 讓畫面上的塔和 state.towers 保持一致 */
export class TowerViews {
  private readonly sprites = new Map<number, TowerSprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(state: BattleState): void {
    const alive = new Set<number>();
    for (const tower of state.towers) {
      alive.add(tower.id);
      let sprite = this.sprites.get(tower.id);
      if (!sprite) {
        sprite = this.create(state, tower);
        this.sprites.set(tower.id, sprite);
      }
      if (sprite.tier !== tower.tier) {
        sprite.tier = tower.tier;
        sprite.tierText.setText(TIER_LABEL[tower.tier]);
        this.scene.tweens.add({ targets: sprite.container, scale: { from: 1.25, to: 1 }, duration: 200 });
      }
    }
    for (const [id, sprite] of this.sprites) {
      if (!alive.has(id)) {
        sprite.container.destroy();
        this.sprites.delete(id);
      }
    }
  }

  /** 開火時的後座力動畫 */
  recoil(towerId: number): void {
    const sprite = this.sprites.get(towerId);
    if (!sprite) return;
    this.scene.tweens.add({ targets: sprite.container, scale: { from: 1.1, to: 1 }, duration: 90 });
  }

  private create(state: BattleState, tower: TowerInstance): TowerSprite {
    const pos = slotPosition(state, tower.slot);
    const g = this.scene.add.graphics();
    if (tower.type === 'archer') {
      g.fillStyle(COLORS.archerFill, 1).fillRoundedRect(-20, -20, 40, 40, 6);
      g.lineStyle(3, COLORS.archerStroke, 1).strokeRoundedRect(-20, -20, 40, 40, 6);
    } else if (tower.type === 'barracks') {
      // 盾形：上方平、下方尖
      const shield = [
        new Phaser.Geom.Point(-20, -19),
        new Phaser.Geom.Point(20, -19),
        new Phaser.Geom.Point(20, 4),
        new Phaser.Geom.Point(0, 21),
        new Phaser.Geom.Point(-20, 4),
      ];
      g.fillStyle(COLORS.barracksFill, 1).fillPoints(shield, true);
      g.lineStyle(3, COLORS.barracksStroke, 1).strokePoints(shield, true);
    } else if (tower.type === 'cannon') {
      g.fillStyle(COLORS.cannonFill, 1).fillCircle(0, 0, 22);
      g.lineStyle(3, COLORS.cannonStroke, 1).strokeCircle(0, 0, 22);
    } else {
      const edge = tower.element ? ELEMENT_COLORS[tower.element] : COLORS.slotStroke;
      g.fillStyle(COLORS.mageFill, 1).fillPoints(hexagon(23), true);
      g.lineStyle(3, edge, 1).strokePoints(hexagon(23), true);
    }
    // 法師塔顯示元素字（炎／潮／森），其他塔顯示塔種
    const labelText = tower.element ? ELEMENT_NAMES[tower.element] : LABEL[tower.type];
    const label = this.scene.add
      .text(0, -1, labelText, { fontFamily: FONT_FAMILY, fontSize: '18px', color: TEXT.normal })
      .setOrigin(0.5);
    const tierText = this.scene.add
      .text(0, 31, TIER_LABEL[tower.tier], {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: TEXT.gold,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const container = this.scene.add.container(pos.x, pos.y, [g, label, tierText]).setDepth(DEPTH.towers);
    this.scene.tweens.add({ targets: container, scale: { from: 0.6, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    return { container, tierText, tier: tower.tier };
  }
}
