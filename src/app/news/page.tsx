export const revalidate = 3600

import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NEWS_HUB_SLUG } from '@/lib/cityNews'
import { rankCityNewsForDisplay } from '@/lib/newsPublishing'
import NewsCardGrid from '@/components/NewsCardGrid'
import { jsonLdScript, buildItemListSchema } from '@/lib/jsonld'
import type { CityNews } from '@/lib/types/database'

const NEWS_OG_IMAGE = 'https://www.theshowfinder.com/og-image.png'

export const metadata: Metadata = {
  title:       'Latest News — Tour Announcements & Ticket News',
  description: 'The latest UK concert, theatre, comedy and sports news — presale windows, on-sale dates and tour announcements, curated by TheShowFinder.',
  alternates:  { canonical: 'https://www.theshowfinder.com/news' },
  openGraph: {
    title:       'Latest News | TheShowFinder',
    description: 'The latest UK concert, theatre, comedy and sports news — presale windows, on-sale dates and tour announcements, curated by TheShowFinder.',
    url:         'https://www.theshowfinder.com/news',
    images:      [{ url: NEWS_OG_IMAGE, width: 1200, height: 630, alt: 'Latest News | TheShowFinder' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Latest News | TheShowFinder',
    description: 'The latest UK concert, theatre, comedy and sports news — presale windows, on-sale dates and tour announcements, curated by TheShowFinder.',
    images:      [NEWS_OG_IMAGE],
  },
}

// This is TheShowFinder's own editorial news hub — distinct from event
// search and affiliate ticket listings (/events, /on-sale-this-week, city
// pages' ticket panels). It shows only city_news rows explicitly published
// here (news_candidates.publish_to_news_page, migration_029), via the
// News Intelligence Inbox admin at /admin/news. Nothing here is generated
// from Ticketmaster event data or on-sale windows — see /on-sale-this-week
// for that feed instead.
//
// city_slug = NEWS_HUB_SLUG is never written to by the daily RSS sync
// (src/lib/cityNews.ts only iterates CITIES + the national feed), so every
// row here is editorial by construction — no is_editorial filter needed,
// though every row this query returns will have it set to true anyway.
export default async function NewsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('city_news')
    .select('*')
    .eq('city_slug', NEWS_HUB_SLUG)
    .order('published_at', { ascending: false })
    .limit(100) as unknown as { data: CityNews[] | null }

  // Same recency-ranking contract city pages/homepage use (see
  // rankCityNewsForDisplay in newsPublishing.ts) — redundant with the
  // query's own ORDER BY today, but keeps this page's ranking explicit
  // and unit-tested rather than implicit in a Supabase query string.
  const items = rankCityNewsForDisplay(data ?? [], 100)

  const itemListSchema = buildItemListSchema(items.map(i => ({ name: i.headline, url: i.url })))

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      {items.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListSchema) }}
        />
      )}
      <div style={{ backgroundColor: '#1A1A2E' }} className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: '#026CDF' }}>
            Ticket news
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            Latest News
          </h1>
          <p className="text-white/60 text-base max-w-2xl">
            Tour announcements, presale windows and on-sale news for UK concerts, theatre, comedy and sports — curated by TheShowFinder.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {items.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-6xl mb-4">📰</p>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">No news right now</h2>
            <p className="text-slate-500">Check back soon.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-6">
              {items.length} stor{items.length !== 1 ? 'ies' : 'y'}
            </p>
            <NewsCardGrid items={items} context="news-page" />
          </>
        )}
      </div>
    </div>
  )
}
