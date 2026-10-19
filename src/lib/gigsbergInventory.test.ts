import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The module imports '@/…' (not resolvable under node --test), so the pure rule is asserted
// from source, plus guards that the batch only writes inventory fields.
const src = readFileSync(join(import.meta.dirname, 'gigsbergInventory.ts'), 'utf8')

test('a positive listing total means available, otherwise no inventory', () => {
  assert.match(src, /\(total \?\? 0\) > 0 \? 'available' : 'no_inventory'/)
})

test('only matched catalogue rows are checked, oldest check first', () => {
  assert.match(src, /MATCHED_STATUSES = \['auto_matched', 'approved_existing', 'approved_new'\]/)
  assert.match(src, /order\('inventory_checked_at', \{ ascending: true, nullsFirst: true \}\)/)
})

test('the batch writes inventory fields only (no affiliate urls, highlights or ids)', () => {
  const updates = [...src.matchAll(/\.update\(\s*\{([^}]*)\}/g)].map(m => m[1])
  assert.ok(updates.length >= 2)
  for (const u of updates) assert.match(u, /^\s*(inventory_status|gigsberg_inventory_status)/)
  assert.ok(!/gigsberg_affiliate_url|gigsberg_highlight|matched_event_id:/.test(updates.join(' ')))
})
