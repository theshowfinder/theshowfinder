// Advertiser outreach emails (admin → Advertisers → Outreach). Short, local, honest: what the site is, where they
// would appear, the founding offer, and how to stop hearing from us. No visitor or click numbers, ever.

const SITE = 'https://www.theshowfinder.com'
export const OUTREACH_FROM = 'TheShowFinder <partners@theshowfinder.com>'
export const OUTREACH_REPLY_TO = 'hello@theshowfinder.com'
// Few, well-chosen emails (Chris, 6 Nov 2026): small independents close to busy venues, not volume.
export const DAILY_LIMIT = 15
export const FOLLOW_UP_AFTER_DAYS = 4
/** No reply this long after the first email (follow-up sent in between): marked "No response", never chased again. */
export const NO_RESPONSE_AFTER_DAYS = 10
/**
 * Company types the sender may email (status must also be approved/sent, see canEmail). 'unconfirmed' is a business
 * whose limited-company status we could not confirm. Chris chose (5 Nov 2026) to email every business that fits,
 * whatever its company type, at the same daily cap, wording and instant unsubscribe; only approval gates sending.
 */
export const SENDABLE_COMPANY_TYPES = ['ltd', 'consented', 'unconfirmed', 'sole_trader', 'partnership', 'unknown'] as const

export interface Prospect {
  id: string
  business_name: string
  category: string
  city: string
  near_venue: string | null
  distance_label: string | null
  contact_name?: string | null
  email: string
  company_type: string
  status: string
  ref_code: string
  unsubscribe_token: string
}

export function canEmail(p: Pick<Prospect, 'company_type' | 'status'>): boolean {
  return (SENDABLE_COMPANY_TYPES as readonly string[]).includes(p.company_type) && ['approved', 'sent'].includes(p.status)
}


/** Oldest first within each city, but cities take turns, so one big batch (say, London) never crowds the rest out. */
export function takeAcrossCities<T extends { city: string }>(rows: T[], n: number): T[] {
  const byCity = new Map<string, T[]>()
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r])
  const lists = [...byCity.values()], out: T[] = []
  for (let i = 0; out.length < n && lists.some(l => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i])
  return out
}

/**
 * One city a weekday, from 5 Nov 2026: Manchester first, then London and the rest of the site's city list in order,
 * starting over after the last. Weekends roll on to the next Monday's city. The finder fills that city all day and
 * the sender emails it first.
 */
export const OUTREACH_START = '2026-11-05'
export function cityOfTheDay(cityNames: string[], now: Date = new Date()): string {
  const order = ['Manchester', ...cityNames.filter(c => c !== 'Manchester')]
  const start = new Date(`${OUTREACH_START}T00:00:00Z`)
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  let weekdays = 0
  for (const d = new Date(start); d < day; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6 !== 0) weekdays++
  // (a Saturday or Sunday has already counted Friday, so it lands on the coming Monday's city)
  return order[weekdays % order.length]
}

// ── Who we email: small independents (6 Nov 2026) ─────────────────────────────────────────────────────────────────
// Chains and groups never buy a local listing and drag the reply rate down. A business is skipped when its name,
// website or email belongs to a known chain/group, or its own site lists branches in several other cities.
const CHAIN_NAME = /\b(nando'?s|brewdog|wetherspoon|las iguanas|hilton|marriott|premier inn|travelodge|ibis|holiday inn|novotel|mercure|radisson|crowne plaza|doubletree|hampton by|moxy|motel one|hotel indigo|malmaison|hotel du vin|all bar one|slug ?(and|&) ?lettuce|revolution|pizza express|zizzi|ask italian|wagamama|prezzo|bella italia|frankie (and|&) benny|harvester|toby carvery|miller (and|&) carter|cosy club|turtle bay|tgi|five guys|honest burgers|byron|gbk|gourmet burger|pret|costa|starbucks|caffe nero|greggs|mcdonald|burger king|kfc|subway|pizza hut|domino|yo! ?sushi|itsu|wasabi|tortilla|chiquito|the ivy|gaucho|hawksmoor|dishoom|six by nico|dirty martini|be at one|walkabout|o'neill'?s|yates|lloyds bar|be at one|mitchells|greene king|stonegate|nicholson'?s|young'?s|fuller'?s|brewhouse (and|&) kitchen|theatre royal|playhouse|academy|arena)\b/i
const CHAIN_HOST = /(nandos|brewdog|jdwetherspoon|wetherspoon|iguanas|hilton|marriott|premierinn|travelodge|ihg|accor|all\.accor|radisson|malmaison|hotelduvin|allbarone|slugandlettuce|revolution-bars|revolutionbars|pizzaexpress|zizzi|askitalian|wagamama|prezzo|bellaitalia|harvester|tobycarvery|browns-restaurants|cosyclub|turtlebay|fiveguys|honestburgers|dishoom|sixbynico|greeneking|stonegate|mbplc|nicholsonspubs|youngs\.co|fullers|atgtickets|ambassadortheatre|livenation|academymusicgroup)/i
const UK_CITIES = ['london', 'manchester', 'birmingham', 'leeds', 'liverpool', 'glasgow', 'edinburgh', 'bristol', 'cardiff', 'newcastle', 'sheffield', 'nottingham', 'leicester', 'brighton', 'southampton', 'york', 'belfast', 'aberdeen', 'oxford', 'cambridge', 'bath', 'norwich', 'exeter', 'plymouth', 'derby', 'coventry']

