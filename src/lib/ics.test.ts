import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildIcs, googleCalendarUrl, icsEscape, foldLine, isAllDay, icsUtc } from './ics.ts'

const ev = {
  uid: 'nickelback-o2',
  title: 'Nickelback, Live',
  startISO: '2026-10-17T18:30:00Z', // 19:30 BST
  location: 'The O2, Peninsula Square, London',
  description: 'Find tickets',
  url: 'https://www.theshowfinder.com/events/nickelback-o2',
}
const now = new Date('2026-10-13T10:00:00Z')

describe('buildIcs', () => {
  test('uses the UTC instant, so BST and GMT both land correctly', () => {
    assert.ok(buildIcs(ev, now).includes('DTSTART:20261017T183000Z'))
    assert.ok(buildIcs(ev, now).includes('DTEND:20261017T213000Z'))
    assert.ok(buildIcs({ ...ev, startISO: '2026-12-11T19:30:00Z' }, now).includes('DTSTART:20261211T193000Z'))
  })
  test('is a well formed calendar with CRLF line endings', () => {
    const out = buildIcs(ev, now)
    assert.ok(out.startsWith('BEGIN:VCALENDAR\r\n'))
    assert.ok(out.endsWith('END:VCALENDAR\r\n'))
    assert.ok(out.includes('SUMMARY:Nickelback\\, Live'))
    assert.ok(out.includes('UID:nickelback-o2@theshowfinder.com'))
  })
  test('midnight London becomes an all-day event on the right London date', () => {
    const out = buildIcs({ ...ev, startISO: '2026-10-16T23:00:00Z' }, now)
    assert.ok(out.includes('DTSTART;VALUE=DATE:20261017'))
    assert.ok(out.includes('DTEND;VALUE=DATE:20261018'))
  })
})

describe('helpers', () => {
  test('escape and fold', () => {
    assert.equal(icsEscape('a,b;c\nd'), 'a\\,b\\;c\\nd')
    const folded = foldLine('X:' + 'a'.repeat(200))
    for (const l of folded.split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75)
    assert.equal(folded.replace(/\r\n /g, ''), 'X:' + 'a'.repeat(200))
  })
  test('isAllDay only at London midnight', () => {
    assert.equal(isAllDay('2026-10-16T23:00:00Z'), true)
    assert.equal(isAllDay('2026-10-17T18:30:00Z'), false)
  })
  test('icsUtc format', () => {
    assert.equal(icsUtc(new Date('2026-10-17T18:30:00Z')), '20261017T183000Z')
  })
})

describe('googleCalendarUrl', () => {
  test('has dates, title, location and details', () => {
    const url = googleCalendarUrl(ev)
    assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'))
    assert.ok(url.includes('dates=20261017T183000Z%2F20261017T213000Z'))
    assert.ok(url.includes('text=Nickelback%2C+Live'))
    assert.ok(url.includes('location=The+O2'))
  })
})
