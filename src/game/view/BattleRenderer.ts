import Phaser from 'phaser';
import { getPath, positionAt, tangentAt } from '../../core/battle/path';
import { mageCoverage } from '../../core/battle/queries';
import { enemyPosition, findEnemy, findTower, slotPosition } from '../../core/battle/state';
import { reactionBetween } from '../../core/data/elements';
import { HERO_RULES, HEROES } from '../../core/data/heroes';
import { TOWERS } from '../../core/data/towers';
import type { BattleState, EnemyInstance, EnemyTypeId } from '../../core/types';
import { DEPTH } from '../config';
import { COLORS, ELEMENT_COLORS, REACTION_COLORS } from '../theme';
import { SLOT_RADIUS } from './MapView';

export type Selection =
  | { kind: 'none' }
  | { kind: 'slot'; slot: number }
  | { kind: 'tower'; towerId: number }
  | { kind: 'hero' };

/** 點地圖時的用途：一般選取、設定集結點、選擇技能施放位置 */
export type MapMode = { kind: 'normal' } | { kind: 'rally'; towerId: number } | { kind: 'skill' };

const SHELL_ARC_HEIGHT = 40;
/** 飛行敵人畫在地面上方多高 */
const FLY_HEIGHT = 10;

/** 各種敵人的大小（半徑），決定血條與印記圖示的位置 */
const ENEMY_SIZE: Record<EnemyTypeId, number> = {
  grunt: 11,
  runner: 10,
  bat: 11,
  brute: 14,
  mist: 7,
  colossus: 24,
};

