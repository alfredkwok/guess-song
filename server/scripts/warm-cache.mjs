// Warm the preview cache until every song resolves (or we stop making progress).
// iTunes rate-limits to ~20 req/min, so several passes are needed.
//
// Usage (from the repo root):
//   node server/scripts/warm-cache.mjs
//
// Run this after editing songdata.js, then commit server/.preview-cache.json so
// the deployed server never has to wait on iTunes.
import { CATEGORIES } from '../songdata.js'
import { resolveTracks, getUncached, isRateLimited } from '../preview.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const missing = () => CATEGORIES.reduce((n, c) => n + getUncached(c.songs).length, 0)

console.log(`起始未取得：${missing()} 條目`)
let pass = 0
let prev = Infinity

while (pass < 25) {
  pass++
  const before = missing()
  if (before === 0) break
  if (before >= prev) {
    console.log(`\n第 ${pass} 輪沒有進展（仍缺 ${before}），可能被限流；等 70 秒再試…`)
    await wait(70000)
  }
  prev = before
  console.log(`\n--- 第 ${pass} 輪，尚缺 ${before} ---`)

  for (const cat of CATEGORIES) {
    const need = getUncached(cat.songs).length
    if (!need) continue
    const resolved = await resolveTracks(cat.songs).catch(() => [])
    const after = getUncached(cat.songs).length
    console.log(`${cat.id.padEnd(12)} 缺 ${need} -> 缺 ${after}（本輪成功 ${resolved.length}）`)
    if (isRateLimited()) {
      console.log('  偵測到 iTunes 限流，暫停 70 秒…')
      await wait(70000)
    }
  }

  const after = missing()
  if (after === 0) break
  if (after === before) {
    console.log(`本輪零進展，再等 70 秒…`)
    await wait(70000)
  }
}

console.log(`\n=== 最終結果（共 ${pass} 輪）===`)
for (const cat of CATEGORIES) {
  const miss = getUncached(cat.songs)
  console.log(`${cat.id.padEnd(12)} 仍缺 ${miss.length} / ${cat.songs.length}`)
  if (miss.length && miss.length <= 12) {
    for (const s of miss) console.log(`      ${s.title} | ${s.artist}`)
  }
}
console.log(`\n總計仍缺 ${missing()} 條目`)
