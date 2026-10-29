// Advertiser numbers for a month: clicks to their website / booking page (real visitors only), vouchers claimed and
// used, and how many show pages they appear on. Used by the monthly summary to hello@ (cron) and by the
// "Send report" button on /admin/local-businesses: reports go to an advertiser only when Chris chooses to send one.
import { createAdminClient } from '@/lib/supabase/admin'
import { listedEventsCount } from '@/lib/listedEvents'
import type { MonthlyStats } from '@/lib/advertiserEmails'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function previousMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { start, end, label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

export async function businessMonthStats(b: { id: string; name: string; city: string; package: string; offer_text: string | null }, month = previousMonth(), cityPages?: Map<string, number>): Promise<MonthlyStats> {
  const db = createAdminClient() as any
  const range = (q: any) => q.eq('business_id', b.id).gte('created_at', month.start.toISOString()).lt('created_at', month.end.toISOString())
  const [web, book, claimed, used] = await Promise.all([
    range(db.from('business_clicks').select('id', { count: 'exact', head: true })).eq('kind', 'website').eq('human', true),
    range(db.from('business_clicks').select('id', { count: 'exact', head: true })).eq('kind', 'booking').eq('human', true),
    range(db.from('business_vouchers').select('id', { count: 'exact', head: true })),
    range(db.from('business_vouchers').select('id', { count: 'exact', head: true })).not('redeemed_at', 'is', null),
  ])
  let pages = cityPages?.get(b.city)
  if (pages === undefined) {
    pages = (await listedEventsCount(db, { city: b.city })).count ?? 0
    cityPages?.set(b.city, pages)
  }
  return {
    businessName: b.name, city: b.city, featured: b.package === 'featured', monthLabel: month.label,
    showPages: pages, websiteClicks: web.count ?? 0, bookingClicks: book.count ?? 0,
    vouchersClaimed: claimed.count ?? 0, vouchersUsed: used.count ?? 0, hasOffer: !!b.offer_text,
  }
}
