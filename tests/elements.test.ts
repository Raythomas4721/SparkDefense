import { describe, expect, it } from 'vitest';
import { buildTower } from '../src/core/battle/commands';
import { enemySpeed, hitEnemy, type Hit } from '../src/core/battle/elements';
import { mageCoverage, nearbyMageElements } from '../src/core/battle/queries';
import { slotPosition } from '../src/core/battle/state';
import { findFirstTarget } from '../src/core/battle/targeting';
import { MARK_RULES, REACTION_RULES, reactionBetween } from '../src/core/data/elements';
import { ENEMIES } from '../src/core/data/enemies';
import type { BattleEvent, Element } from '../src/core/types';
import { addEnemy, newBattle, runFor } from './helpers';

const magic = (element: Element | null, damage = 20): Hit => ({ damage, damageType: 'magic', element, sourceId: 0 });

describe('反應對照', () => {
  it('三種組合各對應一種反應，順序不影響', () => {
    expect(reactionBetween('fire', 'water')).toBe('vaporize');
    expect(reactionBetween('water', 'fire')).toBe('vaporize');
    expect(reactionBetween('water', 'wood')).toBe('bind');
    expect(reactionBetween('wood', 'water')).toBe('bind');
    expect(reactionBetween('wood', 'fire')).toBe('wildfire');
    expect(reactionBetween('fire', 'wood')).toBe('wildfire');
  });

  it('同元素不會反應', () => {
    expect(reactionBetween('fire', 'fire')).toBeNull();
  });
});

describe('印記', () => {
  it('元素命中會附加該元素的印記', () => {
    const s = newBattle();
    const e = addEnemy(s, 'grunt', 100);
    hitEnemy(s, e, magic('wood'), []);
    expect(e.mark).toMatchObject({ element: 'wood', remaining: MARK_RULES.duration });
  });

  it('同種印記只刷新時間，不會疊層', () => {
    const s = newBattle();
    const e = addEnemy(s, 'brute', 100);
    hitEnemy(s, e, magic('fire'), []);
    runFor(s, 1);
    expect(e.mark!.remaining).toBeCloseTo(2, 5);
    hitEnemy(s, e, magic('fire'), []);
    expect(e.mark!.remaining).toBe(MARK_RULES.duration);
    expect(e.mark!.burnDps).toBe(MARK_RULES.burnDps);
  });

  it('沒有元素的命中（箭、砲彈）不影響印記', () => {
    const s = newBattle();
    const e = addEnemy(s, 'grunt', 100);
    hitEnemy(s, e, { damage: 5, damageType: 'physical', element: null, sourceId: 0 }, []);
    expect(e.mark).toBeNull();
  });

  it('灼燒每秒造成魔法傷害（無視護甲），3 秒後消失', () => {
    const s = newBattle();
    const brute = addEnemy(s, 'brute', 100);
    hitEnemy(s, brute, magic('fire', 0), []);
    runFor(s, 4);
    expect(ENEMIES.brute.hp - brute.hp).toBeCloseTo(MARK_RULES.burnDps * MARK_RULES.duration, 5);
    expect(brute.mark).toBeNull();
  });

  it('灼燒打死敵人時照樣給金幣', () => {
    const s = newBattle();
    const e = addEnemy(s, 'mist', 100);
    e.hp = 1;
    hitEnemy(s, e, magic('fire', 0), []);
    const gold = s.gold;
    runFor(s, 1);
    expect(s.enemies.includes(e)).toBe(false);
    expect(s.gold).toBe(gold + ENEMIES.mist.gold);
  });

  it('潮濕讓敵人變慢 10%', () => {
    const s = newBattle();
    const e = addEnemy(s, 'grunt', 100);
    hitEnemy(s, e, magic('water', 0), []);
    expect(enemySpeed(e)).toBeCloseTo(ENEMIES.grunt.speed * (1 - MARK_RULES.wetSlow), 5);
    runFor(s, 1);
    expect(e.distance).toBeCloseTo(100 + ENEMIES.grunt.speed * 0.9, 5);
  });
});

