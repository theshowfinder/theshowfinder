// Festival and tour add-on tickets: parking, campervan passes, glamping tents,
// hotel packages, souvenir tickets, transport, premium upgrades. Ticketmaster
// lists each one as its own "event", so without this a festival shows up on
// the site as a dozen yurts and car parks. Also hides sellers' test listings.
//
// The SAME rule lives in SQL as public.is_listing_addon() (migration 122),
// which keeps these rows out of listed_events_with_venue. Change both together;
// listingAddons.test.ts pins the cases.
// Pure module (no '@/' imports) so it runs under node --test.

const TEST_LISTING = /do not purchase/i
// Only titles that look like a festival or a dated tour product are checked,
// so a band called "Caravan" or "Cabin Boy" playing a normal gig is untouched.
const FESTIVAL_LIKE = /(20[0-9]{2}|festival|fest\b|weekender|fayre)/i
const ADDON_WORDS = /\b(parking|car park|motorbike park|park pass|campervan|caravan|motorhome|trailer park|rv|yurts?|tipi|bell tent|bell for|bell house|bedouin|cabins?|glamping|pods?|lodge|airstream|safari|wagon|hut|tent for|tenthouse|hotel at|souvenir|lockers?|shuttle|transport|upgrade|rip)\b/i
// Real shows that happen to contain those words ("The Caravan, Camping and Motorhome Show 2027").
const REAL_SHOW = /\b(show|exhibition)\b/i

export function isListingAddon(title: string | null | undefined): boolean {
  const t = (title ?? '').trim()
  if (!t) return false
  if (TEST_LISTING.test(t)) return true
  return FESTIVAL_LIKE.test(t) && ADDON_WORDS.test(t) && !REAL_SHOW.test(t)
}
