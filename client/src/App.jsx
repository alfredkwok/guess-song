import { useEffect, useState } from 'react'
import { socket } from './socket.js'
import { getAudioCtx } from './lib/audio.js'
import Home from './screens/Home.jsx'
import Category from './screens/Category.jsx'
import Lobby from './screens/Lobby.jsx'
import Game from './screens/Game.jsx'

export default function App() {
  const [screen, setScreen] = useState('home') // home | category | join | lobby | game
  const [me, setMe] = useState(null) // { name, isHost }
  const [roomCode, setRoomCode] = useState('')
  const [playlist, setPlaylist] = useState(null) // { name, tracks, source }
  const [players, setPlayers] = useState([])
  const [hostId, setHostId] = useState(null)
  const [game, setGame] = useState(null)
  const [questions, setQuestions] = useState(10)
  const [error, setError] = useState('')

  useEffect(() => {
    // Unlock audio on first interaction (mobile autoplay policies).
    const unlock = () => { try { getAudioCtx().resume() } catch { /* noop */ } }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  useEffect(() => {
    const onPlayers = (d) => {
      setPlayers(d.players || [])
      if (d.hostId != null) setHostId(d.hostId)
    }
    const onHostChanged = (d) => setHostId(d.hostId)
    const onGameStarted = (d) => {
      setGame((g) => ({ ...(g || {}), phase: 'playing', total: d.total }))
      setScreen('game')
    }
    const onSongStart = (d) => setGame({
      phase: 'playing',
      total: d.total,
      songNumber: d.songNumber,
      options: d.options,
      correct: null,
      winner: null,
      scores: null,
      mode: d.mode,
      previewUrl: d.previewUrl,
      demoSeed: d.demoSeed,
      albumArt: d.albumArt,
      seconds: d.seconds || 5
    })
    const onSongResult = (d) => setGame((g) => ({
      ...(g || {}),
      correct: d.correct,
      winner: d.winner,
      scores: d.scores
    }))
    const onRoundEnd = (d) => setGame((g) => ({ ...(g || {}), phase: 'ended', scores: d.scores, total: d.total }))

    socket.on('players-updated', onPlayers)
    socket.on('host-changed', onHostChanged)
    socket.on('game-started', onGameStarted)
    socket.on('song-start', onSongStart)
    socket.on('song-result', onSongResult)
    socket.on('round-end', onRoundEnd)

    return () => {
      socket.off('players-updated')
      socket.off('host-changed')
      socket.off('game-started')
      socket.off('song-start')
      socket.off('song-result')
      socket.off('round-end')
    }
  }, [])

  const isHost = hostId != null && hostId === socket.id

  function goHome() {
    socket.emit('leave-room')
    setScreen('home')
    setMe(null)
    setRoomCode('')
    setPlaylist(null)
    setPlayers([])
    setHostId(null)
    setGame(null)
    setQuestions(10)
  }

  function handleCreateRoom(playerName) {
    setError('')
    socket.emit('create-room',
      { name: playerName, tracks: playlist.tracks, source: playlist.source, playlistName: playlist.name },
      (res) => {
        if (!res || !res.ok) { setError(res?.error || '建立房間失敗'); return }
        setRoomCode(res.code)
        setMe({ name: playerName, isHost: true })
        setScreen('lobby')
      }
    )
  }

  function handleJoinRoom(code, playerName) {
    setError('')
    socket.emit('join-room', { code, name: playerName }, (res) => {
      if (!res || !res.ok) { setError(res?.error || '加入失敗'); return }
      setRoomCode(res.code)
      setMe({ name: playerName, isHost: false })
      setPlayers(res.players)
      setHostId(res.hostId)
      setScreen('lobby')
    })
  }

  function handleStartGame(count) {
    const n = Number(count) > 0 ? Math.floor(Number(count)) : questions
    setQuestions(n)
    setError('')
    socket.emit('start-game', { questions: n }, (res) => {
      if (!res || !res.ok) setError(res?.error || '無法開始遊戲')
    })
  }

  function handleGuess(trackId) {
    return new Promise((resolve) => {
      socket.emit('guess', { trackId }, (res) => resolve(res || { ok: false }))
    })
  }

  if (screen === 'home') {
    return <Home onHost={() => setScreen('category')} onJoin={() => setScreen('join')} />
  }

  if (screen === 'join') {
    return <Join onBack={goHome} onJoin={handleJoinRoom} error={error} />
  }

  if (screen === 'category') {
    return (
      <Category
        onBack={goHome}
        setPlaylist={setPlaylist}
        onCreateRoom={handleCreateRoom}
      />
    )
  }

  if (screen === 'lobby') {
    return (
      <Lobby
        roomCode={roomCode}
        players={players}
        isHost={isHost}
        playlistName={playlist?.name}
        playlistSize={playlist?.tracks?.length || 0}
        onStart={handleStartGame}
        onLeave={goHome}
        error={error}
      />
    )
  }

  if (screen === 'game') {
    return (
      <Game
        game={game}
        players={players}
        isHost={isHost}
        myName={me?.name}
        onGuess={handleGuess}
        onPlayAgain={() => handleStartGame(questions)}
        onLeave={goHome}
      />
    )
  }

  return <Home onHost={() => setScreen('category')} onJoin={() => setScreen('join')} />
}

function Join({ onBack, onJoin, error }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    onJoin(code.trim(), name.trim())
  }

  return (
    <div className="screen-center">
      <button className="btn btn-ghost back" onClick={onBack}>← 返回</button>
      <div className="logo">🎧</div>
      <h1 className="title">加入遊戲</h1>
      <form className="card form" onSubmit={submit}>
        <label>你的名字</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：小明"
          maxLength={20}
          autoComplete="off"
        />
        <label>房間代碼</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="6 位代碼"
          maxLength={6}
          autoComplete="off"
          className="code-input"
        />
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || code.trim().length < 4}>
          加入房間
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
