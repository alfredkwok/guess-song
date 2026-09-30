import { useEffect, useState } from 'react'
import VolumeControl from '../components/VolumeControl.jsx'

// Artist groups the host can switch off before creating a room. The songs stay
// in the playlist data - excluding a group only changes what is sent to the room.
const DEFAULT_GROUP = 'mirror'

export default function Category({ onBack, setPlaylist, onCreateRoom }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState({ type: 'idle' }) // idle | loading | success | error
  const [ready, setReady] = useState(false)
  const [hostName, setHostName] = useState('')
  const [excludeGroups, setExcludeGroups] = useState([])
  const [excludedInfo, setExcludedInfo] = useState(null) // { fullTotal, total, labels }
  const [groupLabels, setGroupLabels] = useState({})

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => { setCategories(d); setLoading(false) })
      .catch(() => { setStatus({ type: 'error', message: '無法讀取歌單分類，請確認伺服器已啟動。' }); setLoading(false) })
  }, [])

  async function select(cat, groups = excludeGroups) {
    setSelected(cat)
    setReady(false)
    setStatus({ type: 'loading' })
    const param = groups.join(',')
    try {
      const qs = param ? `?exclude=${encodeURIComponent(param)}` : ''
      const res = await fetch(`/api/category/${cat.id}${qs}`)
      const data = await res.json()
      if (data.success) {
        // Learn the display labels the server uses for each group id.
        const labels = { ...groupLabels }
        for (const g of data.groups || []) labels[g.id] = g.label
        setGroupLabels(labels)
        const names = (data.excluded || []).map((id) => labels[id] || id)
        const suffix = names.length ? `（已排除 ${names.join('、')}）` : ''
        setPlaylist({ name: `${data.name} 粵語歌${suffix}`, tracks: data.tracks, source: 'itunes' })
        setStatus({ type: 'success', count: data.tracks.length })
        setExcludedInfo({
          fullTotal: data.fullTotal,
          total: data.tracks.length,
          labels: names
        })
        setReady(true)
      } else {
        setStatus({ type: 'error', message: data.error || '載入失敗' })
      }
    } catch (e) {
      setStatus({ type: 'error', message: '網路錯誤：' + e.message })
    }
  }

  function toggleGroup(groupId) {
    const next = excludeGroups.includes(groupId)
      ? excludeGroups.filter((g) => g !== groupId)
      : [...excludeGroups, groupId]
    setExcludeGroups(next)
    // Re-fetch the highlighted category so the count and playlist stay in sync.
    if (selected) select(selected, next)
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

      <div className="filter-box">
        <div className="filter-head">
          <span className="filter-title">🚫 排除歌手</span>
          <span className="filter-hint">想避開某些歌手？按一下即可從歌單中移除</span>
        </div>
        <button
          className={`filter-chip ${excludeGroups.includes(DEFAULT_GROUP) ? 'on' : ''}`}
          onClick={() => toggleGroup(DEFAULT_GROUP)}
          aria-pressed={excludeGroups.includes(DEFAULT_GROUP)}
        >
          <span className="chip-dot" />
          排除 MIRROR 全部成員
        </button>
      </div>

      <div className="filter-box">
        <div className="filter-head">
          <span className="filter-title">🔊 音量</span>
          <span className="filter-hint">試聽音樂偏大聲，預設 35%；調整後會記住</span>
        </div>
        <VolumeControl />
      </div>

      {loading && <p className="status">載入中…</p>}

      {groups.map((g) => (
        <div className="cat-group" key={g.name}>
          <h3 className="cat-group-title">{g.name}</h3>
          <div className="categories">
            {g.items.map((cat) => {
              const gc = cat.groupCounts?.[DEFAULT_GROUP]
              const filtering = excludeGroups.includes(DEFAULT_GROUP) && gc
              const shown = filtering ? gc.ready : cat.ready
              const removed = filtering ? gc.removed : 0
              const label = groupLabels[DEFAULT_GROUP] || 'MIRROR'
              return (
                <button
                  key={cat.id}
                  className={`category-card ${selected?.id === cat.id ? 'active' : ''}`}
                  onClick={() => select(cat)}
                >
                  <span className="cat-label">{cat.label}</span>
                  <span className="cat-desc">{cat.description}</span>
                  <span className="cat-count">
                    {shown} 首可玩
                    {removed > 0 && <em className="cat-removed">（已排除 {removed} 首 {label}）</em>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {status.type === 'loading' && <p className="status">⏳ 準備歌曲中…</p>}
      {status.type === 'success' && (
        <div className="status success">
          ✅ 已準備好 {status.count} 首歌曲
          {excludedInfo && excludedInfo.fullTotal !== excludedInfo.total && (
            <span className="status-note">
              （原有 {excludedInfo.fullTotal} 首，已排除 {excludedInfo.fullTotal - excludedInfo.total} 首
              {excludedInfo.labels?.length ? ` ${excludedInfo.labels.join('、')}` : ''}）
            </span>
          )}
        </div>
      )}
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
