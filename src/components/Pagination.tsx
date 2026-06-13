import Link from 'next/link'

interface PaginationProps {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  const around = new Set(
    [1, total, current - 2, current - 1, current, current + 1, current + 2]
      .filter(p => p >= 1 && p <= total)
  )
  const sorted = Array.from(around).sort((a, b) => a - b)

  const result: (number | '...')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...')
    result.push(sorted[i])
  }
  return result
}

export default function Pagination({ currentPage, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = getPageNumbers(currentPage, totalPages)

  const btnBase = 'min-h-[44px] flex items-center px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors'
  const btnInactive = `${btnBase} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`
  const btnDisabled = `${btnBase} bg-white border border-slate-200 text-slate-400 opacity-50 cursor-not-allowed pointer-events-none`

  return (
    <div className="mt-12 flex justify-center items-center gap-1 flex-wrap">
      {currentPage > 1 ? (
        <Link href={buildHref(currentPage - 1)} className={btnInactive}>‹ Prev</Link>
      ) : (
        <span className={btnDisabled}>‹ Prev</span>
      )}

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="min-h-[44px] flex items-center px-2 text-sm text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p as number)}
            className={`${btnBase} ${p === currentPage ? '' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            style={p === currentPage ? { backgroundColor: '#e4022d', color: 'white' } : undefined}
          >
            {p}
          </Link>
        )
      )}

      {currentPage < totalPages ? (
        <Link href={buildHref(currentPage + 1)} className={btnInactive}>Next ›</Link>
      ) : (
        <span className={btnDisabled}>Next ›</span>
      )}
    </div>
  )
}
