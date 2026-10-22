import { describe, expect, it } from 'vitest';
import { BUILD_PLANS } from '../src/core/data/buildPlans';
import { STARTERS } from '../src/core/data/heroes';
import { runPlan } from '../src/core/sim/runner';

const plans = BUILD_PLANS['stage-1']!;
const plan = (id: string) => plans.find((p) => p.id === id)!;

describe('無頭模擬', () => {
  it('相同種子＋相同腳本＝完全相同的結果', () => {
    expect(runPlan('stage-1', plan('mixed'), 7)).toEqual(runPlan('stage-1', plan('mixed'), 7));
  });

  it('什麼都不蓋一定會輸', () => {
    expect(runPlan('stage-1', plan('idle')).result).toBe('defeat');
  });

  it('至少 3 份不同風格的建造腳本能通關關卡 1（DESIGN.md §12 Phase 2 驗收）', () => {
    const wins = plans.filter((p) => runPlan('stage-1', p).result === 'victory');
    expect(wins.length).toBeGreaterThanOrEqual(3);
  });

  it('兵營擋在彎道時，漏怪明顯比不擋的全弓兵少（DESIGN.md §12 Phase 3 驗收）', () => {
    const hold = runPlan('stage-1', plan('corner-hold'));
    const archers = runPlan('stage-1', plan('archers'));
    expect(hold.result).toBe('victory');
    expect(hold.leaks).toBeLessThan(archers.leaks);
  });

  it.each(STARTERS)('御三家 %s 在 Lv.1、0 星時，至少有一份腳本能拿到 ★★（DESIGN.md §12 Phase 4 驗收）', (heroId) => {
    const best = Math.max(...plans.map((p) => runPlan('stage-1', p, 1, heroId).stars));
    expect(best).toBeGreaterThanOrEqual(2);
  });

  it('帶英雄時，英雄的傷害有算進統計', () => {
    const r = runPlan('stage-1', plan('archers'), 1, 'chaosheng');
    expect(r.heroDamage).toBeGreaterThan(0);
    expect(r.heroShare).toBeGreaterThan(0);
  });

  it('反應流派的腳本確實會觸發對應的反應', () => {
    expect(runPlan('stage-1', plan('vaporize')).reactions.vaporize).toBeGreaterThan(0);
    expect(runPlan('stage-1', plan('wildfire')).reactions.wildfire).toBeGreaterThan(0);
  });

  it('模擬中金幣從不為負，也不會逾時', () => {
    for (const p of plans) {
      const r = runPlan('stage-1', p);
      expect(r.unspentGold).toBeGreaterThanOrEqual(0);
      expect(r.result).not.toBe('playing');
    }
  });
});
