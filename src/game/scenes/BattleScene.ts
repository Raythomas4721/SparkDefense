import Phaser from 'phaser';
import { buildTower, sellTower, setRallyPoint, startNextWave, upgradeTower, type CommandResult } from '../../core/battle/commands';
import { addHero, castSkill, moveHero } from '../../core/battle/heroes';
import { createBattle, findTower, getStage, slotPosition, towerAtSlot } from '../../core/battle/state';
import { step } from '../../core/battle/step';
import { STEP_DT } from '../../core/data/battle';
import { REACTION_NAMES } from '../../core/data/elements';
import { ENEMIES } from '../../core/data/enemies';
import { HEROES } from '../../core/data/heroes';
import { MAPS } from '../../core/data/map';
import type { BattleEvent, BattleState, Element, HeroId, TowerTypeId } from '../../core/types';
import { MAP_WIDTH } from '../config';
import { debugHero, loadStarter } from '../storage';
import { failureMessage } from '../text';
import { ELEMENT_COLORS, REACTION_COLORS, TEXT } from '../theme';
import { BattleRenderer, type MapMode, type Selection } from '../view/BattleRenderer';
import { Effects } from '../view/Effects';
import { HeroHud } from '../view/HeroHud';
import { HERO_RADIUS, HeroView } from '../view/HeroView';
import { MapView, SLOT_RADIUS } from '../view/MapView';
import { showResultOverlay } from '../view/ResultOverlay';
import { SidePanel } from '../view/SidePanel';
import { TowerViews } from '../view/TowerViews';

const STAGE_ID = 'stage-1';
/** 一幀最多推進的步數，避免分頁切回來時一次算太久 */
const MAX_STEPS_PER_FRAME = 20;

