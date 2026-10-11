import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSeeTicketsCsv } from './seeTicketsCsv.ts'

test('parses See Tickets event columns and quoted commas', () => {
  const rows = parseSeeTicketsCsv([
    'aw_product_id,merchant_product_id,product_name,event_name,primary_artist,event_date,venue_name,event_location_city,event_location_country,aw_deep_link,min_price',
    '123,abc,Fallback,"The Show, Live",Artist,2027-11-28,Depot Mayfield,Manchester,United Kingdom,https://example.test/ticket,35.00',
  ].join('\n'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, '123')
  assert.equal(rows[0].name, 'The Show, Live')
  assert.equal(rows[0].event_date, '2027-11-28')
  assert.equal(rows[0].min_price, 35)
})
