import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CITIES } from '@/lib/cities'
import type { EventWithVenue } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

// Backs LocalSpotlight.tsx — returns a handful of upcoming events for one of
// our 36 supported cities so the homepage can show real local content once
// middleware.ts + the tsf_city cookie have identified a visitor's city,
// without forcing the (ISR-cached) homepage itself to render dynamically.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawCity = searchParams.get('city') ?? ''

  const match = CITIES.find(c => c.name.toLowerCase() === rawCity.toLowerCase())
  if (!match) {
    return NextResponse.json({ events: [] }, { status: 400 })
  }

  const supabase = await createClient()
  const nowISO = new Date().toISOString()

  const { data } = await supabase
    .from('events_with_venue')
    .select('slug, title, start_date, venue_name, image_url, price_from, currency, category')
    .ilike('venue_city', match.name)
    .gte('start_date', nowISO)
    .order('start_date', { ascending: true })
    .limit(4) as unknown as {
      data: Pick<EventWithVenue, 'slug' | 'title' | 'start_date' | 'venue_name' | 'image_url' | 'price_from' | 'currency' | 'category'>[] | null
    }

  return NextResponse.json({ city: match.name, events: data ?? [] })
}
