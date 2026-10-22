// Rules for the automatic import of shows that Gigsberg / See Tickets list but we do not have.
// Pure module (relative imports only) so it runs under `node --test`. The point of every rule is
// the same: never create a second page for a show we already have, and never publish a package,
// a past show or a row with no real venue.
import { isPackageOrClassTitle } from './eventTitles.ts'
import { CITIES } from './cities.ts'

export interface FeedRow {
  id: string | number
  name: string
  event_date: string | null
  venue: string | null
  city: string | null
  url: string | null
  /** The feed's own genre label (See Tickets only). */
  genre?: string | null
}

/** An event already on the site, reduced to what duplicate detection needs. */
export interface KnownEvent { title: string; date: string; city: string; venue: string }

export function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function comparableVenue(value: string | null | undefined): string {
  return normalize(value)
    .replace(/\b(the|o2|ao|live|venue|music|entertainment|centre|center|arena|hall|theatre|theater|formerly|sse)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function overlap(left: string | null | undefined, right: string | null | undefined): number {
  const a = new Set(normalize(left).split(' ').filter(t => t.length > 2))
  const b = new Set(normalize(right).split(' ').filter(t => t.length > 2))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.max(a.size, b.size)
}

export type SkipReason = 'no_venue_or_city' | 'no_link' | 'package' | 'not_a_show' | 'not_in_future' | 'duplicate' | 'bad_name'

// Things the feeds sell that are not a show anyone would look for on the site: walking tours, attractions and film
// screenings (See Tickets genres ATTRACTIONS / CINEMA), pub quizzes, wedding / antiques / trade fairs, festival
// add-ons (car park, shuttle bus, accommodation, camping) and the feeds' own test listings. Found by reading the
// See Tickets and Gigsberg candidates on 22 Oct 2026 (about 117 rows). Note: the See Tickets genre "NAGIOS_CHECK2"
// is NOT a test marker; those rows are real gigs (Hermanos Gutiérrez, José González...) with a mislabelled genre.
const NOT_A_SHOW_GENRES = new Set(['ATTRACTIONS', 'CINEMA'])
const NOT_A_SHOW_TITLE = new RegExp([
  String.raw`^\s*test\b|\btest (?:event|listing|show|product|page)\b|\bdo not (?:buy|purchase|book)\b`,
  String.raw`\bwalking tours?\b|\bwalks?\s*$`,
  String.raw`\bquiz\b`,
  String.raw`\b(?:antiques?|vintage|craft|wedding|record|book|comic|toy|collectors?|christmas|xmas|food|beer|gin|wine)(?: and \w+)? (?:fairs?|fayres?|markets?|exhibitions?)\b`,
  String.raw`\bwedding (?:show|exhibition|fair)s?\b|\bfayre\b|\bcaravan\b.*\bshow\b|\bmotorhome\b`,
  String.raw`\b(?:accommodation|shuttle(?: bus(?:es)?)?|coach (?:travel|tickets?|packages?|transfers?)|car ?park(?:ing)?|parking|camping|campervans?|glamping|lockers?|merchandise|gift (?:cards?|vouchers?)|vouchers?|donations?|raffle|season tickets?|travel packages?)\b`,
  String.raw`\b(?:conference|seminar|webinar|networking|careers fair|open evening)\b`,
].join('|'), 'i')

/** Not a show (see above), or false. */
export function isNotAShow(row: Pick<FeedRow, 'name' | 'genre'>): boolean {
  if (row.genre && NOT_A_SHOW_GENRES.has(row.genre.trim().toUpperCase())) return true
  return NOT_A_SHOW_TITLE.test(row.name ?? '')
}

/**
 * Why this feed row must NOT become a new event, or null if it may.
 * `sameDay` = events already on the site on the row's date (including ones created earlier in this run).
 */
export function skipReason(row: FeedRow, sameDay: KnownEvent[], today: string): SkipReason | null {
  if (!row.name || normalize(row.name).length < 3) return 'bad_name'
  if (!row.venue?.trim() || !row.city?.trim()) return 'no_venue_or_city'
  if (!row.url) return 'no_link'
  if (isPackageOrClassTitle(row.name)) return 'package'
  if (isNotAShow(row)) return 'not_a_show'
  if (!row.event_date || row.event_date <= today) return 'not_in_future'
  const city = normalize(row.city)
  for (const e of sameDay) {
    const sameCity = normalize(e.city) === city
    const titleHit = (() => {
      const a = normalize(row.name), b = normalize(e.title)
      return Boolean(a && b && (a === b || a.includes(b) || b.includes(a))) || overlap(row.name, e.title) >= 0.35
    })()
    const venueHit = comparableVenue(row.venue) !== '' && (comparableVenue(row.venue) === comparableVenue(e.venue) || overlap(row.venue, e.venue) >= 0.5)
    // Same title anywhere on that day in that city, or the same venue with any title overlap, is the same show.
    if (sameCity && (titleHit || (venueHit && overlap(row.name, e.title) > 0))) return 'duplicate'
    // Same venue on the same day but a different-looking title: a second show in one room, allowed.
  }
  return null
}

/**
 * Local London wall-clock date + time -> UTC ISO string (handles BST).
 * No time in the feed = midnight UK, the site-wide "time not known" value (shown as a date only), never an
 * invented 7pm.
 */
export function londonToUtcIso(date: string, time: string | null | undefined): string {
  const t = /^\d{2}:\d{2}(:\d{2})?$/.test(time ?? '') ? (time as string) : '00:00:00'
  const full = t.length === 5 ? `${t}:00` : t
  const guess = Date.parse(`${date}T${full}Z`)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(guess))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asLondon = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  const offset = asLondon - Date.UTC(new Date(guess).getUTCFullYear(), new Date(guess).getUTCMonth(), new Date(guess).getUTCDate(), new Date(guess).getUTCHours(), new Date(guess).getUTCMinutes())
  return new Date(guess - offset).toISOString()
}

export function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90)
}

