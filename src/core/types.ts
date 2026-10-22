import type { RngState } from './rng';

export interface Vec2 {
  x: number;
  y: number;
}

// ── 定義（固定資料，放在 data/） ─────────────────────────────

export type TowerTypeId = 'archer' | 'barracks' | 'mage' | 'cannon';
export type EnemyTypeId = 'grunt' | 'runner' | 'brute' | 'bat' | 'mist' | 'colossus';
export type HeroId = 'helo' | 'chaosheng' | 'senya' | 'ni' | 'mo' | 'liya';
export type DamageType = 'physical' | 'magic';
export type EnemyTag = 'flying' | 'heavy' | 'boss' | 'swarm';
export type TierIndex = 0 | 1 | 2;
/** 炎、潮、森 */
export type Element = 'fire' | 'water' | 'wood';
/** 蒸發（炎＋潮）、束縛（潮＋森）、野火（森＋炎） */
export type ReactionId = 'vaporize' | 'bind' | 'wildfire';
/** first：最接近終點；strongest：生命最高並鎖定；cluster：周圍敵人最多 */
export type TargetPriority = 'first' | 'strongest' | 'cluster';

export interface TowerTierStats {
  damage: number;
  /** 攻擊間隔（秒） */
  interval: number;
  /** 射程；兵營是集結範圍 */
  range: number;
  /** 範圍攻擊半徑；單體攻擊沒有這個欄位 */
  splashRadius?: number;
}

export interface TowerDefinition {
  id: TowerTypeId;
  name: string;
  /** 一句話描述，顯示在建造選單 */
  summary: string;
  /** [建造, 升到階 II, 升到階 III] */
  costs: readonly [number, number, number];
  tiers: readonly [TowerTierStats, TowerTierStats, TowerTierStats];
  damageType: DamageType;
  canHitFlying: boolean;
  /** 建造時要選元素（法師塔） */
  elemental?: boolean;
  /** arrow：追蹤目標的投射物（箭、法術）；shell：飛向預測落點的砲彈；barracks：派士兵阻擋 */
  attack: 'arrow' | 'shell' | 'barracks';
  /** arrow 的飛行速度（像素／秒） */
  projectileSpeed?: number;
  /** shell 的飛行時間（秒） */
  flightTime?: number;
  /** 兵營的士兵 */
  soldier?: {
    count: number;
    hp: readonly [number, number, number];
    armor: readonly [number, number, number];
    /** 陣亡後重生秒數 */
    respawn: number;
  };
}

export interface EnemyDefinition {
  id: EnemyTypeId;
  name: string;
  hp: number;
  armor: number;
  /** 像素／秒 */
  speed: number;
  gold: number;
  /** 漏過時扣的星核耐久 */
  leakDamage: number;
  tags: readonly EnemyTag[];
  /** 被阻擋時攻擊阻擋者；沒有這個欄位的敵人不會攻擊（例如飛行） */
  attack?: { damage: number; interval: number };
  /** 定期在自己身後召喚其他敵人（首領） */
  summon?: { enemy: EnemyTypeId; count: number; interval: number };
}

export interface SpawnGroup {
  enemy: EnemyTypeId;
  count: number;
  /** 同一組內每隻的間隔（秒） */
  interval: number;
  /** 從波次開始到這組第一隻出現的延遲（秒） */
  delay?: number;
}

export interface WaveDefinition {
  groups: readonly SpawnGroup[];
  /** 這波全部出完時給的獎勵 */
  clearBonus: number;
}

export interface StageDefinition {
  id: string;
  name: string;
  mapId: string;
  waves: readonly WaveDefinition[];
}

export interface MapDefinition {
  id: string;
  /** 路線節點，敵人從第一個點走到最後一個點（星核） */
  path: readonly Vec2[];
  /** 塔位座標；陣列索引就是塔位編號 */
  slots: readonly Vec2[];
  /** 英雄開場與復活的位置（在路上） */
  heroStart: Vec2;
}

// ── 英雄定義（DESIGN.md §6） ──────────────────────────────

export interface HeroAttack {
  /** fan：近戰扇形；projectile：追蹤投射物；pierce：直線穿透（瞬間命中）；splash：落點範圍爆炸 */
  style: 'fan' | 'projectile' | 'pierce' | 'splash';
  damage: number;
  damageType: DamageType;
  interval: number;
  range: number;
  targeting: TargetPriority;
  fanAngle?: number;
  pierce?: number;
  splashRadius?: number;
  /** 命中時的額外緩速 */
  slow?: { amount: number; duration: number };
}

