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

// When the total row count is already known, fetch the pages concurrently
// (a few at a time) instead of one after another. Used for large tables
// where sequential round trips would dominate the run time.
export async function fetchAllPagesParallel<T>(
  total: number,
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE,
  concurrency = 6,
): Promise<T[]> {
  const starts: number[] = []
  for (let from = 0; from < total; from += pageSize) starts.push(from)
  const pages: T[][] = new Array(starts.length)
  for (let i = 0; i < starts.length; i += concurrency) {
    const group = starts.slice(i, i + concurrency)
    const results = await Promise.all(group.map(from => fetchPage(from, from + pageSize - 1)))
    results.forEach((result, index) => {
      if (result.error) throw new Error(result.error.message)
      pages[i + index] = result.data ?? []
    })
  }
  return pages.flat()
}
