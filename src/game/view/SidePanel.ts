import Phaser from 'phaser';
import { earlyCallBonus, sellValue, upgradeCost } from '../../core/battle/commands';
import { findTower, getStage } from '../../core/battle/state';
import { ENEMIES } from '../../core/data/enemies';
import { TOWER_ORDER, TOWERS } from '../../core/data/towers';
import type { BattleState, EnemyTypeId, TowerInstance, TowerTierStats, TowerTypeId } from '../../core/types';
import { Button } from '../ui/Button';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, PANEL_WIDTH, PANEL_X } from '../config';
import { TIER_LABEL } from '../text';
import { COLORS, TEXT } from '../theme';
import type { Selection } from './BattleRenderer';

export interface PanelActions {
  build(slot: number, type: TowerTypeId): void;
  upgrade(towerId: number): void;
  sell(towerId: number): void;
  nextWave(): void;
  toggleSpeed(): void;
  togglePause(): void;
  restart(): void;
  toast(message: string): void;
}

export interface PanelUiState {
  speed: number;
  paused: boolean;
  restartArmed: boolean;
}

const X = PANEL_X + 16;
const W = PANEL_WIDTH - 32;
const CONTEXT_TOP = 138;

/** 右側面板：資源、選取內容（蓋塔／升級／賣出）、波次與速度控制 */
export class SidePanel {
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly goldText: Phaser.GameObjects.Text;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly context: Phaser.GameObjects.Container;
  private contextKey = '';
  /** 選取內容中需要每幀更新的文字 */
  private liveUpdaters: Array<(state: BattleState) => void> = [];

  private readonly waveButton: Button;
  private readonly speedButton: Button;
  private readonly pauseButton: Button;
  private readonly restartButton: Button;

  constructor(private readonly scene: Phaser.Scene, private readonly actions: PanelActions) {
    // 面板背景可以接收點擊，避免點到面板空白處時取消地圖上的選取
    scene.add
      .rectangle(PANEL_X, 0, PANEL_WIDTH, GAME_HEIGHT, COLORS.panel)
      .setOrigin(0, 0)
      .setDepth(DEPTH.panel)
      .setInteractive();
    scene.add.rectangle(PANEL_X, 0, 2, GAME_HEIGHT, COLORS.panelBorder).setOrigin(0, 0).setDepth(DEPTH.panel);

    this.text(X, 14, '星火防線：裂隙初現', 13, TEXT.dim);
    this.hpText = this.text(X, 40, '', 19, TEXT.hp);
    this.goldText = this.text(X, 68, '', 19, TEXT.gold);
    this.waveText = this.text(X, 96, '', 19, TEXT.normal);
    this.divider(128);

    this.context = scene.add.container(0, 0).setDepth(DEPTH.panel);

    this.divider(578);
    this.waveButton = new Button(scene, {
      x: X,
      y: 590,
      width: W,
      height: 56,
      label: '',
      fontSize: 16,
      variant: 'primary',
      onClick: () => actions.nextWave(),
      onDisabledClick: () => actions.nextWave(),
    }).setDepth(DEPTH.panel);
    const small = { y: 656, width: 64, height: 44, fontSize: 15 };
    this.speedButton = new Button(scene, { ...small, x: X, label: '', onClick: () => actions.toggleSpeed() }).setDepth(
      DEPTH.panel,
    );
    this.pauseButton = new Button(scene, { ...small, x: X + 72, label: '', onClick: () => actions.togglePause() }).setDepth(
      DEPTH.panel,
    );
    this.restartButton = new Button(scene, {
      ...small,
      x: X + 144,
      label: '',
      onClick: () => actions.restart(),
    }).setDepth(DEPTH.panel);
  }

  update(state: BattleState, selection: Selection, ui: PanelUiState): void {
    this.hpText.setText(`♥ 耐久 ${state.coreHp} / ${state.maxCoreHp}`);
    this.goldText.setText(`◆ 金幣 ${state.gold}`);
    this.waveText.setText(`⚑ 波次 ${Math.max(0, state.waveIndex + 1)} / ${state.waveCount}`);

    const key = this.keyFor(state, selection);
    if (key !== this.contextKey) {
      this.contextKey = key;
      this.rebuildContext(state, selection);
    }
    for (const update of this.liveUpdaters) update(state);

    this.updateWaveButton(state);
    this.speedButton.setLabel(`${ui.speed}×`);
    this.pauseButton.setLabel(ui.paused ? '繼續' : '暫停').setEnabled(state.result === 'playing');
    this.restartButton.setLabel(ui.restartArmed ? '確定？' : '重來');
  }

