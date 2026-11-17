// "List your event": local organisers (promoters, venues, bands) add their own
// events. Free listings are checked before they go live; a paid Boost (per
// event) or the Promoter plan (monthly, every event boosted) makes them featured
// on city pages, "This weekend", social posts and the weekly email.
// Pure module (no '@/' imports) so it runs under node --test.

import { isListingAddon } from './listingAddons.ts'

export const BOOST_PRICE_GBP = 9.95
export const PROMOTER_PRICE_GBP = 19.95
export const MAX_SUBMISSIONS_PER_DAY = 20
const MAX_MONTHS_AHEAD = 18

export type OrganiserCategory = 'concert' | 'comedy' | 'theatre' | 'family' | 'sports' | 'local'
export const CATEGORY_CHOICES: { value: OrganiserCategory; label: string }[] = [
  { value: 'concert', label: 'Music: gig, club night, DJ, tribute' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'theatre', label: 'Theatre, panto, musical' },
  { value: 'family', label: 'Family and kids' },
  { value: 'sports', label: 'Sport' },
  { value: 'local', label: 'Something else: quiz, market, talk, party' },
]

export type BoostChoice = 'none' | 'boost' | 'promoter'

// Ticket sites people know and trust. A listing whose ticket link goes to one of these (or to the
// organiser's own website) can go live straight away; anything else is looked at first.
const KNOWN_TICKET_HOSTS = [
  'eventbrite.co.uk', 'eventbrite.com', 'skiddle.com', 'seetickets.com', 'ticketmaster.co.uk', 'ticketmaster.com',
  'dice.fm', 'fatsoma.com', 'ticketsource.co.uk', 'ticketsource.com', 'tickettailor.com', 'buytickets.at',
  'wegottickets.com', 'gigantic.com', 'ticketweb.uk', 'ticketweb.co.uk', 'fixr.co', 'eventim.co.uk', 'axs.com',
  'designmynight.com', 'billetto.co.uk', 'billetto.com', 'universe.com', 'tixr.com', 'ents24.com', 'trybooking.com',
  'stickytickets.com', 'gigsandtours.com', 'theticketsellers.co.uk', 'ticketline.co.uk', 'quicket.co.uk',
]

export interface SubmissionInput {
  organiserName: string
  email: string
  website: string
  title: string
  category: string
  date: string        // YYYY-MM-DD (UK date)
  time: string        // HH:MM (UK time)
  venueName: string
  /** Town or city as the organiser typed it: any UK town, not only our 40 cities. */
  city: string
  postcode: string
  ticketUrl: string
  priceFrom: string
  description: string
}

export interface CleanSubmission {
  organiserName: string
  email: string
  website: string | null
  title: string
  category: OrganiserCategory
  date: string
  time: string
  venueName: string
  /** The town as typed (tidied), e.g. "Ilkeston"; one of our cities when it is one, spelt our way. */
  city: string
  postcode: string
  ticketUrl: string
  priceFrom: number | null
  description: string | null
}

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)
// UK postcode, loosely (the venue must be findable; postcodes.io checks it properly).
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i

function titleCaseTown(t: string): string {
  return t.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
}

export function hostOf(url: string | null | undefined): string | null {
  try { return new URL(url ?? '').hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

function httpsUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!u.hostname.includes('.')) return null
    return u.toString()
  } catch { return null }
}

