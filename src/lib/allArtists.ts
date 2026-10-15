import type { SupabaseClient } from '@supabase/supabase-js'
import type { Artist } from '@/lib/types/database'

// Supabase/PostgREST returns at most 1,000 rows per request, silently. A plain
// `from('artists').select('*')` therefore only ever saw the first 1,000 of
// 5,000+ artists, so most on-sale acts had no artist record attached: no Follow
// button, no link to their artist page, no resale ticket links. This pages
// through the whole table (stable order, pages fetched in parallel).
const PAGE = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllArtists(supabase: SupabaseClient<any, any, any>): Promise<Artist[]> {
  const { count } = await supabase.from('artists').select('*', { count: 'exact', head: true })
  const total = count ?? 0
  if (total === 0) return []
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) }, (_, i) =>
      supabase.from('artists').select('*').order('id').range(i * PAGE, i * PAGE + PAGE - 1) as unknown as Promise<{ data: Artist[] | null }>,
    ),
  )
  return pages.flatMap(p => p.data ?? [])
}
