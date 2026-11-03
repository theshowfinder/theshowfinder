import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOutreachEmail, canEmail, type Prospect } from './outreach.ts'

const p: Prospect = {
  id: 'x', business_name: 'The Blue Door', category: 'Restaurant', city: 'Manchester', near_venue: 'Co-op Live',
  distance_label: 'a 6-minute walk from Co-op Live', email: 'info@bluedoor.co.uk', company_type: 'ltd', status: 'approved',
  ref_code: 'abc123', unsubscribe_token: 'tok',
}

test('first email: personal, offer link, unsubscribe, no numbers', () => {
  const e = buildOutreachEmail(p, 'first')
  assert.match(e.subject, /The Blue Door/)
  assert.match(e.text, /only take nine businesses in Manchester/)
  assert.match(e.text, /£29\.95 a month/)
  assert.match(e.text, /decide where to eat before the show/)
  assert.match(e.subject, /We'd love to feature The Blue Door on TheShowFinder Manchester/)
  assert.doesNotMatch(e.text, /chains|independent/i)
  assert.match(e.text, /\/p\/abc123/)
  assert.match(e.text, /\/unsubscribe\/tok/)
  assert.match(e.html, /Unsubscribe/)
  assert.doesNotMatch(e.text, /visitors|clicks|views a month/i)
})

test('follow-up is short and keeps the link', () => {
  const f = buildOutreachEmail({ ...p, contact_name: 'Sam Jones' }, 'follow_up')
  assert.match(f.subject, /^Re: /)
  assert.match(f.text, /^Hi Sam,/)
  assert.match(f.text, /\/p\/abc123/)
})

test('PECR: only limited companies or businesses that said yes', () => {
  assert.equal(canEmail(p), true)
  assert.equal(canEmail({ ...p, company_type: 'sole_trader' }), false)
  assert.equal(canEmail({ ...p, company_type: 'unknown' }), false)
  assert.equal(canEmail({ ...p, company_type: 'consented' }), true)
  assert.equal(canEmail({ ...p, status: 'unsubscribed' }), false)
  assert.equal(canEmail({ ...p, status: 'onboarding' }), false)
})
