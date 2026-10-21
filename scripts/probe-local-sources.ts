// Probe candidate local-event sources the way the sweep reads them (no writes):
//   npx tsx scripts/probe-local-sources.ts <file.json>   (array of {city, label, ...CandidateSource})
import { readFileSync } from 'node:fs'
import { probeCandidateSource, type CandidateSource } from '../src/lib/councilEvents'

type C = CandidateSource & { city: string; label: string }
async function main() {
  const list = JSON.parse(readFileSync(process.argv[2], 'utf-8')) as C[]
  const out: string[] = []
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async c => {
      try {
        const p = await probeCandidateSource(c, c.city)
        const ok = p.sample.filter(s => s.ok)
        out.push(`${c.city.padEnd(11)} ${c.label.padEnd(26)} pages=${String(p.discovered).padStart(5)} readable=${ok.length}/${p.sample.length}  e.g. ${ok[0] ? `${ok[0].start} ${ok[0].title?.slice(0, 35)} | ${ok[0].venue} | ${ok[0].city}` : (p.sample[0]?.reason ?? '')}`)
      } catch (e) { out.push(`${c.city} ${c.label} ERROR ${e instanceof Error ? e.message : e}`) }
    }))
  }
  console.log(out.sort().join('\n'))
}
main()
