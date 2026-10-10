import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { findHeadlinerArtist, buildTonightTicketOffers } from './ticketLinkPolicy.ts'
import type { Artist } from './types/database'

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'a1', name: 'Test Artist', slug: 'test-artist', bio: null, genre: null,
    image_url: null, website: null, spotify_id: null, ticketmaster_id: null,
    description: null, tour_name: null, onsale_date: null, tickets_url: null,
    is_featured: false, featured_onsale: false,
    gigsberg_url: null, viagogo_url: null, stubhub_url: null, vivid_seats_url: null,
    see_tickets_url: null, eventim_url: null, axs_url: null, gigantic_url: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('findHeadlinerArtist', () => {
  const artists = [makeArtist({ name: 'Coldplay' }), makeArtist({ name: 'Harry Styles' })]

  test('matches by the artist name extracted from a Ticketmaster-style title', () => {
    const found = findHeadlinerArtist('Coldplay | Music of the Spheres', artists)
    assert.equal(found?.name, 'Coldplay')
  })

  test('is case-insensitive', () => {
    const found = findHeadlinerArtist('COLDPLAY', artists)
    assert.equal(found?.name, 'Coldplay')
  })

  test('returns null when no artist matches', () => {
    assert.equal(findHeadlinerArtist('Some Unknown Act', artists), null)
  })
})

describe('buildTonightTicketOffers', () => {
  test('no links anywhere — no offers at all (never invents a link)', () => {
    const offers = buildTonightTicketOffers({ title: 'Unknown Act', tickets_url: null, own_ticket_url: null }, [])
    assert.deepEqual(offers, [])
  })

  test('official tickets_url present — "Find tickets" offer', () => {
    const offers = buildTonightTicketOffers(
      { title: 'Unknown Act', tickets_url: 'https://www.ticketmaster.co.uk/event/123', own_ticket_url: null },
      [],
    )
    assert.deepEqual(offers, [{
      kind: 'official',
      label: 'Find tickets',
      href: 'https://ticketmaster.evyy.net/c/7328658/1965662/24023?u=https%3A%2F%2Fwww.ticketmaster.co.uk%2Fevent%2F123',
    }])
  })

  test('own_ticket_url present — "Check availability" direct offer', () => {
    const offers = buildTonightTicketOffers(
      { title: 'Unknown Act', tickets_url: null, own_ticket_url: 'https://theshowfinder.com/own/123' },
      [],
    )
    assert.deepEqual(offers, [{ kind: 'direct', label: 'Check availability', href: 'https://theshowfinder.com/own/123' }])
  })

  test('headliner has a genuine, event-specific resale link — resale offer included', () => {
    const artists = [makeArtist({ name: 'Coldplay', viagogo_url: 'https://www.viagogo.co.uk/ww/SearchResults?q=Coldplay+2026' })]
    const offers = buildTonightTicketOffers(
      { title: 'Coldplay | Music of the Spheres', tickets_url: null, own_ticket_url: null },
      artists,
    )
    assert.deepEqual(offers, [{ kind: 'resale', label: 'Resale tickets', href: 'https://www.viagogo.co.uk/ww/SearchResults?q=Coldplay+2026' }])
  })

  test('headliner’s only resale link is a bare provider homepage — excluded, never shown as a resale offer', () => {
    const artists = [makeArtist({ name: 'Coldplay', viagogo_url: 'https://www.viagogo.co.uk' })]
    const offers = buildTonightTicketOffers(
      { title: 'Coldplay | Music of the Spheres', tickets_url: null, own_ticket_url: null },
      artists,
    )
    assert.deepEqual(offers, [])
  })

  test('falls through resale fields in order, skipping bare homepages, to the first genuine link', () => {
    const artists = [makeArtist({
      name: 'Coldplay',
      viagogo_url: 'https://www.viagogo.co.uk', // bare — skipped
      stubhub_url: 'https://www.stubhub.co.uk/coldplay-tickets', // genuine — used
    })]
    const offers = buildTonightTicketOffers(
      { title: 'Coldplay | Music of the Spheres', tickets_url: null, own_ticket_url: null },
      artists,
    )
    assert.deepEqual(offers, [{ kind: 'resale', label: 'Resale tickets', href: 'https://www.stubhub.co.uk/coldplay-tickets' }])
  })

  test('all three offers can coexist, official first then direct then resale', () => {
    const artists = [makeArtist({ name: 'Coldplay', viagogo_url: 'https://www.viagogo.co.uk/ww/SearchResults?q=Coldplay' })]
    const offers = buildTonightTicketOffers(
      {
        title: 'Coldplay | Music of the Spheres',
        tickets_url: 'https://www.ticketmaster.co.uk/event/123',
        own_ticket_url: 'https://theshowfinder.com/own/123',
      },
      artists,
    )
    assert.deepEqual(offers.map(o => o.kind), ['official', 'direct', 'resale'])
  })

  test('no headliner match at all — only official/direct offers considered, no resale lookup crashes', () => {
    const offers = buildTonightTicketOffers(
      { title: 'A Completely Unknown Act', tickets_url: 'https://www.ticketmaster.co.uk/event/999', own_ticket_url: null },
      [makeArtist({ name: 'Someone Else' })],
    )
    assert.deepEqual(offers, [{
      kind: 'official',
      label: 'Find tickets',
      href: 'https://ticketmaster.evyy.net/c/7328658/1965662/24023?u=https%3A%2F%2Fwww.ticketmaster.co.uk%2Fevent%2F999',
    }])
  })
})
