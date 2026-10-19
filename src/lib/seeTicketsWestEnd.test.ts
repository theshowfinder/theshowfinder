import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SEE_TICKETS_WEST_END, isSeeTicketsRunPage, normalizeTitle, seeTicketsUrlForShow } from './seeTicketsWestEnd.ts'

describe('normalizeTitle', () => {
  it('strips punctuation and case', () => {
    assert.equal(normalizeTitle('Mamma Mia!'), 'mamma mia')
    assert.equal(normalizeTitle('Dirty Dancing - The Classic Story On Stage'), 'dirty dancing the classic story on stage')
  })
})

describe('seeTicketsUrlForShow', () => {
  it('matches exact and prefixed titles at the right theatre', () => {
    assert.match(seeTicketsUrlForShow('Mamma Mia!', 'Novello Theatre')!, /mamma-mia-\/1023$/)
    assert.match(seeTicketsUrlForShow('SIX The Musical', 'Vaudeville Theatre')!, /\/six\/320$/)
    assert.match(seeTicketsUrlForShow('Harry Potter and the Cursed Child - One Part Show', 'Palace Theatre')!, /1270$/)
    assert.match(seeTicketsUrlForShow('Sinatra the Musical', 'Aldwych Theatre')!, /1176$/)
  })
  it('does not match the wrong theatre or a longer different title', () => {
    assert.equal(seeTicketsUrlForShow('Mamma Mia!', 'Palace Theatre'), null)
    assert.equal(seeTicketsUrlForShow('Sixteen Candles', 'Vaudeville Theatre'), null)
  })
  it('returns null for shows See Tickets does not sell', () => {
    assert.equal(seeTicketsUrlForShow('The Lion King', 'Lyceum Theatre'), null)
    assert.equal(seeTicketsUrlForShow(null, 'Lyceum Theatre'), null)
  })
  it('mapping is unique per title+venue and all urls are See Tickets tour pages', () => {
    const keys = SEE_TICKETS_WEST_END.map(l => `${l.title}|${l.venue}`)
    assert.equal(new Set(keys).size, keys.length)
    for (const l of SEE_TICKETS_WEST_END) assert.match(l.url, /^https:\/\/www\.seetickets\.com\/n\/tour\/[^/]+\/\d+$/)
  })
})

describe('isSeeTicketsRunPage', () => {
  it('tells run pages from exact-performance links', () => {
    assert.equal(isSeeTicketsRunPage('https://www.seetickets.com/n/tour/the-play-that-goes-wrong/1'), true)
    assert.equal(isSeeTicketsRunPage('https://www.awin1.com/pclick.php?p=40510475738&a=2896631&m=7816'), false)
    assert.equal(isSeeTicketsRunPage(null), false)
  })
})
