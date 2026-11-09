import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { planAlert, sameAct, playsNear, capReason, type AlertStoryFacts, type AlertSubscriber } from './newsAlertTargeting.ts'

const story = (id: string, artist: string, cities: string[], score = 80, notable = false): AlertStoryFacts =>
  ({ id, slug: id, artist_name: artist, score, facts: { cities, artistSlug: `${id}-slug`, notable } })
const shania = story('shania', 'Shania Twain', ['Glasgow', 'Cardiff'], 116, true)
const urzila = story('urzila', 'Urzila Carlson', ['Leeds'], 60)
const brum = story('brum', 'Kingfishr', ['Birmingham'], 70)
const sub = (p: Partial<AlertSubscriber>): AlertSubscriber => ({ email: 'a@b.com', city: null, actNames: [], artistSlugs: [], ...p })
const none = { sentAt: [] as string[], storyIds: new Set<string>() }
const tuesday = new Date('2026-11-10T06:20:00Z')

describe('who gets which story', () => {
  test('an act they signed up from leads, then their city, then big news', () => {
    const p = planAlert(sub({ city: 'Birmingham', actNames: ["Urzila Carlson - That's Enough Already"] }), [shania, urzila, brum], none, tuesday)
    assert.deepEqual(p.map(x => [x.story.id, x.reason]), [['urzila', 'artist'], ['brum', 'city'], ['shania', 'big']])
  })
  test('no city or act: only the big announcements', () => {
    assert.deepEqual(planAlert(sub({}), [urzila, brum, shania], none, tuesday).map(x => x.story.id), ['shania'])
  })
  test('nothing relevant and nothing big: no email', () => {
    assert.equal(planAlert(sub({ city: 'Hull' }), [urzila, brum], none, tuesday).length, 0)
  })
  test('a story is never sent twice', () => {
    assert.equal(planAlert(sub({}), [shania], { sentAt: [], storyIds: new Set(['shania']) }, tuesday).length, 0)
  })
})

describe('not spam', () => {
  test('one a day, three a week, none on Mondays', () => {
    assert.match(capReason({ sentAt: ['2026-11-10T05:20:00Z'], storyIds: new Set() }, new Date('2026-11-10T17:20:00Z')) ?? '', /today/)
    assert.match(capReason({ sentAt: ['2026-11-04T05:20:00Z', '2026-11-05T05:20:00Z', '2026-11-06T05:20:00Z'], storyIds: new Set() }, tuesday) ?? '', /this week/)
    assert.match(capReason(none, new Date('2026-11-09T06:20:00Z')) ?? '', /monday/)
    assert.equal(capReason(none, tuesday), null)
  })
})

describe('matching rules', () => {
  test('act names', () => {
    assert.equal(sameAct('Shania Twain', 'Shania Twain'), true)
    assert.equal(sameAct("Urzila Carlson - That's Enough Already", 'Urzila Carlson'), true)
    assert.equal(sameAct('Classical Spectacular', 'Shania Twain'), false)
    assert.equal(sameAct('The Script', 'Script'), true)
  })
  test('nearby towns count for the city', () => {
    assert.equal(playsNear(['Burton upon Trent'], 'Derby'), 'Burton upon Trent')
    assert.equal(playsNear(['Leeds'], 'Derby'), null)
  })
})
