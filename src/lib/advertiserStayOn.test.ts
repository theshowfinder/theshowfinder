import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stayOnPath, verifyStayOn } from './advertiserStayOn.ts'

const id = '258f67f5-f732-4703-b4bc-55188e34be7f'
test('a stay-on link verifies and cannot be forged or reused for another business', () => {
  const path = stayOnPath(id, 'secret-1')
  const q = new URLSearchParams(path.split('?')[1])
  assert.equal(verifyStayOn({ a: q.get('a'), k: q.get('k') }, 'secret-1'), id)
  assert.equal(verifyStayOn({ a: q.get('a'), k: q.get('k') }, 'other-secret'), null)
  assert.equal(verifyStayOn({ a: 'e384ce35-552a-4cdd-b72d-3b32b223a41e', k: q.get('k') }, 'secret-1'), null)
  assert.equal(verifyStayOn({ a: id, k: 'x' }, 'secret-1'), null)
  assert.equal(verifyStayOn({ a: id, k: q.get('k') }, ''), null)
})