describe('反應', () => {
  it('蒸發：潮濕的敵人被炎命中，該次傷害 ×1.6，並消耗印記', () => {
    const s = newBattle();
    const e = addEnemy(s, 'brute', 100);
    hitEnemy(s, e, magic('water', 0), []);
    const events: BattleEvent[] = [];
    hitEnemy(s, e, magic('fire', 20), events);
    expect(ENEMIES.brute.hp - e.hp).toBeCloseTo(20 * REACTION_RULES.vaporize.multiplier, 5);
    expect(e.mark).toBeNull(); // 舊印記被消耗，也沒有留下新的炎印記
    expect(events).toContainEqual(expect.objectContaining({ type: 'reaction', reaction: 'vaporize' }));
    expect(s.stats.reactions.vaporize).toBe(1);
  });

  it('束縛：定身 0.8 秒，期間不會移動', () => {
    const s = newBattle();
    const e = addEnemy(s, 'grunt', 100);
    hitEnemy(s, e, magic('wood', 0), []);
    hitEnemy(s, e, magic('water', 0), []);
    expect(e.rooted).toBe(REACTION_RULES.bind.duration);
    expect(enemySpeed(e)).toBe(0);
    runFor(s, 0.5);
    expect(e.distance).toBe(100);
    runFor(s, 1);
    expect(e.distance).toBeGreaterThan(100);
  });

  it('束縛：首領只定身一半時間', () => {
    const s = newBattle();
    const boss = addEnemy(s, 'colossus', 100);
    hitEnemy(s, boss, magic('water', 0), []);
    hitEnemy(s, boss, magic('wood', 0), []);
    expect(boss.rooted).toBeCloseTo(REACTION_RULES.bind.duration * REACTION_RULES.bind.bossFactor, 5);
  });

  it('束縛：4 秒內不會再被束縛', () => {
    const s = newBattle();
    const e = addEnemy(s, 'brute', 100);
    hitEnemy(s, e, magic('wood', 0), []);
    hitEnemy(s, e, magic('water', 0), []);
    runFor(s, 1);
    expect(e.rooted).toBe(0);
    hitEnemy(s, e, magic('wood', 0), []);
    hitEnemy(s, e, magic('water', 0), []);
    expect(e.rooted).toBe(0);
    expect(s.stats.reactions.bind).toBe(2); // 反應有觸發，只是沒有定身
  });

  it('野火：半徑內的敵人受到傷害並附加灼燒；已有其他印記的只受傷', () => {
    const s = newBattle();
    const target = addEnemy(s, 'brute', 700);
    const near = addEnemy(s, 'brute', 740);
    const wet = addEnemy(s, 'brute', 670);
    const far = addEnemy(s, 'brute', 900);
    hitEnemy(s, wet, magic('water', 0), []);
    hitEnemy(s, target, magic('wood', 0), []);
    const events: BattleEvent[] = [];
    hitEnemy(s, target, magic('fire', 20), events);

    const { damage } = REACTION_RULES.wildfire;
    expect(ENEMIES.brute.hp - target.hp).toBe(20 + damage);
    expect(ENEMIES.brute.hp - near.hp).toBe(damage);
    expect(near.mark?.element).toBe('fire');
    expect(ENEMIES.brute.hp - wet.hp).toBe(damage);
    expect(wet.mark?.element).toBe('water');
    expect(far.hp).toBe(ENEMIES.brute.hp);
    expect(events).toContainEqual(expect.objectContaining({ type: 'reaction', reaction: 'wildfire' }));
  });
});

describe('法師塔', () => {
  it('必須選元素才能蓋', () => {
    const s = newBattle();
    expect(buildTower(s, 3, 'mage')).toEqual({ ok: false, reason: 'element-required' });
    expect(buildTower(s, 3, 'mage', 'water')).toEqual({ ok: true });
    expect(s.towers[0]!.element).toBe('water');
  });

  it('其他塔沒有元素', () => {
    const s = newBattle();
    buildTower(s, 3, 'archer', 'fire');
    expect(s.towers[0]!.element).toBeNull();
  });

  it('法術命中會附加元素並造成魔法傷害（無視護甲）', () => {
    const s = newBattle();
    buildTower(s, 3, 'mage', 'fire');
    const brute = addEnemy(s, 'brute', 700);
    runFor(s, 0.4);
    expect(brute.mark?.element).toBe('fire');
    expect(ENEMIES.brute.hp - brute.hp).toBeGreaterThanOrEqual(20);
  });

  it('兩座不同元素的法師塔射程重疊時會觸發反應', () => {
    const s = newBattle();
    s.gold = 1000;
    buildTower(s, 3, 'mage', 'fire');
    buildTower(s, 4, 'mage', 'water');
    addEnemy(s, 'brute', 700);
    runFor(s, 4);
    expect(s.stats.reactions.vaporize).toBeGreaterThan(0);
  });
});

describe('反應熱區查詢', () => {
  it('射程重疊的塔位會回報附近法師塔的元素；離很遠的不會', () => {
    const s = newBattle();
    buildTower(s, 3, 'mage', 'water');
    expect(nearbyMageElements(s, 4)).toEqual(['water']); // 3、4 在下方直路重疊
    expect(nearbyMageElements(s, 9)).toEqual([]); // 星核旁，離塔位 3 很遠
  });

  it('查詢自己時會排除自己', () => {
    const s = newBattle();
    buildTower(s, 3, 'mage', 'fire');
    const tower = s.towers[0]!;
    expect(mageCoverage(s, slotPosition(s, 3), 150, tower.id)).toEqual([]);
    expect(mageCoverage(s, slotPosition(s, 3), 150).length).toBeGreaterThan(0);
  });
});

describe('飛行與首領', () => {
  it('砲塔打不到飛行敵人，弓兵塔可以', () => {
    const s = newBattle();
    addEnemy(s, 'bat', 700);
    const from = slotPosition(s, 3);
    expect(findFirstTarget(s, { from, range: 170, canHitFlying: false })).toBeUndefined();
    expect(findFirstTarget(s, { from, range: 170, canHitFlying: true })?.type).toBe('bat');
  });

  it('首領每 8 秒在身後召喚 2 隻灰霧小獸', () => {
    const s = newBattle();
    addEnemy(s, 'colossus', 500);
    runFor(s, 7.9);
    expect(s.enemies.filter((e) => e.type === 'grunt')).toHaveLength(0);
    runFor(s, 0.2);
    const minions = s.enemies.filter((e) => e.type === 'grunt');
    expect(minions).toHaveLength(2);
    const boss = s.enemies.find((e) => e.type === 'colossus')!;
    for (const m of minions) expect(m.distance).toBeLessThan(boss.distance);
    runFor(s, 8);
    expect(s.enemies.filter((e) => e.type === 'grunt')).toHaveLength(4);
  });
});
