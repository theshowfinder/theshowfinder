// Read-only: runs the current Gigsberg matching rules over today's catalogue and compares with what is stored.
//   npx tsx --env-file=.env.local scripts/simulate-gigsberg-matching.ts
import { createClient } from '@supabase/supabase-js'
import { bucketEventsByDate, dateOnly, decideMatch, hasTitleEvidence, type CatalogueRow, type ShowfinderEvent } from '../src/lib/gigsbergMatchScoring'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function all(build: (from: number, to: number) => any) { const out: any[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await build(f, f + 999); if (error) throw new Error(error.message); out.push(...(data ?? [])); if ((data ?? []).length < 1000) break } return out }
async function main() {
  const today = new Date().toISOString().slice(0, 10)
  console.log("start"); const cat = await all((f, t) => db.from('gigsberg_catalogue_events').select('id, name, event_date, event_time, venue, city, performer1, performer2, url, matched_event_id, match_status').is('gone_at', null).gte('event_date', today).in('match_status', ['pending', 'review', 'no_match', 'auto_matched']).order('id').range(f, t))
  const evs = await all((f, t) => db.from('events').select('id, title, start_date, gigsberg_affiliate_url, venue:venues(name, city)').gte('start_date', new Date().toISOString()).order('id').range(f, t))
  const nonCanon = new Set((await all((f, t) => db.from('event_canonical_map').select('id').eq('is_canonical', false).order('id').range(f, t))).map((r: { id: string }) => r.id))
  const events: ShowfinderEvent[] = evs.filter(e => !nonCanon.has(e.id)).map(e => ({ ...e, artists: [] }))
  console.log("loaded", cat.length, evs.length, nonCanon.size); const byDate = bucketEventsByDate(events)
  const cands = cat.map(item => (byDate.get(dateOnly(item.event_date)) ?? []).filter(e => hasTitleEvidence(item as CatalogueRow, e)))
  const need = [...new Set(cands.flat().map(e => e.id))]
  const arts = new Map<string, { artist: { name: string } | null }[]>()
  for (let i = 0; i < need.length; i += 200) {
    const { data } = await db.from('event_artists').select('event_id, artist:artists(name)').in('event_id', need.slice(i, i + 200))
    for (const r of data ?? []) { const l = arts.get(r.event_id) ?? []; l.push({ artist: r.artist }); arts.set(r.event_id, l) }
  }
  for (const list of cands) for (const e of list) e.artists = arts.get(e.id) ?? []
  const trans = new Map<string, number>(); const examples = new Map<string, string[]>()
  cat.forEach((item, i) => {
    const d = decideMatch(item as CatalogueRow, cands[i])
    let key = `${item.match_status} -> ${d.status}`
    if (item.match_status === 'auto_matched' && d.status === 'auto_matched' && d.event?.id !== item.matched_event_id) key += ' (different event)'
    trans.set(key, (trans.get(key) ?? 0) + 1)
    const ex = examples.get(key) ?? []
    if (ex.length < 6) ex.push(`${item.name} ${item.event_date} @ ${item.venue} => ${d.reason}`)
    examples.set(key, ex)
  })
  for (const [k, n] of [...trans.entries()].sort((a, b) => b[1] - a[1])) { console.log(n, k); for (const e of examples.get(k) ?? []) console.log('    ', e.slice(0, 200)) }
}
main().catch(e => { console.error(e); process.exit(1) })
