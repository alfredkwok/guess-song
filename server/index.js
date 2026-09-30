import 'dotenv/config'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { CATEGORIES, ARTIST_GROUPS, songInGroup } from './songdata.js'
import { resolveTracks, getCachedTracks, getUncached, isRateLimited } from './preview.js'

const PORT = process.env.PORT || 3001
const SONG_SECONDS = 5
const GUESS_WINDOW_MS = 15000
// Pause after the answer is revealed. A correct guess advances quickly so the
// momentum keeps up; a total miss gets a little longer to read the answer.
const RESULT_PAUSE_MS = 4000
const RESULT_PAUSE_CORRECT_MS = 2000
// How many recently-shown wrong options to keep out of the next question.
const DISTRACTOR_RECENT = 8
const MAX_PLAYERS = 20

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: true } })

app.use(express.json())

// ---------------------------------------------------------------- REST API
// -------------------------------------------------------- artist-group filters
// Players may exclude a whole artist group (e.g. MIRROR + all 12 members)
// before creating a room. The songs stay in the playlist data - filtering only
// changes which ones are sent to the client.
function groupsFromQuery(value) {
  if (!value) return []
  const wanted = String(value).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return ARTIST_GROUPS.filter((g) => wanted.includes(g.id.toLowerCase()))
}

// Drop every song that belongs to any of the excluded groups.
function filterSongs(songs, excluded) {
  if (!excluded.length) return songs
  return songs.filter((s) => !excluded.some((g) => songInGroup(s, g)))
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/categories', (_req, res) => {
  res.json(CATEGORIES.map((c) => {
    const ready = getCachedTracks(c.songs).length
    // How many songs remain playable once each group is excluded.
    const groupCounts = {}
    for (const g of ARTIST_GROUPS) {
      const kept = c.songs.filter((s) => !songInGroup(s, g))
      groupCounts[g.id] = {
        ready: getCachedTracks(kept).length,
        count: kept.length,
        removed: c.songs.length - kept.length
      }
    }
    return {
      id: c.id,
      label: c.label,
      group: c.group || '年份歌單',
      range: c.range,
      description: c.description,
      count: c.songs.length,
      ready,
      groupCounts
    }
  }))
})

// Resolve a category's previews, retrying while iTunes rate-limits us.
const categoryJobs = new Set()
async function runCategoryJob(cat) {
  if (categoryJobs.has(cat.id)) return
  categoryJobs.add(cat.id)
  try {
    for (let pass = 0; pass < 30; pass++) {
      await resolveTracks(cat.songs).catch(() => {})
      if (!getUncached(cat.songs).length || !isRateLimited()) break
      await new Promise((r) => setTimeout(r, 60000))
    }
  } finally {
    categoryJobs.delete(cat.id)
  }
}

app.get('/api/category/:id', async (req, res) => {
  const cat = CATEGORIES.find((c) => c.id === req.params.id)
  if (!cat) return res.status(404).json({ success: false, error: '找不到這個分類。' })

  // `exclude=mirror` (comma-separated ids) filters out whole artist groups.
  const excluded = groupsFromQuery(req.query.exclude)
  const songs = filterSongs(cat.songs, excluded)

  // Kick off background resolution for anything not yet cached (self-healing).
  // Always resolve the FULL list, so both the filtered and unfiltered variants
  // are ready without a second round of iTunes lookups.
  const uncached = getUncached(cat.songs)
  const bg = uncached.length ? runCategoryJob(cat) : null

  let cached = getCachedTracks(songs)
  const cachedFull = getCachedTracks(cat.songs)

  // Cold start: wait briefly (up to ~15s) to build a playable set.
  if (cached.length < 4 && bg) {
    await Promise.race([bg, new Promise((r) => setTimeout(r, 15000))])
    cached = getCachedTracks(songs)
  }

  const idSuffix = excluded.length ? `-${excluded.map((g) => g.id).join('_')}` : ''
  const tracks = cached.map((s, i) => ({
    id: `${cat.id}${idSuffix}-${i}`,
    title: s.title,
    artist: s.artist,
    year: s.year,
    previewUrl: s.previewUrl,
    albumArt: s.albumArt
  }))

  if (tracks.length < 4) {
    return res.status(500).json({
      success: false,
      error: `目前只有 ${tracks.length} 首能取得試聽，可能是網路問題，請稍後再試。`
    })
  }

  res.json({
    success: true,
    name: cat.label,
    total: tracks.length,
    fullTotal: cachedFull.length,
    excluded: excluded.map((g) => g.id),
    groups: ARTIST_GROUPS.map((g) => ({ id: g.id, label: g.label, description: g.description })),
    tracks
  })
})

