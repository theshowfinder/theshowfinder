import test from 'node:test'
import assert from 'node:assert/strict'
import { seasonBySlug, seasonYear, seasonWindow, matchesSeason, seasonTitle, seasonDescription, inSeason, SEASONS } from './citySeasonSeo.ts'

const nov = new Date('2026-11-18T12:00:00Z')
const panto = seasonBySlug('panto')!, xmas = seasonBySlug('christmas')!, nye = seasonBySlug('new-years-eve')!

test('season year and windows', () => {
  assert.equal(seasonYear(nov), 2026)
  assert.equal(seasonYear(new Date('2027-01-10T12:00:00Z')), 2026)
  assert.equal(seasonWindow(panto, nov).to, '2027-02-01T00:00:00.000Z')
  assert.equal(seasonWindow(xmas, nov).to, '2026-12-27T00:00:00.000Z')
  assert.equal(seasonWindow(nye, nov).from, nov.toISOString())
})

test('panto: real pantos, not ballets or films', () => {
  const r = (title: string, category = 'theatre') => matchesSeason(panto, { title, category, start_date: '2026-12-20T14:00:00Z' }, nov)
  assert.equal(r('Cinderella - The Pantomime'), true)
  assert.equal(r('Aladdin'), true)
  assert.equal(r('Jack and the Beanstalk', 'family'), true)
  assert.equal(r('Cinderella - Northern Ballet'), false)
  assert.equal(r('Aladdin', 'concert'), false)
})

test('christmas and new year', () => {
  assert.equal(matchesSeason(xmas, { title: 'Christmas Carols by Candlelight', category: 'concert', start_date: '2026-12-15T19:00:00Z' }, nov), true)
  assert.equal(matchesSeason(xmas, { title: 'Arctic Monkeys', category: 'concert', start_date: '2026-12-15T19:00:00Z' }, nov), false)
  assert.equal(matchesSeason(nye, { title: 'Club Night', category: 'concert', start_date: '2026-12-31T21:00:00Z' }, nov), true)
  assert.equal(matchesSeason(nye, { title: 'Club Night', category: 'concert', start_date: '2026-12-31T13:00:00Z' }, nov), false)
  assert.equal(matchesSeason(nye, { title: "NYE Party", category: 'local', start_date: '2026-12-31T13:00:00Z' }, nov), true)
})

test('titles fit search results and carry the year', () => {
  for (const s of SEASONS) {
    assert.ok(seasonTitle('Stoke-on-Trent', s, nov).length <= 60, s.slug)
    assert.ok(seasonDescription('Stoke-on-Trent', s, 123, ['Regent Theatre', 'Victoria Hall', 'X'], nov).length <= 160, s.slug)
  }
  assert.equal(seasonTitle('Leeds', panto, nov), 'Panto in Leeds 2026/27: Dates & Tickets')
  assert.equal(inSeason(nov), true)
  assert.equal(inSeason(new Date('2026-06-01T12:00:00Z')), false)
})