  // ── 選取內容 ───────────────────────────────────────────

  private keyFor(state: BattleState, selection: Selection): string {
    if (state.result !== 'playing') return 'ended';
    if (selection.kind === 'slot') {
      const affordable = TOWER_ORDER.map((t) => (state.gold >= TOWERS[t].costs[0] ? 1 : 0)).join('');
      return `slot:${selection.slot}:${affordable}`;
    }
    if (selection.kind === 'tower') {
      const tower = findTower(state, selection.towerId);
      if (!tower) return 'none';
      const cost = upgradeCost(tower);
      return `tower:${tower.id}:${tower.tier}:${cost !== null && state.gold >= cost ? 1 : 0}`;
    }
    return `none:${state.waveIndex}:${state.waveIndex === -1 ? 'prep' : 'play'}`;
  }

  private rebuildContext(state: BattleState, selection: Selection): void {
    this.context.removeAll(true);
    this.liveUpdaters = [];
    if (state.result !== 'playing') return;
    if (selection.kind === 'slot') this.buildSlotContext(state, selection.slot);
    else if (selection.kind === 'tower') {
      const tower = findTower(state, selection.towerId);
      if (tower) this.buildTowerContext(state, tower);
      else this.buildIdleContext(state);
    } else this.buildIdleContext(state);
  }

  private buildIdleContext(state: BattleState): void {
    const next = state.waveIndex + 1;
    let y = CONTEXT_TOP;
    if (next >= state.waveCount) {
      this.contextText(X, y, '最後一波！', 18, TEXT.warn);
      y += 30;
      this.contextText(X, y, '撐過這一波就勝利了。', 15, TEXT.dim);
      return;
    }

    this.contextText(X, y, `第 ${next + 1} 波會出現`, 18, TEXT.normal);
    y += 32;
    for (const { enemy, count } of wavePreview(state.stageId, next)) {
      const def = ENEMIES[enemy];
      this.contextText(X, y, `${def.name} ×${count}`, 16, TEXT.normal);
      y += 22;
      const traits = enemyTraits(enemy);
      if (traits) {
        this.contextText(X + 12, y, traits, 13, TEXT.dim);
        y += 20;
      }
      y += 6;
    }

    y += 12;
    const hint =
      state.waveIndex === -1
        ? '點地圖上的空塔位蓋塔，\n準備好就按「開始第 1 波」。'
        : '點塔可以升級或賣出。\n倒數中可以提早呼叫下一波，\n剩餘秒數會換成金幣。';
    this.contextText(X, y, hint, 14, TEXT.dim);
  }

  private buildSlotContext(state: BattleState, slot: number): void {
    let y = CONTEXT_TOP;
    this.contextText(X, y, '空塔位：選擇要蓋的塔', 17, TEXT.normal);
    y += 34;
    for (const type of TOWER_ORDER) {
      const def = TOWERS[type];
      const cost = def.costs[0];
      const affordable = state.gold >= cost;
      new Button(
        this.scene,
        {
          x: X,
          y,
          width: W,
          height: 44,
          label: `${def.name}　${cost} 金`,
          fontSize: 17,
          variant: 'primary',
          onClick: () => this.actions.build(slot, type),
          onDisabledClick: () => this.actions.toast(`金幣不足，還差 ${cost - state.gold}`),
        },
        this.context,
      ).setEnabled(affordable);
      y += 50;
      y += this.contextText(X, y, def.summary, 13, TEXT.dim, W).height + 2;
      y += this.contextText(X, y, statsLine(def.tiers[0]), 13, TEXT.dim, W).height + 2;
      if (!affordable) {
        this.contextText(X, y, `還差 ${cost - state.gold} 金`, 13, TEXT.warn);
        y += 20;
      }
      y += 14;
    }
  }

