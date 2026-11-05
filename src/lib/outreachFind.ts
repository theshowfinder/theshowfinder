// Pure helpers for the automatic prospect finder (cron outreach-find): reading a business's own website for a
// contact email and its company details. No network here, so it is unit-tested.

const BAD_LOCAL = /^(no-?reply|donotreply|privacy|dpo|gdpr|data|careers?|jobs?|recruit\w*|press|media|pr|accounts?|invoices?|finance|payroll|hr|legal|complaints|webmaster|admin|support|abuse|sales?|marketing|newsletter|unsubscribe|test|example|name|email|your|user|shop|store|feedback|vouchers?|gifts?|giftcards?|orders?|deliver\w*)$/i
// Place names that, in a chain's inbox ("yorkbookings@"), mean another branch.
const PLACES = ['aberdeen', 'ancoats', 'bath', 'belfast', 'birmingham', 'blackpool', 'bournemouth', 'bradford', 'brighton', 'bristol', 'brixton', 'cambridge', 'camden', 'canarywharf', 'cardiff', 'chester', 'clapham', 'covent', 'coventry', 'derby', 'dublin', 'edinburgh', 'exeter', 'glasgow', 'harrogate', 'hull', 'ipswich', 'islington', 'kingscross', 'leeds', 'leicester', 'liverpool', 'london', 'manchester', 'middlesbrough', 'miltonkeynes', 'newcastle', 'northernquarter', 'norwich', 'nottingham', 'oxford', 'plymouth', 'portsmouth', 'reading', 'scarborough', 'sheffield', 'shoreditch', 'soho', 'southampton', 'spinningfields', 'stokeontrent', 'sunderland', 'swansea', 'wolverhampton', 'york']
const GOOD_LOCAL = ['info', 'hello', 'enquiries', 'enquiry', 'bookings', 'booking', 'reservations', 'events', 'contact', 'manager', 'managers', 'office', 'reception']

/** Cloudflare hides emails as data-cfemail="hex"; this turns them back into addresses. */
export function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

export function extractEmails(html: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) found.add(decodeCfEmail(m[1]).toLowerCase())
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) found.add(decodeURIComponent(m[1]).toLowerCase())
  for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi)) found.add(m[0].toLowerCase())
  return [...found].filter(e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) && !/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e)
    && !/(sentry|wixpress|example\.|domain\.|email\.com$|yourdomain|godaddy|squarespace|shopify)/.test(e))
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }
const rootOf = (host: string) => host.split('.').slice(-3).join('.').replace(/^[^.]+\.(?=[^.]+\.(co|org|ltd|plc)\.uk$)/, '')

/**
 * The best address to write to: on the business's own domain (or given in OpenStreetMap), a general inbox rather than
 * a person or department, and for a chain the one for this city ("manchesterbookings@…"). Null when there is none.
 */
export function pickEmail(emails: string[], website: string, city: string, osmEmail?: string | null): string | null {
  const site = rootOf(hostOf(website))
  const citySlug = city.toLowerCase().replace(/[^a-z]/g, '')
  const ok = [...new Set([...(osmEmail ? [osmEmail.toLowerCase().trim()] : []), ...emails])].filter(e => {
    const [local, domain] = e.split('@')
    if (!local || !domain || BAD_LOCAL.test(local)) return false
    return (osmEmail && e === osmEmail.toLowerCase().trim()) || (site && (domain === site || domain.endsWith('.' + site) || site.endsWith(domain)))
  })
  if (ok.length === 0) return null
  // A chain lists every branch: keep this city's addresses if there are any, and never another city's.
  const local = (e: string) => e.split('@')[0].replace(/[^a-z]/g, '')
  const forCity = ok.filter(e => local(e).includes(citySlug))
  const notOtherBranch = ok.filter(e => !PLACES.some(pl => pl !== citySlug && local(e).includes(pl)))
  const pool = forCity.length ? forCity : notOtherBranch
  if (pool.length === 0) return null
  const score = (e: string) => { const l = e.split('@')[0]; const i = GOOD_LOCAL.findIndex(g => l === g || l.startsWith(g)); return i === -1 ? 50 : i }
  return pool.sort((a, b) => score(a) - score(b) || a.length - b.length)[0]
}

