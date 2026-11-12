import type { Metadata } from 'next'
import AdvertisingCityMockup, { type MockEvent, type MockOnSale } from '@/components/AdvertisingCityMockup'
import { foundingOfferOpen } from '@/lib/advertisingPackages'
import { prospectByRef } from '@/lib/outreachProspect'
import { CITIES } from '@/lib/cities'
import { createPublicClient } from '@/lib/supabase/public'
import { eventImageUrl, isGenericEventImage } from '@/lib/eventImages'
import type { EventCategory } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'City advertising mock-up',
  description: 'Private preview of TheShowFinder city advertising placements.',
  robots: { index: false, follow: false },
}

type Row = { title: string; venue_name: string | null; category: string; start_date: string; image_url: string | null; status: string; on_sale_this_week: boolean | null; newly_announced: boolean | null }
const LABEL: Record<string, string> = { concert: 'Live music', theatre: 'Theatre', comedy: 'Comedy', sports: 'Sport', family: 'Family', local: 'Things to do' }

/** That city's real upcoming shows: three soon ones with photos, and three on sale this week (or just announced). */
async function cityShows(city: string): Promise<{ events: MockEvent[]; onSale: MockOnSale[] }> {
  try {
    const db = createPublicClient()
    const { data } = await db.from('listed_events_with_venue')
      .select('title, venue_name, category, start_date, image_url, status, on_sale_this_week, newly_announced')
      .eq('venue_city', city).gte('start_date', new Date().toISOString()).not('status', 'in', '(cancelled,postponed)')
      .order('start_date', { ascending: true }).limit(150) as unknown as { data: Row[] | null }
    const rows = (data ?? []).filter(r => !isGenericEventImage(r.image_url))
    const seen = new Set<string>()
    const unique = rows.filter(r => { const k = r.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    const image = (r: Row) => eventImageUrl(r.image_url, r.category as EventCategory, r.title)
    const events = unique.filter(r => r.category !== 'local').slice(0, 3).map(r => ({ title: r.title, venue: r.venue_name ?? city, category: LABEL[r.category] ?? 'Live event', startIso: r.start_date, image: image(r) }))
    const used = new Set(events.map(e => e.title))
    const pool = [...unique.filter(r => r.on_sale_this_week), ...unique.filter(r => r.newly_announced), ...unique.slice(3)]
    const onSale: MockOnSale[] = []
    for (const r of pool) {
      if (onSale.length === 3) break
      if (used.has(r.title)) continue
      used.add(r.title)
      onSale.push({ title: r.title, detail: r.on_sale_this_week ? 'On sale this week' : r.newly_announced ? 'Just announced' : 'Tickets available', image: image(r) })
    }
    return { events, onSale }
  } catch {
    return { events: [], onSale: [] }
  }
}

// Opened from an outreach email (/p/<ref>), the business sees its own name in the first Featured slot, and the
// package buttons carry the code through so sign-up is pre-filled. Each city gets its own hero image and real shows.
export default async function AdvertisingMockupPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; ref?: string }>
}) {
  const params = await searchParams
  const prospect = await prospectByRef(params.ref)
  const asked = prospect?.city ?? params.city?.trim() ?? 'Manchester'
  const cityName = CITIES.find(c => c.name.toLowerCase() === asked.toLowerCase())?.name ?? 'Manchester'
  const heroImage = `/city-heroes/${cityName.toLowerCase().replace(/\s+/g, '-')}.webp`
  const { events, onSale } = await cityShows(cityName)
  return (
    <AdvertisingCityMockup
      cityName={cityName}
      heroImage={heroImage}
      events={events}
      onSale={onSale}
      preview={prospect ? { name: prospect.business_name, category: prospect.category } : null}
      refCode={prospect ? params.ref! : ''}
      founding={Boolean(prospect) && foundingOfferOpen()}
    />
  )
}
