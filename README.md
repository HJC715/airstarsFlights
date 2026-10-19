# 星域航空 Air Stars

原生 HTML、CSS、JavaScript ES Modules 的完整虛構航空訂票體驗。無後端、無真實訂位或付款，資料僅保存在當次分頁記憶體，重新整理及離開成功頁後不可恢復。不要填入真實個資；旅客頁提供虛構資料按鈕。

## 本機執行

需 Python 3 與現代瀏覽器，無需 npm 安裝或編譯：

```bash
cd airstarsFlights
python3 -m http.server 8000 --bind 0.0.0.0
```

在一般本機瀏覽器開啟 HTTP server 的 8000 連接埠。ES Modules 須經 HTTP 存取，不能保證 `file://` 雙擊可用。所有必要資料、圖片、PDF 函式庫及繁體中文字型已包含於專案，執行期間不需要外部 API、CDN 或憑證。

## 操作與資料

- 單程、來回、多城市 2–4 段；1–9 成人；可查起飛機場今日至第 364 天，至少提前兩小時。
- 32 機場、38 雙向航線、118 單向固定週班表；直飛或 TPE/KHH 同機場一次轉機。按 PRD Part 1 §5 採 90 分鐘至 **18 小時**；Part 2 的 12 小時摘要以 Part 1 為準。
- 八機型精確客艙、穩定 FNV-1a 模擬占位、逐段混艙與橫向票種比較。行李以 23／32 kg 加減器操作；座位只顯示所購艙等，可略過，亦支援多人依序選位、取消後補位及上下航段切換。
- 經濟／豪經僅預約特殊餐，預設無需求；商務／頭等有主菜與三種早餐，特殊餐獨立設定。確認與成功頁共用圖示卡片，付款授權成功後按「完成」才進成功頁。
- 所有金額由 `js/pricing.js` 統一以整數 TWD 計算，使用固定匯率顯示，換算尾差另列。選位與行李依已選服務計入，無真實退改票功能。
- 返回修改僅清除受影響航段的服務；只換票種保留服務並重算權益，刪除多城市中間航程也保留其他航程的穩定識別碼與服務。付款保存不可變快照，離開成功頁清空整筆訂單。
- 七步流程後進獨立成功頁；六碼 PNR、每人電子票號及 A4 多頁 PDF。PDF 使用瀏覽器 Canvas 與專案內繁中字型繪製再嵌入 PDF，中文字可讀但不能選取為文字，每頁均有模擬無效聲明。
- 一般付款隨機 3–5 秒、98% 成功／2% 失敗。卡片依 Part 1 使用 `DEMO-GOLD`、`DEMO-SILVER`、`DEMO-VIRTUAL`，不接受真實卡號／CVV。開發驗收可明確用 `?qaPayment=success` 或 `?qaPayment=fail`，一般網址不強制結果。
- 無 localStorage、sessionStorage、IndexedDB、會員或既有訂位管理。所有操作與資料保留僅限當次分頁執行階段。

## 基本驗收

1. 搜尋未來可售的 TPE → NRT 單程、一成人，選航班、艙等與票種。
2. 使用具自然姓名的虛構旅客資料，確認行李；可略過選位、手動選位或確認費用後自動分配，再設定餐飲需求。
3. 核對機票、模擬稅費、選位及行李總額；勾選確認，使用測試卡完成模擬付款。
4. 授權成功後按「完成」，核對 PNR、電子票號、下載 PDF 並檢查中文、未選位提示與每頁聲明。
5. 在手機重複操作。用失敗 QA 參數檢查付款後保留資料與可重試。

純邏輯驗證（需 Node 22 以上，無專案套件依賴）：

```bash
node --test tests/*.test.mjs
```

瀏覽器驗收使用外部 Playwright，不影響網站執行依賴：

```bash
npm --cache /workspace/.npm-cache --prefix /workspace/air-stars-tools install --no-audit --no-fund playwright@1.58.2
node tests/browser.mjs
node tests/ui.mjs
node tests/fare-layout.mjs
node tests/review-layout.mjs
node tests/pdf.mjs
```

瀏覽器程式使用 `/usr/bin/chromium`，可透過 `CHROMIUM_PATH` 覆寫；驗收產物寫到 `/tmp/air-stars-results/`。PDF 進階檢查另使用 `pdfinfo`、`pdftoppm`（Poppler）。已驗收內容見 `docs/VALIDATION.md`。

## GitHub Pages

將專案根目錄內容提交到儲存庫，確保根目錄有 `index.html`。到 GitHub Repository → Settings → Pages → Build and deployment → Deploy from a branch，選主分支與 `/ (root)`，再等待部署。所有資產路徑皆相對於本專案，支援 `/<repository>/` 子路徑，不需建置命令。上傳程式碼與發布網站是不同操作；啟用 Pages 後，仍須等待 GitHub 完成部署。

## 檔案與授權

`assets/data/` 保存完整規範資料；`js/` 為時區、航班、庫存、價格、流程、介面、付款與 PDF 模組；`css/` 包含 RWD 與 reduced-motion；`assets/icons/` 為本專案原創 SVG；`assets/images/aircraft-hero.png` 是依本專案需求生成的無文字航空形象圖。

`assets/vendor/jspdf.umd.min.js` 為 jsPDF 3.0.4（MIT，完整授權見同目錄）；`AirStarsCJK.woff2` 由 Noto Sans CJK TC Regular（SIL Open Font License 1.1）轉為 WOFF2，散布授權及原作者資訊見 `Noto-LICENSE.txt`。字型已隨專案提供，無需另外安裝。

2026-10-19 的 16 項介面與流程調整詳見 `docs/UPDATES_2026-10-19.md`；這些新要求優先於原始 PRD 中相對應的舊規則。
