import { describe, expect, it } from 'vitest';
import { buildTower } from '../src/core/battle/commands';
import { addHero, castSkill, moveHero } from '../src/core/battle/heroes';
import { distance } from '../src/core/battle/path';
import { towerDamageMultiplier, towerHaste } from '../src/core/battle/towers';
import { MAPS } from '../src/core/data/map';
import { ENEMIES } from '../src/core/data/enemies';
import { HERO_RULES, HEROES } from '../src/core/data/heroes';
import { MARK_RULES } from '../src/core/data/elements';
import type { BattleState, EnemyInstance, HeroId } from '../src/core/types';
import { addEnemy, newBattle, runFor } from './helpers';

const START = MAPS.rift!.heroStart; // (530, 400)，沿路線約 980
const AT_HERO = 980;

function withHero(id: HeroId): BattleState {
  const s = newBattle();
  addHero(s, id);
  return s;
}

/** 放一隻定住不動的敵人，方便測試遠程攻擊 */
function stillEnemy(s: BattleState, type: EnemyInstance['type'], distanceAlong: number): EnemyInstance {
  const e = addEnemy(s, type, distanceAlong);
  e.rooted = 999;
  return e;
}

describe('英雄出場', () => {
  it('出現在英雄起始位置，生命為定義值，技能從冷卻開始', () => {
    const s = withHero('helo');
    expect(s.hero).toMatchObject({ heroId: 'helo', hp: 300, maxHp: 300, armor: 3, alive: true });
    expect(s.hero!.pos).toEqual(START);
    expect(s.hero!.skillCooldown).toBe(HEROES.helo.skill.cooldown);
  });
});

describe('英雄阻擋與陣亡', () => {
  it('站在路上會擋住敵人並互相攻擊', () => {
    const s = withHero('helo');
    const grunt = addEnemy(s, 'grunt', AT_HERO - 60);
    runFor(s, 1);
    expect(grunt.blockedBy).toBe(s.hero!.id);
    runFor(s, 1);
    expect(grunt.hp).toBeLessThan(ENEMIES.grunt.hp);
    expect(s.hero!.hp).toBe(300 - (ENEMIES.grunt.attack!.damage - 3) * 2); // 護甲 3
  });

  it('陣亡後放開敵人，15 秒後在起始位置復活並補滿血', () => {
    const s = withHero('chaosheng');
    s.hero!.hp = 1;
    const brute = addEnemy(s, 'brute', AT_HERO - 40);
    const events = runFor(s, 1);
    expect(s.hero!.alive).toBe(false);
    expect(brute.blockedBy).toBeNull();
    expect(events).toContainEqual({ type: 'heroDied' });

    const more = runFor(s, HERO_RULES.respawn);
    expect(more).toContainEqual({ type: 'heroRespawned' });
    expect(s.hero).toMatchObject({ alive: true, hp: HEROES.chaosheng.hp });
    expect(s.hero!.pos).toEqual(START);
  });
});

describe('英雄移動', () => {
  it('只能移到路上；移動中不攻擊，抵達後停下', () => {
    const s = withHero('chaosheng');
    expect(moveHero(s, { x: 700, y: 600 })).toEqual({ ok: false, reason: 'not-on-path' });
    expect(moveHero(s, { x: 530, y: 310 })).toEqual({ ok: true });
    stillEnemy(s, 'brute', 1200); // 射程內
    runFor(s, 0.5);
    expect(s.hero!.damageDealt).toBe(0);
    expect(s.hero!.pos.y).toBeCloseTo(400 - HERO_RULES.moveSpeed * 0.5, 0);
    runFor(s, 1);
    expect(s.hero!.pos).toEqual({ x: 530, y: 310 });
    expect(s.hero!.moveTarget).toBeNull();
  });

  it('開始移動時放開正在阻擋的敵人', () => {
    const s = withHero('helo');
    const grunt = addEnemy(s, 'grunt', AT_HERO - 40);
    runFor(s, 0.5);
    expect(grunt.blockedBy).toBe(s.hero!.id);
    moveHero(s, { x: 530, y: 300 });
    expect(grunt.blockedBy).toBeNull();
  });

  it('陣亡時不能移動', () => {
    const s = withHero('helo');
    s.hero!.alive = false;
    expect(moveHero(s, START)).toEqual({ ok: false, reason: 'hero-dead' });
  });
});

