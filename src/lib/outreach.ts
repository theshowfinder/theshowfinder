// Advertiser outreach emails (admin → Advertisers → Outreach). Short, local, honest: what the site is, where they
// would appear, the founding offer, and how to stop hearing from us. No visitor or click numbers, ever.

import { foundingOfferOpen } from './advertisingPackages.ts'

const SITE = 'https://www.theshowfinder.com'
export const OUTREACH_FROM = 'TheShowFinder <partners@theshowfinder.com>'
export const OUTREACH_REPLY_TO = 'hello@theshowfinder.com'
// Few, well-chosen emails (Chris, 6 Nov 2026): small independents close to busy venues, not volume.
export const DAILY_LIMIT = 60   // Resend: first emails + follow-ups a weekday (Chris, 12 Nov 2026; was 40 from 9 Nov, 15 from 6 Nov)
/** Chris's Zoho mailbox, on top of Resend (12 Nov 2026): plain one-to-one emails, spaced through the morning. */
export const ZOHO_DAILY_LIMIT = 25
export const FOLLOW_UP_AFTER_DAYS = 4
/** Founding-offer update emails to businesses emailed before the offer existed: at most this many a day (Resend). */
export const OFFER_UPDATES_PER_DAY = 20
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
  sent_at?: string | null
  subject_variant?: string | null
}

export function canEmail(p: Pick<Prospect, 'company_type' | 'status'>): boolean {
  // followed_up / no_response: only for the one founding-offer update email (outreachRun picks who gets what).
  return (SENDABLE_COMPANY_TYPES as readonly string[]).includes(p.company_type) && ['approved', 'sent', 'followed_up', 'no_response'].includes(p.status)
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

/**
 * Outreach covers every city (12 Nov 2026), not one city a weekday. Bigger cities get more venues searched around:
 * London 20, the next eight biggest 10, everywhere else 6. CITIES is in size order.
 */
export function anchorCountFor(city: string, cityNames: string[]): number {
  const i = cityNames.indexOf(city)
  return i === 0 ? 20 : i > 0 && i <= 8 ? 10 : 6
}

/**
 * Takes turns between cities, the cities with the fewest so far going first (`have`: emails sent, or businesses
 * already queued, per city). Within a city the rows keep their given order.
 */
export function spreadAcrossCities<T extends { city: string }>(rows: T[], n: number, have: Map<string, number>): T[] {
  const byCity = new Map<string, T[]>()
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r])
  const order = [...byCity.keys()].sort((a, b) => (have.get(a) ?? 0) - (have.get(b) ?? 0))
  const ordered: T[] = []
  for (const c of order) ordered.push(...byCity.get(c)!)
  return takeAcrossCities(ordered, n)
}

// ── Who we email (6 Nov 2026) ────────────────────────────────────────────────────────────────────────────────────
// Everyone near a busy venue, but small independents go first: they decide locally and benefit most. A business counts
// as a chain/group when its name, website or email belongs to a known chain, or its own site lists branches in several
// other cities; chains are still emailed, after the independents. The venues themselves are never emailed.
const CHAIN_NAME = /\b(nando'?s|brewdog|wetherspoon|las iguanas|hilton|marriott|premier inn|travelodge|ibis|holiday inn|novotel|mercure|radisson|crowne plaza|doubletree|hampton by|moxy|motel one|hotel indigo|malmaison|hotel du vin|all bar one|slug ?(and|&) ?lettuce|revolution|pizza express|zizzi|ask italian|wagamama|prezzo|bella italia|frankie (and|&) benny|harvester|toby carvery|miller (and|&) carter|cosy club|turtle bay|tgi|five guys|honest burgers|byron|gbk|gourmet burger|pret|costa|starbucks|caffe nero|greggs|mcdonald|burger king|kfc|subway|pizza hut|domino|yo! ?sushi|itsu|wasabi|tortilla|chiquito|the ivy|gaucho|hawksmoor|dishoom|six by nico|dirty martini|be at one|walkabout|o'neill'?s|yates|lloyds bar|mitchells|greene king|stonegate|nicholson'?s|young'?s|fuller'?s|brewhouse (and|&) kitchen)\b/i
const VENUE_NAME = /\b(theatre royal|playhouse|o2 academy|academy [1-3]|arena|apollo|empire theatre|concert hall|philharmonic hall|town hall|city hall)\b/i
/** The venue itself (or its own bar): never emailed. */
export const isVenueName = (name: string | null | undefined) => !!name && VENUE_NAME.test(name)
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

