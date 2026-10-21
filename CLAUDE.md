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

**下一步**：Phase 1（塔防本體）：地圖與 10 個塔位、弓兵塔與砲塔、三種敵人、金幣、波次倒數、提早呼叫、護甲、勝負判定。
