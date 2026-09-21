# 🚀 部署到 AWS EC2（GitHub 流程）

把整個遊戲放上 AWS，讓任何人都能連進來玩。

---

## 先回答你的問題：GitHub 真的比較簡單嗎？

**老實說：首次設定 GitHub 稍微麻煩一點，但之後更新簡單非常多。** 以你會一直改這個遊戲來看，**值得改用 GitHub**。

| | **GitHub** | 打包上傳（scp） |
| --- | --- | --- |
| 首次部署 | 建 repo + 推送（要多做一點） | 3 個指令，不用帳號 |
| **之後每次更新** | **`git push` → 伺服器一行指令** | 要重新打包 + 重新上傳 |
| 程式備份 / 版本紀錄 | ✅ 有 | ❌ 沒有 |
| 初學者最常卡住 | 第一次推送要登入授權 | 幾乎不會卡 |

**關鍵小技巧**：把 repo 設成 **Public（公開）**，EC2 上 `git clone` **完全不用登入**，流程就變得超簡單。
（這個專案沒有任何機密：沒有 API key、`.env` 也已排除，公開沒有風險。）

> 不想公開？看 **附錄 B**，用一組 token 也能跑，只是多一個步驟。

---

## 生產環境長怎樣

```
手機 / 電腦
      │  http://<EC2-IP>/
      ▼
   ┌────────┐
   │ nginx  │  :80 / :443（對外）
   └───┬────┘
       │ proxy_pass + WebSocket upgrade
       ▼
   ┌──────────────────────┐
   │ Node.js (Express +   │  :3001（只在本機）
   │ Socket.io)           │  ← 前端網頁 + API + Socket.io
   └──────────────────────┘
       ▲ systemd 常駐（開機自動啟動、當掉自動重啟）
```

Node 一個埠就搞定全部，nginx 只負責轉發與 WebSocket 升級。

---

## 你需要準備

| 項目 | 說明 |
| --- | --- |
| GitHub 帳號 | 免費 |
| AWS 帳號 | 有 EC2 權限即可 |
| Key Pair (.pem) | 開主機時建立並下載 |

> 費用：`t3.micro` 多數情況在免費方案內。不用時記得 **Stop** 主機。

---

## 步驟 1：把專案推上 GitHub

### 1-1 先建立 GitHub repo

到 **https://github.com/new**：

- **Repository name**：`guess-the-song`
- **Public**（建議，這樣 EC2 不用登入）
- **不要**勾 Add README / .gitignore / license（我們本地已經有了）
- 按 **Create repository**

### 1-2 從 Windows 推送

我已經幫你在專案目錄做好 `git init` 和第一次 commit 了，你只要接上遠端並推送：

```powershell
cd D:\alfreprogramm\javascript\DEEPSEEK
git remote add origin https://github.com/<你的帳號>/guess-the-song.git
git push -u origin main
```

第一次推送會要你登入：

- **最簡單**：會自動跳出瀏覽器 → 登入 GitHub → 授權（Git Credential Manager）
- 若沒跳出來：到 GitHub → Settings → Developer settings → **Personal access tokens** → 建一組（勾 `repo`），推送時帳號打你的 GitHub 用戶名、密碼貼上 token

> 確認推送成功：打開 `https://github.com/<你的帳號>/guess-the-song` 應該看得到檔案。

---

## 步驟 2：開一台 EC2

1. 進 **EC2 Console → Launch instance**
2. **Name**：`guess-the-song`
3. **AMI**：`Ubuntu Server 24.04 LTS (HVM), SSD Volume Type`（64-bit x86）
4. **Instance type**：`t3.micro`（或 `t2.micro`）
5. **Key pair**：`Create new key pair` → 例：`songguess-key` → 下載 `.pem`（**只會給一次**）
6. **Network settings → Edit**，Security group 加這三條 **Inbound rules**：

   | Type | Port | Source | 用途 |
   | --- | --- | --- | --- |
   | SSH | 22 | **My IP** | 你連進去管理 |
   | HTTP | 80 | Anywhere (0.0.0.0/0) | 讓大家連進來玩 |
   | HTTPS | 443 | Anywhere (0.0.0.0/0) | 之後加憑證用 |

7. **Storage**：8 GB gp3 就夠
8. 按 **Launch instance**

開好後記下 **Public IPv4 address**（例如 `13.114.xx.xx`）。

---

## 步驟 3：從 Windows 連進去

```powershell
ssh -i C:\Users\alfre\Downloads\songguess-key.pem ubuntu@<你的-EC2-IP>
```

第一次問 `Are you sure you want to continue connecting?` → 打 `yes`。

> **若出現 `UNPROTECTED PRIVATE KEY FILE`**，先修權限再連：
> ```powershell
> icacls C:\Users\alfre\Downloads\songguess-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
> ```

---

## 步驟 4：在 EC2 上安裝（兩行）

回到 **SSH 視窗**：

```bash
git clone https://github.com/<你的帳號>/guess-the-song.git ~/guess-the-song
cd ~/guess-the-song && bash deploy/setup.sh
```

`deploy/setup.sh` 會自動做完：

