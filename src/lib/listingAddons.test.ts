import test from 'node:test'
import assert from 'node:assert/strict'
import { isListingAddon } from './listingAddons.ts'

test('festival add-ons and test listings are hidden', () => {
  for (const t of [
    'Download 2027 - RIP (LITE) Classic Bell for 2, 3 or 4 in Thunder Valley',
    'Download 2027 - Motorbike Park Pass',
    'Download 2027 - RIP Hotel at Radisson Blu',
    'Download 2027 - Souvenir',
    'Creamfields 2027 - Non Camping Parking',
    'Latitude Luxury 2027 - RV for up to 4 or 8',
    'Leeds Festival 2027 - Campervan - Trailer Park',
    'Lytham Festival - Robbie Williams - Transport',
    'Ben Portsmouth: This is Elvis 2027 Tour - Premium Upgrade',
    'QA Festival DO NOT PURCHASE - Souvenir',
    'Moseley Shoals Commemorative Merch Bundle - Event ticket not included',
    'QA Festival DO NOT PURCHASE - Event Lineup T-Shirt',
  ]) assert.equal(isListingAddon(t), true, t)
})

test('real tickets and ordinary gigs stay listed', () => {
  for (const t of [
    'Download 2027 - Weekend Arena',
    'Download 2027 - 5/3 Night Mini Moshers',
    'Reading Festival 2027 - Weekend + Early Entry Camping',
    'Creamfields 2027 - 4 Day Camping - Gold',
    'Isle of Wight Festival 2027 - Weekend Ticket',
    'Lytham Festival - Kings of Leon',
    'The Caravan, Camping and Motorhome Show 2027',
    'Caravan',
    'Cabin Boy Jumped Ship',
    'The Prodigy',
    '',
  ]) assert.equal(isListingAddon(t), false, t)
})
