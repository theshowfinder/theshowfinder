import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { readSiteContact } from '@/lib/siteContact'
import { buildLinkEmail, domainOf, isOwnSite, SITE, type LinkProspect } from '@/lib/linkOutreach'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Backlink outreach, finding side (vercel.json: every 15 minutes, 07:00-21:00 every day). Each run takes the busiest venues we list that
// haven't been looked at (link_venue_targets: 3+ upcoming shows), finds the venue's own website on OpenStreetMap's
// place search (our venue "website" is only its Ticketmaster page), reads it for a general email, and drafts the email.
// Venues only (organisers get ticket-selling outreach instead). Drafts wait as "ready" for Chris in /admin/backlinks;
// nothing is sent from here. ?dry=1 reports without writing.
const UA = 'TheShowFinderBot/1.0 (+https://www.theshowfinder.com/widgets; partners@theshowfinder.com)'
const VENUES_PER_RUN = 10
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

/** The venue's own website from OpenStreetMap (Nominatim, with extratags), matched by name near its location. */
async function venueWebsite(v: { name: string; city: string | null; lat: number | null; lng: number | null }): Promise<string | null> {
  const q = encodeURIComponent(`${v.name}, ${v.city ?? ''}`)
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=5&countrycodes=gb&extratags=1`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) })
    if (!r.ok) return null
    for (const x of (await r.json()) as Loose[]) {
      // A building or place of business, not a county or city with the same name ("West Midlands").
      if (['boundary', 'place', 'highway', 'landuse', 'natural', 'railway'].includes(x.category)) continue
      const site = x.extratags?.website || x.extratags?.['contact:website'] || x.extratags?.url
      if (!site || !isOwnSite(site)) continue
      // Same place: within ~2km of where we have the venue (when we know it).
      if (v.lat != null && v.lng != null && Math.hypot(Number(x.lat) - v.lat, (Number(x.lon) - v.lng) * Math.cos(v.lat * Math.PI / 180)) > 0.02) continue
      return /^https?:\/\//i.test(site) ? site : `https://${site}`
    }
  } catch { /* none */ }
  return null
}

async function suppressed(db: Loose, email: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    db.from('outreach_prospects').select('id').eq('email', email).eq('status', 'unsubscribed').limit(1),
    db.from('link_prospects').select('id').eq('email', email).in('status', ['unsubscribed', 'declined']).limit(1),
  ])
  return !!(a.data?.length || b.data?.length)
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const db = createAdminClient() as Loose
  const started = Date.now()
  const report: Loose[] = []

  // Small and mid-size venues first (5-80 shows): independents run their own sites and are the likeliest to say yes;
  // the big West End theatres and arenas (owned by large groups) come after.
  let { data: venues } = await db.from('link_venue_targets').select('*').gte('shows', 5).lte('shows', 80).neq('name', 'None').order('shows', { ascending: false }).limit(VENUES_PER_RUN)
  if (!venues?.length) ({ data: venues } = await db.from('link_venue_targets').select('*').neq('name', 'None').order('shows', { ascending: false }).limit(VENUES_PER_RUN))
  for (const v of (venues ?? []) as Loose[]) {
    if (Date.now() - started > 40_000) break
    const row: Loose = { kind: 'venue', name: v.name, city: v.city, venue_id: v.id, shows: v.shows, page_url: `${SITE}/venues/${v.slug}`, pitch: 'widget' }
    const site = await venueWebsite(v)
    await new Promise(r => setTimeout(r, 1100))   // Nominatim: one request a second
    if (!site) { report.push({ ...row, status: 'no_site' }); if (!dry) await db.from('link_prospects').insert({ ...row, status: 'no_site' }); continue }
    row.website = site; row.domain = domainOf(site)
    // One email per website: venue groups share a site.
    const { data: same } = await db.from('link_prospects').select('id, name').eq('domain', row.domain).limit(1)
    if (same?.length) { report.push({ ...row, status: 'skipped' }); if (!dry) await db.from('link_prospects').insert({ ...row, status: 'skipped', notes: `Same website as ${same[0].name}` }); continue }
    const contact = await readSiteContact(site, v.city ?? '', UA)
    if (!contact.email || await suppressed(db, contact.email)) {
      report.push({ ...row, status: 'no_email' })
      if (!dry) await db.from('link_prospects').insert({ ...row, status: 'no_email', company_number: contact.company?.number ?? null })
      continue
    }
    row.email = contact.email; row.company_number = contact.company?.number ?? null
    const draft = buildLinkEmail({ ...row, id: '', contact_name: null, unsubscribe_token: '{token}', venue_slug: v.slug } as LinkProspect, 'first')
    report.push({ ...row, status: 'ready', subject: draft.subject })
    if (!dry) await db.from('link_prospects').insert({ ...row, status: 'ready', subject: draft.subject })
  }

  // Organisers are not contacted here: selling tickets has its own outreach (cron ticket-outreach, /admin/organisers).
  return NextResponse.json({ success: true, dry, found: report.length, ready: report.filter(r => r.status === 'ready').length, report: report.map(r => ({ kind: r.kind, name: r.name, status: r.status, website: r.website ?? null, email: r.email ?? null })) })
}

export const GET = withJobRun('link-find', handleGet)
