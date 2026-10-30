// The /insights figures as a CSV download: /insights/data.csv
import { loadInsights } from '@/lib/insightsData'
import { insightsCsv } from '@/lib/insights'

export const revalidate = 86400

export async function GET() {
  const csv = insightsCsv(await loadInsights())
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline; filename="uk-live-events-index.csv"',
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
