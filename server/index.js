import 'dotenv/config'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { CATEGORIES } from './songdata.js'
import { resolveTracks, getCachedTracks, getUncached, isRateLimited } from './preview.js'

const PORT = process.env.PORT || 3001
const SONG_SECONDS = 5
const GUESS_WINDOW_MS = 15000
const RESULT_PAUSE_MS = 4000
const MAX_PLAYERS = 20

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: true } })

app.use(express.json())

// ---------------------------------------------------------------- REST API
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/categories', (_req, res) => {
  res.json(CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group || '年份歌單',
    range: c.range,
    description: c.description,
    count: c.songs.length,
    ready: getCachedTracks(c.songs).length
  })))
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

  // Kick off background resolution for anything not yet cached (self-healing).
  const uncached = getUncached(cat.songs)
  const bg = uncached.length ? runCategoryJob(cat) : null

  let cached = getCachedTracks(cat.songs)

  // Cold start: wait briefly (up to ~15s) to build a playable set.
  if (cached.length < 4 && bg) {
    await Promise.race([bg, new Promise((r) => setTimeout(r, 15000))])
    cached = getCachedTracks(cat.songs)
  }

  const tracks = cached.map((s, i) => ({
    id: `${cat.id}-${i}`,
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

  res.json({ success: true, name: cat.label, total: tracks.length, tracks })
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

// The 3 wrong options should be other songs by the SAME artist as the answer.
// If that artist has fewer than 3 other songs in the playlist, fill the rest
// with random songs so there are always 4 options.
function pickDistractors(playlist, track) {
  const others = playlist.filter((t) => t.id !== track.id)
  const sameArtist = shuffle(others.filter((t) => sharesArtist(t.artist, track.artist))).slice(0, 3)
  if (sameArtist.length >= 3) return sameArtist
  const chosen = new Set(sameArtist.map((t) => t.id))
  const filler = shuffle(others.filter((t) => !chosen.has(t.id))).slice(0, 3 - sameArtist.length)
  return [...sameArtist, ...filler]
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

  // Prefer songs whose artist has at least 3 other songs in the playlist, so the
  // 3 wrong options can all be by the same artist as the answer.
  const pool = shuffle(room.playlist)
  const hasSiblings = (t) =>
    room.playlist.filter((o) => o.id !== t.id && sharesArtist(o.artist, t.artist)).length >= 3
  room.order = [...pool.filter(hasSiblings), ...pool.filter((t) => !hasSiblings(t))].slice(0, room.roundTotal)
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

  const distractors = pickDistractors(room.playlist, track)
  const options = shuffle([track, ...distractors]).map((t) => ({ id: t.id, title: t.title, artist: t.artist }))

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
  room.nextTimer = setTimeout(() => {
    if (room.state === 'playing') playNext(room)
  }, RESULT_PAUSE_MS)
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
