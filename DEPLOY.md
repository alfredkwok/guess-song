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

## ⚠️ 先搞清楚：每一步要在「哪裡」打？

**這是初學者最常卡住的地方。** 整份文件只會用到兩個地方：

| 步驟 | 在哪裡打 | 提示字元長相 |
| --- | --- | --- |
| ① 推送程式 | **Windows PowerShell** | `PS C:\Users\alfre>` |
| ② 開 EC2 | **AWS 網站**（點按鈕，不用打字） | — |
| ③ 連進 EC2 | **Windows PowerShell**（新開一個視窗） | `PS C:\Users\alfre>` |
| ④ 安裝 | **SSH 連上後的視窗** | `ubuntu@ip-172-31-xx-xx:~$` |

**判斷方法就是看提示字元**：

- 看到 `PS C:\...>` → 你在**自己的 Windows**
- 看到 `ubuntu@ip-172-31-xx-xx:~$` → 你已經**進到 EC2 了**，這裡都是 Linux 指令

> 在 AWS 網站主機頁面右上角的 **Connect → SSH client** 也會教你怎麼連，但照下面做最快。

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

- **Repository name**：`guess-song`
- **Public**（建議，這樣 EC2 不用登入）
- **不要**勾 Add README / .gitignore / license（我們本地已經有了）
- 按 **Create repository**

### 1-2 從 Windows 推送

我已經幫你在專案目錄做好 `git init` 和第一次 commit 了，你只要接上遠端並推送：

```powershell
cd D:\alfreprogramm\javascript\DEEPSEEK
git remote add origin https://github.com/alfredkwok/guess-song.git
git push -u origin main
```

第一次推送會要你登入：

- **最簡單**：會自動跳出瀏覽器 → 登入 GitHub → 授權（Git Credential Manager）
- 若沒跳出來：到 GitHub → Settings → Developer settings → **Personal access tokens** → 建一組（勾 `repo`），推送時帳號打你的 GitHub 用戶名、密碼貼上 token

> 確認推送成功：打開 `https://github.com/alfredkwok/guess-song` 應該看得到檔案。

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

## 步驟 3：從 Windows 連進去（在你的電腦打）

**按 `Win` 鍵 → 打 `powershell` → 按 `Enter`**，開一個**新的 PowerShell 視窗**，然後輸入：

```powershell
# 把 1.2.3.4 換成你的 Public IPv4 address
ssh -i "C:\Users\alfre\Downloads\songguess.pem" ubuntu@1.2.3.4
```

> 🛑 **最常見的錯誤：不要把角括號 `<` `>` 打進去！**
> 文件裡的 `<...>` 只是「這裡要換成你的值」的**記號**。
> 在 PowerShell 裡 `<` 是保留符號，打了會出現
> `Could not resolve hostname <1.2.3.4>` 或一串亂碼錯誤。
>
> ❌ `ubuntu@<43.199.63.71>`
> ✅ `ubuntu@43.199.63.71`

> ⚠️ **金鑰一定要對應正確的 instance。** 你 Downloads 裡有兩個 `.pem`：
> - `songguess.pem` ← **這台用這個**
> - `EC2 tutorial.pem` ← 別台 instance 用的，用錯會出現 `Permission denied (publickey)`

**EC2 的 IP 去哪裡找**：AWS Console → **EC2 → Instances** → 點你的主機 → 複製 **Public IPv4 address**（像 `43.199.63.71`）。

第一次連線會問：

```
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

打 `yes` 再按 `Enter`。

連上後提示字元會變成：

```
ubuntu@ip-172-31-xx-xx:~$
```

**看到這個就代表你已經在 EC2 裡面了** → 接著做步驟 4（這裡開始都是 Linux 指令）。

> **若出現 `UNPROTECTED PRIVATE KEY FILE` 警告**（Windows 最常見的問題：`Permissions ... are too open`）
>
> ```powershell
> # 把權限收成「只有你自己可以讀」
> icacls "C:\Users\alfre\Downloads\songguess.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
>
> # 檢查：應該只剩你自己那一行
> icacls "C:\Users\alfre\Downloads\songguess.pem"
> ```
>
> 如果清單裡還有其他使用者／群組（例如 `CodexSandboxUsers`、`Users`、`Everyone`、`Authenticated Users`），把它們移除：
>
> ```powershell
> icacls "C:\Users\alfre\Downloads\songguess.pem" /remove:g "CodexSandboxUsers" "Users" "Everyone" "Authenticated Users"
> ```
>
> 修好後直接重跑一次 `ssh` 指令即可。
>
> **不想處理權限？** 用瀏覽器版終端機完全不用金鑰：
> AWS Console → EC2 → 選你的主機 → **Connect → EC2 Instance Connect → Connect**
> （前提是 Security Group 的 port 22 要允許 AWS 的服務網段，或暫時開 `0.0.0.0/0`）

---

## 步驟 4：在 EC2 上安裝（兩行）

回到 **SSH 視窗**：

```bash
git clone https://github.com/alfredkwok/guess-song.git ~/guess-song
cd ~/guess-song && bash deploy/setup.sh
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

### ① 上傳到 GitHub（在 Windows PowerShell 打）

```powershell
cd D:\alfreprogramm\javascript\DEEPSEEK
git add -A                 # 把所有改動「選起來」
git commit -m "改了什麼"    # 打包成一個版本（引號內自己描述）
git push                   # 上傳到 GitHub
```

用生活化的比喻：

| 指令 | 比喻 |
| --- | --- |
| `git add -A` | 把要寄的東西**放進箱子** |
| `git commit -m "..."` | **封箱並貼標籤** |
| `git push` | **寄出去**（上傳到 GitHub） |

> 💡 **`server/.preview-cache.json` 會一直顯示 modified，這是正常的**（它在記錄已抓到的試聽網址）。
> `git add -A` 會一起帶上，不用特別理它。

### ② 讓 EC2 也更新（在 SSH 視窗打）

```bash
cd ~/guess-song
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
| `Could not resolve hostname <...>` | 你把角括號 `<` `>` 一起打進去了。IP 只用數字和點：`ubuntu@43.199.63.71` |
| `Permission denied (publickey)` | 用錯 `.pem` 了，確認是 `songguess.pem` |
| `UNPROTECTED PRIVATE KEY FILE` | 跑上面的 `icacls` 修權限 |
| 網站連不上（一直轉圈） | Security group 有沒有開 **port 80**？ |
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
mkdir -p ~/guess-song
tar -xzf ~/songguess.tar.gz -C ~/guess-song
cd ~/guess-song && bash deploy/setup.sh
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
