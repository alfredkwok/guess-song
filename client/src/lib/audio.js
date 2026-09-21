// Audio engine: plays the first N seconds of a Spotify 30s preview, or a
// synthesized deterministic melody in demo mode. Both share a single stop handle.

let currentAudio = null
let stopHandle = null
let audioCtx = null

// A single reusable <audio> element keeps the browser's media pipeline warm,
// so later songs start noticeably faster than building a fresh element each time.
// (Deliberately no crossOrigin: the iTunes CDN does not send CORS headers.)
let audioEl = null
function getAudioEl() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
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
  audio.volume = 1.0
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

  // A bass pulse + a seeded melody so each demo track is recognizable.
  const bass = ctx.createOscillator()
  const bassGain = ctx.createGain()
  bass.type = 'triangle'
  bass.frequency.value = 80 + (seed % 5) * 20
  bassGain.gain.setValueAtTime(0.25, now)
  bassGain.gain.setValueAtTime(0.25, now + seconds - 0.05)
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
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
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
