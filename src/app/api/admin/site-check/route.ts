import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const SITE = 'https://www.theshowfinder.com'
const CONCURRENCY = 8
const MAX_BATCH = 200

// GET: every URL in the live sitemap. POST {urls}: request each one (never following redirects) and
// report anything that is not a plain 200, plus event pages that render as "This event has passed".
// The admin morning clean-up calls these in batches, so no single request is long.
export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const res = await fetch(`${SITE}/sitemap.xml`, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: `sitemap returned ${res.status}` }, { status: 502 })
  const xml = await res.text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
  return NextResponse.json({ urls })
}

interface Problem { url: string; status: number | string; note?: string }

async function checkOne(url: string): Promise<Problem | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'TheShowFinderSiteCheck/1.0' } })
    if (res.status !== 200) return { url, status: res.status, note: res.status >= 300 && res.status < 400 ? `redirects to ${res.headers.get('location') ?? '?'}` : undefined }
    if (url.includes('/events/')) {
      const html = await res.text()
      if (html.includes('This event has passed')) return { url, status: 200, note: 'shows "This event has passed"' }
    } else {
      await res.arrayBuffer().catch(() => null)
    }
    return null
  } catch (e) {
    return { url, status: 'error', note: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: Request) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { urls } = await request.json().catch(() => ({})) as { urls?: unknown }
  if (!Array.isArray(urls) || urls.length > MAX_BATCH || urls.some(u => typeof u !== 'string' || !(u === SITE || u.startsWith(`${SITE}/`)))) {
    return NextResponse.json({ error: 'Send up to 200 theshowfinder.com URLs' }, { status: 400 })
  }
  const problems: Problem[] = []
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < urls.length) {
      const url = urls[next++] as string
      const problem = await checkOne(url)
      if (problem) problems.push(problem)
    }
  }))
  return NextResponse.json({ checked: urls.length, problems })
}
