import test from 'node:test'
import assert from 'node:assert/strict'
import type { LocalBusiness } from '@/lib/types/database'
import { selectLocalBusinessPlacements } from './localBusinessPlacements.ts'

function business(id: string, is_sponsored: boolean): LocalBusiness {
  return {
    id,
    city: 'Manchester',
    name: `Business ${id}`,
    category: 'restaurant',
    description: null,
    website_url: null,
    is_sponsored,
    is_lusso_client: false,
    display_order: Number(id),
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

test('caps a city at three featured and six standard placements', () => {
  const businesses = [
    ...Array.from({ length: 5 }, (_, index) => business(String(index + 1), true)),
    ...Array.from({ length: 8 }, (_, index) => business(String(index + 6), false)),
  ]
  const placements = selectLocalBusinessPlacements(businesses)
  assert.deepEqual(placements.featured.map(item => item.id), ['1', '2', '3'])
  assert.deepEqual(placements.standard.map(item => item.id), ['6', '7', '8', '9', '10', '11'])
})

test('keeps the tiers separate when one is not full', () => {
  const placements = selectLocalBusinessPlacements([
    business('1', false),
    business('2', true),
    business('3', false),
  ])
  assert.deepEqual(placements.featured.map(item => item.id), ['2'])
  assert.deepEqual(placements.standard.map(item => item.id), ['1', '3'])
})
