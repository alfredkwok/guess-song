# 🎵 Guess The Song — 香港廣東歌版

> English version: **[README.en.md](README.en.md)**

從香港最紅的粵語歌猜歌的多人連線派對遊戲。

- 房主選擇**年份歌單**或**歌手精選**（陳奕迅 / 周國賢 / 林家謙 / 三位混合）
- 系統產生一組 **6 位房間代碼**，其他玩家用手機加入
- 每回合可選 **10 / 20 / 30 題**：隨機播一首歌的**前 5 秒**
- 4 個選項是**同一位歌手**的歌；先答對的人得分，全部人答錯就提早揭曉
- 即時分數排行榜

## 歌單分類

| 分類 | 內容 |
| --- | --- |
| 2020–2022 | 2020 至 2022 年最紅粵語歌（100 首） |
| 2022–2024 | 2022 至 2024 年最紅粵語歌（100 首） |
| 2024–2026 | 2024 至 2026 年最紅粵語歌（100 首，實際多為 2024–2025 新歌） |
| 陳奕迅 | 陳奕迅粵語精選（57 首） |
| 周國賢 | 周國賢粵語精選（42 首） |
| 林家謙 | 林家謙粵語精選（33 首） |
| 三位混合 | 陳奕迅 + 周國賢 + 林家謙（132 首） |

> 歌曲資料在 `server/songdata.js`，可自行增減或調整順序。
> 歌手精選的 4 個選項都是同一位歌手，所以挑戰在於**認出是哪一首歌**。

## 音源

使用 **iTunes Search API**（免費、免 API key）取得每首歌的 **30 秒試聽**，遊戲只播放前 5 秒。試聽網址會快取在 `server/.preview-cache.json`，第二次啟動秒開。

> iTunes 限制約 **20 次／分鐘**，程式已節流並在遇到 403 時自動等待重試。

## 架構

| 資料夾 | 說明 |
| --- | --- |
| `server/` | Node.js + Express + Socket.io（房間管理、遊戲邏輯、iTunes 音源） |
| `client/` | React + Vite（手機友善介面） |

## 安裝與執行

需要 Node.js 18+。

```bash
# 1. 安裝所有依賴
npm run install:all

# 2. 啟動開發伺服器（同時啟動 server:3001 與 client:5173）
npm run dev
```

打開瀏覽器到 **http://localhost:5173**。

### 用手機加入

讓其他玩家在同一個 Wi-Fi 下，用手機瀏覽器開啟 `http://<你的電腦IP>:5173`，點「加入朋友的遊戲」輸入房間代碼即可。

> 開發模式下 Vite 已設定 `host: true`，會監聽區域網路。啟動 `npm run dev` 後終端機畫面會列出可用的區域網路位址（例如 `http://192.168.x.x:5173`），用手機開啟那個網址即可。

## 遊戲規則（可調）

- 每回合房主可選 **10 / 20 / 30 題**（若歌單不足則自動調整）
- 每首播放 **前 5 秒**，作答時間最多 **15 秒**
- 每人每首**只能猜一次**；有人答對、或全部人都答錯 → 立即揭曉並換下一首
- 4 個選項 = 正確答案 + **同一位歌手的另外 3 首**

這些參數都在 `server/index.js` 頂端（`SONG_SECONDS`、`GUESS_WINDOW_MS`、`RESULT_PAUSE_MS`）。

> 開發提示：`npm run dev` 不會在改檔後自動重啟伺服器（避免遊戲中途房間被清空）。
> 需要自動重載時用 `npm run dev:watch`。

## 生產部署

本機測試生產模式：

```bash
npm run build     # 建置 client 到 client/dist
npm start         # server:3001 同時提供 API + 靜態網頁
```

開啟 **http://localhost:3001**。

### 放到 AWS EC2（讓全世界都能玩）

完整步驟請看 **[DEPLOY.md](DEPLOY.md)**（GitHub 流程，含 nginx + systemd + HTTPS）：

```bash
# 在 EC2 上
git clone https://github.com/alfredkwok/guess-song.git ~/guess-song
cd ~/guess-song && bash deploy/setup.sh   # 首次安裝
bash deploy/update.sh                     # 之後每次更新
```

`deploy/` 內附 `nginx.conf`（含 WebSocket 升級）、`songguess.service`、`setup.sh`、`update.sh`。

## 注意事項

- 部分歌曲在 iTunes 沒有試聽，會自動被過濾；只要分類還有至少 4 首即可玩。
- 第一次載入某分類會需要幾秒鐘去抓試聽，之後有快取就很快。
- 房間在所有人離開後自動清除。
