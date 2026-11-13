// Daily listings check (/api/cron/listing-check). Ticketmaster and the other
// feeds put things in their event lists that are not shows, and sometimes list
// the same show twice. Known junk is hidden by rule (listingAddons.ts); this
// module finds what is left over:
//   - exact duplicates (same venue, same start time, same title): hidden automatically
//   - near duplicates (same venue, within an hour, very similar titles): for review
//   - titles with "not a show" words (gift card, upgrade, add-on...): for review
//   - a 23:59 start (a feed's "time to be confirmed" placeholder): for review
// Nothing is hidden on a guess: anything not certain goes to /admin/listing-check.
// Pure module (no '@/' imports) so it runs under node --test.

export interface QualityRow {
  id: string
  title: string
  start_date: string
  venue_id: string | null
  venue_name: string | null
  price_from?: number | null
}

export type IssueKind = 'near_duplicate' | 'not_a_show_words' | 'placeholder_time'

export interface QualityIssue {
  eventId: string
  otherEventId?: string
  kind: IssueKind
  detail: string
}

export interface AutoHide {
  eventId: string
  keepId: string
  reason: string
}

const SUSPECT_WORDS = /\b(voucher|gift card|gift voucher|merch|merchandise|bundle|add[- ]?on|parking|car park|upgrades?|membership|placeholder|deposit|pre-?order|not included|donation|test event)\b/i
const STOP = new Set(['the', 'and', 'a', 'of', 'at', 'in', 'live', 'with', 'tour', 'present', 'presents', 'support', 'plus', 'tickets', 'ticket', 'official', 'feat', 'ft', 'featuring', 'vs', 'v'])

export function normTitle(t: string): string {
  return t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
}

function tokens(t: string): Set<string> {
  return new Set(t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w)))
}

export function titleSimilarity(a: string, b: string): number {
  const na = normTitle(a)
  const nb = normTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return 0.9
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  return inter / (ta.size + tb.size - inter)
}

function londonClock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

// Which of two identical listings stays: the one with a price, then the lower id (stable run to run).
function keeper(a: QualityRow, b: QualityRow): QualityRow {
  const pa = a.price_from != null ? 0 : 1
  const pb = b.price_from != null ? 0 : 1
  if (pa !== pb) return pa < pb ? a : b
  return a.id < b.id ? a : b
}

export function checkListings(rows: QualityRow[]): { autoHide: AutoHide[]; issues: QualityIssue[] } {
  const autoHide: AutoHide[] = []
  const issues: QualityIssue[] = []
  const hidden = new Set<string>()

  // Same venue, close in time: compare within each venue only.
  const byVenue = new Map<string, QualityRow[]>()
  for (const r of rows) {
    if (!r.venue_id) continue
    const list = byVenue.get(r.venue_id)
    if (list) list.push(r)
    else byVenue.set(r.venue_id, [r])
  }
  for (const list of byVenue.values()) {
    list.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      const ta = Date.parse(a.start_date)
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]
        const gap = Date.parse(b.start_date) - ta
        if (gap > 3600_000) break
        if (hidden.has(a.id) || hidden.has(b.id)) continue
        const sim = titleSimilarity(a.title, b.title)
        if (gap === 0 && normTitle(a.title) === normTitle(b.title)) {
          const keep = keeper(a, b)
          const drop = keep.id === a.id ? b : a
          hidden.add(drop.id)
          autoHide.push({ eventId: drop.id, keepId: keep.id, reason: `Listed twice: same title, venue and start time as ${keep.id}` })
        } else if (sim >= 0.5) {
          issues.push({
            eventId: b.id, otherEventId: a.id, kind: 'near_duplicate',
            detail: `Looks like the same show as "${a.title}" at ${a.venue_name ?? 'the same venue'} (${gap === 0 ? 'same start time' : `${Math.round(gap / 60000)} min apart`})`,
          })
        }
      }
    }
  }

  for (const r of rows) {
    if (hidden.has(r.id)) continue
    const m = r.title.match(SUSPECT_WORDS)
    if (m) issues.push({ eventId: r.id, kind: 'not_a_show_words', detail: `Title says "${m[0]}": may be an add-on, not a show` })
    if (londonClock(r.start_date) === '23:59') issues.push({ eventId: r.id, kind: 'placeholder_time', detail: 'Starts at 23:59, usually a "time to be confirmed" placeholder or a non-show item' })
  }
  return { autoHide, issues }
}
