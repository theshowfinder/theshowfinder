// Manual check of an HTML local-events reader against live pages:
//   npx tsx scripts/check-local-html.ts <parser> <city> <sitemapUrl> <pathRegex> [count]
// Reads the sitemap, takes the newest-looking N event pages and prints what the reader makes of each.
import { eventFromHtml, isHtmlParser } from '../src/lib/localEventHtml'
import { parseSitemap, matchesDetailPattern, pageId } from '../src/lib/localEventParsing'

const UA = 'Mozilla/5.0 (compatible; TheShowFinderBot/1.0; +https://theshowfinder.com)'
async function get(u: string) { const r = await fetch(u, { headers: { 'User-Agent': UA } }); return r.ok ? r.text() : '' }

async function main() {
  const [parser, city, sitemap, pattern, n] = process.argv.slice(2)
  if (!isHtmlParser(parser)) throw new Error('unknown parser')
  const sm = parseSitemap(await get(sitemap))
  let entries = sm.entries
  if (sm.isIndex) {
    const kids = sm.entries.filter(e => /event|whats/i.test(e.url))
    entries = []
    for (const k of kids.slice(0, 4)) entries.push(...parseSitemap(await get(k.url)).entries)
  }
  const urls = entries.map(e => e.url).filter(u => matchesDetailPattern(u, pattern))
  const hasIds = urls.some(u => pageId(u) > 0)
  const pick = (hasIds ? urls.sort((a, b) => pageId(b) - pageId(a)) : urls.slice().reverse()).slice(0, Number(n ?? 8))
  console.log(`${urls.length} matching pages; checking ${pick.length}`)
  let ok = 0
  for (const u of pick) {
    const ev = eventFromHtml(parser, await get(u), u, city)
    if (ev) ok++
    console.log(ev ? `OK  ${ev.startDate}  ${ev.title.slice(0, 50)} | ${ev.venueName} | ${ev.city} | ${ev.postcode ?? ''} | ${ev.lat ?? ''},${ev.lng ?? ''}` : `--  ${u}`)
  }
  console.log(`${ok}/${pick.length} read as upcoming events`)
}
main().catch(e => { console.error(e); process.exit(1) })
