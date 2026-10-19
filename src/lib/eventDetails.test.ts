import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanTmText, cleanBoxOffice, extractEventDetails, extractVenueDetails, detailsKey, buildEventFaq,
} from './eventDetails.ts'

describe('cleanTmText', () => {
  test('strips markup and entities, collapses whitespace', () => {
    assert.equal(cleanTmText('<p>Free parking&nbsp;after 6pm &amp; weekends.</p><br/>Blue badge bays on site.'), 'Free parking after 6pm & weekends. Blue badge bays on site.')
  })
  test('returns null for empty or tiny values', () => {
    assert.equal(cleanTmText(''), null)
    assert.equal(cleanTmText(null), null)
    assert.equal(cleanTmText('n/a'), null)
  })
  test('caps long text at a sentence end', () => {
    const text = 'First sentence is here. '.repeat(40)
    const out = cleanTmText(text, 100)!
    assert.ok(out.length <= 100)
    assert.ok(out.endsWith('.'))
  })
})

describe('extractEventDetails', () => {
  test('support acts exclude the headliner and the event title and are de-duplicated', () => {
    const d = extractEventDetails({
      name: 'The Strokes',
      _embedded: { attractions: [{ name: 'The Strokes' }, { name: 'Sleeper' }, { name: 'Sleeper' }, { name: 'The Strokes' }, { name: 'Wet Leg' }] },
    })
    assert.ok(d?.support?.includes('Sleeper'))
    assert.ok(d?.support?.includes('Wet Leg'))
    assert.ok(!d?.support?.includes('The Strokes'))
  })
  test('returns null when there is nothing to keep', () => {
    assert.equal(extractEventDetails({ name: 'x', _embedded: { attractions: [{ name: 'x' }] } }), null)
  })
  test('age note only when enforced; seatmap must be https', () => {
    assert.equal(extractEventDetails({ ageRestrictions: { legalAgeEnforced: false } }), null)
    assert.ok(extractEventDetails({ ageRestrictions: { legalAgeEnforced: true } })?.age)
    assert.equal(extractEventDetails({ seatmap: { staticUrl: 'http://x.test/a.png' } }), null)
    assert.equal(extractEventDetails({ seatmap: { staticUrl: 'https://x.test/a.png' } })?.seatmapUrl, 'https://x.test/a.png')
  })
})

describe('extractVenueDetails', () => {
  test('keeps only present, cleaned fields', () => {
    const d = extractVenueDetails({
      parkingDetail: '<b>Car park</b> on Mill Road, open until midnight.',
      generalInfo: { childRule: 'Under 14s must be accompanied by an adult.' },
    })
    assert.equal(d?.parking, 'Car park on Mill Road, open until midnight.')
    assert.equal(d?.childRule, 'Under 14s must be accompanied by an adult.')
    assert.equal(d?.accessibleSeating, undefined)
  })
  test('null when empty', () => {
    assert.equal(extractVenueDetails({}), null)
  })
})

describe('detailsKey', () => {
  test('is stable regardless of key order and empty for null', () => {
    assert.equal(detailsKey({ b: 1, a: 2 }), detailsKey({ a: 2, b: 1 }))
    assert.equal(detailsKey(null), '')
  })
})

describe('buildEventFaq', () => {
  const base = {
    title: 'The Strokes', venueName: 'The O2', venueAddress: 'Peninsula Square', city: 'London',
    dateLabel: 'Tuesday 6 October 2026', startLabel: '19:30', doorsLabel: null as string | null,
    status: 'on_sale', details: null, venueDetails: null, providerNames: ['Ticketmaster', 'Viagogo'],
  }
  test('always answers start time, set times, venue and tickets', () => {
    const qs = buildEventFaq(base).map(f => f.q)
    assert.ok(qs.some(q => q.startsWith('What time does')))
    assert.ok(qs.some(q => q.startsWith('What are the set times')))
    assert.ok(qs.some(q => q.startsWith('Where is')))
    assert.ok(qs.some(q => q.startsWith('Where can I buy')))
  })
  test('does not claim doors when none are known', () => {
    const a = buildEventFaq(base)[0].a
    assert.ok(!/doors open/i.test(a))
    assert.ok(/19:30/.test(a))
  })
  test('uses doors, support, parking and access only when present', () => {
    const faq = buildEventFaq({
      ...base,
      doorsLabel: '18:30',
      details: { support: ['Sleeper'], accessibility: 'Step-free entrance.' },
      venueDetails: { parking: 'Car park on site.', accessibleSeating: 'Wheelchair platforms available.' },
    })
    const text = faq.map(f => `${f.q} ${f.a}`).join(' ')
    assert.ok(text.includes('Doors open at 18:30'))
    assert.ok(text.includes('Sleeper'))
    assert.ok(text.includes('Car park on site.'))
    assert.ok(text.includes('Step-free entrance. Wheelchair platforms available.'))
  })
  test('cancelled events lead with status and skip ticket-buying copy', () => {
    const faq = buildEventFaq({ ...base, status: 'cancelled' })
    assert.ok(faq[0].q.includes('still going ahead'))
    assert.ok(!faq.some(f => f.q.startsWith('Where can I buy')))
  })
})

describe('cleanBoxOffice', () => {
  test('removes Ticketmaster booking lines, fax and call-charge text but keeps hours', () => {
    assert.equal(
      cleanBoxOffice('Monday - Saturday: 10:00 - 20:00. Ticketmaster UK: 0870 154 40 40 International: 00 44 161 385 3500 Groups Number: 0844 844 2121 or Fax 020 7915 0414 Calls will cost 7 ppm plus your network access charge.'),
      'Monday - Saturday: 10:00 - 20:00.',
    )
  })
  test('keeps the venue\'s own number', () => {
    assert.equal(
      cleanBoxOffice('Monday - Saturday 11:00 - 23:00 Ticketmaster UK 0870 154 40 40, International 00 44 161 385 3500 Underworld (+44) 020 7482 1932'),
      'Monday - Saturday 11:00 - 23:00 Underworld (+44) 020 7482 1932',
    )
  })
  test('returns undefined when only Ticketmaster numbers were there', () => {
    assert.equal(cleanBoxOffice('Ticketmaster UK 0870 154 40 40, International 00 44 161 385 3500'), undefined)
    assert.equal(cleanBoxOffice(''), undefined)
    assert.equal(cleanBoxOffice(null), undefined)
  })
})
