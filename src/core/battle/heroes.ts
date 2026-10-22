import { ENEMIES } from '../data/enemies';
import { HERO_RULES, HEROES } from '../data/heroes';
import type {
  BattleEvent,
  BattleState,
  EnemyInstance,
  HeroDefinition,
  HeroId,
  HeroInstance,
  HitExtras,
  TargetPriority,
  Vec2,
} from '../types';
import { releaseBlockedBy } from './blocking';
import { fail, type CommandResult } from './commands';
import { applySlow, enemiesWithin, enemySpeed, hitEnemy, rootEnemy } from './elements';
import { distance, getPath, nearestOnPath, positionAt } from './path';
import { allocateId, enemyPosition, findEnemy, getMap } from './state';

// 英雄（DESIGN.md §6）：站在路上、會阻擋、可移動、陣亡後復活、有被動與主動技能。

const EPSILON = 1e-6;
/** 穿透攻擊：敵人離射線多近算被射中 */
const PIERCE_WIDTH = 16;
/** 霓的火球飛行時間 */
const SPLASH_FLIGHT = 0.5;
const PROJECTILE_SPEED = 520;

export function heroDef(hero: HeroInstance): HeroDefinition {
  return HEROES[hero.heroId];
}

/** 讓英雄出現在地圖的英雄起始位置 */
export function addHero(state: BattleState, heroId: HeroId): HeroInstance {
  const def = HEROES[heroId];
  const hero: HeroInstance = {
    id: allocateId(state),
    heroId,
    hp: def.hp,
    maxHp: def.hp,
    armor: def.armor,
    pos: { ...getMap(state).heroStart },
    moveTarget: null,
    alive: true,
    respawn: 0,
    cooldown: 0,
    skillCooldown: def.skill.cooldown,
    engagedEnemyId: null,
    attackCount: 0,
    streakTargetId: null,
    streak: 0,
    damageDealt: 0,
  };
  state.hero = hero;
  return hero;
}

// ── 每步更新 ───────────────────────────────────────────

export function updateHero(state: BattleState, dt: number, events: BattleEvent[]): void {
  updateDelayedBlasts(state, events);
  updateHasteZones(state, dt);
  const hero = state.hero;
  if (!hero) return;
  hero.skillCooldown = Math.max(0, hero.skillCooldown - dt);

  if (!hero.alive) {
    hero.respawn -= dt;
    if (hero.respawn > EPSILON) return;
    hero.alive = true;
    hero.hp = hero.maxHp;
    hero.pos = { ...getMap(state).heroStart };
    hero.moveTarget = null;
    hero.cooldown = 0;
    events.push({ type: 'heroRespawned' });
    return;
  }

  if (hero.moveTarget) {
    const dist = distance(hero.pos, hero.moveTarget);
    const travel = HERO_RULES.moveSpeed * dt;
    if (dist <= travel) {
      hero.pos = { ...hero.moveTarget };
      hero.moveTarget = null;
    } else {
      hero.pos = {
        x: hero.pos.x + ((hero.moveTarget.x - hero.pos.x) / dist) * travel,
        y: hero.pos.y + ((hero.moveTarget.y - hero.pos.y) / dist) * travel,
      };
    }
    return; // 移動中不攻擊
  }

  hero.cooldown = Math.max(0, hero.cooldown - dt);
  if (hero.cooldown > EPSILON) return;
  const def = heroDef(hero);
  const target = pickTarget(state, hero, def);
  if (!target) return;
  hero.cooldown = attack(state, hero, def, target, events);
}

function canHitFlying(def: HeroDefinition): boolean {
  return def.attack.style === 'projectile' || def.attack.style === 'pierce';
}

function pickTarget(state: BattleState, hero: HeroInstance, def: HeroDefinition): EnemyInstance | undefined {
  const engaged = hero.engagedEnemyId === null ? undefined : findEnemy(state, hero.engagedEnemyId);
  if (engaged && def.attack.style === 'fan') return engaged;

  // 鎖定：strongest 會一直打同一個目標，直到它死亡或離開射程
  if (def.attack.targeting === 'strongest' && hero.streakTargetId !== null) {
    const locked = findEnemy(state, hero.streakTargetId);
    if (locked && distance(hero.pos, enemyPosition(state, locked)) <= def.attack.range) return locked;
  }
  const candidates = state.enemies.filter(
    (e) =>
      e.hp > 0 &&
      (canHitFlying(def) || !ENEMIES[e.type].tags.includes('flying')) &&
      distance(hero.pos, enemyPosition(state, e)) <= def.attack.range,
  );
  return chooseBy(state, candidates, def.attack.targeting);
}

