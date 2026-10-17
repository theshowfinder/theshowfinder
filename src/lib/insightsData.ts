// Loads the counts behind /insights. Head-only count queries (no rows
// transferred), run in parallel. Uses the cookie-free public client so the
// page can be ISR-cached. Throws when the headline total cannot be read so a
// bad render never replaces a good cached page.
import { createPublicClient } from '@/lib/supabase/public'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { normalizeCityFilterValue } from '@/lib/cityEventCount'
import {
  categoryLabel,
  nextMonthRanges,
  type CountRow,
  type InsightsSummary,
  type MonthRow,
} from '@/lib/insights'

const CATEGORIES = ['concert', 'theatre', 'comedy', 'family', 'sports', 'local'] as const

export async function loadInsights(now = new Date()): Promise<InsightsSummary> {
  const supabase = createPublicClient()
  const nowISO = now.toISOString()

  // Fresh builder per call: live status, not yet started.
  const live = () =>
    supabase
      .from('events_with_venue')
      .select('*', { count: 'exact', head: true })
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', nowISO)

  const ranges = nextMonthRanges(now, 12)

  const [totalRes, cityRes, categoryRes, monthRes] = await Promise.all([
    live(),
    Promise.all(CITIES.map(c => live().ilike('venue_city', normalizeCityFilterValue(c.name)))),
    Promise.all(CATEGORIES.map(c => live().eq('category', c as never))),
    Promise.all(
      ranges.map((r, i) => {
        // The current month only counts from now onwards, never past dates.
        const from = i === 0 ? nowISO : r.startISO
        return supabase
          .from('events_with_venue')
          .select('*', { count: 'exact', head: true })
          .in('status', LIVE_EVENT_STATUSES)
          .gte('start_date', from)
          .lt('start_date', r.endISO)
      }),
    ),
  ])

  if (totalRes.error || totalRes.count == null) {
    throw new Error('insights: could not read the total event count')
  }

  const cities: CountRow[] = CITIES.map((c, i) => ({ label: c.name, count: cityRes[i].error ? 0 : cityRes[i].count ?? 0 }))
  const categories: CountRow[] = CATEGORIES.map((c, i) => ({
    label: categoryLabel(c),
    count: categoryRes[i].error ? 0 : categoryRes[i].count ?? 0,
  }))
  const months: MonthRow[] = ranges.map((r, i) => ({
    label: r.label,
    monthStart: r.monthStart,
    count: monthRes[i].error ? 0 : monthRes[i].count ?? 0,
  }))

  return { total: totalRes.count, cities, categories, months }
}
