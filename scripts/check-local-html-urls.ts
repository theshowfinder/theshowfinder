// npx tsx scripts/check-local-html-urls.ts <parser> <city> <url> [<url> ...]
import { eventFromHtml, isHtmlParser } from '../src/lib/localEventHtml'
const UA = 'Mozilla/5.0 (compatible; TheShowFinderBot/1.0; +https://theshowfinder.com)'
async function main() {
  const [parser, city, ...urls] = process.argv.slice(2)
  if (!isHtmlParser(parser)) throw new Error('unknown parser')
  for (const u of urls) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } })
    const ev = eventFromHtml(parser, r.ok ? await r.text() : '', u, city)
    console.log(r.status, ev ? `${ev.startDate} ${ev.title} | ${ev.venueName} | ${ev.city} | ${ev.postcode ?? ''} | ${ev.lat ?? ''},${ev.lng ?? ''}` : `-- ${u}`)
  }
}
main()