/** Company numbers written on the site ("Company No. 08651758", "Registered in Scotland SC123456"). */
export function extractCompanyNumbers(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/(?:company|registration|registered|reg\.?)\s*(?:no\.?|number|num\.?|#)?\s*(?:in\s+(?:england(?:\s*(?:&|and)\s*wales)?|scotland|northern\s+ireland|wales)\s*)?(?:no\.?|number|with\s+(?:company\s+)?number)?\s*[:.\-]?\s*((?:SC|NI|OC|SO|NC|R0)?\s?\d{5,8})\b/gi)) {
    const raw = m[1].replace(/\s/g, '').toUpperCase()
    const prefix = raw.match(/^[A-Z]+/)?.[0] ?? ''
    const digits = raw.slice(prefix.length)
    out.add(prefix ? prefix + digits.padStart(8 - prefix.length, '0') : digits.padStart(8, '0'))
  }
  return [...out]
}

/** Company names written on the site ("© 2026 Rudy's Pizza Limited", "We are Dishoom Limited"). */
export function extractCompanyNames(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/([A-Z0-9][A-Za-z0-9&'’.\- ]{1,60}?\s(?:Limited|LIMITED|Ltd\.?|LTD\.?|LLP|PLC|plc))(?![A-Za-z])/g)) {
    let name = m[1].replace(/^.*?(?:©|copyright|\b\d{4}\b|we are|operated by|trading name of|owned by|part of|registered to)\s*/i, '').trim()
    name = name.replace(/^(the\s+)?(website|site|this site)\s+(of|by)\s+/i, '').trim()
    if (name.split(/\s+/).length < 2 || name.length > 60) continue
    if (/^(company|private|a|our|by|registered|all)\b/i.test(name)) continue
    out.add(name)
  }
  return [...out].slice(0, 5)
}

/** "Rudy's Pizza Ltd." and "RUDY'S PIZZA LIMITED" compare equal. */
export function normCompanyName(name: string): string {
  return name.toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/\b(limited|ltd)\b\.?/g, 'ltd').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Companies House company types that are companies (not sole traders/partnerships), so PECR lets us email them. */
export const CORPORATE_TYPES = new Set(['ltd', 'plc', 'llp', 'private-limited-guarant-nsc', 'private-limited-guarant-nsc-limited-exemption', 'private-limited-shares-section-30-exemption', 'private-unlimited', 'scottish-partnership'])
export const isEmailableCompany = (c: { company_status?: string; type?: string } | null | undefined) =>
  Boolean(c && c.company_status === 'active' && c.type && CORPORATE_TYPES.has(c.type) && c.type !== 'scottish-partnership')

export function categoryFromOsm(tags: Record<string, string>): string {
  if (tags.tourism === 'hotel') return 'Hotel'
  if (tags.amenity === 'pub') return 'Pub'
  if (tags.amenity === 'bar') return 'Bar'
  if (tags.amenity === 'cafe') return 'Cafe'
  return 'Restaurant'
}

export function walkLabel(metres: number, venue: string): string {
  return `${Math.max(1, Math.round(metres / 80))} min walk from ${venue}`
}

export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Same-site links worth reading for an email or company details (contact, privacy, terms, legal). */
export function usefulLinks(html: string, baseUrl: string): string[] {
  const base = (() => { try { return new URL(baseUrl) } catch { return null } })()
  if (!base) return []
  const out: string[] = []
  for (const m of html.matchAll(/href="([^"#]+)"/gi)) {
    if (!/contact|privacy|terms|legal|about|imprint|cookie/i.test(m[1])) continue
    try {
      const u = new URL(m[1], base)
      if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue
      const s = u.toString().split('#')[0]
      if (!out.includes(s)) out.push(s)
    } catch { /* skip */ }
  }
  // contact and privacy pages first: that is where the inbox and the legal entity usually are
  const rank = (s: string) => /contact/i.test(s) ? 0 : /privacy/i.test(s) ? 1 : /terms|legal/i.test(s) ? 2 : 3
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 3)
}
