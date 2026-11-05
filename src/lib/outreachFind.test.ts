import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeCfEmail, extractEmails, pickEmail, extractCompanyNumbers, extractCompanyNames, normCompanyName, isEmailableCompany, usefulLinks, walkLabel } from './outreachFind.ts'

test('decodes Cloudflare-protected emails', () => {
  // "a@b.co" xor 0x12
  const hex = '12' + [...'a@b.co'].map(c => (c.charCodeAt(0) ^ 0x12).toString(16).padStart(2, '0')).join('')
  assert.equal(decodeCfEmail(hex), 'a@b.co')
})

test('picks the general inbox on the business\'s own domain, the city one for a chain', () => {
  const emails = extractEmails('<a href="mailto:bathbookings@cosyclub.co.uk">x</a> manchesterbookings@cosyclub.co.uk privacy@cosyclub.co.uk logo@2x.png')
  assert.equal(pickEmail(emails, 'https://www.cosyclub.co.uk/locations/manchester/', 'Manchester'), 'manchesterbookings@cosyclub.co.uk')
  assert.equal(pickEmail(['jane.smith@gmail.com', 'privacy@rudyspizza.co.uk', 'peterstreet@rudyspizza.co.uk', 'info@rudyspizza.co.uk'], 'https://www.rudyspizza.co.uk/peter-st', 'Manchester'), 'info@rudyspizza.co.uk')
  assert.equal(pickEmail(['someone@gmail.com'], 'https://bar.co.uk', 'Leeds'), null)
  assert.equal(pickEmail([], 'https://bar.co.uk', 'Leeds', 'Bar.Owner@gmail.com'), 'bar.owner@gmail.com')
})

test('reads company numbers and names from footers and privacy pages', () => {
  assert.deepEqual(extractCompanyNumbers('Registered in England and Wales. Company No. 8651758. VAT 123'), ['08651758'])
  assert.deepEqual(extractCompanyNumbers('Registered in Scotland SC123456'), ['SC123456'])
  assert.deepEqual(extractCompanyNames('© 2026 Rudy\'s Pizza Limited. All rights reserved'), ["Rudy's Pizza Limited"])
  assert.deepEqual(extractCompanyNames('We are Dishoom Limited (referred to as "we")'), ['Dishoom Limited'])
  assert.equal(normCompanyName("RUDY'S PIZZA LIMITED"), normCompanyName("Rudy’s Pizza Ltd."))
})

test('only active companies count', () => {
  assert.equal(isEmailableCompany({ company_status: 'active', type: 'ltd' }), true)
  assert.equal(isEmailableCompany({ company_status: 'dissolved', type: 'ltd' }), false)
  assert.equal(isEmailableCompany({ company_status: 'active', type: 'scottish-partnership' }), false)
})

test('finds contact and privacy links on the same site', () => {
  const html = '<a href="/privacy-policy">P</a><a href="https://other.com/contact">X</a><a href="/contact-us">C</a><a href="/menu">M</a>'
  assert.deepEqual(usefulLinks(html, 'https://www.bar.co.uk/'), ['https://www.bar.co.uk/contact-us', 'https://www.bar.co.uk/privacy-policy'])
  assert.equal(walkLabel(260, 'AO Arena'), '3 min walk from AO Arena')
})

test('never picks another branch\'s inbox', () => {
  assert.equal(pickEmail(['york@rudyspizza.co.uk', 'peterstreet@rudyspizza.co.uk'], 'https://www.rudyspizza.co.uk/', 'Manchester'), 'peterstreet@rudyspizza.co.uk')
  assert.equal(pickEmail(['leeds@bar.co.uk'], 'https://bar.co.uk', 'Manchester'), null)
})