export interface BattleSceneData {
  heroId?: HeroId;
}

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private heroId: HeroId = 'helo';
  private selection: Selection = { kind: 'none' };
  private mode: MapMode = { kind: 'normal' };
  private accumulator = 0;
  private speed = 1;
  private paused = false;
  private restartArmed = false;
  private restartTimer?: Phaser.Time.TimerEvent;

  private mapView!: MapView;
  private battleView!: BattleRenderer;
  private towerViews!: TowerViews;
  private heroView!: HeroView;
  private heroHud!: HeroHud;
  private effects!: Effects;
  private panel!: SidePanel;
  private pauseText!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  create(data: BattleSceneData = {}): void {
    this.heroId = data.heroId ?? debugHero() ?? loadStarter() ?? 'helo';
    this.state = createBattle(STAGE_ID, Date.now() >>> 0);
    addHero(this.state, this.heroId);
    this.selection = { kind: 'none' };
    this.mode = { kind: 'normal' };
    this.accumulator = 0;
    this.paused = false;
    this.restartArmed = false;

    const map = MAPS[this.state.mapId]!;
    this.mapView = new MapView(this, map);
    this.battleView = new BattleRenderer(this);
    this.towerViews = new TowerViews(this);
    this.heroView = new HeroView(this);
    this.effects = new Effects(this);
    this.panel = new SidePanel(this, {
      build: (slot, type, element) => this.build(slot, type, element),
      upgrade: (id) => this.run(upgradeTower(this.state, id)),
      sell: (id) => this.sell(id),
      nextWave: () => this.nextWave(),
      toggleSpeed: () => (this.speed = this.speed === 1 ? 2 : 1),
      togglePause: () => this.setPaused(!this.paused),
      restart: () => this.requestRestart(),
      startRally: (id) => this.startRally(id),
      toast: (message) => this.effects.toast(message),
    });
    this.heroHud = new HeroHud(this, this.state, {
      selectHero: () => (this.selection = { kind: 'hero' }),
      skill: () => this.pressSkill(),
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
        get mode() {
          return scene.mode;
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
    if (this.mode.kind === 'rally' && !(this.selection.kind === 'tower' && this.selection.towerId === this.mode.towerId)) {
      this.mode = { kind: 'normal' };
    }
    if (this.mode.kind === 'skill' && !this.state.hero?.alive) this.mode = { kind: 'normal' };

    this.towerViews.sync(this.state);
    this.battleView.draw(this.state, this.selection, this.mode);
    this.heroView.draw(this.state, this.selection.kind === 'hero');
    this.heroHud.update(this.state, this.mode.kind === 'skill');
    this.panel.update(this.state, this.selection, {
      speed: this.speed,
      paused: this.paused,
      restartArmed: this.restartArmed,
    });
  }

  // ── 玩家操作 ───────────────────────────────────────────

  /**
   * 點地圖的優先順序：技能施放 → 集結點 → 點到英雄 → 點到塔位 → 英雄選取中就移動 → 取消選取
   */
  private handleMapTap(x: number, y: number): void {
    if (x >= MAP_WIDTH || this.state.result !== 'playing') return;
    if (this.mode.kind === 'skill') {
      const events: BattleEvent[] = [];
      const result = castSkill(this.state, { x, y }, events);
      this.mode = { kind: 'normal' };
      if (this.run(result)) this.handleEvents(events);
      return;
    }
    if (this.mode.kind === 'rally') {
      const result = setRallyPoint(this.state, this.mode.towerId, { x, y });
      if (result.ok) this.effects.toast('集結點已設定');
      else this.effects.toast(`${failureMessage(result)}（再按一次「設定集結點」重試）`);
      this.mode = { kind: 'normal' };
      return;
    }

    const hero = this.state.hero;
    if (hero?.alive && Math.hypot(hero.pos.x - x, hero.pos.y - y) <= HERO_RADIUS + 10) {
      this.selection = { kind: 'hero' };
      return;
    }
    const map = MAPS[this.state.mapId]!;
    const slot = map.slots.findIndex((s) => Math.hypot(s.x - x, s.y - y) <= SLOT_RADIUS + 8);
    if (slot !== -1) {
      const tower = towerAtSlot(this.state, slot);
      this.selection = tower ? { kind: 'tower', towerId: tower.id } : { kind: 'slot', slot };
      return;
    }
    if (this.selection.kind === 'hero') {
      const result = moveHero(this.state, { x, y });
      if (result.ok) return;
      if (result.reason !== 'not-on-path') this.effects.toast(failureMessage(result));
    }
    this.selection = { kind: 'none' };
  }

  /** 技能按鈕：自身範圍的技能直接施放，其他的進入「選擇位置」模式；再按一次取消 */
  private pressSkill(): void {
    if (this.mode.kind === 'skill') {
      this.mode = { kind: 'normal' };
      return;
    }
    const hero = this.state.hero;
    if (!hero) return;
    if (!hero.alive) return void this.effects.toast(failureMessage({ ok: false, reason: 'hero-dead' }));
    if (hero.skillCooldown > 0) return void this.effects.toast(`技能還在冷卻（${Math.ceil(hero.skillCooldown)} 秒）`);

    const skill = HEROES[hero.heroId].skill;
    if (skill.targeting === 'self') {
      const events: BattleEvent[] = [];
      if (this.run(castSkill(this.state, null, events))) this.handleEvents(events);
      return;
    }
    this.mode = { kind: 'skill' };
    this.effects.toast(skill.targeting === 'direction' ? `點地圖決定「${skill.name}」的方向` : `點地圖選擇「${skill.name}」的位置`);
  }

  private startRally(towerId: number): void {
    this.mode = { kind: 'rally', towerId };
    this.effects.toast('點兵營附近的路，設定集結點');
  }

  private build(slot: number, type: TowerTypeId, element?: Element): void {
    if (!this.run(buildTower(this.state, slot, type, element))) return;
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
    this.announceWave(this.state.waveIndex);
  }

  /** 波次開始的大字；首領波另外提示 */
  private announceWave(index: number): void {
    const wave = getStage(this.state.stageId).waves[index];
    const boss = wave?.groups.find((g) => ENEMIES[g.enemy].tags.includes('boss'));
    this.effects.banner(`第 ${index + 1} 波`, boss ? `首領來襲：${ENEMIES[boss.enemy].name}` : undefined);
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

  private restartBattle(): void {
    this.scene.restart({ heroId: this.heroId } satisfies BattleSceneData);
  }

  private requestRestart(): void {
    if (this.restartArmed || this.state.result !== 'playing') {
      this.restartBattle();
      return;
    }
    this.restartArmed = true;
    this.effects.toast('再按一次「確定？」重新開始這一關');
    this.restartTimer?.remove();
    this.restartTimer = this.time.delayedCall(3000, () => (this.restartArmed = false));
  }

  // ── 戰鬥事件 → 特效 ─────────────────────────────────────

  private handleEvents(events: BattleEvent[]): void {
    const heroColor = ELEMENT_COLORS[HEROES[this.heroId].element];
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
          this.effects.explosion(event.pos.x, event.pos.y, event.radius, event.element ? ELEMENT_COLORS[event.element] : undefined);
          break;
        case 'reaction': {
          const color = REACTION_COLORS[event.reaction];
          this.effects.floatText(event.pos.x, event.pos.y - 26, `${REACTION_NAMES[event.reaction]}！`, color.text, 17);
          if (event.radius) this.effects.explosion(event.pos.x, event.pos.y, event.radius, color.fill);
          break;
        }
        case 'heroAttack':
          if (event.style === 'fan') {
            this.effects.slash(event.from, event.to, 52, HEROES[this.heroId].attack.fanAngle ?? 90, heroColor);
          } else if (event.style === 'pierce') {
            this.effects.beam(event.from, event.to, heroColor, 3, 120);
          }
          break;
        case 'skillCast':
          if (event.effect === 'lance' && event.to) this.effects.beam(event.pos, event.to, heroColor, 12, 400);
          else if (event.effect === 'meteor') this.effects.warning(event.pos.x, event.pos.y, event.radius ?? 80, heroColor, 1);
          else this.effects.ring(event.pos.x, event.pos.y, event.radius ?? 80, heroColor);
          if (event.effect === 'bloom') this.effects.floatText(event.pos.x, event.pos.y - 30, '回復！', TEXT.good, 18);
          break;
        case 'heroDied':
          this.effects.toast(`${HEROES[this.heroId].name}倒下了，15 秒後復活`);
          break;
        case 'heroRespawned':
          this.effects.toast(`${HEROES[this.heroId].name}回到戰場`);
          break;
        case 'waveStarted':
          // 倒數結束自動開始的波次（手動呼叫的在 nextWave() 顯示）
          this.announceWave(event.waveIndex);
          break;
        case 'waveSpawned':
          if (event.bonus > 0) this.effects.toast(`第 ${event.waveIndex + 1} 波出完：波次獎勵 +${event.bonus} 金`);
          break;
        case 'victory':
        case 'defeat':
          this.setPaused(false);
          this.selection = { kind: 'none' };
          this.mode = { kind: 'normal' };
          this.time.delayedCall(600, () => showResultOverlay(this, this.state, () => this.restartBattle()));
          break;
        case 'enemySpawned':
        case 'arrowHit':
        case 'soldierDied':
          break;
      }
    }
  }
}