// ── City names ──────────────────────────────────────────────────────────────
// City pages list a show when its venue's city is exactly one of our city names, and the duplicate check compares
// cities too. The See Tickets feed spells places its own way ("Newcastle Upon Tyne", "Kingston Upon Hull",
// "West Central London", "Camden, London", "Mayfair", a county such as "Kent"), so every feed city is normalised
// first. Conservative on purpose: separate towns stay themselves (Salford, Gateshead, Birkenhead, Port Glasgow,
// Hove...); only real spellings of our cities, London's inner postcode districts and county-only values change.

const OUR_CITY = new Map(CITIES.map(c => [c.name.toLowerCase(), c.name]))

const CITY_ALIASES: Record<string, string> = {
  'newcastle upon tyne': 'Newcastle', 'newcastle-upon-tyne': 'Newcastle', 'newcastle city centre': 'Newcastle',
  'kingston upon hull': 'Hull', 'city of hull': 'Hull',
  'stoke': 'Stoke-on-Trent', 'stoke on trent': 'Stoke-on-Trent', 'stoke-on-trent': 'Stoke-on-Trent', 'hanley': 'Stoke-on-Trent',
  'middlesborough': 'Middlesbrough',
  'brighton and hove': 'Brighton', 'brighton & hove': 'Brighton',
  'gr manchester': 'Manchester', 'greater manchester': 'Manchester', 'manchester city centre': 'Manchester',
  'digbeth': 'Birmingham', "kings heath (b'ham)": 'Birmingham', 'kings heath': 'Birmingham', "king's heath": 'Birmingham',
  'edgbaston': 'Birmingham', 'moseley': 'Birmingham',
  'cardiff university': 'Cardiff', 'cardiff bay': 'Cardiff',
  'warwick arts centre - coventry': 'Coventry',
  'city of edinburgh': 'Edinburgh', 'leith': 'Edinburgh',
  'city of london': 'London', 'central london': 'London', 'west central london': 'London', 'greater london': 'London',
}

