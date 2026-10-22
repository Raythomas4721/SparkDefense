import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, setRallyPoint, upgradeTower } from '../src/core/battle/commands';
import { distance, getPath, nearestOnPath } from '../src/core/battle/path';
import { slotPosition } from '../src/core/battle/state';
import { ENEMIES } from '../src/core/data/enemies';
import { TOWERS } from '../src/core/data/towers';
import type { BattleState } from '../src/core/types';
import { addEnemy, newBattle, runFor } from './helpers';

const SOLDIER = TOWERS.barracks.soldier!;

/** 在塔位 1（第一個轉角旁）蓋兵營；集結點預設在 (150, 170)，沿路線約 170 */
function withBarracks(): BattleState {
  const s = newBattle();
  buildTower(s, 1, 'barracks');
  return s;
}

/** 只留一名士兵，讓測試結果不受其他士兵影響 */
function singleSoldier(s: BattleState) {
  s.soldiers = s.soldiers.slice(0, 1);
  return s.soldiers[0]!;
}

describe('兵營', () => {
  it('蓋好後有 3 名士兵，集結點在路上、在集結範圍內', () => {
    const s = withBarracks();
    const tower = s.towers[0]!;
    expect(s.soldiers).toHaveLength(SOLDIER.count);
    expect(tower.rally).not.toBeNull();
    expect(nearestOnPath(getPath(s.mapId), tower.rally!).offset).toBeLessThan(1);
    expect(distance(tower.rally!, slotPosition(s, 1))).toBeLessThanOrEqual(TOWERS.barracks.tiers[0].range);
    for (const soldier of s.soldiers) expect(soldier).toMatchObject({ hp: 60, maxHp: 60, armor: 0, alive: true });
  });

  it('升階後士兵生命與護甲提高，活著的補滿血', () => {
    const s = withBarracks();
    s.gold = 1000;
    s.soldiers[0]!.hp = 10;
    upgradeTower(s, s.towers[0]!.id);
    for (const soldier of s.soldiers) expect(soldier).toMatchObject({ hp: 100, maxHp: 100, armor: 2 });
  });
});

describe('阻擋', () => {
  it('敵人走到士兵面前會被擋下並停住', () => {
    const s = withBarracks();
    const grunt = addEnemy(s, 'grunt', 100);
    runFor(s, 1);
    expect(grunt.blockedBy).not.toBeNull();
    const stoppedAt = grunt.distance;
    runFor(s, 2);
    expect(grunt.distance).toBe(stoppedAt);
  });

  it('被擋住的敵人和士兵互相攻擊', () => {
    const s = withBarracks();
    const soldier = singleSoldier(s);
    const grunt = addEnemy(s, 'grunt', 100);
    runFor(s, 1);
    expect(grunt.blockedBy).toBe(soldier.id);
    runFor(s, 2);
    const attack = ENEMIES.grunt.attack!;
    expect(grunt.hp).toBeLessThan(ENEMIES.grunt.hp);
    expect((SOLDIER.hp[0] - soldier.hp) % attack.damage).toBe(0); // 護甲 0：每下扣 4
    expect(soldier.hp).toBeLessThan(SOLDIER.hp[0]);
  });

  it('士兵的護甲會減少敵人造成的傷害', () => {
    const s = withBarracks();
    s.gold = 1000;
    upgradeTower(s, s.towers[0]!.id); // 階 II：護甲 2
    const soldier = singleSoldier(s);
    addEnemy(s, 'brute', 140);
    runFor(s, 0.2);
    expect(SOLDIER.hp[1] - soldier.hp).toBe(ENEMIES.brute.attack!.damage - SOLDIER.armor[1]);
  });

  it('士兵陣亡後敵人繼續前進，10 秒後士兵在集結點重生', () => {
    const s = withBarracks();
    const soldier = singleSoldier(s);
    soldier.hp = 1;
    const grunt = addEnemy(s, 'grunt', 100);
    const events = runFor(s, 1.2);
    expect(soldier.alive).toBe(false);
    expect(grunt.blockedBy).toBeNull();
    expect(events).toContainEqual({ type: 'soldierDied', soldierId: soldier.id });
    const at = grunt.distance;
    runFor(s, 1);
    expect(grunt.distance).toBeGreaterThan(at);

    runFor(s, SOLDIER.respawn);
    expect(soldier.alive).toBe(true);
    expect(soldier.hp).toBe(soldier.maxHp);
  });

  it('每名士兵同時只擋 1 名敵人：4 隻擠在一起時有 1 隻會通過', () => {
    const s = withBarracks();
    for (const d of [120, 121, 122, 123]) addEnemy(s, 'grunt', d);
    runFor(s, 2);
    const blocked = s.enemies.filter((e) => e.blockedBy !== null);
    expect(blocked).toHaveLength(3);
    expect(new Set(blocked.map((e) => e.blockedBy)).size).toBe(3);
    const free = s.enemies.find((e) => e.blockedBy === null)!;
    expect(free.distance).toBeGreaterThan(200); // 已經走過集結點
  });

  it('飛行敵人不會被擋住', () => {
    const s = withBarracks();
    const bat = addEnemy(s, 'bat', 100);
    runFor(s, 2);
    expect(bat.blockedBy).toBeNull();
    expect(bat.distance).toBeGreaterThan(200);
  });

  it('賣掉兵營時士兵消失，被擋住的敵人放行', () => {
    const s = withBarracks();
    const grunt = addEnemy(s, 'grunt', 100);
    runFor(s, 1);
    expect(grunt.blockedBy).not.toBeNull();
    sellTower(s, s.towers[0]!.id);
    expect(s.soldiers).toHaveLength(0);
    expect(grunt.blockedBy).toBeNull();
  });
});

describe('集結點', () => {
  it('可以移到集結範圍內的路上，士兵跟著移動並放開原本擋住的敵人', () => {
    const s = withBarracks();
    const tower = s.towers[0]!;
    const grunt = addEnemy(s, 'grunt', 100);
    runFor(s, 1);
    expect(setRallyPoint(s, tower.id, { x: 240, y: 260 })).toEqual({ ok: true });
    expect(tower.rally).toEqual({ x: 240, y: 260 });
    expect(grunt.blockedBy).toBeNull();
    for (const soldier of s.soldiers) expect(distance(soldier.home, tower.rally!)).toBeLessThan(40);
  });

  it('超出集結範圍或不在路上時失敗', () => {
    const s = withBarracks();
    const id = s.towers[0]!.id;
    expect(setRallyPoint(s, id, { x: 240, y: 480 })).toEqual({ ok: false, reason: 'rally-out-of-range' });
    expect(setRallyPoint(s, id, { x: 60, y: 300 })).toEqual({ ok: false, reason: 'not-on-path' });
  });

  it('只有兵營可以設定集結點', () => {
    const s = newBattle();
    buildTower(s, 3, 'archer');
    expect(setRallyPoint(s, s.towers[0]!.id, { x: 300, y: 500 })).toEqual({ ok: false, reason: 'not-barracks' });
  });
});