// Serve built client in production (files written to client/dist by `npm run build`)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.join(__dirname, '..', 'client', 'dist')
app.use(express.static(clientDist))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next() })
})

// ------------------------------------------------------------- Room helpers
const rooms = new Map() // code -> room object
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function genCode() {
  let code
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
  } while (rooms.has(code))
  return code
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Split "張天賦、陳蕾" / "A & B" / "X feat. Y" into individual artist names.
function artistTokens(artist) {
  return String(artist || '')
    .split(/[、,，&/]|feat\.|ft\./i)
    .map((s) => s.trim())
    .filter(Boolean)
}

function sharesArtist(a, b) {
  const setB = new Set(artistTokens(b))
  return artistTokens(a).some((t) => setB.has(t))
}

// ---------------------------------------------------------------- question pool
// For every song we pre-compute which other songs may appear as wrong options.
// Having a POOL (rather than the same fixed trio) is what stops the four options
// from repeating: an artist with exactly 4 songs in a playlist would otherwise
// always show the identical set of 4.
function buildDistractorPool(playlist) {
  const pool = new Map()
  for (const track of playlist) {
    const others = playlist.filter((t) => t.id !== track.id)
    const siblings = shuffle(others.filter((t) => sharesArtist(t.artist, track.artist)))
    const rest = shuffle(others.filter((t) => !sharesArtist(t.artist, track.artist)))
    // Prefer up to 8 same-artist songs, then fall back to a few from anywhere.
    const candidates = [...siblings.slice(0, 8), ...rest.slice(0, 12)]
    pool.set(track.id, candidates.length >= 3 ? candidates : shuffle(others))
  }
  return pool
}

// Pick 3 wrong options, avoiding anything shown very recently for this song.
function pickDistractors(pool, track, recent) {
  const guarded = new Set(recent || [])
  const candidates = pool.get(track.id) || []
  const freshOnes = candidates.filter((t) => !guarded.has(t.id))
  // Fall back to the full candidate list when everything was used recently.
  const source = freshOnes.length >= 3 ? freshOnes : candidates
  return shuffle(source).slice(0, 3)
}

// Order the round so artists rotate: one song per artist per pass, biggest
// catalogues first. This maximises how many DIFFERENT artists show up.
function pickRoundOrder(playlist, total) {
  const byArtist = new Map()
  const primary = (track) => artistTokens(track.artist)[0] || track.artist || '?'
  for (const track of shuffle(playlist)) {
    const key = primary(track)
    if (!byArtist.has(key)) byArtist.set(key, [])
    byArtist.get(key).push(track)
  }
  const groups = shuffle([...byArtist.values()]).sort((a, b) => b.length - a.length)
  const order = []
  for (let pass = 0; order.length < total && pass < 50; pass++) {
    let added = 0
    for (const group of groups) {
      if (order.length >= total) break
      if (pass >= group.length) continue
      order.push(group[pass])
      added++
    }
    if (!added) break
  }
  return order
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score }))
}

function getRoom(socket) {
  const code = socket.data.roomCode
  return code ? rooms.get(code) : null
}

function addPlayer(room, socket, name) {
  const player = { id: socket.id, name: String(name || 'Player').trim().slice(0, 20) || 'Player', score: 0 }
  room.players.set(socket.id, player)
  socket.data.roomCode = room.code
  socket.data.playerName = player.name
  return player
}

function broadcastPlayers(room) {
  io.to(room.code).emit('players-updated', { players: publicPlayers(room), hostId: room.hostId })
}

function clearTimers(room) {
  if (room.songTimer) { clearTimeout(room.songTimer); room.songTimer = null }
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null }
}

function removeFromRoom(socket) {
  const room = getRoom(socket)
  if (!room) return
  room.players.delete(socket.id)
  socket.leave(room.code)
  delete socket.data.roomCode
  delete socket.data.playerName

  if (room.players.size === 0) {
    clearTimers(room)
    rooms.delete(room.code)
    return
  }
  if (socket.id === room.hostId) {
    room.hostId = room.players.keys().next().value
    io.to(room.code).emit('host-changed', { hostId: room.hostId })
  }
  broadcastPlayers(room)
}