/** A real upcoming show at the business's nearest venue, shown in the email as "how you'd appear" (outreachShow.ts). */
export interface OutreachShow { title: string; when: string; venue: string; imageUrl: string; url: string }

// ── Subject lines (12 Nov 2026): two versions, A/B by prospect id, stored in outreach_prospects.subject_variant
// when the first email goes, so a follow-up always replies to the subject that business actually got. Businesses
// emailed before this (subject_variant null, already sent) keep the old subject on their follow-up.
// C and D (12 Nov 2026) carry the founding partner offer and are used while it is open; A and B after it ends.
export type SubjectVariant = 'A' | 'B' | 'C' | 'D'
export const subjectVariantFor = (id: string, now: Date = new Date()): SubjectVariant => {
  const even = parseInt(id.replace(/[^0-9a-f]/gi, '').slice(-1) || '0', 16) % 2 === 0
  return foundingOfferOpen(now) ? (even ? 'C' : 'D') : (even ? 'A' : 'B')
}
const realVenue = (p: Pick<Prospect, 'near_venue' | 'city'>) =>
  p.near_venue && p.near_venue.toLowerCase() !== p.city.toLowerCase() ? p.near_venue : null

const VENUE_SHORT: Record<string, string> = { 'ovo hydro': 'the Hydro', 'sse hydro': 'the Hydro', 'co-op live': 'Co-op Live' }
/** "Ulster Hall Belfast" → "Ulster Hall", "Utilita Arena Birmingham" → "Utilita Arena", "OVO Hydro" → "the Hydro", "The Bodega" → "the Bodega". */
export function shortVenue(venue: string, city: string): string {
  const known = VENUE_SHORT[venue.toLowerCase()]
  if (known) return known
  let v = venue.trim()
  const cityTail = new RegExp(`\\s+${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  if (cityTail.test(v) && v.replace(cityTail, '').split(/\s+/).length >= 2) v = v.replace(cityTail, '')
  return v.replace(/^The\s/, 'the ')
}

function subjectWord(category: string): string {
  const c = category.toLowerCase()
  if (/hotel|stay|b&b|inn/.test(c)) return 'stay the night'
  if (/bar|pub|club|cocktail/.test(c)) return 'grab a drink before the show'
  if (/restaurant|cafe|café|kitchen|food|grill/.test(c)) return 'eat before the show'
  return 'head before the show'
}

export function outreachSubject(p: Prospect, variant: SubjectVariant | 'legacy'): string {
  const b = p.business_name
  if (variant === 'legacy') return `We'd love to feature ${b} on TheShowFinder ${p.city}`
  const venue = realVenue(p)
  const short = venue ? shortVenue(venue, p.city) : null
  if (variant === 'A') {
    const verb = subjectWord(p.category)
    const options = [
      ...(short ? [`Where do ${short} crowds ${verb}?`, `Where do ${short} crowds go first?`] : []),
      `Where do ${p.city} show-goers ${verb}?`, `Where do ${p.city} show-goers go first?`,
    ]
    return options.find(o => o.length <= 60) ?? options[options.length - 1]
  }
  if (variant === 'C') {
    const options = [
      ...(short ? [`Free month for ${b} beside ${short}'s shows`, `A free month beside ${short}'s shows`] : []),
      `Free month for ${b} on our ${p.city} page`, `A free month on our ${p.city} page`,
    ]
    return options.find(o => o.length <= 60) ?? options[options.length - 1]
  }
  if (variant === 'D') {
    const options = [
      ...(short ? [`Be one of 3 spots by ${short}, first month free`, `One of 3 spots by ${short}, first month free`] : []),
      `One of 3 spots in ${p.city}, first month free`, `3 spots in ${p.city}, first month free`,
    ]
    return options.find(o => o.length <= 60) ?? options[options.length - 1]
  }
  const options = [
    ...(short ? [`3 spots next to ${short}'s shows. One for ${b}?`, `3 spots next to ${short}'s shows. One for you?`] : []),
    `3 spots on our ${p.city} page. One for ${b}?`, `3 spots on our ${p.city} page. One for you?`,
  ]
  return options.find(o => o.length <= 60) ?? options[options.length - 1]
}

/** The subject this prospect gets (first) or got (follow-up "Re:"). */
function subjectFor(p: Prospect, now?: Date): string {
  const v = p.subject_variant === 'A' || p.subject_variant === 'B' || p.subject_variant === 'C' || p.subject_variant === 'D' ? p.subject_variant
    : p.sent_at ? 'legacy' : subjectVariantFor(p.id, now)
  return outreachSubject(p, v)
}

// ── Layout: table-based, inline styles only, explicit backgrounds (Gmail, Outlook, Apple Mail, dark mode). ─────
const BRAND = '#E8003D', INK = '#1A1A2E', GREY = '#6B7280', LINE = '#E5E7EB'
const citySlug = (city: string) => city.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** Cities with an email banner in public/email/city (scripts/build-email-city-images.mjs). */
const BANNER_CITIES = new Set(['aberdeen', 'bath', 'belfast', 'birmingham', 'blackpool', 'bournemouth', 'bradford', 'brighton', 'bristol', 'cambridge', 'cardiff', 'coventry', 'derby', 'edinburgh', 'exeter', 'glasgow', 'hull', 'ipswich', 'leeds', 'leicester', 'liverpool', 'london', 'manchester', 'middlesbrough', 'milton-keynes', 'newcastle', 'norwich', 'nottingham', 'oxford', 'plymouth', 'portsmouth', 'reading', 'scarborough', 'sheffield', 'southampton', 'stoke-on-trent', 'sunderland', 'swansea', 'wolverhampton', 'york'])
export const cityBannerUrl = (city: string) => BANNER_CITIES.has(citySlug(city)) ? `${SITE}/email/city/${citySlug(city)}.jpg` : null

const para = (l: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK}">${esc(l)}</p>`

function previewHtml(p: Prospect, show: OutreachShow | undefined): string {
  const shortDistance = p.distance_label ? p.distance_label.replace(/^an?\s+/i, '').replace(/-minute/, ' min') : null
  const meta = [p.category, shortDistance].filter(Boolean).join(' · ')
  const showBlock = show ? `
<tr><td style="padding:0 0 10px" bgcolor="#ffffff">
  <a href="${esc(show.url)}" style="text-decoration:none;color:${INK}">
    <img src="${esc(show.imageUrl)}" width="512" alt="${esc(show.title)}" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:8px">
  </a>
  <p style="margin:10px 0 2px;font-size:16px;font-weight:bold;color:${INK}">${esc(show.title)}</p>
  <p style="margin:0;font-size:13px;color:${GREY}">${esc(show.when)} · ${esc(show.venue)}</p>
</td></tr>` : `
<tr><td style="padding:0 0 8px;font-size:13px;font-weight:bold;color:${GREY}" bgcolor="#ffffff">On our ${esc(p.city)} page</td></tr>`
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;border:1px solid ${LINE};border-radius:10px" bgcolor="#ffffff">
<tr><td style="padding:14px" bgcolor="#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${showBlock}
<tr><td bgcolor="#FAFAFB" style="padding:14px;border:1px solid ${LINE};border-radius:8px">
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:1px;font-weight:bold;color:${BRAND}">${/hotel|stay|b&b|inn/i.test(p.category) ? 'STAY NEARBY' : 'BEFORE THE SHOW'}</p>
  <p style="margin:0 0 2px;font-size:16px;font-weight:bold;color:${INK}">${esc(p.business_name)}</p>
  ${meta ? `<p style="margin:0 0 10px;font-size:13px;color:${GREY}">${esc(meta)}</p>` : ''}
  <span style="display:inline-block;padding:5px 10px;border:1px solid ${BRAND};border-radius:999px;background:#FFF0F4;color:${BRAND};font-size:13px;font-weight:bold">10% off with your show ticket</span>
</td></tr>
</table>
<p style="margin:8px 0 0;font-size:12px;color:${GREY}">Example only: you choose your own offer.</p>
</td></tr>
</table>`
}

/**
 * One warm, local template for everyone, filled in from the business's own details (name, city, type) and, when we
 * have one, a real upcoming show at their nearest venue. Praise stays general so it is true for every business it goes
 * to; no invented facts, no numbers, no guarantees.
 */
/**
 * 'offer_update' (12 Nov 2026): one email to businesses emailed before the founding partner offer existed, telling
 * them about it. Its own subject (it is news, not a chaser).
 */
export type OutreachKind = 'first' | 'follow_up' | 'offer_update'

export function offerUpdateSubject(p: Pick<Prospect, 'business_name'>): string {
  const s = `Update: a free first month for ${p.business_name}`
  return s.length <= 60 ? s : 'Update: a free first month on TheShowFinder'
}

/** A personal message in the same visual email (warm leads, e.g. someone who replied): own subject, greeting and words. */
export interface PersonalNote { subject: string; greeting: string; paragraphs: string[]; afterPreview?: string[] }

export function buildOutreachEmail(p: Prospect, kind: OutreachKind, opts: { show?: OutreachShow; now?: Date; personal?: PersonalNote } = {}): { subject: string; text: string; html: string } {
  const show = opts.show
  // Founding partner offer (until 31 Dec 2026): first month free, then monthly, cancel any time.
  const founding = foundingOfferOpen(opts.now)
  const hi = p.contact_name?.trim() ? `Hi ${p.contact_name.trim().split(/\s+/)[0]},` : `Hi there,`
  const b = p.business_name
  const venue = realVenue(p)
  const firstSubject = subjectFor(p, opts.now)
  const personal = opts.personal
  const subject = personal ? personal.subject : kind === 'offer_update' ? offerUpdateSubject(p) : kind === 'follow_up' ? `Re: ${firstSubject}` : firstSubject
  const button = founding && kind !== 'first' ? `Start ${b}'s free month` : `See how ${b} would look`
  const intro = personal
    ? [personal.greeting, ...personal.paragraphs]
    : kind === 'offer_update'
    ? [
        hi,
        `A quick update since I last emailed about ${b}: we've just launched a founding partner offer for a small number of ${p.city} businesses (details above).`,
        `You'd sit right under the ticket buttons on every show ${venue ? `at ${venue} and the venues around it` : `near you in ${p.city}`}, at the moment people decide where to ${visitPhrase(p.category)}. Here's how it would look:`,
      ]
    : kind === 'first'
    ? [
        hi,
        `Places like ${b} are what make a night out in ${p.city}, and that's exactly who we want to work with.`,
        `TheShowFinder helps people find every concert, show, comedy night and match in ${p.city}, and plan the night around it. We're all about local businesses, so we feature a handful of local places right next to the tickets, at the moment people decide where to ${visitPhrase(p.category)}.`,
        'Your listing can include an offer of your choice (say, 10% off with a show ticket) that they claim on their phone and use at your door. Roughly like this:',
      ]
    : [
        hi,
        `Just checking this reached you. We'd still love to have ${b} on our ${p.city} page${venue ? ` and on the shows at ${venue}` : ''}. There are only three Featured places around each venue, and here's how yours would look:`,
      ]
  // While the founding offer is open it leads the email (the box under the banner); the text below doesn't repeat it.
  const offerLine = founding ? '' : ' Introductory rates start at £29.95 a month.'
  const outro = personal
    ? (personal.afterPreview ?? [])
    : kind === 'first'
    ? [venue
        ? `${p.distance_label ? `You're ${/^\d/.test(p.distance_label) ? 'a ' : ''}${p.distance_label}, so you'd` : 'You would'} be shown on every show there and at the venues around it. We only take three Featured partners around each venue, and we'd genuinely love ${b} to be one of them.${offerLine}`
        : `We only take three Featured partners around each venue in ${p.city}, and we'd genuinely love ${b} to be one of them.${offerLine}`]
    : kind === 'offer_update'
    ? ['We only take three Featured partners around each venue, so it is first come, first served.']
    : []
  const why = `You're getting this because ${b} is close to ${venue ?? `the busy venues in ${p.city}`}.`

  // The plain version (also what the Zoho mailbox sends) has no preview card, so it says it in words instead.
  const plainIntro = kind === 'follow_up' ? intro : intro.map(l => l.replace(/ (Roughly like this|Here's how it would look):$/, ''))
  const offerText = `FOUNDING PARTNER OFFER (until 31 December): your first month is free, then £24.95 a month for a Featured spot (normally £44.95). That price is locked for as long as you stay. No contract, cancel any time.`
  const text = [
    ...(founding ? [plainIntro[0], '', offerText, '', ...plainIntro.slice(1).flatMap(l => [l, ''])] : plainIntro.flatMap(l => [l, ''])),
    ...(show ? [kind === 'offer_update'
      ? `For example, ${b} would be on the page for ${show.title} at ${show.venue} (${show.when}).`
      : kind === 'first'
      ? `For example, on the page for ${show.title} at ${show.venue} (${show.when}), ${b} would sit right under the ticket buttons.`
      : `Next at ${show.venue}: ${show.title}, ${show.when}`, ''] : []),
    ...outro.flatMap(l => [l, '']),
    `${button}: ${offerUrl(p)}`,
    '',
    'Chris',
    'Founder, TheShowFinder',
    'theshowfinder.com',
    'Just reply to this email, it comes straight to me.',
    '',
    `${why} Not for you? Unsubscribe: ${unsubscribeUrl(p)}`,
  ].join('\n')

  const preheader = founding
    ? `Your first month free, then £24.95 a month (normally £44.95), locked in. Here's how ${b} would look beside every show ${venue ? `at ${venue}` : `in ${p.city}`}.`
    : `We feature three local places beside every show ${venue ? `at ${venue}` : `in ${p.city}`}. Here's how ${b} would look.`
  const banner = cityBannerUrl(p.city)
  const buttonHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px"><tr>
<td bgcolor="${BRAND}" style="border-radius:8px">
<a href="${offerUrl(p)}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:${BRAND}">${esc(button)} &rarr;</a>
</td></tr></table>`
  const offerBox = founding ? `
<tr><td style="padding:16px 24px 0" bgcolor="#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF0F4" style="border:2px solid ${BRAND};border-radius:12px">
<tr><td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif" bgcolor="#FFF0F4">
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.5px;font-weight:bold;color:${BRAND}">FOUNDING PARTNER OFFER &middot; UNTIL 31 DECEMBER</p>
  <p style="margin:0 0 6px;font-size:26px;line-height:1.15;font-weight:bold;color:${INK}">Your first month <span style="color:${BRAND}">FREE</span></p>
  <p style="margin:0 0 10px;font-size:16px;color:${INK}">Then <b>£24.95 a month</b> <span style="color:${GREY};text-decoration:line-through">£44.95</span> for a Featured spot</p>
  <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${INK}">&#10003; Price locked for as long as you stay<br>&#10003; No contract, cancel any time<br>&#10003; Only 3 Featured spots around each venue</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${BRAND}" style="border-radius:8px">
    <a href="${offerUrl(p)}" style="display:inline-block;padding:11px 18px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:${BRAND}">Claim your free month &rarr;</a>
  </td></tr></table>
</td></tr>
</table>
</td></tr>` : ''
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F5F7" bgcolor="#F5F5F7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F5F5F7">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F7"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px" bgcolor="#ffffff">
<tr><td style="padding:20px 24px 14px;font-family:Arial,Helvetica,sans-serif" bgcolor="#ffffff">
  <span style="font-size:20px;font-weight:bold;color:${INK}">TheShow<span style="color:${BRAND}">Finder</span></span>
</td></tr>
${banner ? `<tr><td style="padding:0 24px" bgcolor="#ffffff"><img src="${banner}" width="512" alt="${esc(p.city)}" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:8px"></td></tr>` : ''}
${offerBox}
<tr><td style="padding:20px 24px 8px;font-family:Arial,Helvetica,sans-serif" bgcolor="#ffffff">
${intro.map(para).join('\n')}
${previewHtml(p, show)}
${outro.map(para).join('\n')}
${buttonHtml}
<p style="margin:0;font-size:15px;font-weight:bold;color:${INK}">Chris</p>
<p style="margin:0;font-size:13px;color:${GREY}">Founder, TheShowFinder</p>
<p style="margin:0 0 8px;font-size:13px"><a href="${SITE}" style="color:${BRAND};text-decoration:none">theshowfinder.com</a></p>
<p style="margin:0 0 18px;font-size:13px;color:${GREY}">Just reply to this email, it comes straight to me.</p>
</td></tr>
<tr><td style="padding:14px 24px 20px;border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#888888" bgcolor="#ffffff">
${esc(why)} Not for you? <a href="${unsubscribeUrl(p)}" style="color:#888888">Unsubscribe</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, text, html }
}
