// Read-only preview of what the automatic feed import (src/lib/feedEventImport.ts) would create, with every rule
// applied: city names, not-a-show filter, duplicates, real start time, category, description, price, picture.
//   npx tsx --env-file=.env.local scripts/preview-feed-import.ts > preview.json
// Writes nothing to the database.
import { createClient } from '@supabase/supabase-js'
import { cleanFeedDescription, feedCategory, feedPriceFrom, londonToUtcIso, resolveFeedCity, skipReason, slugify, type KnownEvent } from '../src/lib/feedImportRules'
import { inferEventCategory, fallbackEventImage } from '../src/lib/eventImages'
import { CITIES } from '../src/lib/cities'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any
const db: Loose = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const londonDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const OUR = new Set(CITIES.map(c => c.name))

async function all(table: string, columns: string, build: (q: Loose) => Loose): Promise<Loose[]> {
  const out: Loose[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(db.from(table).select(columns)).range(offset, offset + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

async function main() {
  const today = londonDate(new Date().toISOString())
  const horizon = londonDate(new Date(Date.now() + 24 * 30 * 86_400_000).toISOString())
  const known = new Map<string, KnownEvent[]>()
  const ev = await all('events', 'id, title, start_date, venue:venues(name, city)', q => q.gte('start_date', new Date(Date.now() - 86_400_000).toISOString()).in('status', ['upcoming', 'on_sale', 'sold_out']).order('id'))
  for (const e of ev) {
    const d = londonDate(e.start_date); const l = known.get(d) ?? []
    l.push({ title: e.title, date: d, city: e.venue?.city ?? '', venue: e.venue?.name ?? '' }); known.set(d, l)
  }
  const cand = (q: Loose) => q.is('gone_at', null).is('matched_event_id', null).eq('match_status', 'no_match').gt('event_date', today).lte('event_date', horizon).order('event_date').order('id')
  const g = await all('gigsberg_catalogue_events', 'id, name, event_date, event_time, venue, city, performer1, type_name, sub_type, image_url, url', cand)
  const s = await all('see_tickets_catalogue_events', 'id, name, event_date, event_time, venue, city, venue_address, genre, primary_artist, second_artist, feed_description, search_price, min_price, max_price, url', cand)

  // Artists we already have (their photo is used first).
  const wanted = new Set<string>()
  for (const r of g) if (r.performer1) wanted.add(slugify(r.performer1))
  for (const r of s) { const a = r.primary_artist || r.second_artist; if (a) wanted.add(slugify(a)) }
  const artistImg = new Map<string, string | null>()
  const slugs = [...wanted].filter(Boolean)
  for (let i = 0; i < slugs.length; i += 200) {
    const { data } = await db.from('artists').select('slug, image_url').in('slug', slugs.slice(i, i + 200))
    for (const a of data ?? []) artistImg.set(a.slug, a.image_url)
  }

  const report: Loose = { generatedAt: new Date().toISOString(), platforms: {} }
  for (const [platform, rows] of [['gigsberg', g], ['see_tickets', s]] as const) {
    const stats: Loose = { candidates: rows.length, skipped: {}, eligible: 0, inOurCities: 0, byCategory: {}, byCity: {}, withDescription: 0, withPrice: 0, image: { artist: 0, feed: 0, artwork: 0 }, timeKnown: 0 }
    const pages: Loose[] = []
    for (const r of rows) {
      r.city = resolveFeedCity(r.city, platform === 'see_tickets' ? r.venue_address : null)
      const why = skipReason(r, known.get(r.event_date) ?? [], today)
      if (why) { stats.skipped[why] = (stats.skipped[why] ?? 0) + 1; continue }
      const l = known.get(r.event_date) ?? []; l.push({ title: r.name, date: r.event_date, city: r.city ?? '', venue: r.venue ?? '' }); known.set(r.event_date, l)
      stats.eligible++
      const category = (platform === 'gigsberg' ? feedCategory('gigsberg', r.type_name, r.sub_type) : feedCategory('see_tickets', r.genre)) ?? inferEventCategory(r.name)
      const artist = platform === 'gigsberg' ? r.performer1 : (r.primary_artist || r.second_artist)
      const aImg = artist ? artistImg.get(slugify(artist)) ?? null : null
      const fImg = platform === 'gigsberg' && /^https:\/\/(www\.)?gigsberg\.com\/files\/images\//i.test(r.image_url ?? '') ? String(r.image_url).replace(/^https:\/\/gigsberg\.com\//i, 'https://www.gigsberg.com/') : null
      const image = aImg ?? fImg ?? fallbackEventImage(category, r.name)
      stats.image[aImg ? 'artist' : fImg ? 'feed' : 'artwork']++
      const description = platform === 'see_tickets' ? cleanFeedDescription(r.feed_description) : null
      const price = platform === 'see_tickets' ? feedPriceFrom(r.min_price, r.search_price) : null
      if (description) stats.withDescription++
      if (price != null) stats.withPrice++
      const start = londonToUtcIso(r.event_date, r.event_time)
      if (!/T00:00:00/.test(londonToUtcIso(r.event_date, r.event_time)) || r.event_time) stats.timeKnown++
      const ours = OUR.has(r.city ?? '')
      if (ours) stats.inOurCities++
      stats.byCategory[category] = (stats.byCategory[category] ?? 0) + 1
      stats.byCity[r.city ?? '?'] = (stats.byCity[r.city ?? '?'] ?? 0) + 1
      pages.push({ platform, title: r.name, start, time: r.event_time, venue: r.venue, city: r.city, ourCity: ours, category, price, description, image, imageFrom: aImg ? 'artist' : fImg ? 'feed' : 'artwork', url: r.url })
    }
    stats.topCities = Object.entries(stats.byCity).sort((a: Loose, b: Loose) => b[1] - a[1]).slice(0, 15)
    delete stats.byCity
    report.platforms[platform] = { stats, pages }
  }
  process.stdout.write(JSON.stringify(report))
}
main().catch(e => { console.error(e); process.exit(1) })