function chooseBy(state: BattleState, enemies: EnemyInstance[], priority: TargetPriority): EnemyInstance | undefined {
  let best: EnemyInstance | undefined;
  let bestScore = -Infinity;
  for (const enemy of enemies) {
    const score =
      priority === 'strongest'
        ? enemy.hp
        : priority === 'cluster'
          ? enemiesWithin(state, enemyPosition(state, enemy), 50, false).length * 10000 + enemy.distance
          : enemy.distance;
    if (score > bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

/** 普攻，回傳到下一次攻擊的秒數 */
function attack(
  state: BattleState,
  hero: HeroInstance,
  def: HeroDefinition,
  target: EnemyInstance,
  events: BattleEvent[],
): number {
  const a = def.attack;
  const passive = def.passive;
  const targetPos = enemyPosition(state, target);
  hero.attackCount++;

  const extras: HitExtras = {};
  if (passive.kind === 'strongBurnEvery' && hero.attackCount % passive.every === 0) {
    extras.burnMultiplier = passive.burnMultiplier;
  }
  if (passive.kind === 'markDuration') extras.markDurationMultiplier = passive.multiplier;
  if (passive.kind === 'burningKillBlast') extras.burningKillBlast = { damage: passive.damage, radius: passive.radius };
  if (a.slow) extras.slow = a.slow;

  let damage = a.damage;
  if (passive.kind === 'focusStreak') {
    hero.streak = hero.streakTargetId === target.id ? hero.streak + 1 : 1;
    hero.streakTargetId = target.id;
    if (hero.streak % passive.hits === 0) damage *= passive.multiplier;
  } else if (a.targeting === 'strongest') {
    hero.streakTargetId = target.id;
  }
  const hit = { damage, damageType: a.damageType, element: def.element, sourceId: hero.id, ...extras };
  events.push({ type: 'heroAttack', from: { ...hero.pos }, to: targetPos, style: a.style });

  switch (a.style) {
    case 'fan': {
      const half = ((a.fanAngle ?? 90) / 2) * (Math.PI / 180);
      const facing = Math.atan2(targetPos.y - hero.pos.y, targetPos.x - hero.pos.x);
      for (const enemy of enemiesWithin(state, hero.pos, a.range + 12, false)) {
        const p = enemyPosition(state, enemy);
        const angle = Math.abs(normalizeAngle(Math.atan2(p.y - hero.pos.y, p.x - hero.pos.x) - facing));
        if (enemy.id === target.id || angle <= half) hitEnemy(state, enemy, hit, events);
      }
      return a.interval;
    }
    case 'projectile':
      state.projectiles.push({
        id: allocateId(state),
        kind: 'arrow',
        targetId: target.id,
        pos: { ...hero.pos },
        speed: PROJECTILE_SPEED,
        ...hit,
      });
      return a.interval;
    case 'pierce': {
      const hits = enemiesOnRay(state, hero.pos, targetPos, a.range + 20, PIERCE_WIDTH).slice(0, a.pierce ?? 1);
      for (const enemy of hits) hitEnemy(state, enemy, hit, events);
      if (passive.kind === 'pierceHaste' && hits.length >= passive.hits) return a.interval * (1 - passive.reduction);
      return a.interval;
    }
    case 'splash': {
      const path = getPath(state.mapId);
      const lead = Math.min(path.length, target.distance + enemySpeed(target) * SPLASH_FLIGHT);
      const to = positionAt(path, lead);
      state.projectiles.push({
        id: allocateId(state),
        kind: 'shell',
        from: { ...hero.pos },
        to,
        pos: { ...hero.pos },
        elapsed: 0,
        flightTime: SPLASH_FLIGHT,
        radius: a.splashRadius ?? 40,
        ...hit,
      });
      return a.interval;
    }
  }
}

function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** 從 from 朝 toward 方向、長度 length 的射線上（寬度 width）的敵人，依距離排序 */
function enemiesOnRay(state: BattleState, from: Vec2, toward: Vec2, length: number, width: number): EnemyInstance[] {
  const len = distance(from, toward) || 1;
  const dir = { x: (toward.x - from.x) / len, y: (toward.y - from.y) / len };
  return state.enemies
    .filter((e) => e.hp > 0)
    .map((e) => {
      const p = enemyPosition(state, e);
      const along = (p.x - from.x) * dir.x + (p.y - from.y) * dir.y;
      const side = Math.abs((p.x - from.x) * dir.y - (p.y - from.y) * dir.x);
      return { e, along, side };
    })
    .filter((h) => h.along >= 0 && h.along <= length && h.side <= width)
    .sort((a, b) => a.along - b.along)
    .map((h) => h.e);
}

function updateDelayedBlasts(state: BattleState, events: BattleEvent[]): void {
  const due = state.delayedBlasts.filter((b) => b.at <= state.time + EPSILON);
  if (due.length === 0) return;
  state.delayedBlasts = state.delayedBlasts.filter((b) => b.at > state.time + EPSILON);
  for (const blast of due) {
    events.push({ type: 'explosion', pos: blast.pos, radius: blast.radius, element: blast.element });
    for (const enemy of enemiesWithin(state, blast.pos, blast.radius, false)) {
      hitEnemy(state, enemy, { damage: blast.damage, damageType: 'magic', element: blast.element, sourceId: blast.sourceId }, events);
    }
  }
}

function updateHasteZones(state: BattleState, dt: number): void {
  for (const zone of state.hasteZones) zone.remaining -= dt;
  state.hasteZones = state.hasteZones.filter((z) => z.remaining > EPSILON);
}

// ── 指令 ───────────────────────────────────────────────

/** 移動英雄到 point 附近的路上 */
export function moveHero(state: BattleState, point: Vec2): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  const hero = state.hero;
  if (!hero) return fail('no-hero');
  if (!hero.alive) return fail('hero-dead');
  const nearest = nearestOnPath(getPath(state.mapId), point);
  if (nearest.offset > HERO_RULES.pathSnap) return fail('not-on-path');
  hero.moveTarget = nearest.pos;
  hero.engagedEnemyId = null;
  releaseBlockedBy(state, hero.id);
  return { ok: true };
}

/** 施放主動技能。self 類技能不需要 point；point／direction 類需要 */
export function castSkill(state: BattleState, point: Vec2 | null, events: BattleEvent[] = []): CommandResult {
  if (state.result !== 'playing') return fail('battle-ended');
  const hero = state.hero;
  if (!hero) return fail('no-hero');
  if (!hero.alive) return fail('hero-dead');
  if (hero.skillCooldown > EPSILON) return fail('skill-cooldown');
  const def = heroDef(hero);
  const effect = def.skill.effect;
  const target = def.skill.targeting === 'self' || !point ? hero.pos : point;
  const markDuration = def.passive.kind === 'markDuration' ? def.passive.multiplier : undefined;

  switch (effect.kind) {
    case 'nova':
      for (const enemy of enemiesWithin(state, hero.pos, effect.radius)) {
        hitEnemy(
          state,
          enemy,
          { damage: effect.damage, damageType: 'magic', element: def.element, sourceId: hero.id, burnMultiplier: effect.burnMultiplier },
          events,
        );
      }
      events.push({ type: 'skillCast', effect: effect.kind, pos: { ...hero.pos }, radius: effect.radius });
      break;
    case 'lance': {
      const len = distance(hero.pos, target) || 1;
      const end = {
        x: hero.pos.x + ((target.x - hero.pos.x) / len) * effect.length,
        y: hero.pos.y + ((target.y - hero.pos.y) / len) * effect.length,
      };
      for (const enemy of enemiesOnRay(state, hero.pos, target, effect.length, effect.width / 2)) {
        hitEnemy(state, enemy, { damage: effect.damage, damageType: effect.damageType, element: null, sourceId: hero.id }, events);
      }
      events.push({ type: 'skillCast', effect: effect.kind, pos: { ...hero.pos }, to: end });
      break;
    }
    case 'snare':
      for (const enemy of enemiesWithin(state, target, effect.radius, false)) {
        rootEnemy(enemy, effect.rootDuration, effect.bossFactor);
        hitEnemy(state, enemy, { damage: 0, damageType: 'magic', element: 'wood', sourceId: hero.id }, events);
      }
      events.push({ type: 'skillCast', effect: effect.kind, pos: { ...target }, radius: effect.radius });
      break;
    case 'meteor':
      state.delayedBlasts.push({
        at: state.time + effect.delay,
        pos: { ...target },
        radius: effect.radius,
        damage: effect.damage,
        element: 'fire',
        sourceId: hero.id,
      });
      events.push({ type: 'skillCast', effect: effect.kind, pos: { ...target }, radius: effect.radius });
      break;
    case 'tide':
      for (const enemy of enemiesWithin(state, target, effect.radius)) {
        applySlow(enemy, effect.slow, effect.duration);
        hitEnemy(
          state,
          enemy,
          { damage: 0, damageType: 'magic', element: 'water', sourceId: hero.id, markDurationMultiplier: markDuration },
          events,
        );
      }
      events.push({ type: 'skillCast', effect: effect.kind, pos: { ...target }, radius: effect.radius });
      break;
    case 'bloom':
      for (const unit of [...state.soldiers, hero]) {
        if (unit.alive && distance(hero.pos, 'home' in unit ? unit.home : unit.pos) <= effect.radius) {
          unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * effect.healRatio);
        }
      }
      state.hasteZones.push({ pos: { ...hero.pos }, radius: effect.radius, amount: effect.haste, remaining: effect.duration });
      events.push({ type: 'skillCast', effect: effect.kind, pos: { ...hero.pos }, radius: effect.radius });
      break;
  }
  hero.skillCooldown = def.skill.cooldown;
  return { ok: true };
}