/** Checks the form and returns a tidy submission, or the first problem to show the organiser. */
export function validateSubmission(input: SubmissionInput, cities: string[], now: Date = new Date()): { ok: true; value: CleanSubmission } | { ok: false; error: string } {
  const organiserName = clip(input.organiserName, 80)
  const email = input.email.trim().toLowerCase()
  const title = clip(input.title, 120)
  const venueName = clip(input.venueName, 100)
  const townRaw = clip(input.city, 60)
  const city = cities.find(c => c.toLowerCase() === townRaw.toLowerCase()) ?? (townRaw.length >= 2 ? titleCaseTown(townRaw) : '')
  const postcode = clip(input.postcode, 10).toUpperCase().replace(/^([A-Z0-9]+?)\s*(\d[A-Z]{2})$/, '$1 $2')
  const category = CATEGORY_CHOICES.find(c => c.value === input.category)?.value
  const ticketUrl = httpsUrl(input.ticketUrl)
  const website = input.website.trim() ? httpsUrl(input.website) : null
  const description = clip(input.description, 1200) || null
  const priceNum = input.priceFrom.trim() ? Number(input.priceFrom.replace(/[£,\s]/g, '')) : null

  if (organiserName.length < 2) return { ok: false, error: 'Please add your name or your organisation’s name.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please add a valid email address.' }
  if (title.length < 3) return { ok: false, error: 'Please add the event name.' }
  if (/https?:\/\/|www\./i.test(title)) return { ok: false, error: 'Please leave web links out of the event name.' }
  if (!category) return { ok: false, error: 'Please choose what kind of event it is.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: 'Please add the date.' }
  if (!/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: 'Please add the start time.' }
  if (venueName.length < 2) return { ok: false, error: 'Please add the venue name.' }
  if (!city || /https?:|www\./i.test(city)) return { ok: false, error: 'Please add the town or city the venue is in.' }
  if (!UK_POSTCODE.test(postcode)) return { ok: false, error: 'Please add the venue’s postcode, so people can find it (for example DE7 5RP).' }
  if (!ticketUrl) return { ok: false, error: 'Please add the link where people buy tickets or book.' }
  if (input.website.trim() && !website) return { ok: false, error: 'That website address doesn’t look right.' }
  if (priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 5000)) return { ok: false, error: 'Please enter the ticket price as a number, for example 12.50, or leave it blank.' }

  const startMs = Date.parse(`${input.date}T${input.time}:00Z`)
  if (!Number.isFinite(startMs)) return { ok: false, error: 'That date doesn’t look right.' }
  if (startMs < now.getTime() - 3600_000) return { ok: false, error: 'That date has already passed.' }
  const latest = new Date(now); latest.setMonth(latest.getMonth() + MAX_MONTHS_AHEAD)
  if (startMs > latest.getTime()) return { ok: false, error: `We list events up to ${MAX_MONTHS_AHEAD} months ahead.` }

  return {
    ok: true,
    value: {
      organiserName, email, website, title, category, date: input.date, time: input.time, venueName, city,
      postcode, ticketUrl, priceFrom: priceNum, description,
    },
  }
}

/**
 * Can this go live straight away, or does a person need to look first? Live straight away only when
 * nothing looks off: a known ticket site (or the organiser's own website), not an add-on, no links or
 * shouting in the text. Everything else waits for one tap on /admin/event-submissions.
 */
export function autoApproveCheck(s: CleanSubmission): { approve: boolean; reason: string | null } {
  const host = hostOf(s.ticketUrl)
  const own = hostOf(s.website)
  const known = !!host && (KNOWN_TICKET_HOSTS.some(h => host === h || host.endsWith(`.${h}`)) || (!!own && host === own))
  if (!known) return { approve: false, reason: `Ticket link goes to ${host ?? 'an unknown site'}, not a ticket site we know` }
  if (isListingAddon(s.title)) return { approve: false, reason: 'Title looks like an add-on (parking, merch, upgrade), not an event' }
  const links = (s.description ?? '').match(/https?:\/\/|www\./gi)?.length ?? 0
  if (links > 2) return { approve: false, reason: 'Description has a lot of web links' }
  const letters = s.title.replace(/[^A-Za-z]/g, '')
  if (letters.length > 12 && letters === letters.toUpperCase() && /[A-Z]{12,}/.test(letters)) return { approve: false, reason: 'Title is all in capitals' }
  return { approve: true, reason: null }
}

export function organiserSlugBase(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'organiser'
}
