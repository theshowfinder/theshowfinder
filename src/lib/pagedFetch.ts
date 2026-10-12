// Supabase's PostgREST layer returns at most 1000 rows per request no matter
// what .limit() asks for (see the note at the top of src/app/sitemap.ts), so
// anything that needs "every row" must page with range(). This helper holds
// that loop in one tested place. Pure — no '@/' imports — so it runs under
// plain `node --test` like the rest of src/lib.

export const SUPABASE_PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

// fetchPage must apply a deterministic .order() — range() paging over an
// unordered query can skip or repeat rows between pages.
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}