// Inner London postcode areas: a venue here is in London whatever district name the feed uses.
const INNER_LONDON_AREAS = new Set(['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC'])
const POSTCODE = /\b([A-Z]{1,2})(\d[A-Z\d]?)\s*[\dO][A-Z]{2}\b/i

const COUNTIES = new Set([
  'kent', 'devon', 'cornwall', 'essex', 'surrey', 'sussex', 'east sussex', 'west sussex', 'hampshire', 'dorset', 'somerset',
  'wiltshire', 'gloucestershire', 'glos', 'oxfordshire', 'berkshire', 'west berkshire', 'buckinghamshire', 'bucks',
  'hertfordshire', 'herts', 'hert', 'bedfordshire', 'cambridgeshire', 'norfolk', 'suffolk', 'lincolnshire', 'lincs',
  'north lincolnshire', 'north east lincolnshire', 'northamptonshire', 'leicestershire', 'nottinghamshire', 'derbyshire',
  'staffordshire', 'staffs', 'shropshire', 'herefordshire', 'worcestershire', 'warwickshire', 'warwicks', 'west midlands',
  'cheshire', 'lancashire', 'merseyside', 'cumbria', 'northumberland', 'tyne and wear', 'county durham', 'co durham',
  'cleveland', 'yorkshire', 'north yorkshire', 'south yorkshire', 'west yorkshire', 'east riding of yorkshire', 'middlesex',
  'isle of wight', 'wales', 'gwynedd', 'monmouthshire', 'pembrokeshire', 'mid glamorgan', 'renfrewshire', 'dumfriesshire',
  'fife', 'angus', 'northern ireland', 'united kingdom', 'uk', 'england', 'scotland', 'wirral',
])
const STREETISH = /\b(street|st|road|rd|lane|ln|avenue|ave|square|sq|place|way|drive|close|terrace|cliff|yard|walk|row|parade|pde|promenade|esplanade|wharf|quay|quays|gardens|green|grove|court|centre|center|hall|theatre|church|house|park|unit|building|buildings|club|arena|station|school|college|university|estate|farm|pavilion|cathedral|abbey|minster|showground|racecourse)\b|\d/i

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

function cleanCity(raw: string): string {
  return raw.replace(POSTCODE, ' ').replace(/[,\s]+$/g, '').replace(/^[,\s]+/g, '').replace(/\s+/g, ' ').trim()
}

/** The town an address names, ignoring streets, buildings, counties and the postcode. */
function townFromAddress(address: string): string | null {
  const parts = address.split(',').map(p => cleanCity(p)).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (COUNTIES.has(p.toLowerCase()) || STREETISH.test(p) || p.length < 3) continue
    return p
  }
  return null
}

/** One of our city names when the feed's city/address is in one of our cities, else the feed's town, tidied. */
export function resolveFeedCity(city: string | null | undefined, address?: string | null): string | null {
  const raw = cleanCity(city ?? '')
  const addr = address ?? ''
  if (!raw && !addr) return null
  const lower = raw.toLowerCase()
  const ours = OUR_CITY.get(lower)
  if (ours) return ours
  if (CITY_ALIASES[lower]) return CITY_ALIASES[lower]
  // "Camden, London", "Kings Cross London", "ExceL London", "London Borough Of Islington", "London West"
  if (/\blondon\b/i.test(raw) && !/\b(new|east|west|north|south)\s+london\s+road\b/i.test(raw)) return 'London'
  const pc = POSTCODE.exec(addr) ?? POSTCODE.exec(city ?? '')
  if (pc && INNER_LONDON_AREAS.has(pc[1].toUpperCase())) return 'London'
  // "Ely, Cambridgeshire" / "Totnes, Devon": the place is the first part.
  if (raw.includes(',')) {
    const [first, ...rest] = raw.split(',').map(p => p.trim()).filter(Boolean)
    if (first && rest.every(r => COUNTIES.has(r.toLowerCase()) || !r)) return resolveFeedCity(first, addr)
    if (first) return resolveFeedCity(first, addr)
  }
  // A county or region instead of a town: take the town from the address.
  if (!raw || COUNTIES.has(lower)) {
    const town = townFromAddress(addr)
    if (town) return OUR_CITY.get(town.toLowerCase()) ?? CITY_ALIASES[town.toLowerCase()] ?? titleCase(town)
    return raw ? titleCase(raw) : null
  }
  return titleCase(raw)
}

