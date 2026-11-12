import test from 'node:test'
import assert from 'node:assert/strict'
import { eventSeoTitle, eventSeoDescription } from './eventSeo.ts'

test('set times in the title for shows in the next 30 days, when it fits', () => {
  assert.equal(eventSeoTitle({ title: 'Jalen Ngonda', venueStr: 'O2 Academy Brixton, London', venueName: 'O2 Academy Brixton', shortDate: '14 Nov 2026', daysAway: 3 }),
    'Jalen Ngonda, O2 Academy Brixton: Set Times – 14 Nov 2026')
  assert.equal(eventSeoTitle({ title: 'Westlife', venueStr: 'SSE Arena, Belfast', venueName: 'SSE Arena', shortDate: '20 Nov 2026', daysAway: 8 }),
    'Westlife, SSE Arena: Set Times – 20 Nov 2026')
  assert.equal(eventSeoTitle({ title: 'Westlife', venueStr: 'SSE Arena, Belfast', shortDate: '20 Jun 2027', daysAway: 220 }), 'Westlife at SSE Arena, Belfast – 20 Jun 2027')
  const long = eventSeoTitle({ title: 'A Very Long Tour Name That Goes On And On Forever', venueStr: 'Some Venue, Leeds', venueName: 'Some Venue', shortDate: '1 Dec 2026', daysAway: 5 })
  assert.ok(long.length <= 60 || long.startsWith('A Very Long Tour Name That Goes On And On Forever at'), long)
})

test('description leads with date, doors, start and support', () => {
  const d = eventSeoDescription({ title: 'Jalen Ngonda', venueName: 'O2 Academy Brixton', city: 'London', dateStr: 'Saturday 14 November 2026', doors: '19:00', start: '20:00', support: ['Ally Brown'] })
  assert.equal(d, 'Jalen Ngonda at O2 Academy Brixton, London on Saturday 14 November 2026. Doors 19:00, show 20:00. With Ally Brown. Set times, support and tickets from official sellers.'.length <= 158
    ? 'Jalen Ngonda at O2 Academy Brixton, London on Saturday 14 November 2026. Doors 19:00, show 20:00. With Ally Brown. Set times, support and tickets from official sellers.'
    : 'Jalen Ngonda at O2 Academy Brixton, London on Saturday 14 November 2026. Doors 19:00, show 20:00. With Ally Brown.')
  assert.ok(d.length <= 158)
  const plain = eventSeoDescription({ title: 'Panto', venueName: 'Leeds Grand Theatre', city: 'Leeds', dateStr: 'Friday 4 December 2026', doors: null, start: null })
  assert.equal(plain, 'Panto at Leeds Grand Theatre on Friday 4 December 2026. Find tickets from official sellers.')
})
