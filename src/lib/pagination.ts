export function clampPage(page: number, totalPages: number): number {
  if (totalPages < 1) return 1
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(Math.floor(page), totalPages)
}
