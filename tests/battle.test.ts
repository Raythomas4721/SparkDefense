import { describe, expect, it } from 'vitest';
import { buildTower, startNextWave } from '../src/core/battle/commands';
import { mitigatedDamage } from '../src/core/battle/damage';
import { getPath } from '../src/core/battle/path';
import { starsFor } from '../src/core/battle/rating';
import { slotPosition } from '../src/core/battle/state';
import { step } from '../src/core/battle/step';
import { findFirstTarget } from '../src/core/battle/targeting';
import { BATTLE_RULES, STEP_DT } from '../src/core/data/battle';
import { ENEMIES } from '../src/core/data/enemies';
import { addEnemy, newBattle, runFor } from './helpers';

describe('傷害與護甲', () => {
  it('物理傷害扣護甲，最低 1 點', () => {
    expect(mitigatedDamage(10, 'physical', 0)).toBe(10);
    expect(mitigatedDamage(10, 'physical', 8)).toBe(2);
    expect(mitigatedDamage(10, 'physical', 20)).toBe(1);
  });

  it('魔法傷害無視護甲', () => {
    expect(mitigatedDamage(10, 'magic', 8)).toBe(10);
  });
});

describe('敵人移動與漏怪', () => {
  it('敵人以自己的速度前進', () => {
    const s = newBattle();
    const e = addEnemy(s, 'grunt', 0);
    runFor(s, 1);
    expect(e.distance).toBeCloseTo(ENEMIES.grunt.speed, 5);
  });

  it('抵達終點時扣耐久並移除', () => {
    const s = newBattle();
    const end = getPath(s.mapId).length;
    addEnemy(s, 'brute', end - 1);
    const events = step(s, STEP_DT);
    expect(s.coreHp).toBe(BATTLE_RULES.coreHp - ENEMIES.brute.leakDamage);
    expect(s.enemies).toHaveLength(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'enemyLeaked', damage: 2 }));
  });

  it('耐久歸零立刻失敗，之後 step 不再改變任何狀態', () => {
    const s = newBattle();
    s.coreHp = 1;
    addEnemy(s, 'grunt', getPath(s.mapId).length - 1);
    addEnemy(s, 'grunt', 10);
    const events = step(s, STEP_DT);
    expect(s.result).toBe('defeat');
    expect(s.coreHp).toBe(0);
    expect(events).toContainEqual({ type: 'defeat' });

    const snapshot = JSON.stringify(s);
    expect(step(s, STEP_DT)).toEqual([]);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('目標選擇', () => {
  it('選射程內最接近終點的敵人，忽略射程外的', () => {
    const s = newBattle();
    const from = slotPosition(s, 3);
    const behind = addEnemy(s, 'grunt', 650);
    const ahead = addEnemy(s, 'grunt', 750);
    addEnemy(s, 'grunt', 1400); // 更前面但在射程外
    const target = findFirstTarget(s, { from, range: 160, canHitFlying: true });
    expect(target?.id).toBe(ahead.id);
    expect(target?.id).not.toBe(behind.id);
  });

  it('射程內沒有敵人時回傳 undefined', () => {
    const s = newBattle();
    addEnemy(s, 'grunt', 1400);
    expect(findFirstTarget(s, { from: slotPosition(s, 0), range: 160, canHitFlying: true })).toBeUndefined();
  });
});

describe('塔的攻擊', () => {
  it('弓兵塔射出的箭會命中，造成扣護甲後的傷害', () => {
    const s = newBattle();
    buildTower(s, 3, 'archer');
    const brute = addEnemy(s, 'brute', 700);
    runFor(s, 0.5);
    expect(brute.hp).toBe(ENEMIES.brute.hp - (10 - ENEMIES.brute.armor));
    expect(s.towers[0]!.damageDealt).toBe(2);
  });

  it('攻擊間隔：弓兵塔 0.6 秒射一次', () => {
    const s = newBattle();
    buildTower(s, 3, 'archer');
    addEnemy(s, 'brute', 700);
    const fired = runFor(s, 1.25).filter((e) => e.type === 'towerFired');
    expect(fired).toHaveLength(3); // 0、0.6、1.2 秒
  });

  it('砲彈落地時傷害半徑內所有敵人', () => {
    const s = newBattle();
    buildTower(s, 3, 'cannon');
    // 三隻擠在一起，飛行時間內幾乎一起移動
    const a = addEnemy(s, 'grunt', 700);
    const b = addEnemy(s, 'grunt', 710);
    const c = addEnemy(s, 'grunt', 720);
    const events = runFor(s, 0.8);
    expect(events.filter((e) => e.type === 'explosion')).toHaveLength(1);
    for (const e of [a, b, c]) expect(e.hp).toBe(ENEMIES.grunt.hp - 25);
  });

  it('擊殺給金幣並送出事件', () => {
    const s = newBattle();
    buildTower(s, 3, 'archer');
    const runner = addEnemy(s, 'runner', 700);
    runner.hp = 5;
    const goldBefore = s.gold;
    const events = runFor(s, 0.5);
    expect(s.enemies.find((e) => e.id === runner.id)).toBeUndefined();
    expect(s.gold).toBe(goldBefore + ENEMIES.runner.gold);
    expect(s.stats.kills).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'enemyKilled', gold: ENEMIES.runner.gold }));
  });
});

describe('波次', () => {
  it('按下開始前不會出怪', () => {
    const s = newBattle();
    runFor(s, 30);
    expect(s.enemies).toHaveLength(0);
    expect(s.waveIndex).toBe(-1);
  });

  it('這波出完時給波次獎勵並開始 20 秒倒數，倒數結束自動開始下一波', () => {
    const s = newBattle();
    startNextWave(s);
    const goldBefore = s.gold;
    const events = runFor(s, 11);
    expect(events).toContainEqual({ type: 'waveSpawned', waveIndex: 0, bonus: 20 });
    expect(s.countdown).not.toBeNull();
    expect(s.gold).toBeGreaterThanOrEqual(goldBefore + 20);

    const more = runFor(s, BATTLE_RULES.waveCountdown + 0.1);
    expect(more).toContainEqual({ type: 'waveStarted', waveIndex: 1 });
    expect(s.waveIndex).toBe(1);
  });

  it('最後一波出完後不倒數，清空場上即勝利', () => {
    const s = newBattle();
    startNextWave(s);
    s.waveIndex = s.waveCount - 1;
    s.pendingSpawns = [];
    s.spawning = true;
    step(s, STEP_DT);
    expect(s.countdown).toBeNull();
    expect(s.result).toBe('victory');
  });
});

describe('星級', () => {
  it('依剩餘耐久給星', () => {
    const s = newBattle();
    s.result = 'victory';
    s.coreHp = 20;
    expect(starsFor(s)).toBe(3);
    s.coreHp = 18;
    expect(starsFor(s)).toBe(3);
    s.coreHp = 17;
    expect(starsFor(s)).toBe(2);
    s.coreHp = 10;
    expect(starsFor(s)).toBe(2);
    s.coreHp = 9;
    expect(starsFor(s)).toBe(1);
    s.result = 'defeat';
    expect(starsFor(s)).toBe(0);
  });
});
