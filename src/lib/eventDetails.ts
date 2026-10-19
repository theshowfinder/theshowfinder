// Practical event facts (doors, age limit, support acts, parking, access…)
// pulled from Ticketmaster's event/venue objects, plus the question-and-answer
// copy built from them. Pure functions, no imports, so `node --test` can run
// them. Nothing here invents facts: every answer is built from a value we were
// actually given, and anything missing is simply left out.

export interface EventDetails {
  age?: string
  ticketLimit?: string
  accessibility?: string
  support?: string[]
  promoter?: string
  seatmapUrl?: string
}

export interface VenueDetails {
  parking?: string
  accessibleSeating?: string
  generalRule?: string
  childRule?: string
  boxOffice?: string
}

// ── Ticketmaster shapes (only the fields we read) ───────────────────────────

export interface TMEventExtras {
  name?: string
  doorsTimes?: { dateTime?: string }
  ageRestrictions?: { legalAgeEnforced?: boolean }
  ticketLimit?: { info?: string }
  accessibility?: { info?: string }
  promoter?: { name?: string }
  seatmap?: { staticUrl?: string }
  _embedded?: { attractions?: Array<{ name?: string }> }
}

export interface TMVenueExtras {
  parkingDetail?: string
  accessibleSeatingDetail?: string
  generalInfo?: { generalRule?: string; childRule?: string }
  boxOfficeInfo?: { openHoursDetail?: string; phoneNumberDetail?: string }
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
}

/** Strips markup, collapses whitespace and caps length at a sentence/word end. */
export function cleanTmText(input: string | null | undefined, max = 500): string | null {
  if (!input) return null
  let text = input
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, m => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length < 8) return null
  if (text.length > max) {
    const cut = text.slice(0, max)
    const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    text = sentence > max * 0.5 ? cut.slice(0, sentence + 1) : cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…'
  }
  return text
}

function compact<T extends object>(obj: T): T | null {
  const entries = Object.entries(obj).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
  return entries.length ? (Object.fromEntries(entries) as T) : null
}

export function extractEventDetails(event: TMEventExtras): EventDetails | null {
  const title = (event.name ?? '').trim().toLowerCase()
  const support = (event._embedded?.attractions ?? [])
    .slice(1)
    .map(a => (a.name ?? '').trim())
    .filter(name => name && name.toLowerCase() !== title)
  const uniqueSupport = [...new Set(support)].slice(0, 6)

  return compact<EventDetails>({
    age: event.ageRestrictions?.legalAgeEnforced ? 'Age restrictions are enforced at this event. Check the ticket terms before you buy.' : undefined,
    ticketLimit: cleanTmText(event.ticketLimit?.info, 200) ?? undefined,
    accessibility: cleanVenueNote(cleanTmText(event.accessibility?.info, 400)),
    support: uniqueSupport.length ? uniqueSupport : undefined,
    promoter: event.promoter?.name?.trim() || undefined,
    seatmapUrl: event.seatmap?.staticUrl?.startsWith('https://') ? event.seatmap.staticUrl : undefined,
  })
}

// Ticketmaster's box-office text for many venues still carries Ticketmaster's own
// old booking line (0870), its international number, group-booking and fax numbers
// and a premium-rate call-charge notice. None of that is the venue's box office, so
// it is removed; the opening hours and the venue's own number are kept. Returns
// undefined when nothing useful is left.
export function cleanBoxOffice(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  let t = text
  t = t.replace(/(?:\b(?:or|and)\s+)?\bfax\b[^A-Za-z]*(?:[\d\s+()-]+)?/gi, ' ')
  t = t.replace(/\bTicketmaster(?:\s+UK)?\s*:?\s*0(?:84|87)\d[\d\s]*,?/gi, ' ')
  t = t.replace(/\bInternational\s*:?\s*(?:\+|00)\s*44[\d\s()+-]*,?/gi, ' ')
  t = t.replace(/\bGroups?(?:\s+(?:Number|Booking|Bookings|Line))?\s*:?\s*0(?:84|87)\d[\d\s]*/gi, ' ')
  t = t.replace(/\b0(?:84|87)\d[\d\s]{6,}/g, ' ')
  t = t.replace(/\bCalls?\s+(?:will\s+)?cost[^.]*\.?/gi, ' ')
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim()
  t = t.replace(/[\s,;:&-]+$/, '').trim()
  if (!/[A-Za-z0-9]{3,}/.test(t) || t.length < 4) return undefined
  return t
}

// Free-text venue notes (accessibility, parking, general rules) sometimes tell people to
// ring an 0870/0844/0871 booking line. Those are Ticketmaster-era premium-rate numbers
// and no longer the venue's line, so any sentence that sends the reader to one is
// removed; the rest of the note is kept. Returns undefined when nothing is left.
const PREMIUM_NUMBER = /\b0(?:84|87)\d[\d\s]{6,}/
export function cleanVenueNote(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => !PREMIUM_NUMBER.test(sentence))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return /[A-Za-z0-9]{3,}/.test(kept) ? kept : undefined
}

