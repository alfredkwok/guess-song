import { useEffect, useState } from 'react'
import { playSpotifyPreview, playDemoTone, stopAudio } from '../lib/audio.js'
import { socket } from '../socket.js'

export default function Game({ game, players, isHost, myName, onGuess, onPlayAgain, onLeave }) {
  const [locked, setLocked] = useState(null)
  const [localResult, setLocalResult] = useState(null) // 'correct' | 'wrong' | null
  const [needsTap, setNeedsTap] = useState(false)

  const songNumber = game?.songNumber || 0
  const total = game?.total || 0
  const result = game?.correct || null
  const winner = game?.winner || null
  const options = game?.options || []
  const scores = game?.scores || players

  // Play audio when a new song starts.
  useEffect(() => {
    if (!game || game.phase !== 'playing') return
    setLocked(null)
    setLocalResult(null)
    setNeedsTap(false)
    if (game.mode === 'demo') {
      playDemoTone(game.demoSeed ?? 0, game.seconds || 5)
    } else if (game.previewUrl) {
      const p = playSpotifyPreview(game.previewUrl, game.seconds || 5)
      if (p && typeof p.catch === 'function') p.catch(() => setNeedsTap(true))
    }
  }, [songNumber])

  // Stop audio when the answer is revealed.
  useEffect(() => {
    if (result) stopAudio()
  }, [result])

  useEffect(() => () => stopAudio(), [])

  function replay() {
    setNeedsTap(false)
    if (game.mode === 'demo') {
      playDemoTone(game.demoSeed ?? 0, game.seconds || 5)
    } else if (game.previewUrl) {
      const p = playSpotifyPreview(game.previewUrl, game.seconds || 5)
      if (p && typeof p.catch === 'function') p.catch(() => setNeedsTap(true))
    }
  }

  function handleGuess(id) {
    if (locked || result) return
    setLocked(id)
    onGuess(id).then((res) => {
      if (res && res.ok) {
        setLocalResult(res.correct ? 'correct' : 'wrong')
      } else {
        setLocked(null)
      }
    })
  }

  const sorted = [...scores].sort((a, b) => b.score - a.score)

  if (game?.phase === 'ended') {
    return (
      <RoundEnd scores={sorted} total={total} isHost={isHost} onPlayAgain={onPlayAgain} onLeave={onLeave} />
    )
  }

  return (
    <div className="screen game">
      <header className="game-header">
        <button className="btn btn-ghost back" onClick={onLeave}>←</button>
        <div className="song-progress">
          <span className="song-count">{songNumber}</span>
          <span className="song-total">/ {total}</span>
        </div>
        <div className="score-chip">🎯 {sorted.find((p) => p.id === socket.id)?.score ?? 0}</div>
      </header>

      <div className="now-playing">
        {result && game?.albumArt ? (
          <img className="album-art" src={game.albumArt} alt="" />
        ) : (
          <div className="album-art fallback">🎵</div>
        )}
        <div className="equalizer">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="eq-bar" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        {needsTap && (
          <button className="btn btn-play" onClick={replay}>▶ 播放 5 秒試聽</button>
        )}
      </div>

      <div className="scoreboard">
        {sorted.slice(0, 8).map((p, i) => (
          <div className="chip" key={p.id}>
            <span className="chip-rank">{i + 1}</span>
            <span className="chip-name">{p.name}</span>
            <span className="chip-score">{p.score}</span>
          </div>
        ))}
      </div>

      {result ? (
        <div className="result-banner">
          {winner ? (
            <div className="result-win">
              🎉 <strong>{winner.name}</strong> 答對了！
            </div>
          ) : (
            <div className="result-miss">😢 沒人答對</div>
          )}
          <div className="result-answer">
            正確答案：<strong>{result.title}</strong> — {result.artist}
          </div>
        </div>
      ) : (
        <div className="guess-prompt">🎧 聽出是哪一首了嗎？快搶答！</div>
      )}

      <div className="options">
        {options.map((opt) => {
          let cls = 'option'
          if (result) {
            if (opt.id === result.id) cls += ' correct'
            else if (opt.id === locked) cls += ' wrong'
            else cls += ' dim'
          } else if (locked === opt.id) {
            cls += localResult === 'wrong' ? ' wrong' : ' selected'
          }
          return (
            <button key={opt.id} className={cls} onClick={() => handleGuess(opt.id)} disabled={locked || result}>
              <span className="opt-title">{opt.title}</span>
              <span className="opt-artist">{opt.artist}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RoundEnd({ scores, total, isHost, onPlayAgain, onLeave }) {
  const winner = scores[0]
  return (
    <div className="screen-center round-end">
      <div className="logo">🏆</div>
      <h1 className="title">回合結束</h1>
      <p className="subtitle">共 {total} 首 · {winner ? `${winner.name} 獲勝！` : '沒有玩家'}</p>

      <div className="card podium">
        {scores.slice(0, 3).map((p, i) => (
          <div className="podium-row" key={p.id}>
            <span className="podium-rank">{['🥇', '🥈', '🥉'][i]}</span>
            <span className="pname">{p.name}</span>
            <span className="podium-score">{p.score} 分</span>
          </div>
        ))}
        {scores.slice(3).map((p) => (
          <div className="podium-row muted" key={p.id}>
            <span className="podium-rank">·</span>
            <span className="pname">{p.name}</span>
            <span className="podium-score">{p.score} 分</span>
          </div>
        ))}
      </div>

      {isHost ? (
        <div className="row-center">
          <button className="btn btn-big" onClick={onPlayAgain}>再玩一回合</button>
          <button className="btn btn-ghost" onClick={onLeave}>回到大廳</button>
        </div>
      ) : (
        <p className="hint">等待房主開始下一回合…</p>
      )}
    </div>
  )
}
