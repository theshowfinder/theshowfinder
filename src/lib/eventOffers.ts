// Extra ticket options for a canonical event.
//
// Premium / VIP / lounge packages and repeat source records for the same
// artist + venue + day are merged into ONE canonical event listing
// (listed_events_with_venue, migration 055/056). Their separate ticket links
// must not be lost, so the canonical event page shows them as additional
// ticket options built here. Pure functions: the page wraps each URL in the
// matching affiliate link (src/lib/affiliate.ts) exactly as it does for the
// canonical event's own links.

export interface SiblingEvent {
  id: string
  slug: string
  title: string
  start_date: string
  source: string | null
  tickets_url: string | null
  see_tickets_affiliate_url: string | null
  gigsberg_affiliate_url: string | null
  is_package: boolean
}

export interface CanonicalHas {
  tickets_url: string | null
  see_tickets_affiliate_url: string | null
  gigsberg_affiliate_url: string | null
}

export type SiblingOfferKind = 'ticketmaster' | 'see_tickets' | 'gigsberg'

export interface SiblingOffer {
  key: string
  kind: SiblingOfferKind
  label: string
  url: string
  /** Slug of the sibling record the link came from (tracking context). */
  fromSlug: string
}

const MAX_OFFERS = 8

/** "Jimmy Carr - VIP Package" -> "VIP Package". Falls back to "Package". */
export function packageLabel(title: string): string {
  const m = title.trim().match(/^.*\S\s*[-–—:|]\s*([^-–—:|]*\S)\s*$/)
  const tail = m?.[1]?.trim()
  return tail && tail.length <= 60 ? tail : 'Package'
}

function londonTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
}

export function buildSiblingOffers(canonical: CanonicalHas, siblings: SiblingEvent[]): SiblingOffer[] {
  const out: SiblingOffer[] = []
  const seen = new Set<string>()
  if (canonical.tickets_url) seen.add(canonical.tickets_url)
  let hasSee = !!canonical.see_tickets_affiliate_url
  let hasGig = !!canonical.gigsberg_affiliate_url

  const push = (o: SiblingOffer) => {
    if (seen.has(o.url) || out.length >= MAX_OFFERS) return
    seen.add(o.url)
    out.push(o)
  }

  const ordered = [...siblings].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.slug.localeCompare(b.slug))
  for (const s of ordered) {
    if (s.tickets_url) {
      push({
        key: `tm-${s.id}`,
        kind: 'ticketmaster',
        label: s.is_package ? packageLabel(s.title) : `${londonTime(s.start_date)} session`,
        url: s.tickets_url,
        fromSlug: s.slug,
      })
    }
    if (s.see_tickets_affiliate_url && !hasSee) {
      hasSee = true
      push({ key: `st-${s.id}`, kind: 'see_tickets', label: 'See Tickets', url: s.see_tickets_affiliate_url, fromSlug: s.slug })
    }
    if (s.gigsberg_affiliate_url && !hasGig) {
      hasGig = true
      push({ key: `gb-${s.id}`, kind: 'gigsberg', label: 'Gigsberg', url: s.gigsberg_affiliate_url, fromSlug: s.slug })
    }
  }
  return out
}
