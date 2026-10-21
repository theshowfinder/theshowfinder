// Supabase stops auto-granting Data API access to NEW tables in the public schema on
// 30 Oct 2026. A table (or view) created after that with no GRANT is invisible to
// supabase-js: our server code (service_role) gets "permission denied" and the job or
// page that uses it silently breaks. Existing tables keep their grants.
//
// Rule enforced here for every migration from 079 onwards: each table, view or
// materialized view the file creates in public must be granted to service_role in the
// same file. Grants to anon / authenticated are optional and deliberate: leave them out
// for admin/server-only tables (the default and safer choice), add them only for data
// the public site or signed-in users read directly. See CLAUDE.md "Database migrations".

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const FIRST_CHECKED = 79

const CREATE_RE = /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?/gi

export function createdObjects(sql: string): string[] {
  const clean = sql.replace(/--.*$/gm, '')
  const names: string[] = []
  for (const m of clean.matchAll(CREATE_RE)) {
    const schema = m[1]?.toLowerCase()
    if (schema && schema !== 'public') continue
    names.push(m[2].toLowerCase())
  }
  return [...new Set(names)]
}

export function grantedToServiceRole(sql: string, name: string): boolean {
  const clean = sql.replace(/--.*$/gm, '').toLowerCase()
  const re = new RegExp(`grant\\s+[^;]*?\\s+on\\s+(?:table\\s+)?(?:"?public"?\\.)?"?${name}"?\\s+to\\s+[^;]*\\bservice_role\\b`)
  return re.test(clean)
}

describe('migration grants (Supabase Data API change, 30 Oct 2026)', () => {
  test('helpers find created objects and their service_role grant', () => {
    const sql = `create table if not exists public.foo (id int);
      create or replace view public.bar_view as select 1;
      create table other.skip_me (id int);
      -- create table public.commented_out (id int);
      grant select, insert, update, delete on public.foo to service_role;
      grant select on bar_view to anon, authenticated, service_role;`
    assert.deepEqual(createdObjects(sql), ['foo', 'bar_view'])
    assert.ok(grantedToServiceRole(sql, 'foo'))
    assert.ok(grantedToServiceRole(sql, 'bar_view'))
    assert.ok(!grantedToServiceRole('create table public.baz (id int); grant select on public.baz to anon;', 'baz'))
  })

  test(`every migration from ${FIRST_CHECKED} grants each new table/view to service_role`, () => {
    const dir = join(process.cwd(), 'supabase')
    const missing: string[] = []
    for (const file of readdirSync(dir)) {
      const m = /^migration_(\d+)_.*\.sql$/.exec(file)
      if (!m || Number(m[1]) < FIRST_CHECKED) continue
      const sql = readFileSync(join(dir, file), 'utf-8')
      for (const name of createdObjects(sql)) {
        if (!grantedToServiceRole(sql, name)) missing.push(`${file}: ${name}`)
      }
    }
    assert.deepEqual(missing, [], `Add "grant select, insert, update, delete on public.<name> to service_role;" (and anon/authenticated only if the public site reads it) to: ${missing.join(', ')}`)
  })
})