  private buildTowerContext(state: BattleState, tower: TowerInstance): void {
    const def = TOWERS[tower.type];
    const stats = def.tiers[tower.tier];
    let y = CONTEXT_TOP;
    this.contextText(X, y, `${def.name}　階 ${TIER_LABEL[tower.tier]}`, 19, TEXT.normal);
    y += 32;
    y += this.contextText(X, y, statsLine(stats), 14, TEXT.dim, W).height + 4;
    const damageText = this.contextText(X, y, '', 14, TEXT.dim);
    this.liveUpdaters.push((s) => {
      const current = findTower(s, tower.id);
      if (current) damageText.setText(`累計傷害 ${Math.round(current.damageDealt)}`);
    });
    y += 34;

    const cost = upgradeCost(tower);
    if (cost === null) {
      this.contextText(X, y, '已達最高階', 16, TEXT.gold);
      y += 34;
    } else {
      const affordable = state.gold >= cost;
      new Button(
        this.scene,
        {
          x: X,
          y,
          width: W,
          height: 44,
          label: `升到階 ${TIER_LABEL[tower.tier + 1]}　${cost} 金`,
          fontSize: 17,
          variant: 'primary',
          onClick: () => this.actions.upgrade(tower.id),
          onDisabledClick: () => this.actions.toast(`金幣不足，還差 ${cost - state.gold}`),
        },
        this.context,
      ).setEnabled(affordable);
      y += 50;
      const next = def.tiers[tower.tier + 1]!;
      y += this.contextText(X, y, upgradePreview(stats, next), 13, TEXT.good, W).height + 4;
      if (!affordable) {
        this.contextText(X, y, `還差 ${cost - state.gold} 金`, 13, TEXT.warn);
        y += 20;
      }
      y += 18;
    }

    new Button(
      this.scene,
      {
        x: X,
        y,
        width: W,
        height: 40,
        label: `賣出　+${sellValue(tower)} 金`,
        fontSize: 16,
        variant: 'danger',
        onClick: () => this.actions.sell(tower.id),
      },
      this.context,
    );
    y += 46;
    this.contextText(X, y, '賣出退還總花費的 60%', 12, TEXT.dim);
  }

  // ── 控制列 ─────────────────────────────────────────────

  private updateWaveButton(state: BattleState): void {
    const b = this.waveButton;
    if (state.result !== 'playing') {
      b.setLabel('戰鬥結束').setEnabled(false);
    } else if (state.waveIndex === -1) {
      b.setLabel('開始第 1 波').setEnabled(true);
    } else if (state.countdown !== null) {
      const secs = Math.ceil(state.countdown);
      b.setLabel(`提早呼叫（+${earlyCallBonus(state)} 金）\n第 ${state.waveIndex + 2} 波 ${secs} 秒後開始`).setEnabled(true);
    } else if (state.spawning) {
      b.setLabel(`第 ${state.waveIndex + 1} 波進行中`).setEnabled(false);
    } else {
      b.setLabel('最後一波').setEnabled(false);
    }
  }

  // ── 小工具 ─────────────────────────────────────────────

  private text(x: number, y: number, content: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, content, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color })
      .setDepth(DEPTH.panel);
  }

  private contextText(
    x: number,
    y: number,
    content: string,
    size: number,
    color: string,
    wrapWidth?: number,
  ): Phaser.GameObjects.Text {
    const text = this.scene.add.text(x, y, content, {
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      color,
      lineSpacing: 4,
      ...(wrapWidth ? { wordWrap: { width: wrapWidth, useAdvancedWrap: true } } : {}),
    });
    this.context.add(text);
    return text;
  }

  private divider(y: number): void {
    this.scene.add
      .rectangle(X, y, W, 1, COLORS.panelBorder)
      .setOrigin(0, 0)
      .setDepth(DEPTH.panel);
  }
}

function statsLine(stats: TowerTierStats): string {
  const parts = [`傷害 ${stats.damage}`, `每 ${stats.interval} 秒`, `射程 ${stats.range}`];
  if (stats.splashRadius) parts.push(`範圍 ${stats.splashRadius}`);
  return parts.join('・');
}

function upgradePreview(current: TowerTierStats, next: TowerTierStats): string {
  const parts: string[] = [];
  if (next.damage !== current.damage) parts.push(`傷害 ${current.damage} → ${next.damage}`);
  if (next.range !== current.range) parts.push(`射程 ${current.range} → ${next.range}`);
  if (next.splashRadius !== current.splashRadius) parts.push(`範圍 ${current.splashRadius} → ${next.splashRadius}`);
  return parts.join('\n');
}

function wavePreview(stageId: string, index: number): Array<{ enemy: EnemyTypeId; count: number }> {
  const counts = new Map<EnemyTypeId, number>();
  for (const group of getStage(stageId).waves[index]?.groups ?? []) {
    counts.set(group.enemy, (counts.get(group.enemy) ?? 0) + group.count);
  }
  return [...counts].map(([enemy, count]) => ({ enemy, count }));
}

function enemyTraits(enemy: EnemyTypeId): string {
  const def = ENEMIES[enemy];
  const traits: string[] = [];
  if (def.armor > 0) traits.push(`護甲 ${def.armor}：弓箭傷害大減`);
  if (def.speed >= 100) traits.push('速度很快');
  if (def.leakDamage > 1) traits.push(`漏過扣 ${def.leakDamage} 耐久`);
  return traits.join('，');
}
