import test from 'node:test'
import assert from 'node:assert/strict'
import { organiserLinkParams, verifyOrganiserLink } from './organiserAccess.ts'

const id = '11111111-2222-3333-4444-555555555555'
test('signed organiser links', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')
  const p = organiserLinkParams(id, 'secret', now)
  assert.equal(verifyOrganiserLink(p, 'secret', now), id)
  assert.equal(verifyOrganiserLink(p, 'other', now), null)
  assert.equal(verifyOrganiserLink({ ...p, o: '11111111-2222-3333-4444-666666666666' }, 'secret', now), null)
  assert.equal(verifyOrganiserLink({ ...p, e: String(Number(p.e) + 100) }, 'secret', now), null)
  assert.equal(verifyOrganiserLink(p, 'secret', now + 31 * 86400_000), null)
  assert.equal(verifyOrganiserLink(p, '', now), null)
})
