import { useEffect, useState } from 'react'
import { getVolume, setVolume, onVolumeChange } from '../lib/audio.js'

// Friendly slider for the preview volume. Preview tracks are loud, so the
// default sits low and the choice is remembered on the device.
export default function VolumeControl({ compact = false }) {
  const [volume, setLocal] = useState(getVolume())

  useEffect(() => onVolumeChange(setLocal), [])

  const percent = Math.round(volume * 100)
  const icon = volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : volume < 0.75 ? '🔉' : '🔊'

  return (
    <div className={`volume ${compact ? 'volume-compact' : ''}`}>
      <span className="volume-icon" aria-hidden="true">{icon}</span>
      <input
        className="volume-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={percent}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        aria-label="音量"
        title={`音量 ${percent}%`}
      />
      <span className="volume-value">{percent}%</span>
    </div>
  )
}
