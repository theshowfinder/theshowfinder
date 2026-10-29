import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { withJobRun } from '@/lib/jobRuns'

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

  // Every city page (all 40, plus their this-week / this-weekend views),
  // the homepage, the browse page, venues and the sitemap.
  revalidatePath('/cities/[city]', 'page')
  revalidatePath('/cities/[city]/this-week', 'page')
  revalidatePath('/cities/[city]/this-weekend', 'page')
  revalidatePath('/venues/[slug]', 'page')
  revalidatePath('/events')
  revalidatePath('/')
  revalidatePath('/on-sale-this-week')
  revalidatePath('/sitemap.xml')

  return NextResponse.json({
    changedRows: data ?? 0,
    cityPagesRevalidated: CITIES.length,
    ms: Date.now() - started,
  })
}

export const GET = withJobRun('refresh-listings', handleGet)
