import { describe, expect, it } from 'vitest';
import {
  buildTower,
  earlyCallBonus,
  sellTower,
  sellValue,
  startNextWave,
  upgradeCost,
  upgradeTower,
} from '../src/core/battle/commands';
import { BATTLE_RULES } from '../src/core/data/battle';
import { newBattle, runFor } from './helpers';

describe('蓋塔', () => {
  it('扣金幣並在塔位上建立階 I 的塔', () => {
    const s = newBattle();
    expect(buildTower(s, 3, 'archer')).toEqual({ ok: true });
    expect(s.gold).toBe(BATTLE_RULES.startGold - 70);
    expect(s.towers).toHaveLength(1);
    expect(s.towers[0]).toMatchObject({ slot: 3, type: 'archer', tier: 0, spent: 70 });
  });

  it('同一個塔位不能蓋兩座', () => {
    const s = newBattle();
    buildTower(s, 3, 'archer');
    expect(buildTower(s, 3, 'cannon')).toEqual({ ok: false, reason: 'slot-occupied' });
    expect(s.towers).toHaveLength(1);
  });

  it('金幣不足時失敗、回報還差多少，且金幣不變', () => {
    const s = newBattle();
    s.gold = 100;
    expect(buildTower(s, 0, 'cannon')).toEqual({ ok: false, reason: 'not-enough-gold', shortBy: 20 });
    expect(s.gold).toBe(100);
  });

  it('不存在的塔位會失敗', () => {
    const s = newBattle();
    expect(buildTower(s, 10, 'archer')).toMatchObject({ ok: false, reason: 'invalid-slot' });
    expect(buildTower(s, -1, 'archer')).toMatchObject({ ok: false, reason: 'invalid-slot' });
  });

  it('金幣永遠不會變成負數', () => {
    const s = newBattle();
    for (let slot = 0; slot < 10; slot++) buildTower(s, slot, 'archer');
    expect(s.gold).toBeGreaterThanOrEqual(0);
    expect(s.towers).toHaveLength(Math.floor(BATTLE_RULES.startGold / 70));
  });
});

describe('升級', () => {
  it('依序升到階 II、階 III，並累計花費', () => {
    const s = newBattle();
    s.gold = 1000;
    buildTower(s, 0, 'cannon');
    const tower = s.towers[0]!;
    expect(upgradeCost(tower)).toBe(90);
    expect(upgradeTower(s, tower.id).ok).toBe(true);
    expect(tower.tier).toBe(1);
    expect(upgradeCost(tower)).toBe(140);
    expect(upgradeTower(s, tower.id).ok).toBe(true);
    expect(tower.tier).toBe(2);
    expect(tower.spent).toBe(120 + 90 + 140);
    expect(s.gold).toBe(1000 - 350);
  });

  it('已是階 III 時不能再升', () => {
    const s = newBattle();
    s.gold = 1000;
    buildTower(s, 0, 'archer');
    const id = s.towers[0]!.id;
    upgradeTower(s, id);
    upgradeTower(s, id);
    expect(upgradeCost(s.towers[0]!)).toBeNull();
    expect(upgradeTower(s, id)).toEqual({ ok: false, reason: 'max-tier' });
  });

  it('金幣不足時不升級', () => {
    const s = newBattle();
    buildTower(s, 0, 'archer');
    s.gold = 10;
    expect(upgradeTower(s, s.towers[0]!.id)).toEqual({ ok: false, reason: 'not-enough-gold', shortBy: 50 });
    expect(s.towers[0]!.tier).toBe(0);
  });
});

describe('賣塔', () => {
  it('退還總花費的 60%（無條件捨去），並空出塔位', () => {
    const s = newBattle();
    s.gold = 1000;
    buildTower(s, 2, 'archer');
    const tower = s.towers[0]!;
    upgradeTower(s, tower.id); // 70 + 60 = 130 → 退 78
    expect(sellValue(tower)).toBe(78);
    const before = s.gold;
    expect(sellTower(s, tower.id)).toEqual({ ok: true, gold: 78 });
    expect(s.gold).toBe(before + 78);
    expect(s.towers).toHaveLength(0);
    expect(buildTower(s, 2, 'cannon').ok).toBe(true);
  });

  it('找不到塔時失敗', () => {
    expect(sellTower(newBattle(), 999)).toEqual({ ok: false, reason: 'tower-not-found' });
  });
});

describe('開始與提早呼叫', () => {
  it('第一次呼叫開始第 1 波，不給獎勵', () => {
    const s = newBattle();
    expect(startNextWave(s)).toEqual({ ok: true, gold: 0 });
    expect(s.waveIndex).toBe(0);
    expect(s.spawning).toBe(true);
  });

  it('出怪中不能呼叫下一波', () => {
    const s = newBattle();
    startNextWave(s);
    expect(startNextWave(s)).toEqual({ ok: false, reason: 'wave-in-progress' });
  });

  it('倒數中提早呼叫，給「剩餘秒數 × 1」金幣並開始下一波', () => {
    const s = newBattle();
    startNextWave(s);
    runFor(s, 20); // 第 1 波 10 隻、間隔 1.2 秒，約 10.8 秒出完
    expect(s.countdown).not.toBeNull();
    const remaining = s.countdown!;
    const expected = Math.floor(remaining);
    expect(earlyCallBonus(s)).toBe(expected);
    const goldBefore = s.gold;
    expect(startNextWave(s)).toEqual({ ok: true, gold: expected });
    expect(s.gold).toBe(goldBefore + expected);
    expect(s.waveIndex).toBe(1);
    expect(s.countdown).toBeNull();
  });

  it('戰鬥結束後所有指令都會失敗', () => {
    const s = newBattle();
    s.result = 'defeat';
    expect(buildTower(s, 0, 'archer')).toMatchObject({ ok: false, reason: 'battle-ended' });
    expect(startNextWave(s)).toMatchObject({ ok: false, reason: 'battle-ended' });
  });
});