export function looksLikeChain(x: { name?: string | null; website?: string | null; email?: string | null }): boolean {
  if (x.name && CHAIN_NAME.test(x.name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return true
  const hosts = [x.website ?? '', (x.email ?? '').split('@')[1] ?? ''].join(' ')
  return CHAIN_HOST.test(hosts)
}

/** A site that names four or more other UK cities is a group with branches ("our venues: Leeds, York, Bath…"). */
export function looksMultiSite(pageText: string, city: string): boolean {
  const t = pageText.toLowerCase()
  return UK_CITIES.filter(c => c !== city.toLowerCase() && new RegExp(`\\b${c}\\b`).test(t)).length >= 4
}

export const offerUrl = (p: Pick<Prospect, 'ref_code'>) => `${SITE}/p/${p.ref_code}`
export const unsubscribeUrl = (p: Pick<Prospect, 'unsubscribe_token'>) => `${SITE}/unsubscribe/${p.unsubscribe_token}`

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** What people come to this kind of business for, in "…where to <eat before the show>". */
function visitPhrase(category: string): string {
  const c = category.toLowerCase()
  if (/hotel|stay|b&b|inn/.test(c)) return 'stay the night'
  if (/bar|pub|club|cocktail/.test(c)) return 'grab a drink before the show'
  if (/restaurant|cafe|café|kitchen|food|grill/.test(c)) return 'eat before the show'
  return 'eat, drink or stay'
}

/**
 * One warm, local template for everyone, filled in from the business's own details (name, city, type). Praise stays
 * general so it is true for every business it goes to; no invented facts, no numbers, no guarantees.
 */
export function buildOutreachEmail(p: Prospect, kind: 'first' | 'follow_up'): { subject: string; text: string; html: string } {
  const hi = p.contact_name?.trim() ? `Hi ${p.contact_name.trim().split(/\s+/)[0]},` : `Hi there,`
  const b = p.business_name
  const firstSubject = `We'd love to feature ${b} on TheShowFinder ${p.city}`
  const subject = kind === 'follow_up' ? `Re: ${firstSubject}` : firstSubject
  const button = `See ${b} on our ${p.city} page`
  const lines = kind === 'first'
    ? [
        hi,
        '',
        `Places like ${b} are what make a night out in ${p.city}, and that's exactly who we want to work with.`,
        '',
        `TheShowFinder helps people find every concert, show, comedy night and match in ${p.city}, and plan the night around it. We're all about local businesses, so we feature a handful of local places right next to the tickets, at the moment people decide where to ${visitPhrase(p.category)}.`,
        '',
        'Your listing can include an offer of your choice (say, 10% off with a show ticket) that they claim on their phone and use at your door.',
        '',
        p.near_venue && p.near_venue.toLowerCase() !== p.city.toLowerCase()
          ? `${p.distance_label ? `You're ${p.distance_label}, so you'd` : 'You would'} be shown on every show there and at the venues around it. We only take three Featured partners around each venue, and we'd genuinely love ${b} to be one of them. Introductory rates start at £29.95 a month.`
          : `We only take three Featured partners around each venue in ${p.city}, and we'd genuinely love ${b} to be one of them. Introductory rates start at £29.95 a month.`,
        '',
        `${button}: ${offerUrl(p)}`,
        '',
        'Chris',
        'TheShowFinder',
      ]
    : [
        hi,
        '',
        `Just checking this reached you. We'd still love to have ${b} on our ${p.city} page${p.near_venue && p.near_venue.toLowerCase() !== p.city.toLowerCase() ? ` and on the shows at ${p.near_venue}` : ''}. There are only three Featured places around each venue, and here's how yours would look:`,
        '',
        `${button}: ${offerUrl(p)}`,
        '',
        'Chris',
        'TheShowFinder',
      ]
  const footer = `Not for you? Unsubscribe: ${unsubscribeUrl(p)}`
  const text = [...lines, '', footer].join('\n')
  const linkHtml = `<a href="${offerUrl(p)}" style="display:inline-block;background:#E8003D;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">${esc(button)} &rarr;</a>`
  const html = [
    ...lines.map(l => {
      if (!l) return ''
      if (l.includes(offerUrl(p))) return `<p style="margin:4px 0 16px">${linkHtml}</p>`
      return `<p style="margin:0 0 10px">${esc(l)}</p>`
    }),
    `<p style="margin:24px 0 0;font-size:12px;color:#888">Not for you? <a href="${unsubscribeUrl(p)}" style="color:#888">Unsubscribe</a></p>`,
  ].join('')
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1A1A2E;max-width:560px">${html}</div>` }
}
