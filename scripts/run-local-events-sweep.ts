/**
 * Manual trigger for the local-events sweep, straight against production Supabase (no CRON_SECRET needed).
 * Same code the cron and /admin/local-events call.
 *
 *   npx tsx scripts/run-local-events-sweep.ts                      # stalest sources, default time budget
 *   npx tsx scripts/run-local-events-sweep.ts --city=Norwich
 *   npx tsx scripts/run-local-events-sweep.ts --key=norwich_visit --budget=60
 *   npx tsx scripts/run-local-events-sweep.ts --city=Derby --action=clean
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const lines = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let value = t.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  loadEnv()
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
  const { syncCouncilEvents } = await import('../src/lib/councilEvents')
  const result = await syncCouncilEvents({
    city: arg('city'),
    key: arg('key'),
    action: arg('action') === 'clean' ? 'clean' : 'refresh',
    budgetMs: arg('budget') ? Number(arg('budget')) * 1000 : undefined,
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
