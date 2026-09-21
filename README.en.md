# 🎵 Guess The Song — Hong Kong Cantonese Edition

A multiplayer party game where you guess Hong Kong Cantonese songs from their first 5 seconds.

> 中文版說明請看 **[README.md](README.md)**

## What it does

- The host picks a **year playlist** or an **artist selection** (Eason Chan / Endy Chow / Terence Lam / all three mixed)
- The server generates a **6-character room code**; other players join from their phones
- Each round the host chooses **10 / 20 / 30 questions**; each song plays its **first 5 seconds**
- The 4 answer options are all by the **same artist** as the answer — first correct guess scores
- Live scoreboard; the song is revealed early as soon as someone is right, or when everyone has guessed wrong

## Playlists

| Category | Contents |
| --- | --- |
| 2020–2022 | Most popular Cantonese songs of 2020–2022 (100) |
| 2022–2024 | Most popular Cantonese songs of 2022–2024 (100) |
| 2024–2026 | Most popular Cantonese songs of 2024–2026 (100; mostly 2024–2025 releases) |
| 陳奕迅 (Eason Chan) | Eason Chan Cantonese favourites (57) |
| 周國賢 (Endy Chow) | Endy Chow Cantonese favourites (42) |
| 林家謙 (Terence Lam) | Terence Lam Cantonese favourites (33) |
| 三位混合 (All three) | Eason Chan + Endy Chow + Terence Lam (132) |

> Song data lives in `server/songdata.js` — add, remove or reorder freely.
> For the artist categories the 4 options are all the same artist, so the challenge is **recognising which song it is**.

## Audio source

Uses the **iTunes Search API** (free, no API key) to fetch each track's **30-second preview**; the game only plays the first 5 seconds. Preview URLs are cached in `server/.preview-cache.json`, so restarts are instant.

> iTunes allows roughly **20 requests/minute**. The app throttles itself and automatically waits and retries when it receives a 403.

## Architecture

| Folder | Purpose |
| --- | --- |
| `server/` | Node.js + Express + Socket.io (rooms, game logic, iTunes previews) |
| `client/` | React + Vite (mobile-friendly UI) |

## Run it locally

Requires Node.js 18+.

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start the dev servers (server on :3001 and client on :5173)
npm run dev
```

Open **http://localhost:5173**.

### Joining from a phone

Players on the **same Wi-Fi** can open `http://<your-computer-IP>:5173` and tap "加入朋友的遊戲" to enter the room code.

> In dev mode Vite is configured with `host: true`, so it listens on your LAN.
> After `npm run dev`, the terminal prints the available network addresses (e.g. `http://192.168.x.x:5173`) — open one of those on the phone.

## Game rules (configurable)

- The host picks **10 / 20 / 30 questions** per round (auto-adjusted if the playlist is smaller)
- Each song plays its **first 5 seconds**; up to **15 seconds** to answer
- Each player may guess **only once per song**; the song ends as soon as someone is right, or when everyone has guessed wrong
- The 4 options = the correct song + **3 other songs by the same artist**

These values live at the top of `server/index.js` (`SONG_SECONDS`, `GUESS_WINDOW_MS`, `RESULT_PAUSE_MS`).

> Dev note: `npm run dev` does **not** auto-restart the server on file changes (that would wipe in-progress rooms).
> Use `npm run dev:watch` if you want auto-reload.

## Production

Test production mode locally:

```bash
npm run build     # builds the client into client/dist
npm start         # server on :3001 serves the API + the static site
```

Open **http://localhost:3001**.

### Deploying to AWS EC2

Full step-by-step guide (GitHub flow, nginx + systemd + HTTPS): **[DEPLOY.md](DEPLOY.md)**

```bash
# On the EC2 instance
git clone https://github.com/alfredkwok/guess-song.git ~/guess-song
cd ~/guess-song && bash deploy/setup.sh   # first-time install
bash deploy/update.sh                     # every later update
```

`deploy/` contains `nginx.conf` (with WebSocket upgrade), `songguess.service`, `setup.sh` and `update.sh`.

## Notes

- Tracks without an iTunes preview are filtered out automatically; a category only needs 4 playable songs.
- Loading a category for the first time takes a few seconds while previews are fetched; afterwards it is cached and instant.
- Rooms are deleted once everyone leaves.