function startRound(room) {
  clearTimers(room)
  room.state = 'playing'
  room.scores = new Map()
  for (const p of room.players.values()) p.score = 0
  if (!room.roundTotal) room.roundTotal = Math.min(10, room.playlist.length)

  // Rotate through artists (one song per artist per pass) so the round spreads
  // across as many different singers as the playlist allows.
  room.order = pickRoundOrder(room.playlist, room.roundTotal)
  room.roundTotal = room.order.length
  room.distractorPool = buildDistractorPool(room.playlist)
  room.recentDistractors = new Map() // answerId -> [recent distractor ids]
  room.songsPlayed = 0
  room.currentSong = null
  room.answered = new Set()

  io.to(room.code).emit('game-started', { total: room.roundTotal, playlistName: room.playlistName })
  playNext(room)
}

function playNext(room) {
  if (room.songsPlayed >= room.roundTotal) {
    endRound(room)
    return
  }
  const track = room.order[room.songsPlayed]
  room.songsPlayed++
  room.currentSong = track
  room.answered = new Set()

  const recent = room.recentDistractors.get(track.id) || []
  const distractors = pickDistractors(room.distractorPool, track, recent)
  // Remember what was just shown for this song so the next time it comes up the
  // options are different (keeps the answer hidden but the choices fresh).
  room.recentDistractors.set(
    track.id,
    [...distractors.map((t) => t.id), ...recent].slice(0, DISTRACTOR_RECENT)
  )

  const options = shuffle([track, ...distractors]).map((t) => ({ id: t.id, title: t.title, artist: t.artist }))

  if (process.env.GTS_DEBUG) console.log(`[emit song-start] room=${room.code} #${room.songsPlayed}/${room.roundTotal} track=${track.title}`)
  io.to(room.code).emit('song-start', {
    songNumber: room.songsPlayed,
    total: room.roundTotal,
    mode: room.source,
    previewUrl: track.previewUrl || null,
    demoSeed: typeof track.demoSeed === 'number' ? track.demoSeed : null,
    albumArt: track.albumArt || null,
    seconds: SONG_SECONDS,
    options
  })

  room.songTimer = setTimeout(() => finishSong(room, null), GUESS_WINDOW_MS)
}

function finishSong(room, winnerId) {
  if (process.env.GTS_DEBUG) console.log(`[finishSong] room=${room.code} songsPlayed=${room.songsPlayed}/${room.roundTotal} winner=${winnerId || 'none'} state=${room.state} hasSong=${!!room.currentSong}`)
  if (room.state !== 'playing' || !room.currentSong) return
  if (room.songTimer) { clearTimeout(room.songTimer); room.songTimer = null }

  const correct = room.currentSong
  let winner = null
  if (winnerId && room.players.has(winnerId)) {
    const player = room.players.get(winnerId)
    const nextScore = (room.scores.get(winnerId) || 0) + 1
    room.scores.set(winnerId, nextScore)
    player.score = nextScore
    winner = { id: player.id, name: player.name }
  }

  io.to(room.code).emit('song-result', {
    winner,
    correct: { id: correct.id, title: correct.title, artist: correct.artist },
    scores: publicPlayers(room)
  })

  room.currentSong = null
  // Guess was correct -> move on quickly. Nobody got it -> let players read it.
  const pause = winner ? RESULT_PAUSE_CORRECT_MS : RESULT_PAUSE_MS
  room.nextTimer = setTimeout(() => {
    if (room.state === 'playing') playNext(room)
  }, pause)
}

function endRound(room) {
  room.state = 'ended'
  io.to(room.code).emit('round-end', { scores: publicPlayers(room), total: room.roundTotal })
}

