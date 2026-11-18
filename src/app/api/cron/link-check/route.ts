import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { fetchHtml } from '@/lib/siteContact'
import { linksToUs, pagesToCheck } from '@/lib/linkOutreach'
import { linkDb } from '@/lib/linkOutreachSend'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Backlink outreach, results (vercel.json: daily). Looks at the websites we've emailed (home page plus up to five
// "what's on / events / links" pages) for a link to theshowfinder.com, and marks the ones that now link to us.
// Each site is checked at most every 3 days, for 60 days after the email.
const UA = 'TheShowFinderBot/1.0 (+https://www.theshowfinder.com/widgets; partners@theshowfinder.com)'
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = linkDb()
  const started = Date.now()
  const stale = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const { data } = await db.from('link_prospects').select('id, name, website, checked_at').in('status', ['sent', 'followed_up', 'replied']).gte('sent_at', since).not('website', 'is', null)
    .or(`checked_at.is.null,checked_at.lt.${stale}`).order('checked_at', { ascending: true, nullsFirst: true }).limit(15)
  const linked: Loose[] = []
  let checked = 0
  for (const r of (data ?? []) as Loose[]) {
    if (Date.now() - started > 45_000) break
    const home = await fetchHtml(r.website, UA)
    let url = home ? linksToUs(home) : null
    let where = r.website
    if (home && !url) {
      for (const page of pagesToCheck(home, r.website)) {
        const html = await fetchHtml(page, UA, 6000)
        if (html && (url = linksToUs(html))) { where = page; break }
      }
    }
    const now = new Date().toISOString()
    checked++
    if (url) {
      await db.from('link_prospects').update({ status: 'linked', linked_at: now, link_url: where, checked_at: now, updated_at: now }).eq('id', r.id)
      linked.push({ name: r.name, page: where })
    } else await db.from('link_prospects').update({ checked_at: now }).eq('id', r.id)
  }
  return NextResponse.json({ success: true, checked, linked })
}

export const GET = withJobRun('link-check', handleGet)
