import Phaser from 'phaser';
import { buildTower, sellTower, startNextWave, upgradeTower, type CommandResult } from '../../core/battle/commands';
import { createBattle, findTower, slotPosition, towerAtSlot } from '../../core/battle/state';
import { step } from '../../core/battle/step';
import { STEP_DT } from '../../core/data/battle';
import { MAPS } from '../../core/data/map';
import type { BattleEvent, BattleState, TowerTypeId } from '../../core/types';
import { MAP_WIDTH } from '../config';
import { failureMessage } from '../text';
import { TEXT } from '../theme';
import { BattleRenderer, type Selection } from '../view/BattleRenderer';
import { Effects } from '../view/Effects';
import { MapView, SLOT_RADIUS } from '../view/MapView';
import { showResultOverlay } from '../view/ResultOverlay';
import { SidePanel } from '../view/SidePanel';
import { TowerViews } from '../view/TowerViews';

const STAGE_ID = 'stage-1';
/** 一幀最多推進的步數，避免分頁切回來時一次算太久 */
const MAX_STEPS_PER_FRAME = 20;

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private selection: Selection = { kind: 'none' };
  private accumulator = 0;
  private speed = 1;
  private paused = false;
  private restartArmed = false;
  private restartTimer?: Phaser.Time.TimerEvent;

  private mapView!: MapView;
  private battleView!: BattleRenderer;
  private towerViews!: TowerViews;
  private effects!: Effects;
  private panel!: SidePanel;
  private pauseText!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  create(): void {
    this.state = createBattle(STAGE_ID, Date.now() >>> 0);
    this.selection = { kind: 'none' };
    this.accumulator = 0;
    this.paused = false;
    this.restartArmed = false;

    const map = MAPS[this.state.mapId]!;
    this.mapView = new MapView(this, map);
    this.battleView = new BattleRenderer(this);
    this.towerViews = new TowerViews(this);
    this.effects = new Effects(this);
    this.panel = new SidePanel(this, {
      build: (slot, type) => this.build(slot, type),
      upgrade: (id) => this.run(upgradeTower(this.state, id)),
      sell: (id) => this.sell(id),
      nextWave: () => this.nextWave(),
      toggleSpeed: () => (this.speed = this.speed === 1 ? 2 : 1),
      togglePause: () => this.setPaused(!this.paused),
      restart: () => this.requestRestart(),
      toast: (message) => this.effects.toast(message),
    });

    this.pauseText = this.add
      .text(MAP_WIDTH / 2, 360, '已暫停', {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        color: TEXT.normal,
        backgroundColor: '#0b0d14aa',
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(15)
      .setVisible(false);

    // 只處理沒有點到任何按鈕或面板的點擊
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return;
      this.handleMapTap(pointer.worldX, pointer.worldY);
    });

    // 開發模式：在 console 用 __spark.state 查看戰鬥狀態
    if (import.meta.env.DEV) {
      const scene = this;
      (window as unknown as { __spark: object }).__spark = {
        game: this.game,
        get state() {
          return scene.state;
        },
        get selection() {
          return scene.selection;
        },
      };
    }
  }

  update(_time: number, deltaMs: number): void {
    if (!this.paused && this.state.result === 'playing') {
      this.accumulator += (Math.min(deltaMs, 250) / 1000) * this.speed;
      let steps = 0;
      while (this.accumulator >= STEP_DT && steps < MAX_STEPS_PER_FRAME) {
        this.handleEvents(step(this.state, STEP_DT));
        this.accumulator -= STEP_DT;
        steps++;
      }
    }

    if (this.selection.kind === 'tower' && !findTower(this.state, this.selection.towerId)) {
      this.selection = { kind: 'none' };
    }
    this.towerViews.sync(this.state);
    this.battleView.draw(this.state, this.selection);
    this.panel.update(this.state, this.selection, {
      speed: this.speed,
      paused: this.paused,
      restartArmed: this.restartArmed,
    });
  }

  // ── 玩家操作 ───────────────────────────────────────────

  private handleMapTap(x: number, y: number): void {
    if (x >= MAP_WIDTH || this.state.result !== 'playing') return;
    const map = MAPS[this.state.mapId]!;
    const slot = map.slots.findIndex((s) => Math.hypot(s.x - x, s.y - y) <= SLOT_RADIUS + 8);
    if (slot === -1) {
      this.selection = { kind: 'none' };
      return;
    }
    const tower = towerAtSlot(this.state, slot);
    this.selection = tower ? { kind: 'tower', towerId: tower.id } : { kind: 'slot', slot };
  }

  private build(slot: number, type: TowerTypeId): void {
    if (!this.run(buildTower(this.state, slot, type))) return;
    const tower = towerAtSlot(this.state, slot);
    if (tower) this.selection = { kind: 'tower', towerId: tower.id };
  }

  private sell(towerId: number): void {
    const tower = findTower(this.state, towerId);
    if (!tower) return;
    const pos = slotPosition(this.state, tower.slot);
    const result = sellTower(this.state, towerId);
    if (!this.run(result) || !result.ok) return;
    this.effects.floatText(pos.x, pos.y - 20, `+${result.gold ?? 0}`, TEXT.gold);
    this.selection = { kind: 'slot', slot: tower.slot };
  }

  private nextWave(): void {
    const result = startNextWave(this.state);
    if (!this.run(result) || !result.ok) return;
    if (result.gold) this.effects.toast(`提早呼叫！獲得 ${result.gold} 金`);
    this.effects.banner(`第 ${this.state.waveIndex + 1} 波`);
  }

  /** 執行指令；失敗時顯示原因。回傳是否成功 */
  private run(result: CommandResult): boolean {
    if (!result.ok) this.effects.toast(failureMessage(result));
    return result.ok;
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseText.setVisible(paused);
  }

  private requestRestart(): void {
    if (this.restartArmed || this.state.result !== 'playing') {
      this.scene.restart();
      return;
    }
    this.restartArmed = true;
    this.effects.toast('再按一次「確定？」重新開始這一關');
    this.restartTimer?.remove();
    this.restartTimer = this.time.delayedCall(3000, () => (this.restartArmed = false));
  }

  // ── 戰鬥事件 → 特效 ─────────────────────────────────────

  private handleEvents(events: BattleEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'enemyKilled':
          this.effects.floatText(event.pos.x, event.pos.y - 14, `+${event.gold}`, TEXT.gold, 14);
          break;
        case 'enemyLeaked':
          this.effects.pulse(this.mapView.core);
          this.effects.floatText(this.mapView.core.x, this.mapView.core.y - 40, `-${event.damage}`, TEXT.hp, 20);
          break;
        case 'towerFired':
          this.towerViews.recoil(event.towerId);
          break;
        case 'explosion':
          this.effects.explosion(event.pos.x, event.pos.y, event.radius);
          break;
        case 'waveStarted':
          // 倒數結束自動開始的波次（手動呼叫的在 nextWave() 顯示）
          this.effects.banner(`第 ${event.waveIndex + 1} 波`);
          break;
        case 'waveSpawned':
          if (event.bonus > 0) this.effects.toast(`第 ${event.waveIndex + 1} 波出完：波次獎勵 +${event.bonus} 金`);
          break;
        case 'victory':
        case 'defeat':
          this.setPaused(false);
          this.selection = { kind: 'none' };
          this.time.delayedCall(600, () => showResultOverlay(this, this.state, () => this.scene.restart()));
          break;
        case 'enemySpawned':
        case 'arrowHit':
          break;
      }
    }
  }
}
