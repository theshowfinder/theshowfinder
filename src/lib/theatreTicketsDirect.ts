// Theatre Tickets Direct (Awin advertiser 1936): download the product feed (THEATRE_TICKETS_DIRECT_FEED_URL, an Awin
// Create-a-Feed CSV link) and keep it in ttd_catalogue. Products missing from today's feed are marked gone.
import { gunzipSync } from 'node:zlib'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseCsv } from '@/lib/seeTicketsCsv'

const num = (v: string | undefined) => { const n = Number((v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }

export async function syncTheatreTicketsDirect() {
  const feedUrl = process.env.THEATRE_TICKETS_DIRECT_FEED_URL
  if (!feedUrl) throw new Error('Missing THEATRE_TICKETS_DIRECT_FEED_URL')
  const res = await fetch(feedUrl, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Theatre Tickets Direct feed returned ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const body = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')
  const [header, ...lines] = parseCsv(body)
  if (!header?.length) throw new Error('Theatre Tickets Direct feed was empty')
  const cols = header.map(h => h.trim())
  const records = lines.map(cells => Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()])))
  const now = new Date().toISOString()
  const rows = records
    .filter(r => r.aw_product_id && r.product_name)
    .map(r => ({
      id: r.aw_product_id,
      name: r.product_name,
      url: r.aw_deep_link || null,
      merchant_url: r.merchant_deep_link || null,
      price: num(r.search_price) ?? num(r.store_price) ?? num(r.display_price),
      image_url: r.merchant_image_url || r.aw_image_url || null,
      category: r.merchant_category || r.category_name || null,
      raw: r,
      last_seen_at: now,
      gone_at: null,
    }))
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const db = createAdminClient() as any
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('ttd_catalogue').upsert(rows.slice(i, i + 200), { onConflict: 'id' })
    if (error) throw new Error(`save feed: ${error.message}`)
  }
  let gone = 0
  if (rows.length > 20) {
    const { data } = await db.from('ttd_catalogue').update({ gone_at: now }).lt('last_seen_at', now).is('gone_at', null).select('id')
    gone = data?.length ?? 0
  }
  return { columns: cols, products: rows.length, gone, sample: rows.slice(0, 3).map(r => ({ name: r.name, price: r.price, category: r.category })) }
}