describe('普攻與被動', () => {
  it('赫洛：扇形斬擊同時打到前方多名敵人，並附加灼燒', () => {
    const s = withHero('helo');
    const a = stillEnemy(s, 'grunt', AT_HERO - 25);
    const b = stillEnemy(s, 'grunt', AT_HERO - 35);
    runFor(s, 0.1);
    expect(a.hp).toBeLessThan(ENEMIES.grunt.hp);
    expect(b.hp).toBeLessThan(ENEMIES.grunt.hp);
    expect(a.mark?.element).toBe('fire');
  });

  it('赫洛：每第 3 次攻擊附加強灼燒（灼燒 ×2）', () => {
    const s = withHero('helo');
    const e = stillEnemy(s, 'colossus', AT_HERO - 30);
    runFor(s, 0.1);
    expect(e.mark!.burnDps).toBe(MARK_RULES.burnDps);
    runFor(s, 2.0); // 第 3 次攻擊在 2 秒時
    expect(e.mark!.burnDps).toBe(MARK_RULES.burnDps * 2);
  });

  it('潮生：連續命中同一目標，第 3 擊傷害 ×2', () => {
    const s = withHero('chaosheng');
    const boss = stillEnemy(s, 'colossus', 1200);
    const armor = ENEMIES.colossus.armor;
    runFor(s, 3.0); // 0、1.2、2.4 秒出手，箭飛行約 0.3 秒
    const normal = 35 - armor;
    expect(ENEMIES.colossus.hp - boss.hp).toBe(normal * 2 + (35 * 2 - armor));
  });

  it('森牙：弩箭貫穿直線上最多 3 名敵人；命中 3 名時下一次攻擊更快', () => {
    const s = withHero('senya');
    // 英雄正上方的直路（x = 530），最前面那隻是目標，射線會穿過其他三隻
    const hit = [1010, 1040, 1070, 1100].map((d) => stillEnemy(s, 'brute', d));
    runFor(s, 0.05);
    expect(hit.filter((e) => e.hp < ENEMIES.brute.hp)).toHaveLength(3);
    expect(s.hero!.cooldown).toBeCloseTo(1.3 * 0.6, 1);
  });

  it('沫：水波緩速 30%，附加的潮濕持續 2 倍時間', () => {
    const s = withHero('mo');
    const e = stillEnemy(s, 'brute', 1060);
    runFor(s, 0.5);
    expect(e.slow?.amount).toBe(0.3);
    expect(e.mark?.element).toBe('water');
    expect(e.mark!.remaining).toBeGreaterThan(MARK_RULES.duration);
  });

  it('霓：火球落地爆炸，命中的敵人附加灼燒', () => {
    const s = withHero('ni');
    const a = stillEnemy(s, 'grunt', 1180);
    const b = stillEnemy(s, 'grunt', 1190);
    runFor(s, 0.7);
    for (const e of [a, b]) {
      expect(e.hp).toBeLessThan(ENEMIES.grunt.hp);
      expect(e.mark?.element).toBe('fire');
    }
  });

  it('莉亞：附近的塔攻速 +15%', () => {
    const s = withHero('liya');
    s.hero!.pos = { x: 640, y: 250 }; // 移到塔位 6 旁邊（約 125）
    buildTower(s, 6, 'archer');
    buildTower(s, 0, 'archer'); // 很遠
    expect(towerHaste(s, s.towers[0]!)).toBeCloseTo(0.15, 5);
    expect(towerHaste(s, s.towers[1]!)).toBe(0);
  });
});

describe('元素加持', () => {
  it('英雄附近同元素的法師塔傷害 +15%；不同元素或太遠不加', () => {
    const s = withHero('helo');
    s.gold = 1000;
    buildTower(s, 6, 'mage', 'fire'); // 近、同元素
    buildTower(s, 5, 'mage', 'water'); // 近、不同元素
    buildTower(s, 0, 'mage', 'fire'); // 遠
    const [near, other, far] = s.towers;
    expect(distance(MAPS.rift!.slots[6]!, START)).toBeLessThanOrEqual(HERO_RULES.auraRadius);
    expect(towerDamageMultiplier(s, near!)).toBeCloseTo(1 + HERO_RULES.auraBonus, 5);
    expect(towerDamageMultiplier(s, other!)).toBe(1);
    expect(towerDamageMultiplier(s, far!)).toBe(1);
  });

  it('英雄陣亡時加持消失', () => {
    const s = withHero('helo');
    buildTower(s, 6, 'mage', 'fire');
    s.hero!.alive = false;
    expect(towerDamageMultiplier(s, s.towers[0]!)).toBe(1);
  });
});

