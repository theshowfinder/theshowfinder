// Guards against the "same canonical URL on many pages" problem Bing flagged:
// the root layout must not set a canonical (every page would inherit it), and
// every public page must set its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(import.meta.dirname, '..', 'app')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name === 'page.tsx') out.push(p)
  }
  return out
}

test('root layout does not set a site-wide canonical', () => {
  const layout = readFileSync(join(APP, 'layout.tsx'), 'utf8')
  assert.ok(!/alternates\s*:\s*\{\s*canonical/.test(layout), 'layout.tsx must not set alternates.canonical')
})

// Pages that are allowed to have no canonical: private/utility pages that are
// noindex or blocked in robots.txt. Anything else must declare one (directly or
// through its metadata helper).
const NO_CANONICAL = [/\/admin\//, /\/login\/page\.tsx$/, /\/signup\/page\.tsx$/, /\/saved\/page\.tsx$/]
// Pages whose metadata is built by a shared helper that sets the canonical.
const HELPER_PAGES = [/\/venues\/\[slug\]\/page\.tsx$/, /\/venues\/\[slug\]\/p\/\[n\]\/page\.tsx$/]

test('every public page sets its own canonical', () => {
  const missing = walk(APP).filter(f => {
    const rel = f.replace(APP, '')
    if (NO_CANONICAL.some(r => r.test(rel))) return false
    if (HELPER_PAGES.some(r => r.test(rel))) return false
    return !/canonical/.test(readFileSync(f, 'utf8'))
  })
  assert.deepEqual(missing.map(f => f.replace(APP, '')), [])
})

test('venue metadata helper sets a canonical', () => {
  assert.match(readFileSync(join(APP, 'venues', '[slug]', 'venueMetadata.ts'), 'utf8'), /canonical/)
})
