import Phaser from 'phaser';
import type { MapDefinition } from '../../core/types';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, MAP_WIDTH } from '../config';
import { COLORS, TEXT } from '../theme';

export const SLOT_RADIUS = 24;
const PATH_WIDTH = 46;

/** 不會變動的地圖背景：地面、路線、裂隙、星核、塔位 */
export class MapView {
  readonly core: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, map: MapDefinition) {
    scene.add.rectangle(0, 0, MAP_WIDTH, GAME_HEIGHT, COLORS.ground).setOrigin(0, 0).setDepth(DEPTH.map);

    const g = scene.add.graphics().setDepth(DEPTH.map);
    this.drawPath(g, map, PATH_WIDTH + 8, COLORS.pathEdge);
    this.drawPath(g, map, PATH_WIDTH, COLORS.path);

    for (const slot of map.slots) {
      g.fillStyle(COLORS.slotFill, 1).fillCircle(slot.x, slot.y, SLOT_RADIUS);
      g.lineStyle(2, COLORS.slotStroke, 0.9).strokeCircle(slot.x, slot.y, SLOT_RADIUS);
      g.lineStyle(2, COLORS.slotStroke, 0.6);
      g.lineBetween(slot.x - 6, slot.y, slot.x + 6, slot.y);
      g.lineBetween(slot.x, slot.y - 6, slot.x, slot.y + 6);
    }

    // 裂隙（入口）
    const start = map.path[0]!;
    const rift = scene.add.ellipse(Math.max(start.x, 14), start.y, 30, 70, COLORS.rift, 0.45).setDepth(DEPTH.map);
    rift.setStrokeStyle(3, COLORS.riftGlow);
    scene.tweens.add({ targets: rift, scaleY: 1.15, alpha: 0.75, duration: 900, yoyo: true, repeat: -1 });

    // 星核（終點）
    const end = map.path[map.path.length - 1]!;
    this.core = scene.add.circle(end.x, end.y, 28, COLORS.core, 0.55).setDepth(DEPTH.map);
    this.core.setStrokeStyle(3, COLORS.coreGlow);
    scene.add
      .text(end.x, end.y + 44, '星核', { fontFamily: FONT_FAMILY, fontSize: '14px', color: TEXT.dim })
      .setOrigin(0.5)
      .setDepth(DEPTH.map);
  }

  private drawPath(g: Phaser.GameObjects.Graphics, map: MapDefinition, width: number, color: number): void {
    g.lineStyle(width, color, 1);
    g.beginPath();
    map.path.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.strokePath();
    // 轉角補圓，避免粗線在接點出現缺口
    g.fillStyle(color, 1);
    for (const p of map.path.slice(1, -1)) g.fillCircle(p.x, p.y, width / 2);
  }
}
