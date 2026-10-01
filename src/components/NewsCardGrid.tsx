'use client'

import type { CityNews } from '@/lib/types/database'
import { trackEvent } from '@/lib/gtag'
import { buildNewsClickEvent } from '@/lib/analytics'

// "Today" / "X days ago" for a news item's published_at.
function fmtNewsAge(publishedAt: string | null): string {
  if (!publishedAt) return ''
  const days = Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// Shared news-card grid — used by the city page's local news section, the
// homepage's national news section, and the /news hub, so the card design
// only lives once. `context` identifies which of those pages rendered it
// (fulfils Phase 5A's "Article views" measurement — these cards link
// straight out to the external publisher, so there's no internal article
// page to log a pageview for; the click itself is the signal, fired as a
// GA4 'news_click' custom event). Client component only because of that
// click handler — the markup itself is unchanged.
export default function NewsCardGrid({ items, context }: { items: CityNews[]; context: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {items.map(item => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => trackEvent('news_click', buildNewsClickEvent({ destination: item.url, context }))}
          className="block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5"
        >
          <h3 className="font-bold text-slate-900 text-base leading-snug mb-2 hover:text-red-600 transition-colors">
            {item.headline}
          </h3>
          <p className="text-xs text-slate-400">
            {item.source ?? 'News'}
            {item.published_at && ` · ${fmtNewsAge(item.published_at)}`}
          </p>
        </a>
      ))}
    </div>
  )
}