describe('主動技能', () => {
  it('冷卻中不能施放；冷卻結束後可以施放並重新冷卻', () => {
    const s = withHero('helo');
    expect(castSkill(s, null)).toEqual({ ok: false, reason: 'skill-cooldown' });
    s.hero!.skillCooldown = 0;
    expect(castSkill(s, null)).toEqual({ ok: true });
    expect(s.hero!.skillCooldown).toBe(HEROES.helo.skill.cooldown);
  });

  it('燼火迴旋：周圍敵人受到魔法傷害並附加強灼燒', () => {
    const s = withHero('helo');
    s.hero!.skillCooldown = 0;
    const near = stillEnemy(s, 'brute', AT_HERO + 60);
    const far = stillEnemy(s, 'brute', AT_HERO + 200);
    castSkill(s, null);
    expect(ENEMIES.brute.hp - near.hp).toBe(60);
    expect(near.mark).toMatchObject({ element: 'fire', burnDps: MARK_RULES.burnDps * 2 });
    expect(far.hp).toBe(ENEMIES.brute.hp);
  });

  it('潮汐穿心：直線上所有敵人受到 300 物理傷害', () => {
    const s = withHero('chaosheng');
    s.hero!.skillCooldown = 0;
    const line = [AT_HERO + 50, AT_HERO + 100, AT_HERO + 140].map((d) => stillEnemy(s, 'colossus', d));
    castSkill(s, { x: 530, y: 260 }); // 朝上（沿路線前方）
    for (const e of line) expect(ENEMIES.colossus.hp - e.hp).toBe(300 - ENEMIES.colossus.armor);
  });

  it('藤蔓陷阱：範圍內定身 2 秒（首領 1 秒）並附加纏藤', () => {
    const s = withHero('senya');
    s.hero!.skillCooldown = 0;
    const grunt = addEnemy(s, 'grunt', 700);
    const boss = addEnemy(s, 'colossus', 720);
    castSkill(s, { x: 360, y: 500 });
    expect(grunt.rooted).toBe(2);
    expect(boss.rooted).toBe(1);
    expect(grunt.mark?.element).toBe('wood');
  });

  it('隕火：1 秒後在指定地點爆炸，造成 150 魔法傷害並附加灼燒', () => {
    const s = withHero('ni');
    s.hero!.skillCooldown = 0;
    const brute = stillEnemy(s, 'brute', 700);
    castSkill(s, { x: 350, y: 500 });
    runFor(s, 0.5);
    expect(brute.hp).toBe(ENEMIES.brute.hp);
    runFor(s, 0.6);
    expect(ENEMIES.brute.hp - brute.hp).toBeGreaterThanOrEqual(150);
    expect(brute.mark?.element).toBe('fire');
  });

  it('潮浪：範圍內緩速 50% 並附加潮濕', () => {
    const s = withHero('mo');
    s.hero!.skillCooldown = 0;
    const e = addEnemy(s, 'grunt', 700);
    castSkill(s, { x: 350, y: 500 });
    expect(e.slow).toEqual({ amount: 0.5, remaining: 4 });
    expect(e.mark?.element).toBe('water');
  });

  it('生命之芽：附近士兵與英雄回血、塔加攻速', () => {
    const s = withHero('liya');
    s.hero!.skillCooldown = 0;
    s.hero!.hp = 50;
    s.hero!.pos = { x: 640, y: 250 };
    buildTower(s, 6, 'archer');
    castSkill(s, null);
    expect(s.hero!.hp).toBe(50 + HEROES.liya.hp * 0.5);
    expect(s.hasteZones).toHaveLength(1);
    expect(towerHaste(s, s.towers[0]!)).toBeCloseTo(0.15 + 0.4, 5);
    runFor(s, 6.1);
    expect(s.hasteZones).toHaveLength(0);
  });

  it('陣亡時不能施放', () => {
    const s = withHero('helo');
    s.hero!.skillCooldown = 0;
    s.hero!.alive = false;
    expect(castSkill(s, null)).toEqual({ ok: false, reason: 'hero-dead' });
  });
});