1. 安裝 **Node.js 20 + nginx**
2. `npm run install:all`（安裝全部依賴）
3. `npm run build`（打包前端）
4. 建立 **systemd 服務**（開機自啟、當掉自動重啟）
5. 設定 **nginx 反向代理**（含 WebSocket 升級）
6. 健康檢查並印出網址

看到這樣就成功了：

```
   OK  server is up

Open:  http://13.114.xx.xx/
```

> 📦 因為 repo 裡已經包含 `server/.preview-cache.json`（抓好的試聽快取），
> 上線後**分類立刻能玩**，不用等 iTunes 慢慢抓。

---

## 步驟 5：開始玩 🎵

1. 瀏覽器打開 **`http://<你的-EC2-IP>/`**
2. 按 **Guess Song** → 選歌單（年份歌單 / 歌手精選）
3. 得到 **6 位房間代碼**
4. 朋友用手機開**同一個網址**，按「加入朋友的遊戲」輸入代碼

> 這次不用同一個 Wi-Fi，**全世界都連得上**。

---

## 之後要更新程式（重點！）

改完程式碼後：

```powershell
# Windows
cd D:\alfreprogramm\javascript\DEEPSEEK
git add -A
git commit -m "改了什麼"
git push
```

```bash
# EC2
cd ~/guess-the-song
bash deploy/update.sh
```

`update.sh` 會自動 `git pull` → 安裝依賴 → 重新 build → 重啟服務 → 健康檢查。
**這就是用 GitHub 最大的好處：伺服器端只要一行。**

---

## 步驟 6（建議）：綁網域 + HTTPS

**6-1 綁網域**：在網域商（或 Route 53）加一筆 **A 記錄**指向 EC2 的 Public IP。

**6-2 改 nginx 的 server_name**：

```bash
sudo nano /etc/nginx/sites-available/songguess
# 把 server_name _;  改成   server_name song.你的網域.com;
sudo nginx -t && sudo systemctl reload nginx
```

**6-3 免費憑證（Let's Encrypt）**：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d song.你的網域.com
```

Certbot 會自動改好 nginx 並設定自動續期。完成後開 **`https://song.你的網域.com/`**。

---

## 疑難排解

| 症狀 | 檢查 |
| --- | --- |
| 網站連不上 | Security group 有沒有開 **port 80**？ |
| 打開是 502 | `sudo journalctl -u songguess -n 50` |
| 房間代碼無法加入 | nginx 的 `Upgrade`/`Connection` 標頭（`deploy/nginx.conf` 已含） |
| 歌都抓不到 | `curl -s localhost/api/health`；iTunes 限流會自動重試，稍等即可 |
| `bad interpreter: /bin/bash^M` | 檔案被存成 CRLF。`sed -i 's/\r$//' deploy/*.sh`（`.gitattributes` 已防止） |
| 改了程式沒生效 | EC2 上跑 `bash deploy/update.sh` |

常用指令：

```bash
sudo systemctl status songguess     # 服務狀態
sudo journalctl -u songguess -f     # 即時日誌
sudo systemctl restart songguess    # 重啟
sudo systemctl status nginx         # nginx 狀態
```

---

## 附錄 A：不想用 GitHub（打包上傳）

```powershell
# Windows：打包（約 84 KB，已排除 node_modules）
cd D:\alfreprogramm\javascript\DEEPSEEK
tar -czf songguess.tar.gz --exclude=node_modules --exclude=client/dist --exclude=.git --exclude=songguess.tar.gz .

scp -i C:\Users\alfre\Downloads\songguess-key.pem songguess.tar.gz ubuntu@<EC2-IP>:~/
```

```bash
# EC2
mkdir -p ~/guess-the-song
tar -xzf ~/songguess.tar.gz -C ~/guess-the-song
cd ~/guess-the-song && bash deploy/setup.sh
```

之後更新要重複「打包 → scp → 解壓 → build → 重啟」，這就是 GitHub 流程想省掉的部分。

---

## 附錄 B：Private repo 怎麼讓 EC2 抓下來

用 **Personal access token**（GitHub → Settings → Developer settings → Personal access tokens → 勾 `repo`）：

```bash
git clone https://<你的帳號>:<TOKEN>@github.com/<你的帳號>/guess-the-song.git ~/guess-the-song
```

之後 `deploy/update.sh` 裡的 `git pull` 也能用（token 會存在 remote 設定裡）。
更安全的做法是 **Deploy key**（Settings → Deploy keys → 貼上 EC2 的 `~/.ssh/id_ed25519.pub`，並把 remote 改成 SSH 網址）。

---

## 注意事項

- **房間存在記憶體**：重啟服務會清空所有房間（遊戲進行中請避免重啟）。
- **沒有帳號系統**：知道代碼就能加入，適合朋友聚會；不要放敏感資料。
- **iTunes 限流**：程式限制約 19 次／分鐘並自動重試；快取過一次永久有效。
- **`.preview-cache.json` 要可寫**：服務使用者（`ubuntu`）需能寫入 `server/`。
- **對外只需 80/443**：Node 的 3001 只綁本機。
