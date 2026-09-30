# 🎵 Guess The Song — Hong Kong Cantonese Edition

A multiplayer party game where you guess Hong Kong Cantonese songs from their first 5 seconds.

> Chinese version: **[README.zh.md](README.zh.md)**

## What it does

- The host picks a **year playlist** (one category per calendar year) or an **artist selection** (Eason Chan / Endy Chow / Terence Lam / all three mixed)
- The host can tick **🚫 Exclude all MIRROR members** so no MIRROR song comes up
- A **🔊 volume slider** (default 35%) lets each player tame the preview volume; the choice is remembered
- The server generates a **6-character room code**; other players join from their phones
- Each round the host chooses **10 / 20 / 30 questions**; each song plays its **first 5 seconds**
- The 4 answer options are all by the **same artist** as the answer — first correct guess scores
- **A correct guess advances after 2 seconds** instead of waiting out the timer
- Questions **rotate through artists**, so one singer never dominates a round
- Live scoreboard; the song is revealed early as soon as someone is right, or when everyone has guessed wrong

## Playlists

| Category | Contents | Playable | After excluding MIRROR |
| --- | --- | --- | --- |
| 2020 | Cantonese songs of 2020 | 45 | **41** |
| 2021 | Cantonese songs of 2021 | 63 | **47** |
| 2022 | Cantonese songs of 2022 | 61 | **46** |
| 2023 | Cantonese songs of 2023 | 65 | **50** |
| 2024 | Cantonese songs of 2024 | 66 | **51** |
| 2025 | Cantonese songs of 2025 | 102 | **85** |
| 2026 | Cantonese songs of 2026 | 58 | **58** |
| 陳奕迅 (Eason Chan) | Eason Chan Cantonese favourites | 57 | 57 |
| 周國賢 (Endy Chow) | Endy Chow Cantonese favourites | 42 | 42 |
| 林家謙 (Terence Lam) | Terence Lam Cantonese favourites | 31 | 31 |
| 三位混合 (All three) | Eason Chan + Endy Chow + Terence Lam | 130 | 130 |

> Year categories are **generated from each song's `year`** (`buildYearCategories()`), so adding a
> song to `songdata.js` automatically feeds the matching year. A year with fewer than 12 songs is
> not offered, to keep the category substantial.
>
> Song data lives in `server/songdata.js` — add, remove or reorder freely.
> For the artist categories the 4 options are all the same artist, so the challenge is **recognising which song it is**.
> A handful of tracks have no preview on iTunes HK and are skipped at load time, hence "playable" can be 1–2 short of the total.

## Question generation (why the options don't repeat)

The original rule was "3 wrong options = the artist's other 3 songs". For an artist with exactly
4 songs in a category, that produced the **identical 4 options** every single time. Now:

1. Each song gets a **candidate pool** (up to 8 same-artist songs plus 12 others) rather than a fixed trio.
2. Three options are drawn at random from that pool, **skipping the 8 most recently used** options for that answer.
3. The round order **rotates through artists** — one song per artist per pass, biggest catalogues first —
   so a 30-question round covers 20–30 different singers.

## 🚫 Excluding all MIRROR members

The year playlists used to be dominated by MIRROR: **107 of their 300 songs (35.7%)** were by MIRROR
or one of its members. The playlist picker now has a toggle that removes **MIRROR plus all 12 members**
(Anson Kong, Anson Lo, Edan Lui, Ian Chan, Jer Lau, Jiang Tao, Keung To, Lokman Yeung,
Alton Wong, Frankie Chan, Stanley Yau, Jeremy Lee) — **collaborations included**, so
"古巨基、呂爵安" is filtered out too.

Key points:

- **Nothing is deleted.** The MIRROR songs stay in `songdata.js`; excluding them is just a per-room choice.
- **Every year category still has 100+ playable songs after filtering**, because 163 new songs were
  added to dilute the pool.
- The artist selections are unaffected (they never contained MIRROR).
- Each category card shows "已排除 N 首" live, so you can see the exact impact.

To add or change excludable groups, edit `ARTIST_GROUPS` in `server/songdata.js`:

```js
export const ARTIST_GROUPS = [
  {
    id: 'mirror',                    // used in the URL: ?exclude=mirror
    label: 'MIRROR',
    description: 'MIRROR 及其全部成員',
    members: ['MIRROR', '陳瑞輝', /* … */]
  }
]
```

## Audio source

Uses the **iTunes Search API** (free, no API key) to fetch each track's **30-second preview**; the game only plays the first 5 seconds. Preview URLs are cached in `server/.preview-cache.json`, so restarts are instant.

> iTunes allows roughly **20 requests/minute**. The app throttles itself and automatically waits and retries when it receives a 403.

### After editing the playlists: warm the preview cache

```bash
node server/scripts/warm-cache.mjs        # fetch every missing preview (takes minutes)
node server/scripts/check-coverage.mjs    # report which songs genuinely have no preview
```

Then **commit `server/.preview-cache.json`** so the deployed server can serve every category
instantly instead of crawling iTunes on first play.

## Architecture

| Folder | Purpose |
| --- | --- |
| `server/` | Node.js + Express + Socket.io (rooms, game logic, iTunes previews) |
| `server/scripts/` | Maintenance tools (preview cache warmer, coverage check) |
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
- **A correct guess advances after 2 seconds**; a total miss pauses 4 seconds so players can read the answer
- The 4 options = the correct song + **3 other songs by the same artist** (other artists fill in when needed)

These values live at the top of `server/index.js`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `SONG_SECONDS` | 5 | Seconds of preview played |
| `GUESS_WINDOW_MS` | 15000 | Answer window |
| `RESULT_PAUSE_CORRECT_MS` | 2000 | Pause after a correct guess |
| `RESULT_PAUSE_MS` | 4000 | Pause when nobody got it |
| `DISTRACTOR_RECENT` | 8 | Recently-used wrong options to avoid per answer |

> Dev note: `npm run dev` does **not** auto-restart the server on file changes (that would wipe in-progress rooms).
> Use `npm run dev:watch` if you want auto-reload.
>
> 🔍 To trace question generation, run with `GTS_DEBUG=1` (PowerShell: `$env:GTS_DEBUG="1"`) and the
> server logs every song it emits, every guess and every scoring decision.

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
- **The MIRROR exclusion is per room** and does not affect other rooms; a room cannot be joined once it has started.
