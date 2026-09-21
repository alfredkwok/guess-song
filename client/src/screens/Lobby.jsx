import { useState } from 'react'

export default function Lobby({ roomCode, players, isHost, playlistName, playlistSize = 0, onStart, onLeave, error }) {
  const sorted = [...players].sort((a, b) => b.score - a.score)

  // Offer 10 / 20 / 30 always; disable any the playlist can't cover.
  const ROUNDS = [10, 20, 30]
  const firstAvailable = ROUNDS.find((n) => n <= playlistSize) || Math.max(1, playlistSize)
  const [questions, setQuestions] = useState(firstAvailable)

  return (
    <div className="screen-center lobby">
      <button className="btn btn-ghost back" onClick={onLeave}>← 離開</button>
      <div className="logo">🪩</div>
      <h1 className="title">遊戲大廳</h1>
      {playlistName && <p className="subtitle">歌單：{playlistName}（{playlistSize} 首）</p>}

      <div className="code-box">
        <span className="code-label">房間代碼</span>
        <span className="code">{roomCode}</span>
        <span className="code-hint">把這組代碼分享給朋友，讓大家用手機加入</span>
      </div>

      <div className="card players">
        <h3>玩家（{players.length}）</h3>
        {sorted.length === 0 && <p className="muted">等待玩家加入…</p>}
        <ul className="player-list">
          {sorted.map((p, i) => (
            <li key={p.id}>
              <span className="rank">#{i + 1}</span>
              <span className="pname">{p.name}</span>
              {isHost && i === 0 && <span className="crown">👑</span>}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <>
          <div className="card round-picker">
            <h3>每回合題數</h3>
            <div className="rp-options">
              {ROUNDS.map((n) => (
                <button
                  key={n}
                  className={`rp-btn ${questions === n ? 'active' : ''}`}
                  onClick={() => setQuestions(n)}
                  disabled={n > playlistSize}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="muted">
              共 {questions} 題，隨機抽自 {playlistSize} 首歌
              {playlistSize < 30 ? `（目前可播 ${playlistSize} 首）` : ''}
            </p>
          </div>

          <button className="btn btn-big" onClick={() => onStart(questions)} disabled={players.length < 1}>
            開始遊戲（{questions} 題 · {players.length} 人）
          </button>
        </>
      ) : (
        <p className="hint">等待房主開始遊戲…</p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
