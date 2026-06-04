import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

const BASE = 'https://www.theshowfinder.com'

const CITIES = [
  'London','Manchester','Birmingham','Glasgow','Edinburgh','Leeds','Liverpool',
  'Bristol','Cardiff','Belfast','Nottingham','Newcastle','Leicester','Sheffield',
  'Derby','Coventry','Southampton','Portsmouth','Norwich','Brighton','Oxford',
  'Cambridge','Exeter','Plymouth','Hull','Middlesbrough','Sunderland','Bradford',
  'Reading','Milton Keynes','Bournemouth','Ipswich','Stoke-on-Trent','Wolverhampton',
  'Swansea','Aberdeen',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()
  const now      = new Date().toISOString()

  type SlugRow        = { slug: string }
  type SlugUpdatedRow = { slug: string; updated_at: string }

  const [eventsRes, venuesRes, artistsRes] = await Promise.all([
    supabase.from('events').select('slug, updated_at').gte('start_date', now).limit(5000) as unknown as Promise<{ data: SlugUpdatedRow[] | null }>,
    supabase.from('venues').select('slug').not('slug', 'is', null).limit(2000)            as unknown as Promise<{ data: SlugRow[] | null }>,
    supabase.from('artists').select('slug').limit(1000)                                    as unknown as Promise<{ data: SlugRow[] | null }>,
  ])

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE,                          lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/events`,              lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/on-sale-this-week`,   lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
  ]

  const cityPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE}/cities/${encodeURIComponent(city)}`,
    lastModified:    new Date(),
    changeFrequency: 'daily' as const,
    priority:        0.8,
  }))

  const eventPages: MetadataRoute.Sitemap = (eventsRes.data ?? []).map(e => ({
    url:             `${BASE}/events/${e.slug}`,
    lastModified:    new Date(e.updated_at),
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  }))

  const venuePages: MetadataRoute.Sitemap = (venuesRes.data ?? []).map(v => ({
    url:             `${BASE}/venues/${v.slug}`,
    lastModified:    new Date(),
    changeFrequency: 'weekly' as const,
    priority:        0.7,
  }))

  const artistPages: MetadataRoute.Sitemap = (artistsRes.data ?? []).map(a => ({
    url:             `${BASE}/artists/${a.slug}`,
    lastModified:    new Date(),
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  }))

  return [...staticPages, ...cityPages, ...eventPages, ...venuePages, ...artistPages]
}
