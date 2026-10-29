// The sign-up form's "Business type" choices, mapped to the categories a live listing can have
// (local_businesses.category, migration 091). Pure, so it runs under `node --test`.
export const LISTING_CATEGORIES = ['restaurant', 'bar', 'cafe', 'hotel', 'transport', 'parking', 'beauty', 'shop', 'attraction', 'other'] as const
export type ListingCategory = typeof LISTING_CATEGORIES[number]

/** "Bar or pub" -> bar, "Café" -> cafe, "Hotel or B&B" -> hotel, "Hair or beauty" -> beauty; anything unknown -> other. */
export function listingCategory(value: string | null | undefined): ListingCategory {
  const v = (value ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim()
  const first = v.split(' ')[0] ?? ''
  if ((LISTING_CATEGORIES as readonly string[]).includes(first)) return first as ListingCategory
  if (/\b(pub|bar)\b/.test(v)) return 'bar'
  if (/\b(hotel|b b|bnb|guest)\b/.test(v)) return 'hotel'
  if (/\b(taxi|tran)/.test(v)) return 'transport'
  if (/\b(hair|beauty|nail|salon)\b/.test(v)) return 'beauty'
  if (/\b(things to do|attraction)/.test(v)) return 'attraction'
  if (/\bre ?_?taurant|restaurant\b/.test(v)) return 'restaurant'
  return 'other'
}
