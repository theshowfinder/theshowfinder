import test from 'node:test'
import assert from 'node:assert/strict'
import { parseImport } from './outreachImport.ts'

const cities = ['Brighton', 'Manchester']

test('import: pasted spreadsheet rows with a header', () => {
  const { rows, skipped } = parseImport([
    'Business\tWebsite\tCity\tNear venue\tEmail',
    'Furna\twearefurna.com\tbrighton\tTheatre Royal Brighton\thello@wearefurna.com',
    'Bad one\thttps://facebook.com/bad\tBrighton\t\t',
    'Nowhere\tnowhere.co.uk\tAtlantis\t\t',
    'Furna again\thttps://www.wearefurna.com/menu\tBrighton\t\t',
  ].join('\n'), cities)
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { name: 'Furna', website: 'https://wearefurna.com', city: 'Brighton', venue: 'Theatre Royal Brighton', email: 'hello@wearefurna.com', category: null })
  assert.equal(skipped.length, 2)
})

test('import: CSV without a header, in the default column order', () => {
  const { rows } = parseImport('"The Blue Door, Bar",https://bluedoor.co.uk,Manchester,Co-op Live', cities)
  assert.equal(rows[0].name, 'The Blue Door, Bar')
  assert.equal(rows[0].venue, 'Co-op Live')
  assert.equal(rows[0].email, null)
})

test("import: Chris's tracker sheet columns (City, Business, Category, Contact Email, …, Website / Contact Page)", () => {
  const { rows } = parseImport('City\tBusiness\tCategory\tContact Email\tContact Name\tWebsite / Contact Page\nManchester\tBAB NQ\tRestaurant\tinfo@babnq.co.uk\t\thttps://babnq.co.uk/', cities)
  assert.deepEqual(rows[0], { name: 'BAB NQ', website: 'https://babnq.co.uk/', city: 'Manchester', venue: null, email: 'info@babnq.co.uk', category: 'Restaurant' })
})
