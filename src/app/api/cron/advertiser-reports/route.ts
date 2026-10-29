import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listedEventsCount } from '@/lib/listedEvents'
import { sendMonthlyReport, type MonthlyStats } from '@/lib/advertiserEmails'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Monthly advertiser report (1st of the month, vercel.json): for every live listing with an advertiser contact,
// last month's clicks to their website / booking page (real visitors only), vouchers claimed and used, and how many
// show pages they appear on. A copy goes to hello@. Each advertiser gets one report a month (last_report_at), so a
// re-run never sends twice. ?dry=1 returns the numbers without sending anything.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const db = createAdminClient() as any
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const monthLabel = prevStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const { data: rows, error } = await db.from('local_businesses')
    .select('id, name, city, package, offer_text, status, account:local_business_accounts(contact_email, last_report_at)')
    .eq('status', 'active')
  if (error) throw new Error(error.message)

  const cityPages = new Map<string, number>()
  const results: Array<{ business: string; sent: boolean; reason?: string; stats?: MonthlyStats }> = []
  for (const b of rows ?? []) {
    const acc = Array.isArray(b.account) ? b.account[0] : b.account
    if (!acc?.contact_email || acc.contact_email === 'hello@theshowfinder.com') { results.push({ business: b.name, sent: false, reason: 'no advertiser email' }); continue }
    if (!dry && acc.last_report_at && new Date(acc.last_report_at) >= monthStart) { results.push({ business: b.name, sent: false, reason: 'already sent this month' }); continue }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const range = (q: any) => q.eq('business_id', b.id).gte('created_at', prevStart.toISOString()).lt('created_at', monthStart.toISOString())
    const [web, book, claimed, used] = await Promise.all([
      range(db.from('business_clicks').select('id', { count: 'exact', head: true })).eq('kind', 'website').eq('human', true),
      range(db.from('business_clicks').select('id', { count: 'exact', head: true })).eq('kind', 'booking').eq('human', true),
      range(db.from('business_vouchers').select('id', { count: 'exact', head: true })),
      range(db.from('business_vouchers').select('id', { count: 'exact', head: true })).not('redeemed_at', 'is', null),
    ])
    if (!cityPages.has(b.city)) cityPages.set(b.city, (await listedEventsCount(db, { city: b.city })).count ?? 0)
    const stats: MonthlyStats = {
      businessName: b.name, city: b.city, featured: b.package === 'featured', monthLabel,
      showPages: cityPages.get(b.city) ?? 0,
      websiteClicks: web.count ?? 0, bookingClicks: book.count ?? 0,
      vouchersClaimed: claimed.count ?? 0, vouchersUsed: used.count ?? 0,
      hasOffer: !!b.offer_text,
    }
    if (dry) { results.push({ business: b.name, sent: false, reason: 'dry run', stats }); continue }
    try {
      await sendMonthlyReport(acc.contact_email, stats)
      await db.from('local_business_accounts').update({ last_report_at: now.toISOString() }).eq('business_id', b.id)
      results.push({ business: b.name, sent: true })
    } catch (err) {
      results.push({ business: b.name, sent: false, reason: err instanceof Error ? err.message : String(err) })
    }
  }
  return NextResponse.json({ success: true, dry, month: monthLabel, sent: results.filter(r => r.sent).length, results })
}

export const GET = withJobRun('advertiser-reports', handleGet)
