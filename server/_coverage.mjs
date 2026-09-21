// Coverage check: resolve every song in every category and report misses.
import { CATEGORIES } from './songdata.js'
import { resolveTracks } from './preview.js'

for (const cat of CATEGORIES) {
  const resolved = await resolveTracks(cat.songs, 8)
  const resolvedIds = new Set(resolved.map((s) => `${s.title}\u0000${s.artist}`))
  const missing = cat.songs.filter((s) => !resolvedIds.has(`${s.title}\u0000${s.artist}`))
  console.log(`\n=== ${cat.id} (${cat.songs.length} songs) ===`)
  console.log(`resolved: ${resolved.length} / ${cat.songs.length}`)
  if (missing.length) {
    console.log('MISSING:')
    for (const m of missing) console.log(`  - ${m.title} — ${m.artist} (${m.year})`)
  }
}
