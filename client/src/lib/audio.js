// Audio engine: plays the first N seconds of an iTunes 30s preview, or a
// synthesized deterministic melody in demo mode. Both share a single stop handle.

let currentAudio = null
let stopHandle = null
let audioCtx = null

// ------------------------------------------------------------------ volume
// Volume is remembered between sessions. Preview tracks are mastered loud, so
// the default is deliberately low (35%).
const VOLUME_KEY = 'gts.volume'
const DEFAULT_VOLUME = 0.35

function clamp01(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return DEFAULT_VOLUME
  return Math.min(1, Math.max(0, v))
}

function readStoredVolume() {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY)
    if (raw === null) return DEFAULT_VOLUME
    return clamp01(parseFloat(raw))
  } catch {
    return DEFAULT_VOLUME
  }
}

let volume = readStoredVolume()
const volumeListeners = new Set()

export function getVolume() { return volume }

export function setVolume(next) {
  volume = clamp01(next)
  try { window.localStorage.setItem(VOLUME_KEY, String(volume)) } catch { /* private mode */ }
  if (audioEl) { try { audioEl.volume = volume } catch { /* noop */ } }
  for (const fn of volumeListeners) { try { fn(volume) } catch { /* noop */ } }
  return volume
}

export function onVolumeChange(fn) {
  volumeListeners.add(fn)
  return () => volumeListeners.delete(fn)
}

// A single reusable <audio> element keeps the browser's media pipeline warm,
// so later songs start noticeably faster than building a fresh element each time.
// (Deliberately no crossOrigin: the iTunes CDN does not send CORS headers.)
let audioEl = null
function getAudioEl() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
    audioEl.volume = volume
  }
  return audioEl
}

export function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    audioCtx = new Ctx()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

export function stopAudio() {
  if (stopHandle) { stopHandle(); stopHandle = null }
  if (currentAudio) { try { currentAudio.pause() } catch { /* noop */ } }
}

// Returns the play() promise so callers can detect autoplay rejection.
export function playSpotifyPreview(url, seconds = 5) {
  stopAudio()
  const audio = getAudioEl()
  audio.src = url
  audio.volume = volume
  currentAudio = audio
  try { audio.load() } catch { /* noop */ }

  const stopTimer = setTimeout(() => { try { audio.pause() } catch { /* noop */ } }, seconds * 1000)
  stopHandle = () => {
    clearTimeout(stopTimer)
    try { audio.pause() } catch { /* noop */ }
  }
  return audio.play()
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SCALE = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33]
const WAVES = ['sine', 'triangle', 'square', 'sawtooth']

export function playDemoTone(seed = 0, seconds = 5) {
  stopAudio()
  const ctx = getAudioCtx()
  const rng = mulberry32((seed + 1) * 7919 + 13)
  const now = ctx.currentTime
  // The synthesized tone respects the same volume setting as real previews.
  const master = volume

  // A bass pulse + a seeded melody so each demo track is recognizable.
  const bass = ctx.createOscillator()
  const bassGain = ctx.createGain()
  bass.type = 'triangle'
  bass.frequency.value = 80 + (seed % 5) * 20
  bassGain.gain.setValueAtTime(0.25 * master, now)
  bassGain.gain.setValueAtTime(0.25 * master, now + seconds - 0.05)
  bassGain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
  bass.connect(bassGain).connect(ctx.destination)
  bass.start(now)
  bass.stop(now + seconds)

  const noteDur = 0.24
  const totalNotes = Math.floor(seconds / noteDur)
  let t = now
  for (let i = 0; i < totalNotes; i++) {
    const freq = SCALE[Math.floor(rng() * SCALE.length)]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = WAVES[Math.floor(rng() * WAVES.length)]
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.3 * master, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + noteDur + 0.02)
    t += noteDur
  }

  const stopTimer = setTimeout(() => { try { ctx.close(); audioCtx = null } catch { /* noop */ } }, (seconds + 0.3) * 1000)
  stopHandle = () => {
    clearTimeout(stopTimer)
    try { ctx.close(); audioCtx = null } catch { /* noop */ }
  }
}
