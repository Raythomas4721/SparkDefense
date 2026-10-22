// 無頭戰鬥模擬（DESIGN.md §11.6）
// 用法：npm run sim -- [關卡 id] [種子] [英雄]
//   英雄：starters（預設，比較無英雄與三位御三家）、none、或英雄 id（helo、chaosheng、senya、ni、mo、liya）
import { BUILD_PLANS } from '../src/core/data/buildPlans';
import { REACTION_NAMES } from '../src/core/data/elements';
import { HEROES, STARTERS } from '../src/core/data/heroes';
import { STAGES } from '../src/core/data/stages';
import { TOWERS } from '../src/core/data/towers';
import { runPlan, type SimReport } from '../src/core/sim/runner';
import type { HeroId, ReactionId } from '../src/core/types';

const stageId = process.argv[2] ?? 'stage-1';
const seed = Number(process.argv[3] ?? 1);
const heroArg = process.argv[4] ?? 'starters';
const stage = STAGES[stageId];
const plans = BUILD_PLANS[stageId];

if (!stage || !plans) {
  console.error(`找不到關卡或建造腳本：${stageId}`);
  process.exit(1);
}
if (heroArg !== 'starters' && heroArg !== 'none' && !(heroArg in HEROES)) {
  console.error(`找不到英雄：${heroArg}`);
  process.exit(1);
}

const RESULT_TEXT = { victory: '勝利', defeat: '失敗', playing: '逾時' } as const;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const heroName = (id: HeroId | null) => (id ? HEROES[id].name : '無英雄');

/** 對齊用：中文字算兩格寬 */
function pad(text: string, width: number): string {
  const len = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  return text + ' '.repeat(Math.max(0, width - len));
}

function cell(r: SimReport): string {
  const core = r.result === 'victory' ? stars(r.stars) : `第${r.waveReached}波敗`;
  return r.heroId ? `${core} ${r.coreHp}（英雄${pct(r.heroShare)}）` : `${core} ${r.coreHp}`;
}

function printDetail(r: SimReport, planName: string): void {
  console.log(`■ ${planName}（${r.planId}）${r.heroId ? `＋${heroName(r.heroId)}` : ''}`);
  console.log(
    `  ${RESULT_TEXT[r.result]} ${r.result === 'victory' ? stars(r.stars) : `第 ${r.waveReached}/${stage!.waves.length} 波`}` +
      `  耐久 ${r.coreHp}  擊殺 ${r.kills}  漏怪 ${r.leaks}  時間 ${r.time}s`,
  );
  console.log(`  金幣：收入 ${r.goldEarned}  花費 ${r.goldSpent}  剩餘 ${r.unspentGold}  腳本進度 ${r.actionsDone}/${r.actionsTotal}`);
  const reactions = (Object.keys(r.reactions) as ReactionId[])
    .filter((id) => r.reactions[id] > 0)
    .map((id) => `${REACTION_NAMES[id]} ${r.reactions[id]}`);
  if (reactions.length > 0) console.log(`  反應：${reactions.join('  ')}`);
  const total = r.towers.reduce((sum, t) => sum + t.damage, 0) + r.heroDamage || 1;
  if (r.heroId) console.log(`    英雄 ${heroName(r.heroId)}`.padEnd(22) + `傷害 ${r.heroDamage}（${pct(r.heroDamage / total)}）`);
  for (const t of r.towers) {
    console.log(`    塔位 ${t.slot}  ${TOWERS[t.type].name} 階${'I'.repeat(t.tier)}`.padEnd(22) + `傷害 ${t.damage}（${pct(t.damage / total)}）`);
  }
  console.log('');
}

console.log(`星火防線 無頭模擬 ─ ${stage.name}（${stageId}），種子 ${seed}\n`);

if (heroArg === 'starters') {
  const heroes: Array<HeroId | null> = [null, ...STARTERS];
  console.log(pad('建造腳本', 26) + heroes.map((h) => pad(heroName(h), 24)).join(''));
  for (const plan of plans) {
    const row = heroes.map((h) => pad(cell(runPlan(stageId, plan, seed, h)), 24)).join('');
    console.log(pad(plan.name, 26) + row);
  }
  console.log('\n格式：結果 剩餘耐久（英雄傷害佔比）。看單一英雄的詳細結果：npm run sim -- stage-1 1 helo');
} else {
  const heroId = heroArg === 'none' ? null : (heroArg as HeroId);
  for (const plan of plans) printDetail(runPlan(stageId, plan, seed, heroId), plan.name);
}