/** 每幀重畫的部分：選取框、射程、反應熱區、敵人、投射物 */
export class BattleRenderer {
  private readonly selectionLayer: Phaser.GameObjects.Graphics;
  private readonly enemyLayer: Phaser.GameObjects.Graphics;
  private readonly projectileLayer: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.selectionLayer = scene.add.graphics().setDepth(DEPTH.selection);
    this.enemyLayer = scene.add.graphics().setDepth(DEPTH.enemies);
    this.projectileLayer = scene.add.graphics().setDepth(DEPTH.projectiles);
  }

  draw(state: BattleState, selection: Selection, mode: MapMode): void {
    this.drawSelection(state, selection, mode);
    this.enemyLayer.clear();
    this.drawSoldiers(state);
    this.drawEnemies(state);
    this.drawProjectiles(state);
  }

  // ── 兵營的士兵與集結點 ─────────────────────────────────

  private drawSoldiers(state: BattleState): void {
    const g = this.enemyLayer;
    for (const tower of state.towers) {
      if (!tower.rally) continue;
      const { x, y } = tower.rally;
      g.lineStyle(2, COLORS.barracksStroke, 0.8).lineBetween(x, y - 20, x, y + 2);
      g.fillStyle(COLORS.barracksStroke, 0.8).fillTriangle(x, y - 20, x + 11, y - 15, x, y - 10);
    }
    for (const soldier of state.soldiers) {
      if (!soldier.alive) {
        g.fillStyle(COLORS.soldier, 0.2).fillCircle(soldier.home.x, soldier.home.y, 6);
        continue;
      }
      // 戰鬥中站到敵人旁邊，否則站在集結點附近
      let { x, y } = soldier.home;
      const enemy = soldier.engagedEnemyId === null ? undefined : findEnemy(state, soldier.engagedEnemyId);
      if (enemy) {
        const e = enemyPosition(state, enemy);
        const len = Math.hypot(soldier.home.x - e.x, soldier.home.y - e.y) || 1;
        x = e.x + ((soldier.home.x - e.x) / len) * 15;
        y = e.y + ((soldier.home.y - e.y) / len) * 15;
      }
      g.fillStyle(COLORS.soldier, 1).fillCircle(x, y, 7);
      g.lineStyle(2, COLORS.soldierEdge, 1).strokeCircle(x, y, 7);
      g.lineStyle(2, 0xffffff, 0.9).lineBetween(x - 3, y + 3, x + 4, y - 4); // 劍
      if (soldier.hp < soldier.maxHp) {
        const ratio = Math.max(0, soldier.hp / soldier.maxHp);
        g.fillStyle(COLORS.hpBack, 0.7).fillRect(x - 9, y - 14, 18, 4);
        g.fillStyle(ratio > 0.4 ? COLORS.hpHigh : COLORS.hpLow, 1).fillRect(x - 8, y - 13, 16 * ratio, 2);
      }
    }
  }

  // ── 選取與反應熱區 ─────────────────────────────────────

  private drawSelection(state: BattleState, selection: Selection, mode: MapMode): void {
    const g = this.selectionLayer.clear();
    if (selection.kind === 'slot') {
      const p = slotPosition(state, selection.slot);
      g.lineStyle(3, COLORS.selection, 1).strokeCircle(p.x, p.y, SLOT_RADIUS + 4);
      // 預覽：在這裡蓋法師塔時，路上哪些地方會和既有的法師塔重疊（以對方元素的顏色標示）
      for (const point of mageCoverage(state, p, TOWERS.mage.tiers[0].range)) {
        point.elements.forEach((element, i) => {
          g.fillStyle(ELEMENT_COLORS[element], 0.75).fillCircle(point.pos.x + i * 5, point.pos.y, 3);
        });
      }
      return;
    }
    if (selection.kind === 'hero') {
      const hero = state.hero;
      if (!hero?.alive) return;
      const def = HEROES[hero.heroId];
      const color = ELEMENT_COLORS[def.element];
      // 攻擊範圍（白）＋元素加持範圍（元素色）
      g.fillStyle(0xffffff, 0.05).fillCircle(hero.pos.x, hero.pos.y, def.attack.range);
      g.lineStyle(2, 0xffffff, 0.3).strokeCircle(hero.pos.x, hero.pos.y, def.attack.range);
      g.lineStyle(2, color, 0.45).strokeCircle(hero.pos.x, hero.pos.y, HERO_RULES.auraRadius);
      return;
    }
    if (selection.kind !== 'tower') return;

    const tower = findTower(state, selection.towerId);
    if (!tower) return;
    const p = slotPosition(state, tower.slot);
    const range = TOWERS[tower.type].tiers[tower.tier].range;
    const choosingRally = mode.kind === 'rally' && mode.towerId === tower.id;
    g.fillStyle(choosingRally ? COLORS.barracksStroke : 0xffffff, choosingRally ? 0.12 : 0.06).fillCircle(p.x, p.y, range);
    g.lineStyle(2, choosingRally ? COLORS.barracksStroke : 0xffffff, choosingRally ? 0.9 : 0.35).strokeCircle(p.x, p.y, range);
    g.lineStyle(3, COLORS.selection, 1).strokeCircle(p.x, p.y, SLOT_RADIUS + 6);

    // 法師塔：標出會和其他元素法師塔觸發反應的路段（以反應的顏色標示）
    if (tower.element) {
      for (const point of mageCoverage(state, p, range, tower.id)) {
        const reaction = point.elements.map((e) => reactionBetween(tower.element!, e)).find((r) => r);
        if (reaction) g.fillStyle(REACTION_COLORS[reaction].fill, 0.85).fillCircle(point.pos.x, point.pos.y, 4);
      }
    }
  }

  // ── 敵人 ───────────────────────────────────────────────

  private drawEnemies(state: BattleState): void {
    const g = this.enemyLayer;
    const path = getPath(state.mapId);
    // 先畫地面的，再畫飛行的，飛行敵人才會在上層
    const sorted = [...state.enemies].sort((a, b) => Number(a.type === 'bat') - Number(b.type === 'bat'));
    for (const enemy of sorted) {
      // 同一條路上的敵人稍微左右錯開，避免完全疊在一起（只影響畫面）
      const base = positionAt(path, enemy.distance);
      const dir = tangentAt(path, enemy.distance);
      const offset = enemy.type === 'colossus' ? 0 : lateralOffset(enemy.id);
      const x = base.x - dir.y * offset;
      let y = base.y + dir.x * offset;
      if (enemy.type === 'bat') {
        g.fillStyle(0x000000, 0.3).fillEllipse(x, y + 4, 16, 6); // 地面影子
        y -= FLY_HEIGHT;
      }

      this.drawEnemyBody(g, enemy.type, x, y, dir);
      const size = ENEMY_SIZE[enemy.type];
      if (enemy.rooted > 0) {
        g.lineStyle(2, COLORS.root, 0.9).strokeCircle(x, y, size + 5);
        g.lineStyle(1, COLORS.root, 0.6).strokeCircle(x, y, size + 8);
      }
      this.drawHpBar(g, enemy, x, y - size - 8);
      if (enemy.mark) this.drawMark(g, enemy, x + size + 6, y - size - 4);
    }
  }

  private drawEnemyBody(
    g: Phaser.GameObjects.Graphics,
    type: EnemyTypeId,
    x: number,
    y: number,
    dir: { x: number; y: number },
  ): void {
    switch (type) {
      case 'grunt':
        g.fillStyle(COLORS.grunt, 1).fillCircle(x, y, 11);
        g.lineStyle(2, 0x000000, 0.5).strokeCircle(x, y, 11);
        break;
      case 'runner': {
        // 菱形，尖端朝前進方向
        const fx = dir.x * 12, fy = dir.y * 12, sx = -dir.y * 7, sy = dir.x * 7;
        g.fillStyle(COLORS.runner, 1).fillTriangle(x + fx, y + fy, x + sx, y + sy, x - sx, y - sy);
        g.fillTriangle(x - fx * 0.6, y - fy * 0.6, x + sx, y + sy, x - sx, y - sy);
        break;
      }
      case 'bat':
        // 兩片翅膀＋身體
        g.fillStyle(COLORS.bat, 1);
        g.fillTriangle(x - 3, y, x - 15, y - 7, x - 11, y + 5);
        g.fillTriangle(x + 3, y, x + 15, y - 7, x + 11, y + 5);
        g.fillStyle(COLORS.batBody, 1).fillCircle(x, y, 5);
        g.lineStyle(1, COLORS.bat, 1).strokeCircle(x, y, 5);
        break;
      case 'brute':
        // 重甲：方形＋粗外框
        g.fillStyle(COLORS.brute, 1).fillRect(x - 14, y - 14, 28, 28);
        g.lineStyle(4, COLORS.bruteArmor, 1).strokeRect(x - 14, y - 14, 28, 28);
        break;
      case 'mist':
        g.fillStyle(COLORS.mist, 0.75).fillCircle(x, y, 7);
        break;
      case 'colossus':
        g.fillStyle(COLORS.colossus, 1).fillRoundedRect(x - 24, y - 24, 48, 48, 8);
        g.lineStyle(4, COLORS.colossusEdge, 1).strokeRoundedRect(x - 24, y - 24, 48, 48, 8);
        g.fillStyle(COLORS.colossusCore, 1).fillCircle(x, y, 8);
        break;
    }
  }

  private drawHpBar(g: Phaser.GameObjects.Graphics, enemy: EnemyInstance, x: number, y: number): void {
    const isBoss = enemy.type === 'colossus';
    if (enemy.hp >= enemy.maxHp && !isBoss) return;
    const width = isBoss ? 56 : 28;
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    g.fillStyle(COLORS.hpBack, 0.7).fillRect(x - width / 2, y - 2, width, 5);
    g.fillStyle(ratio > 0.4 ? COLORS.hpHigh : COLORS.hpLow, 1).fillRect(x - width / 2 + 1, y - 1, (width - 2) * ratio, 3);
  }

  /** 印記圖示：炎＝火焰三角形、潮＝水滴圓形、森＝葉片菱形（形狀不同，不只靠顏色） */
  private drawMark(g: Phaser.GameObjects.Graphics, enemy: EnemyInstance, x: number, y: number): void {
    const element = enemy.mark!.element;
    const color = ELEMENT_COLORS[element];
    g.fillStyle(0x000000, 0.55).fillCircle(x, y, 7);
    g.fillStyle(color, 1);
    if (element === 'fire') g.fillTriangle(x, y - 5, x - 4, y + 4, x + 4, y + 4);
    else if (element === 'water') g.fillCircle(x, y + 1, 4);
    else g.fillTriangle(x, y - 5, x - 4, y, x + 4, y).fillTriangle(x, y + 5, x - 4, y, x + 4, y);
  }

  // ── 投射物 ─────────────────────────────────────────────

  private drawProjectiles(state: BattleState): void {
    const g = this.projectileLayer.clear();
    for (const p of state.projectiles) {
      if (p.kind === 'arrow') {
        if (p.element) {
          const color = ELEMENT_COLORS[p.element];
          g.fillStyle(color, 0.35).fillCircle(p.pos.x, p.pos.y, 7);
          g.fillStyle(color, 1).fillCircle(p.pos.x, p.pos.y, 4);
        } else {
          g.fillStyle(COLORS.arrow, 1).fillCircle(p.pos.x, p.pos.y, 3);
        }
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
