// City sections are separate queries, so the same listing can appear in the
// morning edition, a date rail and "Just Added". Keep the first placement and
// leave distinct dates (which have distinct IDs) alone.
export function excludePreviouslyShown<T extends { id: string }>(
  rows: readonly T[],
  shownIds: Set<string>,
  limit = rows.length,
): T[] {
  const result: T[] = []
  if (limit <= 0) return result
  for (const row of rows) {
    if (shownIds.has(row.id)) continue
    shownIds.add(row.id)
    result.push(row)
    if (result.length >= limit) break
  }
  return result
}
