import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { withJobRun } from '@/lib/jobRuns'
import { geocodeVenues } from '@/lib/venueGeocode'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Nightly (vercel.json) and from /admin/health: gives venues without a map position one (src/lib/venueGeocode.ts).
// ?dry=1 reports what it would set without writing.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  try {
    const result = await geocodeVenues({ deadlineMs: Date.now() + 270_000, dryRun })
    const placed = result.fromPostcode + result.fromAddressPostcode + result.fromSameVenue + result.fromSearch
    // Venue pages show nearby partners and distances: rebuild them when positions changed.
    if (!dryRun && placed > 0) revalidatePath('/venues/[slug]', 'page')
    return NextResponse.json({ success: true, dryRun, placed, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('geocode-venues', handleGet)
