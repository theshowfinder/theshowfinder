import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { idTailPattern, slugIdTail } from './renamedEvents.ts'

describe('slugIdTail', () => {
  it('takes the id tail even when it contains a dash or underscore', () => {
    assert.equal(slugIdTail('raye-_fraI-ph'), '_fraI-ph')
    assert.equal(slugIdTail('raye-this-symphony-may-contain-hope-_fraI-ph'), '_fraI-ph')
    assert.equal(slugIdTail('overpass-1OZwRQUT'), '1OZwRQUT')
  })
  it('ignores slugs that cannot carry a tail', () => {
    assert.equal(slugIdTail('short'), null)
    assert.equal(slugIdTail('nodashhereatallinthisslug'), null)
  })
})

describe('idTailPattern', () => {
  it('escapes LIKE wildcards', () => {
    assert.equal(idTailPattern('_fraI-ph'), '%\\_fraI-ph')
    assert.equal(idTailPattern('1OZwRQUT'), '%1OZwRQUT')
  })
})
