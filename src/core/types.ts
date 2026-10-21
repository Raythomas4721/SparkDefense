import type { RngState } from './rng';

export interface Vec2 {
  x: number;
  y: number;
}

// ── 定義（固定資料，放在 data/） ─────────────────────────────

export type TowerTypeId = 'archer' | 'cannon';
export type EnemyTypeId = 'grunt' | 'runner' | 'brute';
export type DamageType = 'physical' | 'magic';
export type EnemyTag = 'flying' | 'heavy' | 'boss' | 'swarm';
export type TierIndex = 0 | 1 | 2;

export interface TowerTierStats {
  damage: number;
  /** 攻擊間隔（秒） */
  interval: number;
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
  /** arrow：追蹤目標的箭；shell：飛向預測落點的砲彈 */
  attack: 'arrow' | 'shell';
  /** arrow 的飛行速度（像素／秒） */
  projectileSpeed?: number;
  /** shell 的飛行時間（秒） */
  flightTime?: number;
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
}

// ── 戰鬥中的狀態 ─────────────────────────────────────────

export interface TowerInstance {
  id: number;
  type: TowerTypeId;
  slot: number;
  tier: TierIndex;
  /** 距離下次可攻擊的秒數 */
  cooldown: number;
  /** 累計花費（建造＋升級），賣出時用 */
  spent: number;
  /** 累計造成的傷害，給介面與模擬統計 */
  damageDealt: number;
}

export interface EnemyInstance {
  id: number;
  type: EnemyTypeId;
  hp: number;
  maxHp: number;
  /** 沿路線走過的距離 */
  distance: number;
}

export interface ArrowProjectile {
  id: number;
  kind: 'arrow';
  towerId: number;
  targetId: number;
  pos: Vec2;
  speed: number;
  damage: number;
  damageType: DamageType;
}

export interface ShellProjectile {
  id: number;
  kind: 'shell';
  towerId: number;
  from: Vec2;
  to: Vec2;
  pos: Vec2;
  elapsed: number;
  flightTime: number;
  damage: number;
  damageType: DamageType;
  radius: number;
}

export type Projectile = ArrowProjectile | ShellProjectile;

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
  enemies: EnemyInstance[];
  projectiles: Projectile[];
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
  | { type: 'explosion'; pos: Vec2; radius: number }
  | { type: 'victory' }
  | { type: 'defeat' };
