import { createAdminClient } from '@/lib/supabase/admin'
import { gunzipSync } from 'node:zlib'
import { parseSeeTicketsCsv, type SeeTicketsRow } from './seeTicketsCsv'

const UK_COUNTRIES = new Set(['uk', 'gb', 'great britain', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland'])

export type SeeTicketsSyncResult = {
  fetched: number
  eligible: number
  inserted: number
  updated: number
  skipped: number
  errors: number
  durationMs: number
}

function inWindow(eventDate: string | null, from: Date, to: Date) {
  if (!eventDate) return false
  const date = new Date(`${eventDate}T23:59:59Z`)
  return !Number.isNaN(date.getTime()) && date >= from && date <= to
}

function rowChanged(next: SeeTicketsRow, existing: SeeTicketsRow) {
  return JSON.stringify(next) !== JSON.stringify(existing)
}

function dateAfterMonths(months: number) {
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date
}

export async function syncSeeTicketsCatalogue(from = new Date(), to = dateAfterMonths(24)): Promise<SeeTicketsSyncResult> {
  const started = Date.now()
  const feedUrl = process.env.SEE_TICKETS_FEED_URL
  if (!feedUrl) throw new Error('Missing SEE_TICKETS_FEED_URL')
  const response = await fetch(feedUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`See Tickets feed returned ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const body = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes).toString('utf8')
    : bytes.toString('utf8')
  const rows = parseSeeTicketsCsv(body)
  const eligibleRows = rows.filter(row => {
    const country = (row.country ?? '').toLowerCase()
    return (!country || UK_COUNTRIES.has(country)) && inWindow(row.event_date, from, to)
  })
  const db = createAdminClient()
  const ids = eligibleRows.map(row => row.id)
  const existingById = new Map<string, SeeTicketsRow>()
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await db.from('see_tickets_catalogue_events').select('id, merchant_product_id, name, event_date, venue, city, country, primary_artist, second_artist, genre, url, availability_status, available_from, valid_from, valid_to, min_price, max_price, raw').in('id', ids.slice(index, index + 500))
    if (error) throw new Error(`Could not read the See Tickets catalogue: ${error.message}`)
    for (const row of (data ?? []) as unknown as SeeTicketsRow[]) existingById.set(row.id, row)
  }
  let inserted = 0; let updated = 0; let skipped = 0; let errors = 0
  for (let index = 0; index < eligibleRows.length; index += 100) {
    const batch = eligibleRows.slice(index, index + 100)
    const changed = batch.filter(row => !existingById.has(row.id) || rowChanged(row, existingById.get(row.id)!))
    skipped += batch.length - changed.length
    if (!changed.length) continue
    const { data, error } = await db.from('see_tickets_catalogue_events').upsert(changed.map(row => ({ ...row, last_seen_at: new Date().toISOString() })), { onConflict: 'id', ignoreDuplicates: false }).select('id')
    if (error) { errors += changed.length; console.error(`[see-tickets] catalogue batch failed: ${error.message}`); continue }
    const written = new Set((data ?? []).map(row => row.id))
    inserted += changed.filter(row => !existingById.has(row.id) && written.has(row.id)).length
    updated += changed.filter(row => existingById.has(row.id) && written.has(row.id)).length
  }
  return { fetched: rows.length, eligible: eligibleRows.length, inserted, updated, skipped, errors, durationMs: Date.now() - started }
}
