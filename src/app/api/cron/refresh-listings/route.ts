import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { withJobRun } from '@/lib/jobRuns'
import { revalidateChangedShowPages } from '@/lib/changedPages'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Runs after the Ticketmaster / See Tickets / Gigsberg import windows (see
// vercel.json). It does NOT touch any import code or data: it only
//   1. re-groups events into canonical listings (refresh_event_canonical(),
//      migration 056: premium / lounge packages and repeat source records for
//      the same artist + venue + day collapse into one canonical event), and
//   2. invalidates the cached pages whose event lists or counts depend on it,
//      so a freshly imported (or cancelled / past) event is reflected straight
//      away instead of waiting out the ISR window.
// City pages additionally revalidate every 30 minutes on their own and filter
// to future events at render time, so they can never keep serving past dates.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('refresh_event_canonical') as { data: number | null; error: { message: string } | null }
  if (error) {
    console.error('[refresh-listings] refresh_event_canonical failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Prices from the sellers that share them (migration 097): See Tickets face value, Gigsberg resale.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prices, error: priceError } = await (admin as any).rpc('refresh_event_prices') as { data: unknown; error: { message: string } | null }
  if (priceError) console.error('[refresh-listings] refresh_event_prices failed', priceError.message)
  // Theatre Tickets Direct links on London theatre shows (migration 100).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ttd, error: ttdError } = await (admin as any).rpc('refresh_ttd_links') as { data: unknown; error: { message: string } | null }
  if (ttdError) console.error('[refresh-listings] refresh_ttd_links failed', ttdError.message)

  // Every city page (all 40, plus their this-week / this-weekend views), the homepage, the browse page and the
  // sitemap. Event, artist and venue pages are rebuilt only where something on them changed.
  revalidatePath('/cities/[city]', 'page')
  revalidatePath('/cities/[city]/this-week', 'page')
  revalidatePath('/cities/[city]/this-weekend', 'page')
  const changedPages = await revalidateChangedShowPages(admin)
  revalidatePath('/events')
  revalidatePath('/')
  revalidatePath('/on-sale-this-week')
  revalidatePath('/sitemap.xml')

  return NextResponse.json({
    changedRows: data ?? 0,
    cityPagesRevalidated: CITIES.length,
    changedPages,
    prices: priceError ? { error: priceError.message } : prices,
    theatreTicketsDirect: ttdError ? { error: ttdError.message } : ttd,
    ms: Date.now() - started,
  })
}

export const GET = withJobRun('refresh-listings', handleGet)
