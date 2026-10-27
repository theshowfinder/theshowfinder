// Local business advertising packages (prices shown on /advertise and /advertise/join).
export const PACKAGES = {
  standard: {
    name: 'Standard listing',
    monthly: 29.95,
    yearly: 299.95,
    summary: 'A strong business listing in the local guide on your city page.',
  },
  featured: {
    name: 'Featured placement',
    monthly: 44.95,
    yearly: 449.95,
    summary: 'One of only three premium spaces: priority city placement plus a "Before the show" spot on event pages in your city.',
  },
} as const

export type PackageKey = keyof typeof PACKAGES
export const BUSINESS_CATEGORIES = [
  ['restaurant', 'Restaurant'], ['bar', 'Bar or pub'], ['cafe', 'Café'], ['hotel', 'Hotel or B&B'],
  ['parking', 'Parking'], ['transport', 'Taxi or transport'], ['beauty', 'Hair or beauty'],
  ['shop', 'Shop'], ['attraction', 'Things to do'], ['other', 'Other'],
] as const

export const gbp = (n: number) => `£${n.toFixed(2)}`
