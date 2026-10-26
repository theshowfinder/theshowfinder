// Local business advertising packages (prices shown on /advertise and /advertise/join).
export const PACKAGES = {
  standard: {
    name: 'Standard listing',
    monthly: 24.95,
    yearly: 249.95,
    summary: 'A place in the local business guide on your city page.',
  },
  featured: {
    name: 'Featured placement',
    monthly: 49.95,
    yearly: 499.95,
    summary: 'Top of your city guide, plus a "Before the show" spot on the show pages in your city.',
  },
} as const

export type PackageKey = keyof typeof PACKAGES
export const BUSINESS_CATEGORIES = [
  ['restaurant', 'Restaurant'], ['bar', 'Bar or pub'], ['cafe', 'Café'], ['hotel', 'Hotel or B&B'],
  ['parking', 'Parking'], ['transport', 'Taxi or transport'], ['beauty', 'Hair or beauty'],
  ['shop', 'Shop'], ['attraction', 'Things to do'], ['other', 'Other'],
] as const

export const gbp = (n: number) => `£${n.toFixed(2)}`
