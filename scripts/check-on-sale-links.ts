/**
 * Read-only internal link-health check.
 *
 * Catches the class of bug behind the "InPop card → 404" incident: a card
 * rendered on one surface (homepage, a city page, the On Sale This Week
 * listing) linking to /on-sale-this-week/[slug] or /events/[slug] when
 * that destination's own query logic doesn't actually resolve it — i.e.
 * the card-producing query and the destination-resolving query have drifted
 * out of sync.
 *
 * The actual checking logic lives in src/lib/linkHealth.ts and is shared
 * with the admin Daily Intelligence Dashboard's Quality Checks section —
 * this script is just the CLI wrapper: env loading, the connectivity
 * guard, and printing the report.
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
import type { Artist } from '../src/lib/types/database'
import { checkOnSaleLinkHealth } from '../src/lib/linkHealth'

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

async function main() {
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

  const report = await checkOnSaleLinkHealth(supabase, artists, CITIES)

  console.log(`Resolvable /on-sale-this-week/[slug] pool: ${report.resolvableSlugCount} slugs`)
  console.log(`\nChecked ${report.checked} internal link targets across ${CITIES.length} city pages + homepage + listing page.`)
  console.log(`Empty event slugs in sampled pools: ${report.emptyEventSlugs}`)
  console.log(`Empty artist slugs: ${report.emptyArtistSlugs}`)

  if (report.broken.length === 0) {
    console.log('\n✅ No broken internal links found.')
    process.exit(0)
  }

  console.log(`\n❌ ${report.broken.length} broken internal link(s) found:\n`)
  for (const b of report.broken) {
    console.log(`  [${b.surface}] ${b.url}  (slug: ${b.slug})`)
  }
  process.exit(1)
}

main().catch(err => {
  console.error('Link-health check failed to run:', err)
  process.exit(1)
})
