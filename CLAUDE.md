# 星火防線：裂隙守望（SparkDefense）

2D 塔防 × 英雄收集養成，瀏覽器單機遊戲。

**規格以 [DESIGN.md](DESIGN.md) 為準**（目前 v0.3）。實作與文件不一致時，先提出來討論，不要自行決定改哪一邊。`DESIGN-v0.1-gpt.md`、`DESIGN-v0.2.md` 是舊版，只供參考，不要照著做。

## 指令

```bash
npm run dev        # 開發伺服器
npm test           # 單元測試（Vitest）
npm run typecheck  # 型別檢查
npm run build      # 型別檢查＋正式打包到 dist/
npm run sim        # 無頭戰鬥模擬（Node 直接執行 src/core）
```

## 架構規則

- `src/core/`：**純 TypeScript** 的遊戲規則（戰鬥、養成、資料、RNG）。
  - 不可以 import Phaser、`src/game/`，也不可以使用 `window`、`document`、`localStorage`。
  - `tests/architecture.test.ts` 會自動檢查這條規則，違反時測試會失敗。
  - 存檔：`core/meta/save.ts` 只負責序列化、解析、版本遷移；真正讀寫 `localStorage` 的程式放在 `src/game/`。
- `src/game/`：Phaser 場景與畫面。只讀取 core 的狀態來繪製，並把玩家輸入轉成 core 的指令。
- 戰鬥用固定時間步長（1/30 秒）推進；所有隨機都用 `core/rng.ts`，不要直接呼叫 `Math.random()`。
- 數值集中放在 `src/core/data/`，不要寫死在場景或規則程式裡。
- 邏輯判斷一律用 `id`，不用顯示名稱。

## 工作方式

1. 一次只做一個 Phase（DESIGN.md §12）。開始前先提出實作計畫。
2. 不在本版範圍的功能，寫進 DESIGN.md §13.3，不要直接實作。
3. 新增套件、改動架構、移除功能之前，先說明原因與影響。
4. 每次修改後執行 `npm test` 和 `npm run typecheck`；完成一個段落時再跑 `npm run build`。平衡相關的修改要加跑 `npm run sim`。不能執行時要說明原因，不可以假稱通過。
5. 畫面相關的修改，要在瀏覽器實際確認，並檢查 console 沒有錯誤。
6. 功能完成才把按鈕放上畫面，不留空殼。
7. 每個 Phase 結束時，更新下方的「開發進度」。
8. 介面文字使用繁體中文（台灣用語）。用語：塔的升級叫「階」（I／II／III），英雄等級叫「Lv」，星級用「★」。

## 環境備註

- Node 22。npm 10.9 安裝 Vitest 4 時可能出現 `Cannot read properties of null (reading 'edgesOut')`，這是 npm 的 bug，改用 `npx npm@11.6.2 install` 即可。
- Phaser 約 1.2 MB，在 `vite.config.ts` 中單獨切成一個 chunk。

## 開發進度

### Phase 0：專案骨架（2026-10-21 完成）

- Vite 7＋TypeScript 5.9（strict）＋Phaser 3.90＋Vitest 4＋tsx
- `src/core/rng.ts`：可設定種子的 RNG（mulberry32），狀態可複製、可存檔
- `src/game/`：Phaser 啟動、16:9 邏輯解析度（1280×720）、`Scale.FIT` 縮放、佔位畫面
- `tools/simulate.ts`：目前只做 RNG 檢查，Phase 1 會換成第一場模擬戰鬥
- 測試：RNG 決定性、架構規則（core 不依賴 Phaser／DOM）
- 驗證：`npm test`、`npm run typecheck`、`npm run build`、`npm run sim` 通過；瀏覽器在桌面與手機尺寸都正常縮放，console 沒有錯誤

### Phase 1：塔防本體（2026-10-21 完成，待試玩）

- **core**：路線與 10 個塔位（`data/map.ts`）、弓兵塔與砲塔（建造、升到階 III、賣出退 60%）、灰霧小獸／疾行者／重甲石裔、物理傷害與護甲、擊殺金幣、波次出完給獎勵並倒數 20 秒、提早呼叫、勝敗、星級
  - 弓兵塔的箭會追蹤目標；砲彈飛向「飛行時間後敵人的預測位置」，快速敵人可能閃過
  - `step()` 直接修改 state 並回傳事件（`BattleEvent`），畫面用事件做特效
- **模擬**：`core/sim/runner.ts`＋`data/buildPlans.ts`，`npm run sim -- [關卡] [種子]`
- **畫面**：戰場、塔、敵人（形狀不同：圓＝小獸、菱形＝疾行者、方形粗框＝重甲）、投射物、右側面板（資源、蓋塔、升級預覽、賣出、下一波預覽、開始／提早呼叫、1×／2×、暫停、重來需按兩次確認）、結算畫面
- **開發用**：開發模式下 console 可用 `__spark.state` 查看戰鬥狀態、`__spark.game` 取得 Phaser 實例
- 測試 64 個全過；build、sim 通過；瀏覽器實測蓋塔、升級、停用按鈕提示、賣出、開波、倒數、失敗與勝利結算、再玩一次，console 無錯誤

**與 DESIGN.md 的差異（待確認）**

- 關卡 1 目前是 Phase 1 暫定的 5 波版本（只用三種敵人）；Phase 2 改成 §9.2 的六波
- 路線總長約 1790 像素（文件寫約 1600）
- 「波次獎勵」在該波**全部出完**時發放（倒數同時開始），不是等場上清空

**模擬觀察（起始數值）**：全弓兵 ★★、弓砲混合 ★、全砲塔失敗、什麼都不蓋第 3 波失敗。砲塔偏弱（敵人間距大，一發通常只打到 1–2 隻），重甲石裔護甲 8 讓弓兵塔階 I 每箭只剩 2 傷害。數值調整留到試玩後一起決定。

**下一步**：自己玩 10 分鐘確認「蓋塔／升級」的決定有趣（DESIGN.md §12 Phase 1 驗收），之後進 Phase 2（法師塔、元素反應、關卡 1 完整版）。
