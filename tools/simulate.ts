// 無頭戰鬥模擬（DESIGN.md §11.6）。
// 戰鬥核心在 Phase 1 實作，目前只確認 Node 能直接執行 src/core 的程式。
import { createRng, nextFloat } from '../src/core/rng';

const rng = createRng(42);
const sample = Array.from({ length: 3 }, () => nextFloat(rng).toFixed(4));

console.log('星火防線 無頭模擬');
console.log(`RNG 檢查（種子 42）：${sample.join(', ')}`);
console.log('戰鬥核心尚未實作，Phase 1 會加入第一場模擬戰鬥。');
