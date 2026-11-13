import test from 'node:test'
import assert from 'node:assert/strict'
import { actName, onePerAct, isoWeek, stableUuid, buildOnSaleRoundupDraft, buildWeekendDraft, buildPresaleAlertDraft, buildPartnerDraft, weekendCities } from './socialAuto.ts'

test('act names, one per act, weeks and stable ids', () => {
  assert.equal(actName('Muse - The Wow! Signal Europa Tour'), 'Muse')
  assert.equal(actName('Bill Bailey: Vaudevillean'), 'Bill Bailey')
  assert.equal(actName('Kasabian (Touring)'), 'Kasabian')
  assert.deepEqual(onePerAct([{ title: 'Muse - Tour' }, { title: 'Muse - Tour' }, { title: 'Jungle' }], 5).map(r => r.title), ['Muse - Tour', 'Jungle'])
  assert.equal(isoWeek(new Date('2026-11-16T00:00:00Z')), '2026-W47')
  assert.equal(stableUuid('a'), stableUuid('a'))
  assert.match(stableUuid('a'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.deepEqual(weekendCities(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'], '2026-W47'), ['E', 'F'])
})

test('list posts carry the list in the image and the captions', () => {
  const items = [{ title: 'Phoebe Bridgers', line: 'Mon 10am · Co-op Live' }, { title: 'Jungle', line: 'Fri 9am · The O2' }]
  const r = buildOnSaleRoundupDraft({ weekKey: '2026-W47', items })
  assert.equal(r.source_type, 'roundup')
  assert.equal(r.image_params.kind, 'roundup')
  assert.deepEqual((r.image_params as unknown as { list: unknown }).list, items)
  assert.match(r.instagram_text, /• Phoebe Bridgers: Mon 10am · Co-op Live/)
  assert.match(r.facebook_text, /on-sale-this-week/)
  assert.equal(r.status, 'draft')
  const w = buildWeekendDraft({ weekKey: '2026-W47', city: 'Leeds', items })
  assert.equal(w.headline, 'This weekend in Leeds')
  assert.match(w.facebook_text, /cities\/Leeds\/this-weekend/)
  assert.notEqual(w.source_id, r.source_id)
})

test('presale alert and partner post', () => {
  const p = buildPresaleAlertDraft({ eventId: '11111111-1111-4111-8111-111111111111', act: 'Kasabian', presaleLabel: 'Fri 10am', generalLabel: 'Sat 21 Nov 10am', dates: 6, cities: ['Leeds', 'Manchester', 'Glasgow', 'London', 'Cardiff'], imageUrl: null, destinationPath: '/artists/kasabian', city: null })
  assert.equal(p.headline, 'Kasabian presale opens Fri 10am')
  assert.match(p.instagram_text, /6 UK dates \(Leeds, Manchester, Glasgow, London and 1 more\)/)
  assert.equal(p.image_params.kind, 'presale')
  const b = buildPartnerDraft({ businessId: '22222222-2222-4222-8222-222222222222', name: 'The Dial', city: 'London', nearVenue: 'The O2', offer: '10% off food with your show ticket' })
  assert.equal(b.source_type, 'partner')
  assert.match(b.instagram_text, /Tag The Dial when you post this/)
  assert.match(b.instagram_text, /with 10% off food with your show ticket for show-goers/)
})
