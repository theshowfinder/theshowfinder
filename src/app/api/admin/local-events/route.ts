import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCouncilEvents, probeCandidateSource, slugKey, type CandidateSource } from '@/lib/councilEvents'
import { CITIES } from '@/lib/cities'
import { isHtmlParser } from '@/lib/localEventHtml'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface Body {
  action?: 'refresh' | 'clean' | 'test' | 'add' | 'toggle'
  city?: string
  key?: string
  enabled?: boolean
  label?: string
  base_url?: string
  discovery?: 'listing' | 'sitemap'
  discovery_url?: string
  detail_pattern?: string
  sitemap_child_pattern?: string
  page_param?: string
  page_size?: number
  parser?: string
}

function candidateFrom(b: Body): CandidateSource | string {
  if (!b.discovery_url || !/^https?:\/\//.test(b.discovery_url)) return 'Enter the full address of the listing page or sitemap (starting https://).'
  if (b.discovery !== 'listing' && b.discovery !== 'sitemap') return 'Choose listing page or sitemap.'
  if (!b.detail_pattern) return 'Enter the pattern the event page addresses match, e.g. ^/event/[^/]+/$'
  try { new RegExp(b.detail_pattern) } catch { return 'That pattern is not a valid regular expression.' }
  const u = new URL(b.discovery_url)
  return {
    base_url: u.origin,
    discovery: b.discovery,
    discovery_url: u.pathname + u.search,
    detail_pattern: b.detail_pattern,
    sitemap_child_pattern: b.sitemap_child_pattern || null,
    page_param: b.page_param || null,
    page_size: b.page_size ?? null,
    parser: isHtmlParser(b.parser) ? b.parser : 'jsonld',
  }
}

export async function POST(request: Request) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const body = (await request.json().catch(() => ({}))) as Body
  const started = Date.now()

  try {
    if (body.action === 'refresh' || body.action === 'clean') {
      const result = await syncCouncilEvents({ city: body.city, key: body.key, action: body.action, budgetMs: 250_000 })
      return NextResponse.json({ ok: true, ms: Date.now() - started, ...result })
    }

    if (body.action === 'toggle') {
      if (!body.key) return NextResponse.json({ error: 'No source given' }, { status: 400 })
      await (createAdminClient() as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
        .from('local_event_sources').update({ enabled: !!body.enabled }).eq('key', body.key)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'test' || body.action === 'add') {
      if (!body.city || !CITIES.some(c => c.name === body.city)) return NextResponse.json({ error: 'Choose one of our cities.' }, { status: 400 })
      const candidate = candidateFrom(body)
      if (typeof candidate === 'string') return NextResponse.json({ error: candidate }, { status: 400 })
      const probe = await probeCandidateSource(candidate, body.city)

      if (body.action === 'test') return NextResponse.json({ ok: true, probe })

      const working = probe.sample.filter(s => s.ok).length
      if (probe.discovered === 0 || working === 0) {
        return NextResponse.json({ error: 'Not saved: the test found no readable events on that site. Run "Test" and check the result first.', probe }, { status: 422 })
      }
      const label = (body.label || '').trim() || `${body.city} events`
      const key = `${slugKey(body.city)}_${slugKey(label)}`.slice(0, 60)
      const { error } = await (createAdminClient() as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<{ error: { message: string } | null }> } })
        .from('local_event_sources').insert({
          key, city: body.city, label, event_source: `${slugKey(body.city)}_council`, ...candidate,
          max_pages: 8, max_details_per_run: 300, enabled: true,
        })
      if (error) return NextResponse.json({ error: error.message, probe }, { status: 400 })
      return NextResponse.json({ ok: true, saved: key, probe })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
