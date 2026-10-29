import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { businessMonthStats, previousMonth } from '@/lib/advertiserReports'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Monthly advertiser summary (1st of the month, vercel.json). Goes to hello@ ONLY: every live advertiser's numbers
// for last month, so Chris can see who to contact and whose numbers are worth sending. Nothing is emailed to
// advertisers automatically; a report goes to an advertiser only via "Send report" on /admin/local-businesses.
// ?dry=1 returns the numbers without emailing.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const db = createAdminClient() as any
  const month = previousMonth()
  const { data: rows, error } = await db.from('local_businesses').select('id, name, city, package, offer_text').eq('status', 'active').order('city')
  if (error) throw new Error(error.message)
  const cityPages = new Map<string, number>()
  const stats = []
  for (const b of rows ?? []) stats.push(await businessMonthStats(b, month, cityPages))

  const lines = stats.map(s => `${s.businessName} (${s.city}, ${s.featured ? 'Featured' : 'Standard'}): website ${s.websiteClicks}, booking ${s.bookingClicks}, vouchers ${s.vouchersClaimed} claimed / ${s.vouchersUsed} used${s.hasOffer ? '' : ' · no offer yet'}`)
  const text = [`Advertiser numbers for ${month.label}`, '', ...(lines.length ? lines : ['No live advertisers.']), '', 'Nothing has been sent to advertisers. To send someone their report, use "Send report" on https://www.theshowfinder.com/admin/local-businesses', 'Monthly check-in: contact every advertiser this week (and line up their social media posts).'].join('\n')
  if (!dry && stats.length) {
    const { error: mailErr } = await resend.emails.send({ from: FROM_EMAIL, to: 'hello@theshowfinder.com', subject: `Advertiser numbers: ${month.label}`, text })
    if (mailErr) throw new Error(`summary email: ${JSON.stringify(mailErr)}`)
  }
  return NextResponse.json({ success: true, dry, month: month.label, advertisers: stats.length, stats })
}

export const GET = withJobRun('advertiser-reports', handleGet)
