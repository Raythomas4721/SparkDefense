import Phaser from 'phaser';
import { earlyCallBonus, sellValue, upgradeCost } from '../../core/battle/commands';
import { mageCoverage, nearbyMageElements } from '../../core/battle/queries';
import { findTower, getStage, slotPosition } from '../../core/battle/state';
import { ELEMENT_NAMES, ELEMENTS, MARK_NAMES, MARK_RULES, REACTION_NAMES, reactionBetween } from '../../core/data/elements';
import { ENEMIES } from '../../core/data/enemies';
import { HERO_RULES, HEROES } from '../../core/data/heroes';
import { TOWER_ORDER, TOWERS } from '../../core/data/towers';
import type { BattleState, Element, EnemyTypeId, TierIndex, TowerInstance, TowerTypeId } from '../../core/types';
import { Button } from '../ui/Button';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, PANEL_WIDTH, PANEL_X } from '../config';
import { TIER_LABEL } from '../text';
import { COLORS, ELEMENT_COLORS, TEXT } from '../theme';
import type { Selection } from './BattleRenderer';

export interface PanelActions {
  build(slot: number, type: TowerTypeId, element?: Element): void;
  upgrade(towerId: number): void;
  sell(towerId: number): void;
  nextWave(): void;
  toggleSpeed(): void;
  togglePause(): void;
  restart(): void;
  startRally(towerId: number): void;
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
    if (selection.kind === 'hero' && state.hero) return `hero:${state.hero.alive ? 1 : 0}`;
    return `none:${state.waveIndex}:${state.waveIndex === -1 ? 'prep' : 'play'}`;
  }

  private rebuildContext(state: BattleState, selection: Selection): void {
    this.context.removeAll(true);
    this.liveUpdaters = [];
    if (state.result !== 'playing') return;
    if (selection.kind === 'slot') this.buildSlotContext(state, selection.slot);
    else if (selection.kind === 'hero' && state.hero) this.buildHeroContext(state);
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
    y += 30;
    for (const type of TOWER_ORDER) {
      const def = TOWERS[type];
      const cost = def.costs[0];
      const affordable = state.gold >= cost;
      const shortfall = affordable ? '' : `（差 ${cost - state.gold}）`;
      const notEnough = () => this.actions.toast(`金幣不足，還差 ${cost - state.gold}`);

      if (def.elemental) {
        // 法師塔：先選元素才蓋
        this.contextText(X, y, `${def.name}　${cost} 金${shortfall}`, 16, affordable ? TEXT.normal : TEXT.disabled);
        y += 24;
        const bw = (W - 16) / 3;
        ELEMENTS.forEach((element, i) => {
          new Button(
            this.scene,
            {
              x: X + i * (bw + 8),
              y,
              width: bw,
              height: 38,
              label: ELEMENT_NAMES[element],
              fontSize: 18,
              color: ELEMENT_COLORS[element],
              onClick: () => this.actions.build(slot, type, element),
              onDisabledClick: notEnough,
            },
            this.context,
          ).setEnabled(affordable);
        });
        y += 42;
      } else {
        new Button(
          this.scene,
          {
            x: X,
            y,
            width: W,
            height: 40,
            label: `${def.name}　${cost} 金${shortfall}`,
            fontSize: 16,
            variant: 'primary',
            onClick: () => this.actions.build(slot, type),
            onDisabledClick: notEnough,
          },
          this.context,
        ).setEnabled(affordable);
        y += 44;
      }
      y += this.contextText(X, y, def.summary, 13, TEXT.dim, W).height;
      if (def.elemental) y += this.contextText(X, y, mageHint(nearbyMageElements(state, slot)), 13, TEXT.good, W).height;
      y += 12;
    }
  }

  private buildTowerContext(state: BattleState, tower: TowerInstance): void {
    const def = TOWERS[tower.type];
    const stats = def.tiers[tower.tier];
    let y = CONTEXT_TOP;
    const name = tower.element ? `${def.name}・${ELEMENT_NAMES[tower.element]}` : def.name;
    this.contextText(X, y, `${name}　階 ${TIER_LABEL[tower.tier]}`, 19, TEXT.normal);
    y += 32;
    y += this.contextText(X, y, statsText(tower.type, tower.tier), 14, TEXT.dim, W).height + 4;
    if (tower.type === 'barracks') {
      new Button(
        this.scene,
        { x: X, y, width: W, height: 36, label: '設定集結點', fontSize: 15, onClick: () => this.actions.startRally(tower.id) },
        this.context,
      );
      y += 42;
    }
    if (tower.element) {
      y += this.contextText(X, y, markDescription(tower.element), 13, TEXT.dim, W).height + 2;
      const partners = mageCoverage(state, slotPosition(state, tower.slot), stats.range, tower.id).flatMap((p) => p.elements);
      y += this.contextText(X, y, partnerHint(tower.element, partners), 13, TEXT.good, W).height + 4;
    }
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
      y += this.contextText(X, y, upgradePreview(tower.type, tower.tier), 13, TEXT.good, W).height + 4;
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

  private buildHeroContext(state: BattleState): void {
    const hero = state.hero!;
    const def = HEROES[hero.heroId];
    const a = def.attack;
    let y = CONTEXT_TOP;
    this.contextText(X, y, `${def.name}・${def.title}`, 19, TEXT.normal);
    y += 28;
    this.contextText(X, y, `${ELEMENT_NAMES[def.element]}元素・${def.role}`, 14, `#${ELEMENT_COLORS[def.element].toString(16)}`);
    y += 24;

    const hpText = this.contextText(X, y, '', 14, TEXT.normal);
    this.liveUpdaters.push((s) => {
      const h = s.hero;
      if (!h) return;
      hpText.setText(h.alive ? `生命 ${Math.ceil(h.hp)} / ${h.maxHp}　護甲 ${h.armor}` : `陣亡，${Math.ceil(h.respawn)} 秒後復活`);
      hpText.setColor(h.alive ? TEXT.normal : TEXT.hp);
    });
    y += 22;
    const attackStats = [`傷害 ${a.damage}`, `每 ${a.interval} 秒`, `射程 ${a.range}`];
    if (a.pierce) attackStats.push(`穿透 ${a.pierce}`);
    if (a.splashRadius) attackStats.push(`範圍 ${a.splashRadius}`);
    y += this.contextText(X, y, attackStats.join('・'), 13, TEXT.dim, W).height + 8;

    y += this.contextText(X, y, `被動：${def.passiveText}`, 13, TEXT.dim, W).height + 6;
    y += this.contextText(X, y, `技能「${def.skill.name}」（冷卻 ${def.skill.cooldown} 秒）`, 14, TEXT.good, W).height + 2;
    y += this.contextText(X, y, def.skill.description, 13, TEXT.dim, W).height + 6;
    y += this.contextText(
      X,
      y,
      `元素加持：半徑 ${HERO_RULES.auraRadius} 內的${ELEMENT_NAMES[def.element]}法師塔傷害 +${HERO_RULES.auraBonus * 100}%`,
      13,
      TEXT.dim,
      W,
    ).height + 12;
    this.contextText(X, y, '移動：點路上的位置\n技能：點左下角的技能按鈕', 13, TEXT.warn, W);
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

function statsText(type: TowerTypeId, tier: TierIndex): string {
  const def = TOWERS[type];
  const stats = def.tiers[tier];
  if (def.soldier) {
    return (
      `士兵 ${def.soldier.count} 名・生命 ${def.soldier.hp[tier]}・護甲 ${def.soldier.armor[tier]}\n` +
      `每名傷害 ${stats.damage}／${stats.interval} 秒・集結範圍 ${stats.range}`
    );
  }
  const parts = [`傷害 ${stats.damage}`, `每 ${stats.interval} 秒`, `射程 ${stats.range}`];
  if (stats.splashRadius) parts.push(`範圍 ${stats.splashRadius}`);
  return parts.join('・');
}

function upgradePreview(type: TowerTypeId, tier: TierIndex): string {
  const def = TOWERS[type];
  const nextTier = (tier + 1) as TierIndex;
  const current = def.tiers[tier];
  const next = def.tiers[nextTier];
  const parts: string[] = [];
  const diff = (label: string, a: number | undefined, b: number | undefined) => {
    if (a !== b) parts.push(`${label} ${a} → ${b}`);
  };
  diff(def.soldier ? '每名傷害' : '傷害', current.damage, next.damage);
  diff('射程', current.range, next.range);
  diff('範圍', current.splashRadius, next.splashRadius);
  if (def.soldier) {
    diff('士兵生命', def.soldier.hp[tier], def.soldier.hp[nextTier]);
    diff('士兵護甲', def.soldier.armor[tier], def.soldier.armor[nextTier]);
  }
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
  if (def.tags.includes('boss')) traits.push('首領');
  if (def.tags.includes('flying')) traits.push('飛行：砲塔打不到');
  if (def.tags.includes('swarm')) traits.push('成群出現：適合範圍攻擊');
  if (def.armor > 0) traits.push(`護甲 ${def.armor}：物理傷害大減，魔法無視`);
  if (def.speed >= 100) traits.push('速度很快');
  if (def.summon) traits.push(`每 ${def.summon.interval} 秒召喚${ENEMIES[def.summon.enemy].name}`);
  if (def.leakDamage > 1) traits.push(`漏過扣 ${def.leakDamage} 耐久`);
  return traits.join('，');
}

function markDescription(element: Element): string {
  const detail = {
    fire: `每秒 ${MARK_RULES.burnDps} 點傷害`,
    water: `移速 −${MARK_RULES.wetSlow * 100}%`,
    wood: '只用來觸發反應',
  }[element];
  return `附加印記：${MARK_NAMES[element]}（${detail}）`;
}

/** element 和 others 中每個不同的元素會觸發的反應 */
function reactionsWith(element: Element, others: readonly Element[]): Array<{ other: Element; name: string }> {
  return [...new Set(others)]
    .filter((other) => other !== element)
    .map((other) => ({ other, name: REACTION_NAMES[reactionBetween(element, other)!] }));
}

/** 已蓋好的法師塔：射程內和哪些元素重疊、會觸發什麼反應 */
function partnerHint(element: Element, partners: readonly Element[]): string {
  const list = reactionsWith(element, partners).map((r) => `${ELEMENT_NAMES[r.other]}塔 → ${r.name}`);
  return list.length > 0 ? `射程重疊：${list.join('、')}` : '射程內沒有不同元素的法師塔，不會觸發反應';
}

/** 準備蓋法師塔：選不同元素各會和附近的塔觸發什麼反應 */
function mageHint(nearby: readonly Element[]): string {
  if (nearby.length === 0) return '附近沒有法師塔。兩座不同元素的法師塔射程重疊時，會觸發反應';
  const options = ELEMENTS.map((e) => ({ e, names: reactionsWith(e, nearby).map((r) => r.name) }))
    .filter((o) => o.names.length > 0)
    .map((o) => `選${ELEMENT_NAMES[o.e]}→${o.names.join('、')}`);
  return `射程內有${nearby.map((e) => ELEMENT_NAMES[e]).join('、')}塔：${options.join('，')}`;
}
