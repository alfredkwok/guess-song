export default function Home({ onHost, onJoin }) {
  return (
    <div className="screen-center home">
      <div className="logo">🎵</div>
      <h1 className="title">Guess The Song</h1>
      <p className="subtitle">香港廣東歌猜歌 · 多人連線對戰</p>

      <button className="btn btn-big" onClick={onHost}>
        Guess Song
      </button>

      <button className="btn btn-ghost" onClick={onJoin}>
        加入朋友的遊戲
      </button>

      <p className="hint">房主選擇歌單後，會得到一組代碼，讓其他玩家用手機加入同場對戰。</p>
    </div>
  )
}
