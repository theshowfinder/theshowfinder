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

// Every package is a 12-month subscription (Chris, 6 Nov 2026): paid monthly or upfront, then renews for a further
// 12 months unless cancelled at least 30 days before the end of the term. Shown on /advertise, the sign-up form,
// Stripe checkout, the welcome email and /terms (section 12).
export const TERM_MONTHS = 12
export const TERM_SUMMARY = '12-month subscription, paid monthly or upfront. Renews for a further 12 months unless cancelled at least 30 days before the end of the term.'

export const gbp = (n: number) => `£${n.toFixed(2)}`

/** What paying for the year upfront saves against 12 monthly payments (Featured £89.45, Standard £59.45). */
export const yearlySaving = (key: PackageKey) => Math.round((PACKAGES[key].monthly * TERM_MONTHS - PACKAGES[key].yearly) * 100) / 100

// ── Founding partner offer (Chris, 12 Nov 2026) ───────────────────────────────────────────────────────────────────
// For businesses that sign up from one of our outreach emails (a /p/<ref> link) by 31 Dec 2026: first month free,
// then the normal monthly price, monthly, cancel any time (no 12-month term). The card is taken at checkout and Stripe
// starts charging after FOUNDING_TRIAL_DAYS. Shown on the outreach emails, the sign-up form, Stripe checkout, the
// confirmation and live emails and /terms (section 12).
export const FOUNDING_OFFER_ENDS = '2026-12-31T23:59:59Z'
export const FOUNDING_TRIAL_DAYS = 30
export const FOUNDING_OFFER_KEY = 'founding_free_month'
export const foundingOfferOpen = (now: Date = new Date()) => now.getTime() <= Date.parse(FOUNDING_OFFER_ENDS)
export const FOUNDING_SUMMARY = 'First month free, then monthly. Cancel any time.'
export const foundingPriceLine = (key: PackageKey) => `First month free, then ${gbp(PACKAGES[key].monthly)} a month · cancel any time`