export type HeroPassive =
  /** 每第 every 次攻擊附加強灼燒（灼燒傷害 × burnMultiplier） */
  | { kind: 'strongBurnEvery'; every: number; burnMultiplier: number }
  /** 連續命中同一目標時，第 hits 擊傷害 × multiplier */
  | { kind: 'focusStreak'; hits: number; multiplier: number }
  /** 一次命中 hits 名以上時，下一次攻擊間隔減少 reduction */
  | { kind: 'pierceHaste'; hits: number; reduction: number }
  /** 擊殺灼燒中的敵人時，敵人爆炸 */
  | { kind: 'burningKillBlast'; damage: number; radius: number }
  /** 自己附加的印記持續時間 × multiplier */
  | { kind: 'markDuration'; multiplier: number }
  /** 半徑內的塔攻速 +amount */
  | { kind: 'towerHaste'; radius: number; amount: number };

export type HeroSkillEffect =
  /** 以自己為中心的範圍傷害 */
  | { kind: 'nova'; radius: number; damage: number; burnMultiplier: number }
  /** 朝指定方向的直線，貫穿所有敵人 */
  | { kind: 'lance'; length: number; width: number; damage: number; damageType: DamageType }
  /** 指定地點範圍定身，附加纏藤 */
  | { kind: 'snare'; radius: number; rootDuration: number; bossFactor: number }
  /** 指定地點延遲後爆炸，附加灼燒 */
  | { kind: 'meteor'; radius: number; delay: number; damage: number }
  /** 指定地點範圍緩速，附加潮濕 */
  | { kind: 'tide'; radius: number; slow: number; duration: number }
  /** 以自己為中心：士兵與英雄回血、塔加攻速 */
  | { kind: 'bloom'; radius: number; healRatio: number; haste: number; duration: number };

export interface HeroSkill {
  name: string;
  description: string;
  cooldown: number;
  /** self：按下就施放；point：點地圖選位置；direction：點地圖決定方向 */
  targeting: 'self' | 'point' | 'direction';
  effect: HeroSkillEffect;
}

export interface HeroDefinition {
  id: HeroId;
  name: string;
  /** 稱號，例如「燼刃」 */
  title: string;
  element: Element;
  role: string;
  /** 御三家（開局 3 選 1） */
  starter: boolean;
  summary: string;
  hp: number;
  armor: number;
  attack: HeroAttack;
  passive: HeroPassive;
  passiveText: string;
  skill: HeroSkill;
}

// ── 戰鬥中的狀態 ─────────────────────────────────────────

export interface TowerInstance {
  id: number;
  type: TowerTypeId;
  slot: number;
  tier: TierIndex;
  /** 法師塔的元素；其他塔為 null */
  element: Element | null;
  /** 兵營的集結點（在路上）；其他塔為 null */
  rally: Vec2 | null;
  /** 距離下次可攻擊的秒數 */
  cooldown: number;
  /** 累計花費（建造＋升級），賣出時用 */
  spent: number;
  /** 累計造成的傷害，給介面與模擬統計 */
  damageDealt: number;
}

export interface SoldierInstance {
  id: number;
  towerId: number;
  /** 在兵營中的編號，決定站位 */
  index: number;
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  /** 重生倒數（陣亡時才使用） */
  respawn: number;
  /** 沒有在戰鬥時站的位置（集結點附近） */
  home: Vec2;
  cooldown: number;
  /** 正在阻擋的敵人 */
  engagedEnemyId: number | null;
}

export interface HeroInstance {
  id: number;
  heroId: HeroId;
  hp: number;
  maxHp: number;
  armor: number;
  pos: Vec2;
  /** 移動目的地；null 表示站著 */
  moveTarget: Vec2 | null;
  alive: boolean;
  /** 復活倒數（陣亡時才使用） */
  respawn: number;
  cooldown: number;
  /** 技能剩餘冷卻；0 表示可以施放 */
  skillCooldown: number;
  engagedEnemyId: number | null;
  /** 累計攻擊次數（被動「每第 N 次攻擊」用） */
  attackCount: number;
  /** 連續命中的目標與次數（被動「連續命中」用） */
  streakTargetId: number | null;
  streak: number;
  damageDealt: number;
}

/** 敵人身上的元素印記；同時最多一個（DESIGN.md §5.4） */
export interface ElementMark {
  element: Element;
  /** 剩餘秒數 */
  remaining: number;
  /** 灼燒每秒傷害（只有炎印記用到） */
  burnDps: number;
  /** 附加印記的來源（塔或英雄），灼燒傷害算在它身上 */
  sourceId: number;
}

