import { buildIcsFeed, type CalendarEvent } from './ics.ts'

/** Standard response for a calendar feed: cached at the CDN, not indexed as a page. */
export function icsResponse(name: string, description: string, events: CalendarEvent[], filename: string): Response {
  return new Response(buildIcsFeed({ name, description, events }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80)}"`,
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