// --------------------------------------------------------------- Socket.io
io.on('connection', (socket) => {
  socket.on('create-room', (payload, cb) => {
    try {
      const { name, tracks, source, playlistName } = payload || {}
      if (!Array.isArray(tracks) || tracks.length < 4) {
        return cb?.({ ok: false, error: '歌曲數量不足（至少 4 首）。' })
      }
      const code = genCode()
      const room = {
        code,
        hostId: socket.id,
        players: new Map(),
        playlist: tracks,
        playlistName: playlistName || 'Playlist',
        source: source || 'itunes',
        state: 'lobby',
        scores: new Map(),
        order: [],
        currentSong: null,
        answered: new Set(),
        songsPlayed: 0,
        roundTotal: 0,
        distractorPool: new Map(),
        recentDistractors: new Map(),
        songTimer: null,
        nextTimer: null
      }
      rooms.set(code, room)
      addPlayer(room, socket, name)
      socket.join(code)
      cb?.({ ok: true, code })
      broadcastPlayers(room)
    } catch (e) {
      cb?.({ ok: false, error: e.message })
    }
  })

  socket.on('join-room', (payload, cb) => {
    const room = rooms.get(String(payload?.code || '').trim().toUpperCase())
    if (!room) return cb?.({ ok: false, error: '找不到這個房間代碼。' })
    if (room.state !== 'lobby') return cb?.({ ok: false, error: '遊戲已開始，無法加入。' })
    if (room.players.size >= MAX_PLAYERS) return cb?.({ ok: false, error: '房間已滿。' })

    addPlayer(room, socket, payload?.name)
    socket.join(room.code)
    cb?.({ ok: true, code: room.code, playlistName: room.playlistName, players: publicPlayers(room), hostId: room.hostId })
    broadcastPlayers(room)
  })

  socket.on('start-game', (payload, cb) => {
    // Support both start-game(cb) and start-game({ questions }, cb).
    if (typeof payload === 'function') { cb = payload; payload = null }

    const room = getRoom(socket)
    if (!room) return cb?.({ ok: false, error: '你不在任何房間中。' })
    if (socket.id !== room.hostId) return cb?.({ ok: false, error: '只有房主可以開始遊戲。' })
    if (room.state === 'playing') return cb?.({ ok: false, error: '遊戲已經在進行中。' })

    const requested = Number(payload?.questions)
    const wanted = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 10
    room.roundTotal = Math.max(1, Math.min(wanted, room.playlist.length))

    startRound(room)
    cb?.({ ok: true })
  })

  socket.on('guess', (payload, cb) => {
    const room = getRoom(socket)
    if (process.env.GTS_DEBUG) console.log(`[guess] room=${room?.code} song=${room?.currentSong?.title} songsPlayed=${room?.songsPlayed} trackId=${payload?.trackId} answered=${room ? room.answered.size : '-'}/${room ? room.players.size : '-'} state=${room?.state}`)
    if (!room || room.state !== 'playing' || !room.currentSong) return cb?.({ ok: false })
    if (!room.players.has(socket.id)) return cb?.({ ok: false })
    if (room.answered.has(socket.id)) return cb?.({ ok: false, error: 'already-answered' })

    const correct = payload?.trackId === room.currentSong.id
    room.answered.add(socket.id)
    cb?.({ ok: true, correct })

    if (correct) {
      finishSong(room, socket.id)
    } else {
      // Nobody got it right, but if every remaining player has now guessed,
      // there is nothing left to wait for - reveal the answer early.
      const allAnswered = [...room.players.keys()].every((id) => room.answered.has(id))
      if (allAnswered) finishSong(room, null)
    }
  })

  socket.on('leave-room', () => removeFromRoom(socket))

  socket.on('disconnect', () => removeFromRoom(socket))
})

httpServer.listen(PORT, () => {
  console.log(`🎵 Guess The Song server running on http://localhost:${PORT}`)
  console.log(`   Categories: ${CATEGORIES.map((c) => `${c.id} (${c.songs.length})`).join(', ')}`)
  // Sanity line: how many songs stay playable once each artist group is excluded.
  for (const g of ARTIST_GROUPS) {
    const kept = CATEGORIES.map((c) => {
      const playable = getCachedTracks(filterSongs(c.songs, [g])).length
      return `${c.id} ${playable}`
    })
    console.log(`   Excluding ${g.label}: ${kept.join(', ')}`)
  }
})

// Warm the preview cache in the background so categories load fast on first play.
// Delayed so early user imports (which use the same iTunes throttle) get priority.
setTimeout(() => {
  for (const cat of CATEGORIES) {
    resolveTracks(cat.songs)
      .then((r) => console.log(`   warmed ${cat.id}: ${r.length}/${cat.songs.length} previews`))
      .catch(() => {})
  }
}, 10 * 60 * 1000).unref?.()