export function extractVenueDetails(venue: TMVenueExtras): VenueDetails | null {
  const box = cleanBoxOffice(
    [venue.boxOfficeInfo?.openHoursDetail, venue.boxOfficeInfo?.phoneNumberDetail]
      .map(t => cleanTmText(t, 200))
      .filter((t): t is string => !!t)
      .join(' '),
  ) ?? ''

  return compact<VenueDetails>({
    parking: cleanVenueNote(cleanTmText(venue.parkingDetail, 500)),
    accessibleSeating: cleanVenueNote(cleanTmText(venue.accessibleSeatingDetail, 500)),
    generalRule: cleanTmText(venue.generalInfo?.generalRule, 500) ?? undefined,
    childRule: cleanTmText(venue.generalInfo?.childRule, 300) ?? undefined,
    boxOffice: box || undefined,
  })
}

/** Stable comparison key so the sync can tell whether details changed. */
export function detailsKey(d: object | null | undefined): string {
  if (!d) return ''
  return JSON.stringify(Object.keys(d).sort().map(k => [k, (d as Record<string, unknown>)[k]]))
}

// ── Q&A copy ────────────────────────────────────────────────────────────────

export interface FaqInput {
  title: string
  venueName: string | null
  venueAddress: string | null
  city: string | null
  dateLabel: string          // e.g. "Saturday 24 October 2026"
  startLabel: string         // e.g. "19:30"
  doorsLabel: string | null  // e.g. "18:30"
  status: string
  details: EventDetails | null
  venueDetails: VenueDetails | null
  providerNames: string[]
}

export interface FaqItem { q: string; a: string }

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function buildEventFaq(input: FaqInput): FaqItem[] {
  const { title, venueName, venueAddress, city, dateLabel, startLabel, doorsLabel, details, venueDetails, providerNames } = input
  const faq: FaqItem[] = []
  const where = venueName ? `${venueName}${city ? `, ${city}` : ''}` : city
  const cancelled = input.status === 'cancelled' || input.status === 'postponed'

  if (cancelled) {
    faq.push({
      q: `Is ${title} still going ahead?`,
      a: `This event is currently listed as ${input.status}. Check the official ticket seller for the latest on refunds or a new date.`,
    })
  }

  faq.push({
    q: `What time does ${title} start?`,
    a: doorsLabel
      ? `${title} is on ${dateLabel}${where ? ` at ${where}` : ''}. Doors open at ${doorsLabel} and the show is listed to start at ${startLabel} (UK time).`
      : `${title} is on ${dateLabel}${where ? ` at ${where}` : ''}. The listed start time is ${startLabel} (UK time).`,
  })

  faq.push({
    q: `What are the set times for ${title}?`,
    a: doorsLabel
      ? `Official set times for ${title} haven't been published. Doors open at ${doorsLabel} and the listed start is ${startLabel}. Running orders are usually confirmed by the venue or artist closer to the date, so check their social channels, and arrive for doors if you want to catch the support.`
      : `Official set times for ${title} haven't been published. The listed start is ${startLabel}. Running orders are usually confirmed by the venue or artist closer to the date, so check their social channels.`,
  })

  if (details?.support?.length) {
    faq.push({
      q: `Who is supporting at ${title}?`,
      a: `Listed with this event: ${joinNames(details.support)}.`,
    })
  }

  if (venueName && venueAddress) {
    faq.push({
      q: `Where is ${venueName}?`,
      a: `${venueName} is at ${venueAddress}${city ? `, ${city}` : ''}.`,
    })
  }

  if (details?.age) {
    faq.push({ q: `Is there an age limit for ${title}?`, a: details.age })
  } else if (venueDetails?.childRule) {
    faq.push({ q: `Can children attend ${title}?`, a: venueDetails.childRule })
  }

  if (venueDetails?.parking) {
    faq.push({ q: `Is there parking at ${venueName ?? 'the venue'}?`, a: venueDetails.parking })
  }

  if (cleanVenueNote(venueDetails?.accessibleSeating) || cleanVenueNote(details?.accessibility)) {
    faq.push({
      q: `Is ${venueName ?? 'the venue'} accessible?`,
      a: [cleanVenueNote(details?.accessibility), cleanVenueNote(venueDetails?.accessibleSeating)].filter(Boolean).join(' '),
    })
  }

  if (!cancelled && providerNames.length) {
    faq.push({
      q: `Where can I buy tickets for ${title}?`,
      a: `You can find tickets for ${title} through ${joinNames(providerNames)}, linked from TheShowFinder. Prices change as tickets sell, so check each seller before you buy.`,
    })
  }

  return faq
}