// ── Categories ──────────────────────────────────────────────────────────────
// Use the feed's own label where it says something definite; return null to fall back to the title-based guess
// (inferEventCategory). Music genres always mean a concert: guessing from the title there turns bands such as
// "Musical Youth" into theatre. See Tickets genres seen on 22 Oct 2026: ROCK, OTHER MUSIC, COMEDY, POP,
// DANCE AND CLUBS, SPECIAL EVENTS, FESTIVAL, THEATRE, SPORT, plus junk labels (NAGIOS_CHECK2, WINTER) and blanks.
// Gigsberg gives a type (Concert, Comedy, Theatre, Sport, Festival) and a sub-type (Football, Darts, Cirque...).
export type FeedCategory = 'concert' | 'theatre' | 'comedy' | 'sports' | 'family'

const SEE_TICKETS_GENRE: Record<string, FeedCategory> = {
  'ROCK': 'concert', 'POP': 'concert', 'OTHER MUSIC': 'concert', 'DANCE AND CLUBS': 'concert', 'FESTIVAL': 'concert',
  'COMEDY': 'comedy', 'THEATRE': 'theatre', 'SPORT': 'sports',
}
const GIGSBERG_TYPE: Record<string, FeedCategory> = {
  'concert': 'concert', 'festival': 'concert', 'comedy': 'comedy', 'theatre': 'theatre', 'sport': 'sports',
}

export function feedCategory(source: 'see_tickets' | 'gigsberg', label: string | null | undefined, subType?: string | null): FeedCategory | null {
  const l = (label ?? '').trim()
  if (!l) return null
  if (source === 'see_tickets') return SEE_TICKETS_GENRE[l.toUpperCase()] ?? null
  // Gigsberg files talks and exhibitions under Theatre; leave those to the title rules.
  if (/conference|speaking|museum|exhibition/i.test(subType ?? '')) return null
  return GIGSBERG_TYPE[l.toLowerCase()] ?? null
}

// ── Description, price, postcode ────────────────────────────────────────────

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', pound: '£', eacute: 'é' }

/**
 * The seller's description as plain text for the "About this event" box (rendered with line breaks kept):
 * HTML tags and entities removed, paragraphs kept, capped at about 900 characters on a sentence end.
 * Null when there is nothing worth showing.
 */
export function cleanFeedDescription(html: string | null | undefined, maxLength = 900): string | null {
  if (!html) return null
  let t = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
  t = t.split('\n').map(line => line.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n')
  if (t.length < 40) return null
  if (t.length <= maxLength) return t
  const cut = t.slice(0, maxLength)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'))
  return (end > maxLength * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim()
}

/** Face-value "from" price in pounds: the feed's minimum, else its search price; null for free / missing / silly values. */
export function feedPriceFrom(min: string | number | null | undefined, search: string | number | null | undefined): number | null {
  for (const v of [min, search]) {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.]/g, ''))
    if (Number.isFinite(n) && n >= 1 && n < 5000) return Math.round(n * 100) / 100
  }
  return null
}

/** A UK postcode in an address, normalised ("SW96LH" -> "SW9 6LH"), or null. */
export function postcodeFrom(address: string | null | undefined): string | null {
  const m = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*([\dO])([A-Z]{2})\b/i.exec(address ?? '')
  if (!m) return null
  return `${m[1]} ${m[2].replace(/O/i, '0')}${m[3]}`.toUpperCase()
}
