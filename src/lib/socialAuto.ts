// Automatic Social Packs (13 Nov 2026). Every post type Chris uses, prepared as a draft pack with its image and
// captions, for him to check and schedule in Meta Business Suite. Nothing is ever posted from here.
//   • Monday: "On sale this week" — the week's biggest on-sales as a list graphic.
//   • Daily: presale alerts for big shows whose presale opens in the next two days (max 2 a day, one per act).
//   • Thursday: "This weekend in <city>" for two of the ten biggest cities, rotating weekly.
//   • A new featured partner (when Chris approves them): a "find us on TheShowFinder" post to tag them in.
//   • Just-announced tours already get a pack from the news system.
// Pure: no '@/' imports, so `node --test` runs it.
import { createHash } from 'node:crypto'
import { buildSocialPackDraft, type SocialPackDraft } from './socialPack.ts'

export interface ListItem { title: string; line: string }

/** A stable uuid from a key, so the same week's post is never made twice (social_packs is unique on source). */
export function stableUuid(key: string): string {
  const h = createHash('md5').update(key).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** ISO week, e.g. "2026-W46" (Monday-based, Europe/London date passed in). */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The act from a listing title: "Muse - The Wow! Signal Europa Tour" -> "Muse"; "Bill Bailey: Vaudevillean" -> "Bill Bailey". */
export function actName(title: string): string {
  const t = title.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim()
  const cut = t.split(/\s+[-–—|]\s+|:\s+|\s+presents?\s+|\s+live\s+(in|at)\s+/i)[0]?.trim()
  return (cut && cut.length >= 2 ? cut : t).slice(0, 48)
}

/** One row per act (the first, i.e. best-ranked, listing wins), up to `max`. */
export function onePerAct<T extends { title: string }>(rows: T[], max: number): T[] {
  const seen = new Set<string>(), out: T[] = []
  for (const r of rows) {
    const k = actName(r.title).toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
    if (out.length >= max) break
  }
  return out
}

function listText(items: ListItem[]): string {
  return items.map(i => `• ${i.title}: ${i.line}`).join('\n')
}

function withList(draft: SocialPackDraft, items: ListItem[], title: string): SocialPackDraft {
  return { ...draft, image_params: { ...draft.image_params, headline: title, list: items } as SocialPackDraft['image_params'] }
}

/** Monday's "On sale this week" list post. */
export function buildOnSaleRoundupDraft(a: { weekKey: string; items: ListItem[] }): SocialPackDraft {
  const headline = 'On sale this week'
  const context = `${listText(a.items)}\n\nSave this so you don't miss a sale. Every on-sale date, updated daily, at TheShowFinder.`
  const d = buildSocialPackDraft({
    sourceType: 'roundup', sourceId: stableUuid(`onsale:${a.weekKey}`), cityName: null, headline, context,
    destinationPath: '/on-sale-this-week', hashtagSeed: ['On Sale This Week', 'UK Gigs', 'Live Music UK', 'Concert Tickets'],
    kind: 'roundup', campaignSuffix: `onsale-${a.weekKey}`,
  })
  return withList(d, a.items, headline)
}

/** Thursday's "This weekend in <city>" list post. */
export function buildWeekendDraft(a: { weekKey: string; city: string; items: ListItem[] }): SocialPackDraft {
  const headline = `This weekend in ${a.city}`
  const context = `${listText(a.items)}\n\nEverything on in ${a.city} this weekend, with tickets from official sellers, on TheShowFinder.`
  const d = buildSocialPackDraft({
    sourceType: 'roundup', sourceId: stableUuid(`weekend:${a.city}:${a.weekKey}`), cityName: a.city, headline, context,
    destinationPath: `/cities/${encodeURIComponent(a.city)}/this-weekend`, hashtagSeed: [a.city, `${a.city} Gigs`, `What's On ${a.city}`, 'This Weekend'],
    kind: 'weekend', campaignSuffix: `weekend-${a.city.toLowerCase().replace(/\s+/g, '-')}-${a.weekKey}`,
  })
  return withList(d, a.items, headline)
}

/** A presale alert for one act. */
export function buildPresaleAlertDraft(a: {
  eventId: string; act: string; presaleLabel: string; generalLabel: string | null; dates: number; cities: string[];
  imageUrl: string | null; destinationPath: string; city: string | null
}): SocialPackDraft {
  const where = a.cities.length ? ` (${a.cities.slice(0, 4).join(', ')}${a.cities.length > 4 ? ` and ${a.cities.length - 4} more` : ''})` : ''
  const headline = `${a.act} presale opens ${a.presaleLabel}`
  const context = `${a.dates > 1 ? `${a.dates} UK dates${where}.` : `One UK date${where}.`} Presale opens ${a.presaleLabel}${a.generalLabel ? `, general sale ${a.generalLabel}` : ''}. Set a reminder: dates, times and tickets on TheShowFinder.`
  return buildSocialPackDraft({
    sourceType: 'event', sourceId: a.eventId, cityName: a.city, headline, context, destinationPath: a.destinationPath,
    hashtagSeed: [a.act, 'Presale', 'UK Tour', 'Concert Tickets'], kind: 'presale', imageUrl: a.imageUrl, imageDateLabel: a.presaleLabel,
  })
}

/** A new featured partner, for Chris to tag them (they usually reshare). */
export function buildPartnerDraft(a: { businessId: string; name: string; city: string; nearVenue: string | null; offer: string | null }): SocialPackDraft {
  const headline = `${a.name}: our featured partner in ${a.city}`
  const near = a.nearVenue ? ` near ${a.nearVenue}` : ''
  const context = `Heading to a show${near}? ${a.name} is now on TheShowFinder, right next to the tickets${a.offer ? `, with ${a.offer.charAt(0).toLowerCase()}${a.offer.slice(1)} for show-goers` : ''}. Tag ${a.name} when you post this.`
  const d = buildSocialPackDraft({
    sourceType: 'partner', sourceId: a.businessId, cityName: a.city, headline, context,
    destinationPath: `/cities/${encodeURIComponent(a.city)}`, hashtagSeed: [a.city, `${a.city} Food`, `What's On ${a.city}`, 'Support Local'],
    kind: 'partner',
  })
  return withList(d, [{ title: a.name, line: `${a.nearVenue ? `Before the show at ${a.nearVenue}` : `On our ${a.city} page`}${a.offer ? ` · ${a.offer}` : ''}` }], headline)
}

/** Which two big cities get a weekend post this week (rotating through the top ten). */
export function weekendCities(cityNames: string[], weekKey: string): string[] {
  const top = cityNames.slice(0, 10)
  const n = Number(weekKey.split('W')[1]) || 0
  return [top[(n * 2) % top.length], top[(n * 2 + 1) % top.length]]
}