export interface EnemyInstance {
  id: number;
  type: EnemyTypeId;
  hp: number;
  maxHp: number;
  /** 沿路線走過的距離 */
  distance: number;
  mark: ElementMark | null;
  /** 印記以外的緩速（例如沫的水波） */
  slow: { amount: number; remaining: number } | null;
  /** 定身剩餘秒數 */
  rooted: number;
  /** 束縛免疫剩餘秒數 */
  rootImmunity: number;
  /** 被哪個阻擋者（士兵或英雄）擋住；null 表示沒被擋 */
  blockedBy: number | null;
  attackCooldown: number;
  /** 距離下次召喚的秒數（沒有召喚能力時不使用） */
  summonCooldown: number;
}

/** 命中時的附加效果（英雄被動等） */
export interface HitExtras {
  /** 灼燒傷害倍率（強灼燒） */
  burnMultiplier?: number;
  /** 印記持續時間倍率 */
  markDurationMultiplier?: number;
  /** 額外緩速 */
  slow?: { amount: number; duration: number };
  /** 擊殺灼燒中的敵人時爆炸 */
  burningKillBlast?: { damage: number; radius: number };
}

export interface ArrowProjectile extends HitExtras {
  id: number;
  kind: 'arrow';
  sourceId: number;
  targetId: number;
  pos: Vec2;
  speed: number;
  damage: number;
  damageType: DamageType;
  /** 法術會附加元素印記；箭為 null */
  element: Element | null;
}

export interface ShellProjectile extends HitExtras {
  id: number;
  kind: 'shell';
  sourceId: number;
  from: Vec2;
  to: Vec2;
  pos: Vec2;
  elapsed: number;
  flightTime: number;
  damage: number;
  damageType: DamageType;
  element: Element | null;
  radius: number;
}

export type Projectile = ArrowProjectile | ShellProjectile;

/** 塔的攻速加成區域（莉亞的技能） */
export interface HasteZone {
  pos: Vec2;
  radius: number;
  amount: number;
  remaining: number;
}

/** 延遲發動的效果（霓的隕火） */
export interface DelayedBlast {
  at: number;
  pos: Vec2;
  radius: number;
  damage: number;
  element: Element | null;
  sourceId: number;
}

export interface PendingSpawn {
  /** 戰鬥時間（秒） */
  at: number;
  enemy: EnemyTypeId;
}

export type BattleResult = 'playing' | 'victory' | 'defeat';

export interface BattleStats {
  kills: number;
  leaks: number;
  goldEarned: number;
  goldSpent: number;
  earlyCallGold: number;
  /** 各種反應觸發的次數 */
  reactions: Record<ReactionId, number>;
}

export interface BattleState {
  stageId: string;
  mapId: string;
  /** 戰鬥經過的秒數 */
  time: number;
  gold: number;
  coreHp: number;
  maxCoreHp: number;
  /** 目前波次索引；-1 表示還沒開始第一波 */
  waveIndex: number;
  waveCount: number;
  /** 目前這波是否還在出怪 */
  spawning: boolean;
  pendingSpawns: PendingSpawn[];
  /** 距離下一波的秒數；null 表示沒有在倒數 */
  countdown: number | null;
  towers: TowerInstance[];
  soldiers: SoldierInstance[];
  hero: HeroInstance | null;
  enemies: EnemyInstance[];
  projectiles: Projectile[];
  hasteZones: HasteZone[];
  delayedBlasts: DelayedBlast[];
  nextId: number;
  rng: RngState;
  result: BattleResult;
  stats: BattleStats;
}

// ── 事件：step() 回傳給畫面做特效用 ─────────────────────────

export type BattleEvent =
  | { type: 'waveStarted'; waveIndex: number }
  | { type: 'waveSpawned'; waveIndex: number; bonus: number }
  | { type: 'enemySpawned'; enemyId: number }
  | { type: 'enemyKilled'; enemyId: number; enemyType: EnemyTypeId; pos: Vec2; gold: number }
  | { type: 'enemyLeaked'; enemyId: number; damage: number }
  | { type: 'towerFired'; towerId: number }
  | { type: 'arrowHit'; pos: Vec2 }
  | { type: 'explosion'; pos: Vec2; radius: number; element?: Element | null }
  | { type: 'reaction'; reaction: ReactionId; pos: Vec2; radius?: number }
  | { type: 'soldierDied'; soldierId: number }
  | { type: 'heroDied' }
  | { type: 'heroRespawned' }
  | { type: 'heroAttack'; from: Vec2; to: Vec2; style: HeroAttack['style'] }
  | { type: 'skillCast'; effect: HeroSkillEffect['kind']; pos: Vec2; radius?: number; to?: Vec2 }
  | { type: 'victory' }
  | { type: 'defeat' };
