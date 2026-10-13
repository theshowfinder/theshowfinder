// Details for the shows saved in a visitor's browser: GET /api/saved?slugs=a,b,c
// Only slugs are ever sent (no personal data). Past shows are left out.
import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { isValidSlug } from '@/lib/savedShows'

export const dynamic = 'force-dynamic'

const MAX = 60

export interface SavedEventRow {
  id: string
  slug: string
  title: string
  start_date: string
  status: string
  category: string
  image_url: string | null
  onsale_date: string | null
  venue_name: string | null
  venue_city: string | null
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('slugs') ?? ''
  const slugs = [...new Set(raw.split(',').map(s => s.trim()).filter(isValidSlug))].slice(0, MAX)
  if (slugs.length === 0) return NextResponse.json({ events: [] })

  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data, error } = await createPublicClient()
    .from('events_with_venue')
    .select('id, slug, title, start_date, status, category, image_url, onsale_date, venue_name, venue_city')
    .in('slug', slugs)
    .gte('start_date', since) as unknown as { data: SavedEventRow[] | null; error: { message: string } | null }

  if (error) return NextResponse.json({ error: 'Could not load saved shows' }, { status: 500 })
  const events = (data ?? []).sort((a, b) => a.start_date.localeCompare(b.start_date))
  return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } })
}
