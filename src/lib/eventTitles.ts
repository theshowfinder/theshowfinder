// Title rules shared by the On Sale This Week cards, the New Tours hub and the
// Featured Shows strip. Pure module (relative imports only) so it runs under `node --test`.

// Hospitality, upgrades and bundles are products sold against a show, never a show.
export const PACKAGE_TITLE = /\b(vip|premium|hospitality|lounge|packages?|upgrades?|meet\s*(?:&|and)?\s*greets?|ticket\s+experiences?|fast[\s-]?track)\b/i

// Recurring classes, weekly series slots and similar listings that are not a
// headline night out ("Fishies Week 10", "Toddler Workshop", "Guided Walks ...").
export const NOT_A_HEADLINE = /\b(week\s*\d+|workshops?|classes|class|lessons?|guided\s+walks?|ghost\s+walks?|brunch|afternoon\s+tea|bottomless|open\s+day|fishies)\b/i

// Things Ticketmaster lists as their own "event" that are an extra on a show: hotel bundles, festival camping,
// parking, lockers, phone charging, souvenirs, VIP / hospitality upgrades. Found on the live site 23 Oct 2026
// ("Download 2027 - Charge Candy", "Madness - Official Ticket and Hotel Bundle", "Creamfields 2027 - Non Camping
// Parking"). They are folded into their main show by the merge job, never listed as shows.
export const EXTRA_TITLE = /\b(hotel\s+bundl\w*|no\s+ticket\s+included|official\s+vip|vip\s+(tickets?|packages?|experiences?|upgrades?)|ticket\s+experiences?|hospitality|upgrades?|camping|campervans?|caravans?|glamping|bell\s+(tents?|for)|safari\s+(tents?|for)|tipis?|yurts?|crew\s+huts?|car\s*parks?|parking|shuttles?|coach\s+(travel|packages?|transfers?)|lockers?|souvenirs?|charge\s+candy|phone\s+charging|merch(andise)?\s+bundles?|rock\s+retreat|mini\s+moshers|wagon\s+for|bedouin|emperor\s+bell)\b/i

/** An extra sold against a show (hotel bundle, camping, parking, VIP upgrade...), not a show. */
export function isExtraTitle(title: string | null | undefined): boolean {
  return !!title && EXTRA_TITLE.test(title)
}

/** A package / upgrade / class listing: not something to promote as a show in its own right. */
export function isPackageOrClassTitle(title: string | null | undefined): boolean {
  if (!title) return false
  return PACKAGE_TITLE.test(title) || NOT_A_HEADLINE.test(title)
}

// A year in the run that is part of the edition, not the act's name ("... Darts 2027"),
// plus the stray "202" a feed typo leaves in front of a title ("202 BetMGM ...").
const YEAR_TOKEN = String.raw`(?:202[4-9]|202)`
const LEADING_YEAR = new RegExp(String.raw`^\s*${YEAR_TOKEN}\b[\s:–—-]*`)
const TRAILING_YEAR = new RegExp(String.raw`[\s:–—-]*\b${YEAR_TOKEN}\s*$`)
const BRACKET_YEAR = new RegExp(String.raw`\s*[([]\s*${YEAR_TOKEN}\s*[)\]]`, 'g')

/** Tidy a series/act name for display: no stray or edition years, "BETMGM" → "BetMGM". */
export function cleanSeriesName(name: string): string {
  let n = name.replace(BRACKET_YEAR, ' ').replace(/\s+/g, ' ').trim()
  const stripped = n.replace(LEADING_YEAR, '').replace(TRAILING_YEAR, '').trim()
  // Never strip a name down to nothing (or to a single stray word of a year-only title).
  if (stripped.length >= 3) n = stripped
  return n.replace(/\bbetmgm\b/gi, 'BetMGM').replace(/\s+/g, ' ').trim()
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

// Sponsors that appear and disappear from the same series' name between listings.
const SPONSOR = /\bbetmgm\b/gi
// The same sponsor written two ways across listings ("American Express Presents BST Hyde Park"
// / "Amex Presents BST Hyde Park") must land on one card.
const SPONSOR_ALIASES: [RegExp, string][] = [[/\bamerican\s+express\b/gi, 'amex']]

/** Stable key so variants of one series ("BETMGM Premier League Darts", "2027 BetMGM …",
 *  "Premier League Darts 2027") land on one card. */
export function seriesKey(name: string): string {
  let base = cleanSeriesName(name).replace(SPONSOR, ' ')
  for (const [re, to] of SPONSOR_ALIASES) base = base.replace(re, to)
  base = base.replace(/\s+/g, ' ').trim()
  return slugify(base || name)
}

// Darts is a sport, whatever genre the feed files it under.
const DARTS_TITLE = /\b(premier\s+league\s+darts|world\s+(?:darts|matchplay)|darts\s+(?:masters|grand\s+prix|championship)|night\s+at\s+the\s+darts)\b|^\s*darts\s*$/i
export function isDartsTitle(title: string): boolean {
  return DARTS_TITLE.test(title)
}
