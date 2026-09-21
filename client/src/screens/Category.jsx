import { useEffect, useState } from 'react'

export default function Category({ onBack, setPlaylist, onCreateRoom }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState({ type: 'idle' }) // idle | loading | success | error
  const [ready, setReady] = useState(false)
  const [hostName, setHostName] = useState('')

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => { setCategories(d); setLoading(false) })
      .catch(() => { setStatus({ type: 'error', message: '無法讀取歌單分類，請確認伺服器已啟動。' }); setLoading(false) })
  }, [])

  async function select(cat) {
    setSelected(cat)
    setReady(false)
    setStatus({ type: 'loading' })
    try {
      const res = await fetch(`/api/category/${cat.id}`)
      const data = await res.json()
      if (data.success) {
        setPlaylist({ name: `${data.name} 粵語歌`, tracks: data.tracks, source: 'itunes' })
        setStatus({ type: 'success', count: data.tracks.length })
        setReady(true)
      } else {
        setStatus({ type: 'error', message: data.error || '載入失敗' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: '網路錯誤：' + e.message })
    }
  }

  function create() {
    if (!hostName.trim()) return
    onCreateRoom(hostName.trim())
  }

  // Group the categories ("年份歌單" / "歌手精選") while keeping the server order.
  const groups = []
  for (const cat of categories) {
    const name = cat.group || '年份歌單'
    let g = groups.find((x) => x.name === name)
    if (!g) { g = { name, items: [] }; groups.push(g) }
    g.items.push(cat)
  }

  return (
    <div className="screen-center category">
      <button className="btn btn-ghost back" onClick={onBack}>← 返回</button>
      <div className="logo">🎤</div>
      <h1 className="title">選擇歌單</h1>
      <p className="subtitle">年份歌單 · 歌手精選</p>

      {loading && <p className="status">載入中…</p>}

      {groups.map((g) => (
        <div className="cat-group" key={g.name}>
          <h3 className="cat-group-title">{g.name}</h3>
          <div className="categories">
            {g.items.map((cat) => (
              <button
                key={cat.id}
                className={`category-card ${selected?.id === cat.id ? 'active' : ''}`}
                onClick={() => select(cat)}
              >
                <span className="cat-label">{cat.label}</span>
                <span className="cat-desc">{cat.description}</span>
                <span className="cat-count">{cat.ready} / {cat.count} 首可玩</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {status.type === 'loading' && <p className="status">⏳ 準備歌曲中…</p>}
      {status.type === 'success' && <div className="status success">✅ 已準備好 {status.count} 首歌曲</div>}
      {status.type === 'error' && <p className="status error">❌ {status.message}</p>}

      {ready && (
        <div className="card">
          <h3>建立房間</h3>
          <label>你的名字</label>
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="例如：房主"
            maxLength={20}
            autoComplete="off"
          />
          <button className="btn btn-big" onClick={create} disabled={!hostName.trim()}>
            建立遊戲房間
          </button>
        </div>
      )}
    </div>
  )
}
