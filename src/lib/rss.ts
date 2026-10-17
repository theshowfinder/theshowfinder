// Minimal RSS 2.0 builder for syndication feeds (local blogs, newsletter tools,
// feed readers). Pure so it can be unit tested with `node --test`.

export interface RssItem {
  title: string
  link: string
  /** Stable identity so readers never repost an item. */
  guid: string
  description: string
  pubDate: Date
}

export interface RssFeed {
  title: string
  link: string
  description: string
  /** Public URL of the feed itself (atom:link rel=self). */
  selfUrl: string
  items: RssItem[]
}

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildRssFeed(feed: RssFeed, now: Date = new Date()): string {
  const items = feed.items
    .map(
      i =>
        `    <item>\n` +
        `      <title>${escapeXml(i.title)}</title>\n` +
        `      <link>${escapeXml(i.link)}</link>\n` +
        `      <guid isPermaLink="false">${escapeXml(i.guid)}</guid>\n` +
        `      <pubDate>${i.pubDate.toUTCString()}</pubDate>\n` +
        `      <description>${escapeXml(i.description)}</description>\n` +
        `    </item>`,
    )
    .join('\n')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(feed.title)}</title>\n` +
    `    <link>${escapeXml(feed.link)}</link>\n` +
    `    <description>${escapeXml(feed.description)}</description>\n` +
    `    <language>en-gb</language>\n` +
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>\n` +
    `    <ttl>60</ttl>\n` +
    `    <atom:link href="${escapeXml(feed.selfUrl)}" rel="self" type="application/rss+xml" />\n` +
    (items ? items + '\n' : '') +
    `  </channel>\n` +
    `</rss>\n`
  )
}

/** Standard response for an RSS feed: CDN cached. Feeds are for readers, not search, so not indexed. */
export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
