/**
 * Read-only internal link-health check.
 *
 * Catches the class of bug behind the "InPop card → 404" incident: a card
 * rendered on one surface (homepage, a city page, the On Sale This Week
 * listing) linking to /on-sale-this-week/[slug] or /events/[slug] when
 * that destination's own query logic doesn't actually resolve it — i.e.
 * the card-producing query and the destination-resolving query have drifted
 * out of sync. Imports the *real* site functions (src/lib/eventPools.ts,
 * src/lib/on-sale.ts) rather than re-implementing the queries, so this
 * check has the same logic as the live site and can't itself drift out of
 * date with it.
 *
 * Uses the anon (public, RLS-respecting) Supabase key — the same one the
 * site itself queries with — never the service-role key. Makes no writes.
 *
 * Run from the project root:
 *   npx tsx scripts/check-on-sale-links.ts
 *
 * Exits 0 if every checked link resolves, 1 if any broken link is found
 * (so it can be wired into CI or a scheduled check later).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import type { EventWithVenue, Artist } from '../src/lib/types/database'
import {
  fetchEventsThisWeek, fetchTopEvents,
  fetchPresalesOpenNow, fetchPresalesOpenNowEvents,
  fetchOnSaleThisWeek, fetchOnSaleThisWeekEvents,
} from '../src/lib/eventPools'
import { groupEventsByArtist, mergeEventsById, onSaleThisWeekWindow } from '../src/lib/on-sale'

// ── Load .env.local ──────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // read-only, RLS-respecting — same as the live site

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

// Same 36 UK cities Footer.tsx links to and every /cities/[city] page serves.
const CITIES = [
  'London', 'Manchester', 'Birmingham', 'Glasgow', 'Edinburgh',
  'Leeds', 'Liverpool', 'Bristol', 'Cardiff', 'Belfast',
  'Nottingham', 'Newcastle', 'Leicester', 'Sheffield', 'Derby',
  'Coventry', 'Southampton', 'Portsmouth', 'Norwich', 'Brighton',
  'Oxford', 'Cambridge', 'Exeter', 'Plymouth', 'Hull',
  'Middlesbrough', 'Sunderland', 'Bradford', 'Reading', 'Milton Keynes',
  'Bournemouth', 'Ipswich', 'Stoke-on-Trent', 'Wolverhampton', 'Swansea',
  'Aberdeen',
]

interface Broken {
  surface: string
  slug:    string
  url:     string
}

async function main() {
  const broken: Broken[] = []
  let checked = 0

  // Fail loudly on a connectivity/query error instead of silently treating
  // it as "no data, therefore no broken links" — a network failure must
  // never be reported as a clean health check.
  const artistsQuery = await supabase.from('artists').select('*') as unknown as { data: Artist[] | null; error: { message: string } | null }
  if (artistsQuery.error) {
    console.error('Could not reach Supabase — aborting rather than reporting a false "all clear".')
    console.error(artistsQuery.error.message)
    process.exit(1)
  }
  const artists = artistsQuery.data ?? []
  if (artists.length === 0) {
    console.error('Artists table returned zero rows — this is almost certainly a connectivity issue, not reality. Aborting.')
    process.exit(1)
  }

  // ── 1. The resolving pool: exactly what the fixed
  //    /on-sale-this-week/[slug] detail page checks a slug against. ────────
  const [onSaleEvents, presaleEvents] = await Promise.all([
    fetchOnSaleThisWeekEvents(supabase, { fetchLimit: 1000 }),
    fetchPresalesOpenNowEvents(supabase, { fetchLimit: 1000 }),
  ])
  const resolvableSlugs = new Set(
    groupEventsByArtist(mergeEventsById(onSaleEvents, presaleEvents), artists).map(g => g.slug)
  )
  console.log(`Resolvable /on-sale-this-week/[slug] pool: ${resolvableSlugs.size} slugs`)

  function checkOnSaleSlugs(surface: string, slugs: string[]) {
    for (const slug of slugs) {
      checked++
      if (!resolvableSlugs.has(slug)) {
        broken.push({ surface, slug, url: `/on-sale-this-week/${slug}` })
      }
    }
  }

  // ── 2. Every surface that renders an on-sale-this-week / presale card ──

  checkOnSaleSlugs(
    'Homepage — On Sale This Week',
    (await fetchOnSaleThisWeek(supabase, artists, { limit: 500 })).map(g => g.slug),
  )
  checkOnSaleSlugs(
    'On Sale This Week listing page',
    (await fetchOnSaleThisWeek(supabase, artists, { limit: 500 })).map(g => g.slug),
  )
  checkOnSaleSlugs(
    'Homepage — Presales Open Now',
    (await fetchPresalesOpenNow(supabase, artists, { limit: 500 })).map(g => g.slug),
  )

  // Checked concurrently (36 cities x 2 queries) rather than one city at a
  // time — this is a read-only reporting script, not a page render, so
  // there's no benefit to serializing it, and serial execution made a full
  // run too slow to be practical to re-run often.
  const { floorISO, ceilISO } = onSaleThisWeekWindow()
  await Promise.all(CITIES.map(async city => {
    const presaleSlugs = (await fetchPresalesOpenNow(supabase, artists, { city, limit: 500 })).map(g => g.slug)

    // Replicates the city page's own on-sale-this-week query verbatim
    // (src/app/cities/[city]/page.tsx) — deliberately NOT routed through
    // fetchOnSaleThisWeek, since the city page filters on the onsale_date
    // column directly (a safe subset — see that file's comments) rather
    // than the public_onsale_start/presale_start OR used elsewhere.
    const { data: cityOnSale } = await supabase
      .from('events_with_venue')
      .select('*')
      .ilike('venue_city', city)
      .gte('onsale_date', floorISO)
      .lte('onsale_date', ceilISO)
      .order('onsale_date', { ascending: true })
      .limit(500) as unknown as { data: EventWithVenue[] | null }
    const citySlugs = groupEventsByArtist(cityOnSale ?? [], artists).map(g => g.slug)

    checkOnSaleSlugs(`City page — ${city} — Presales Open Now`, presaleSlugs)
    checkOnSaleSlugs(`City page — ${city} — On Sale This Week`, citySlugs)
  }))

  // ── 3. Lightweight sanity check on /events/[slug] and /artists/[slug] — ─
  //    these resolve by a DB-stored slug column rather than a derived one,
  //    so the only failure mode here is a null/empty slug on a row that's
  //    otherwise being surfaced in a card.
  const sampleEvents = mergeEventsById(
    await fetchEventsThisWeek(supabase, { limit: 100 }),
    await fetchTopEvents(supabase, { limit: 100 }),
  )
  let emptyEventSlugs = 0
  for (const event of sampleEvents) {
    checked++
    if (!event.slug || event.slug.trim() === '') {
      emptyEventSlugs++
      broken.push({ surface: 'Event card (homepage pools)', slug: event.id, url: '/events/(missing slug)' })
    }
  }

  let emptyArtistSlugs = 0
  for (const artist of artists) {
    checked++
    if (!artist.slug || artist.slug.trim() === '') {
      emptyArtistSlugs++
      broken.push({ surface: 'Artist row', slug: artist.name, url: '/artists/(missing slug)' })
    }
  }

  // ── Report ────────────────────────────────────────────────────────────

  console.log(`\nChecked ${checked} internal link targets across ${CITIES.length} city pages + homepage + listing page.`)
  console.log(`Empty event slugs in sampled pools: ${emptyEventSlugs}`)
  console.log(`Empty artist slugs: ${emptyArtistSlugs}`)

  if (broken.length === 0) {
    console.log('\n✅ No broken internal links found.')
    process.exit(0)
  }

  console.log(`\n❌ ${broken.length} broken internal link(s) found:\n`)
  for (const b of broken) {
    console.log(`  [${b.surface}] ${b.url}  (slug: ${b.slug})`)
  }
  process.exit(1)
}

main().catch(err => {
  console.error('Link-health check failed to run:', err)
  process.exit(1)
})
