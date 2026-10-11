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

test('parses UK-formatted event dates', () => {
  const rows = parseSeeTicketsCsv([
    'aw_product_id,event_name,event_date,aw_deep_link',
    '456,Another Show,28/11/2027,https://example.test/ticket',
  ].join('\n'))
  assert.equal(rows[0].event_date, '2027-11-28')
})

test('parses named event dates', () => {
  const rows = parseSeeTicketsCsv([
    'aw_product_id,event_name,event_date,aw_deep_link',
    '789,Named Date Show,28 Nov 2027,https://example.test/ticket',
  ].join('\n'))
  assert.equal(rows[0].event_date, '2027-11-28')
})

test('maps Awin ticket columns with the Tickets prefix', () => {
  const rows = parseSeeTicketsCsv([
    'aw_product_id,Tickets:event_date,Tickets:event_name,Tickets:venue_name,Tickets:event_location_city,aw_deep_link',
    '321,2027-12-02,Prefixed Show,The Venue,Manchester,https://example.test/ticket',
  ].join('\n'))
  assert.equal(rows[0].name, 'Prefixed Show')
  assert.equal(rows[0].event_date, '2027-12-02')
  assert.equal(rows[0].venue, 'The Venue')
  assert.equal(rows[0].city, 'Manchester')
})
