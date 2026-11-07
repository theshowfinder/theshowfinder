import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Read-only look at the StubHub International Event Catalog on Impact (catalog 17571):
// which fields it has, a few raw items, and the commonest values per field (to find country / city / date).
// Writes nothing. Admin only.
const CATALOG_ID = process.env.STUBHUB_IMPACT_CATALOG_ID || '17571'

type Item = Record<string, unknown>

export async function GET(request: Request) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const sid = process.env.IMPACT_ACCOUNT_SID
  const token = process.env.IMPACT_AUTH_TOKEN
  if (!sid || !token) return NextResponse.json({ error: 'IMPACT_ACCOUNT_SID / IMPACT_AUTH_TOKEN not set' }, { status: 500 })
  const maxPages = Math.min(Number(new URL(request.url).searchParams.get('pages') || '30'), 40)
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
  const deadline = Date.now() + 100_000
  const values = new Map<string, Map<string, number>>()
  const samples: Item[] = []
  const ukSamples: Item[] = []
  let scanned = 0; let pages = 0; let numPages: unknown = null; let total: unknown = null
  let next: string | null = `/Mediapartners/${sid}/Catalogs/${CATALOG_ID}/Items?PageSize=1000&Page=1`
  const errors: string[] = []
  while (next && pages < maxPages && Date.now() < deadline) {
    const res = await fetch(`https://api.impact.com${next}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) { errors.push(`${res.status} ${(await res.text()).slice(0, 300)}`); break }
    const body = await res.json() as Record<string, unknown>
    pages++
    numPages = body['@numpages'] ?? numPages; total = body['@total'] ?? total
    const items = (body.Items ?? []) as Item[]
    for (const item of items) {
      scanned++
      if (samples.length < 3) samples.push(item)
      const flat = JSON.stringify(item).toLowerCase()
      if (ukSamples.length < 5 && /(united kingdom|"gb"|london|manchester|glasgow)/.test(flat)) ukSamples.push(item)
      for (const [k, v] of Object.entries(item)) {
        if (v === null || v === '' || typeof v === 'object') continue
        const s = String(v).slice(0, 60)
        const m = values.get(k) ?? new Map<string, number>()
        if (m.size < 400 || m.has(s)) m.set(s, (m.get(s) ?? 0) + 1)
        values.set(k, m)
      }
    }
    const nu = body['@nextpageuri']
    next = typeof nu === 'string' && nu ? nu : null
  }
  const fields = Object.fromEntries([...values.entries()].map(([k, m]) => [k, {
    distinct: m.size >= 400 ? '400+' : m.size,
    top: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${n} × ${v}`),
  }]))
  return NextResponse.json({ catalog: CATALOG_ID, total, numPages, pagesRead: pages, scanned, finished: !next, errors, fields, samples, ukSamples })
}
