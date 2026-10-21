import Phaser from 'phaser';
import { getPath, positionAt, tangentAt } from '../../core/battle/path';
import { findTower, slotPosition } from '../../core/battle/state';
import { TOWERS } from '../../core/data/towers';
import type { BattleState, EnemyInstance } from '../../core/types';
import { DEPTH } from '../config';
import { COLORS } from '../theme';
import { SLOT_RADIUS } from './MapView';

export type Selection = { kind: 'none' } | { kind: 'slot'; slot: number } | { kind: 'tower'; towerId: number };

const SHELL_ARC_HEIGHT = 40;

/** 每幀重畫的部分：選取框、射程、敵人、投射物 */
export class BattleRenderer {
  private readonly selectionLayer: Phaser.GameObjects.Graphics;
  private readonly enemyLayer: Phaser.GameObjects.Graphics;
  private readonly projectileLayer: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.selectionLayer = scene.add.graphics().setDepth(DEPTH.selection);
    this.enemyLayer = scene.add.graphics().setDepth(DEPTH.enemies);
    this.projectileLayer = scene.add.graphics().setDepth(DEPTH.projectiles);
  }

  draw(state: BattleState, selection: Selection): void {
    this.drawSelection(state, selection);
    this.drawEnemies(state);
    this.drawProjectiles(state);
  }

  private drawSelection(state: BattleState, selection: Selection): void {
    const g = this.selectionLayer.clear();
    if (selection.kind === 'slot') {
      const p = slotPosition(state, selection.slot);
      g.lineStyle(3, COLORS.selection, 1).strokeCircle(p.x, p.y, SLOT_RADIUS + 4);
    } else if (selection.kind === 'tower') {
      const tower = findTower(state, selection.towerId);
      if (!tower) return;
      const p = slotPosition(state, tower.slot);
      const range = TOWERS[tower.type].tiers[tower.tier].range;
      g.fillStyle(0xffffff, 0.06).fillCircle(p.x, p.y, range);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(p.x, p.y, range);
      g.lineStyle(3, COLORS.selection, 1).strokeCircle(p.x, p.y, SLOT_RADIUS + 6);
    }
  }

  private drawEnemies(state: BattleState): void {
    const g = this.enemyLayer.clear();
    const path = getPath(state.mapId);
    for (const enemy of state.enemies) {
      // 同一條路上的敵人稍微左右錯開，避免完全疊在一起（只影響畫面）
      const base = positionAt(path, enemy.distance);
      const dir = tangentAt(path, enemy.distance);
      const offset = lateralOffset(enemy.id);
      const x = base.x - dir.y * offset;
      const y = base.y + dir.x * offset;

      if (enemy.type === 'grunt') {
        g.fillStyle(COLORS.grunt, 1).fillCircle(x, y, 11);
        g.lineStyle(2, 0x000000, 0.5).strokeCircle(x, y, 11);
      } else if (enemy.type === 'runner') {
        // 菱形，尖端朝前進方向
        const fx = dir.x * 12, fy = dir.y * 12, sx = -dir.y * 7, sy = dir.x * 7;
        g.fillStyle(COLORS.runner, 1).fillTriangle(x + fx, y + fy, x + sx, y + sy, x - sx, y - sy);
        g.fillTriangle(x - fx * 0.6, y - fy * 0.6, x + sx, y + sy, x - sx, y - sy);
      } else {
        // 重甲：方形＋粗外框
        g.fillStyle(COLORS.brute, 1).fillRect(x - 14, y - 14, 28, 28);
        g.lineStyle(4, COLORS.bruteArmor, 1).strokeRect(x - 14, y - 14, 28, 28);
      }
      this.drawHpBar(g, enemy, x, y - 22);
    }
  }

  private drawHpBar(g: Phaser.GameObjects.Graphics, enemy: EnemyInstance, x: number, y: number): void {
    if (enemy.hp >= enemy.maxHp) return;
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    g.fillStyle(COLORS.hpBack, 0.7).fillRect(x - 14, y - 2, 28, 5);
    g.fillStyle(ratio > 0.4 ? COLORS.hpHigh : COLORS.hpLow, 1).fillRect(x - 13, y - 1, 26 * ratio, 3);
  }

  private drawProjectiles(state: BattleState): void {
    const g = this.projectileLayer.clear();
    for (const p of state.projectiles) {
      if (p.kind === 'arrow') {
        g.fillStyle(COLORS.arrow, 1).fillCircle(p.pos.x, p.pos.y, 3);
      } else {
        const t = Math.min(1, p.elapsed / p.flightTime);
        const lift = Math.sin(Math.PI * t) * SHELL_ARC_HEIGHT;
        g.fillStyle(0x000000, 0.3).fillEllipse(p.pos.x, p.pos.y, 10, 5);
        g.fillStyle(COLORS.shell, 1).fillCircle(p.pos.x, p.pos.y - lift, 6);
        g.lineStyle(2, COLORS.cannonStroke, 1).strokeCircle(p.pos.x, p.pos.y - lift, 6);
      }
    }
  }
}

function lateralOffset(id: number): number {
  return (((id * 2654435761) >>> 0) % 13) - 6;
}
