# AI 藝術能量掃描儀 2.0：跨領域美育評量與創客實踐系統
## 【全新網站獨立發布指南 ＆ 競賽備審說明書】

> 📌 **重要保證**：本系統為 100% 全新重構之獨立專案，所有程式碼均存放在 `art-scanner-2.0/` 資料夾內，**絕不覆蓋、不影響您原有的任何專案與網站！**

---

## 🚀 第一部分：全新網站獨立發布教學（二選一）

為了讓競賽評審擁有獨立、乾淨的評測專屬網址，建議使用 **GitHub Pages** 或 **Google Apps Script** 發布為全新獨立站點：

---

### 方案 A：發布為全新獨立 GitHub Pages 網站（強烈推薦，競賽最愛）

您可以在 GitHub 上開一個全新的 Repository，發布後擁有專屬網址：
`https://<您的帳號>.github.io/ai-art-scanner-2.0/`

#### 簡易四步驟：
1. **前往 GitHub 建立新儲存庫**：
   - 登入 [GitHub.com](https://github.com/) 點擊右上角「**New repository**」。
   - 儲存庫名稱（Repository name）填入：`ai-art-scanner-2.0`。
   - 選擇 **Public**（公開），勾選「Add a README file」，點擊「Create repository」。

2. **上傳本專案檔案**：
   - 進入新建立的 `ai-art-scanner-2.0` 儲存庫頁面。
   - 點擊「**Add file**」➔「**Upload files**」。
   - 將本專案資料夾 `art-scanner-2.0/index.html` 直接拖曳上傳，並確認檔名為 `index.html`。
   - 點擊下方綠色「**Commit changes**」。

3. **開啟 GitHub Pages 服務**：
   - 點擊儲存庫上方的「**Settings**（設定）」。
   - 左側選單點擊「**Pages**」。
   - 在 **Build and deployment** 下方的 **Branch**，選擇 `main` 分支與 `/(root)` 目錄，按「**Save**」。

4. **取得全新專屬網址**：
   - 等待約 1~2 分鐘，重新整理頁面，頂端就會出現綠色勾勾與您的全新網址：
     `https://<您的帳號>.github.io/ai-art-scanner-2.0/`
   - 將此網址直接填入競賽報名表！

---

### 方案 B：發布為全新 Google Apps Script 獨立 Web App

若您希望放在 Google 雲端帳號管理：
1. 前往 [script.google.com](https://script.google.com/)，點擊「新增專案」，命名為「`AI藝術能量掃描儀2.0`」。
2. 在 `Code.gs` 中貼入：
   ```javascript
   function doGet() {
     return HtmlService.createHtmlOutputFromFile('index')
       .setTitle('AI 藝術能量掃描儀 2.0')
       .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
       .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
   }
   ```
3. 點擊「+」新增 HTML 檔案，命名為 `index`，將 `art-scanner-2.0/index.html` 的全部代碼複製貼入。
4. 點擊「部署 ➔ 新增部署作業 ➔ 網頁應用程式」，誰可以存取選擇「所有人」，即可取得全新的獨立 `/exec` 網址。

---

## 🏆 第二部分：競賽參賽作品說明書（可直接複製至報名表）

### 一、 作品基本資料
* **作品名稱**：AI 藝術能量掃描儀 2.0：生成式 AI 輔助之跨領域美感評量與創客實踐系統
* **設計理念**：
  在傳統美術教育與自主學習中，教師常面臨「學生創作量龐大、難以即時給予每位學生個別化深度回饋」的痛點。本系統結合多模態視覺 AI（Multimodal Vision AI）與 108 課綱藝術涵養指標，建構出**「即時美感診斷 ➔ 視覺化構圖回饋 ➔ 自主修煉迭代 ➔ 實體創客胸章輸出」**的完整學習閉環。

---

### 二、 核心創新功能與競賽優勢

| 競賽檢驗重點 | 本專案解決方案（Version 2.0 亮點） |
| :--- | :--- |
| **評審試用零門檻** | **雙模式切換**：具備「評審展示通道（免填 Key、內建模擬規準與高畫質示範作）」與「自訂 Gemini 視覺模型通道」，評審 3 秒即可無痛體驗。 |
| **美育教育規準** | 告別傳統客套話！導入真實教育 Rubrics，細化為「主題契合 (35%)」、「構圖重心 (20%)」、「色彩冷暖 (15%)」、「明暗層次 (15%)」、「線條筆觸 (15%)」五大專業維度。 |
| **視覺化疊圖診斷** | 獨創**三大 Canvas 疊圖分析**：<br>1. **三分構圖法則線（Rule of Thirds）**<br>2. **AI 視覺焦點熱區定位（Visual Focus）**<br>3. **畫面主色調色票萃取（Extracted Palette）** |
| **虛實整合創客實踐** | 綜合評定達 85 分以上，直接解鎖實體創客輸出：<br>• 一鍵匯出 **標準 58mm 胸章印刷版型**（含正面可視區、金屬折邊出血線與裁切十字線）。<br>• 生成 **特級繪師·AI 藝術能量高解析認證證書**。 |
| **形成性評量與自學歷程** | 支援 **Before vs After 迭代進步對比**，記錄自主學習軌跡，並即時典藏至**「班級星空數位藝廊」**。 |

---

### 三、 適用參賽類別推薦
1. **各縣市教育局 / 教育部**：科技創新教育應用競賽、智慧課堂教學創新獎、教師資訊融入教學競賽。
2. **聯發科技「智在家鄉」**：數位社會創新競賽（促進跨領域 STEAM 教育與城鄉美育平等）。
3. **全國大專校院資訊服務創新競賽（InnoServe Awards）**：教育科技組、AI 創新應用組。
4. **大專/高中職青年黑客松 & 生成式 AI 創意大賽**。

---

## 🛠️ 本機快速預覽與驗證

本系統不依賴任何編譯工具（Zero-build），雙擊 `art-scanner-2.0/index.html` 或以任何瀏覽器開啟即可立即體驗所有完整功能！
