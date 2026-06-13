import { createClient } from '@/lib/supabase/server'
import SearchBar from './SearchBar'

// Fetches distinct cities that have at least one upcoming event, sorted alphabetically.
// Falls back gracefully — SearchBar has its own fallback list if this query fails.
export default async function SearchBarWrapper() {
  const supabase = await createClient()

  const { data } = await (supabase
    .from('events_with_venue')
    .select('venue_city')
    .gte('start_date', new Date().toISOString())
    .not('venue_city', 'is', null)
    .limit(5000) as unknown as Promise<{ data: { venue_city: string }[] | null }>)

  const seen = new Set<string>()
  for (const row of data ?? []) {
    const c = row.venue_city?.trim()
    if (c) seen.add(c)
  }

  const cities = ['All UK', ...Array.from(seen).sort((a, b) => a.localeCompare(b))]

  return <SearchBar cities={cities} />
}
