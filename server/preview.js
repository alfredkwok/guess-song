// Resolves 30-second audio previews for Cantonese songs via the iTunes Search API.
// No API key required. Results are cached to disk so restarts are instant.
// Requests are throttled and retried with backoff because iTunes rate-limits bursts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, '.preview-cache.json')

let cache = {}
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { cache = {} }

let saveTimer = null
function persist() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)) } catch { /* ignore */ }
    saveTimer = null
  }, 400)
}

function cacheKey(title, artist) { return `${title}\u0000${artist}` }

// Strip everything except letters/numbers (keeps CJK) for fuzzy comparison.
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')
}

function upgradeArtwork(url) {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\./g, '/600x600bb.')
}

function pickBest(results, title, artist) {
  const t = norm(title)
  const a = norm(artist)
  if (!t) return null
  const withPreview = (results || []).filter((r) => r && r.previewUrl)
  const exactArtist = withPreview.find(
    (r) => norm(r.trackName) === t && (norm(r.artistName).includes(a) || a.includes(norm(r.artistName)))
  )
  const exact = withPreview.find((r) => norm(r.trackName) === t)
  const fuzzy = withPreview.find((r) => norm(r.trackName).includes(t) || t.includes(norm(r.trackName)))
  return exactArtist || exact || fuzzy || null
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Global throttle. Apple's iTunes Search API allows only ~20 requests per
// minute per IP; going faster gets the IP temporarily blocked with HTTP 403.
let lastRequestAt = 0
const MIN_INTERVAL = 3200

// When iTunes starts blocking us (HTTP 403 / "Rate limit"), every worker pauses
// together instead of hammering, then resumes automatically once it clears.
let blockedUntil = 0
export function isRateLimited() { return Date.now() < blockedUntil }

async function throttle() {
  const now = Date.now()
  const waitMs = Math.max(0, lastRequestAt + MIN_INTERVAL - now, blockedUntil - now)
  if (waitMs > 0) await wait(Math.min(waitMs, 30000))
  lastRequestAt = Date.now()
}

export async function resolvePreview(title, artist) {
  const k = cacheKey(title, artist)
  if (cache[k]) return cache[k]

  // Inside a global back-off window: give up immediately so a whole pass
  // finishes fast. The caller retries the pass once the window expires.
  if (Date.now() < blockedUntil) return null

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await throttle()
      const term = encodeURIComponent(`${title} ${artist}`)
      const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&country=HK&limit=10`
      const res = await fetch(url)
      const text = await res.text()

      if (!res.ok || /rate limit/i.test(text)) {
        blockedUntil = Date.now() + 60000 // pause every worker for a minute
        return null // fail fast; the pass-level retry handles it
      }

      let data
      try { data = JSON.parse(text) } catch {
        blockedUntil = Date.now() + 60000
        return null
      }

      const best = pickBest(data.results, title, artist)
      if (best && best.previewUrl) {
        const entry = { previewUrl: best.previewUrl, albumArt: upgradeArtwork(best.artworkUrl100) || null }
        cache[k] = entry
        persist()
        return entry
      }
      return null // searched fine, just no match
    } catch {
      await wait(1500 * (attempt + 1))
    }
  }
  return null
}

const inflight = new Map()

// Return songs that already have a cached preview (instant, no network).
export function getCachedTracks(songs) {
  return songs
    .map((s) => {
      const e = cache[cacheKey(s.title, s.artist)]
      return e && e.previewUrl ? { ...s, previewUrl: e.previewUrl, albumArt: e.albumArt } : null
    })
    .filter(Boolean)
}

// Return songs that still need a preview lookup.
export function getUncached(songs) {
  return songs.filter((s) => !cache[cacheKey(s.title, s.artist)])
}

// Resolve previews for a list of {title, artist, ...} songs with bounded concurrency.
// Returns only the songs that successfully resolved a preview.
export async function resolveTracks(songs, concurrency = 2) {
  const results = new Array(songs.length).fill(null)
  let cursor = 0
  let completed = 0

  return new Promise((resolve) => {
    if (!songs.length) return resolve([])

    const worker = async () => {
      while (true) {
        const i = cursor++
        if (i >= songs.length) return
        const s = songs[i]
        const k = cacheKey(s.title, s.artist)
        if (!inflight.has(k)) {
          inflight.set(k, resolvePreview(s.title, s.artist).finally(() => inflight.delete(k)))
        }
        const r = await inflight.get(k)
        if (r && r.previewUrl) {
          results[i] = { ...s, previewUrl: r.previewUrl, albumArt: r.albumArt }
        }
        completed++
        if (completed === songs.length) resolve(results.filter(Boolean))
      }
    }

    for (let i = 0; i < Math.min(concurrency, songs.length); i++) worker()
  })
}
