// Spreadsheet import for outreach (Chris, 26 Nov 2026): businesses collected by hand from Google Maps etc., pasted
// into Admin → Outreach. Each row only needs a name, a website and a city; the finder (cron outreach-find) then
// reads the website for the email and runs every usual check (Companies House, chains, booking desks, inbox domain,
// mail server) before anything is approved. Imported businesses are read before the map ones.

export interface ImportRow { name: string; website: string; city: string; venue: string | null; email: string | null; category: string | null }

const HEADER_WORDS = /^(business|name|website|site|url|city|town|venue|near|email|category|type)/i

/** Parses rows pasted from a spreadsheet (tab-separated) or a CSV. Columns are found by header when there is one,
 *  otherwise taken in the order: Business, Website, City, Near venue, Email, Category. */
export function parseImport(text: string, cityNames: string[]): { rows: ImportRow[]; skipped: string[] } {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim())
  if (!lines.length) return { rows: [], skipped: [] }
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : splitCsv(l)).map(c => c.trim().replace(/^"|"$/g, '').trim())
  let col = { name: 0, website: 1, city: 2, venue: 3, email: 4, category: 5 }
  const first = split(lines[0])
  if (first.filter(c => HEADER_WORDS.test(c)).length >= 2) {
    const find = (re: RegExp) => first.findIndex(c => re.test(c))
    col = {
      name: find(/^(business|name)/i), website: find(/^(website|site|url)/i), city: find(/^(city|town)/i),
      venue: find(/venue|near/i), email: find(/e-?mail/i), category: find(/^(category|type)/i),
    }
    lines.shift()
  }
  const rows: ImportRow[] = [], skipped: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const c = split(line)
    const get = (i: number) => (i >= 0 ? c[i] ?? '' : '').trim()
    const name = get(col.name)
    let website = get(col.website)
    const cityIn = get(col.city)
    const city = cityNames.find(n => n.toLowerCase() === cityIn.toLowerCase())
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`
    const host = hostOf(website)
    if (!name || !host || !city) { skipped.push(`${name || line.slice(0, 40)}: ${!name ? 'no name' : !host ? 'no website' : `"${cityIn}" is not one of our cities`}`); continue }
    if (/facebook|instagram|google\.|tripadvisor|booking\.com|opentable|linktr\.ee/.test(host)) { skipped.push(`${name}: website is ${host}, not their own site`); continue }
    if (seen.has(host)) continue
    seen.add(host)
    const email = get(col.email).toLowerCase()
    rows.push({ name, website, city, venue: get(col.venue) || null, email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email : null, category: get(col.category) || null })
  }
  return { rows, skipped }
}

export const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
