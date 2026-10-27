import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.theshowfinder.com'

// Pages that are never worth crawling: admin, affiliate hops, embeds, per-event calendar files
// (10k+ bot hits a day on 22 Oct 2026), API routes and share images.
const NEVER_CRAWL = ['/admin', '/admin/', '/embed/', '/out/', '/go/', '/api/', '/events/*/calendar.ics', '/saved']

// Crawlers that only collect training data and never send visitors. Together they made about a third of
// all requests (22 Oct 2026: Meta 31k/day, ClaudeBot 12k, ShapBot 4k, Exa 4k, Amazonbot 4k, PetalBot 1k),
// and every one of those hits rebuilds an event page on Vercel. Search engines and AI *search* crawlers
// (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Applebot,
// DuckDuckBot) stay allowed: they are how people find the site.
const TRAINING_ONLY = [
  'meta-externalagent', 'ClaudeBot', 'GPTBot', 'CCBot', 'Bytespider', 'Amazonbot',
  'ShapBot', 'PetalBot', 'ExaBot', 'exasearchbot', 'Diffbot', 'ImagesiftBot', 'omgili', 'Timpibot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: TRAINING_ONLY, disallow: '/' },
      // Share images are the page's picture in search results and link previews, so they stay crawlable.
      { userAgent: '*', allow: ['/', '/api/share-image/'], disallow: NEVER_CRAWL },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
