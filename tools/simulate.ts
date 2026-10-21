// 無頭戰鬥模擬（DESIGN.md §11.6）
// 用法：npm run sim -- [關卡 id] [種子]
import { BUILD_PLANS } from '../src/core/data/buildPlans';
import { STAGES } from '../src/core/data/stages';
import { TOWERS } from '../src/core/data/towers';
import { runPlan } from '../src/core/sim/runner';

const stageId = process.argv[2] ?? 'stage-1';
const seed = Number(process.argv[3] ?? 1);
const stage = STAGES[stageId];
const plans = BUILD_PLANS[stageId];

if (!stage || !plans) {
  console.error(`找不到關卡或建造腳本：${stageId}`);
  process.exit(1);
}

const RESULT_TEXT = { victory: '勝利', defeat: '失敗', playing: '逾時' } as const;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

console.log(`星火防線 無頭模擬 ─ ${stage.name}（${stageId}），種子 ${seed}\n`);

for (const plan of plans) {
  const r = runPlan(stageId, plan, seed);
  console.log(`■ ${plan.name}（${plan.id}）`);
  console.log(
    `  ${RESULT_TEXT[r.result]} ${r.result === 'victory' ? stars(r.stars) : `第 ${r.waveReached}/${stage.waves.length} 波`}` +
      `  耐久 ${r.coreHp}  擊殺 ${r.kills}  漏怪 ${r.leaks}  時間 ${r.time}s`,
  );
  console.log(
    `  金幣：收入 ${r.goldEarned}  花費 ${r.goldSpent}  剩餘 ${r.unspentGold}  腳本進度 ${r.actionsDone}/${r.actionsTotal}`,
  );
  const total = r.towers.reduce((sum, t) => sum + t.damage, 0) || 1;
  for (const t of r.towers) {
    const share = ((t.damage / total) * 100).toFixed(0).padStart(3);
    console.log(`    塔位 ${t.slot}  ${TOWERS[t.type].name} 階${'I'.repeat(t.tier)}`.padEnd(22) + `傷害 ${t.damage}（${share}%）`);
  }
  console.log('');
}
