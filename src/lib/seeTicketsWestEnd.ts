// See Tickets sells West End runs as "tour" pages
// (https://www.seetickets.com/n/tour/<slug>/<id>) that are NOT in the See
// Tickets product feed, so the feed matcher never links them. This is the
// hand-checked mapping of West End show + theatre -> See Tickets page.
//
// It drives (a) the "See Tickets" buttons on /west-end cards and show pages
// and (b) supabase/seed_see_tickets_west_end.sql, which writes the same URLs
// to events.see_tickets_affiliate_url so each performance's ticket panel
// leads with See Tickets too. Keep the two in step.
//
// Commission: See Tickets pays 5% of net face value (ex VAT/fees) on West End
// tickets, so these links are the highest-value ones on the site.
//
// No '@/' imports so it runs under `node --test`.

export interface SeeTicketsWestEndLink {
  /** Normalised show title (see normalizeTitle) — matched exactly or as a prefix word-group. */
  title: string
  /** Lower-case fragment of the theatre name. */
  venue: string
  /** Destination on seetickets.com (wrap with getSeeTicketsAffiliateLink before use). */
  url: string
}

const ST = 'https://www.seetickets.com/n/tour'

export const SEE_TICKETS_WEST_END: SeeTicketsWestEndLink[] = [
  { title: 'the play that goes wrong',          venue: 'duchess',         url: `${ST}/the-play-that-goes-wrong/1` },
  { title: 'witness for the prosecution',       venue: 'county hall',     url: `${ST}/witness-for-the-prosecution-county-hall/1217` },
  { title: 'harry potter and the cursed child', venue: 'palace',          url: `${ST}/harry-potter-and-the-cursed-child-one-part/1270` },
  { title: 'the devil wears prada',             venue: 'dominion',        url: `${ST}/the-devil-wears-prada/743` },
  { title: 'sinatra',                           venue: 'aldwych',         url: `${ST}/sinatra-the-musical/1176` },
  { title: 'mamma mia',                         venue: 'novello',         url: `${ST}/mamma-mia-/1023` },
  { title: 'hamilton',                          venue: 'victoria palace', url: `${ST}/hamilton/1002` },
  { title: 'oliver',                            venue: 'gielgud',         url: `${ST}/oliver-/1024` },
  { title: 'miss saigon',                       venue: 'prince edward',   url: `${ST}/miss-saigon/1320` },
  { title: 'avenue q',                          venue: 'shaftesbury',     url: `${ST}/avenue-q/1143` },
  { title: 'amadeus',                           venue: 'noel coward',     url: `${ST}/amadeus/1328` },
  { title: 'the book of mormon',                venue: 'prince of wales', url: `${ST}/the-book-of-mormon/980` },
  { title: 'dirty dancing',                     venue: 'prince edward',   url: `${ST}/dirty-dancing-the-classic-story-on-stage/1330` },
  { title: 'beetlejuice',                       venue: 'prince edward',   url: `${ST}/beetlejuice/1136` },
  { title: 'cirque berserk',                    venue: 'garrick',         url: `${ST}/cirque-berserk-/1302` },
  { title: 'six',                               venue: 'vaudeville',      url: `${ST}/six/320` },
]

/** Lower-case, strip punctuation/accents, collapse spaces: "Mamma Mia!" -> "mamma mia". */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * See Tickets page for a West End show, or null when See Tickets doesn't sell
 * it. A title matches when it equals the mapped title or starts with it
 * followed by a word break ("sinatra" matches "Sinatra the Musical"), and the
 * theatre name contains the mapped venue fragment.
 */
export function seeTicketsUrlForShow(
  title: string | null | undefined,
  venueName: string | null | undefined,
): string | null {
  if (!title || !venueName) return null
  const t = normalizeTitle(title)
  const v = venueName.toLowerCase()
  for (const link of SEE_TICKETS_WEST_END) {
    if (!v.includes(link.venue)) continue
    if (t === link.title || t.startsWith(`${link.title} `)) return link.url
  }
  return null
}

/**
 * True for a West End show we have hand-checked (the list above). Ticketmaster
 * tags some of these (The Play That Goes Wrong, Avenue Q, ...) with a Comedy genre,
 * which would file a West End play under stand-up comedy; callers use this to keep
 * them under Theatre.
 */
export function isKnownWestEndShow(
  title: string | null | undefined,
  venueName: string | null | undefined,
): boolean {
  return seeTicketsUrlForShow(title, venueName) !== null
}
