# Local business advertising (for Claude and ChatGPT)

## How we pitch it (Chris, 26 Oct 2026; updated 29 Oct 2026)
- Say what we are, what we do and what we can offer. Big up our strengths; don't claim to be established, and don't say we're new or won't bring business.
- Never quote visitor, click or view numbers for the site. "Growing" is fine, with no figures. (Show-page counts are fine: they are listings, not traffic. Each advertiser's own report numbers are theirs, never quoted to anyone else.)
- Many buyers are café, restaurant, bar and salon owners who just want customers. Sell the picture in plain words.
- The pitch in one line: **seen at the right moment, used at your door, counted.**
  1. Seen when they plan the night: Featured partners sit right under the ticket buttons on every show page in their city ("Make a night of it"), with "4 min walk from the venue".
  2. A reason to choose you: an offer ("10% off food with your show ticket") that visitors claim as a one-off QR voucher on their phone, valid on the day of their show.
  3. Proof it works: staff scan the QR with any phone and enter the venue's PIN; each voucher works once. A monthly report shows vouchers claimed and used, plus clicks to their website and booking page. No app or equipment needed.
- Why Featured over Standard: Standard is the city page's local guide only. Featured is on every show page in the city (live count on /advertise?city=X, e.g. "all 659 upcoming show pages in Leeds") and the top of the guide. Only 3 Featured places per city.
- Our strengths (true, check the live counts before quoting): concerts, theatre, comedy, sport, family and local what's on across 40 UK cities, tens of thousands of upcoming shows and thousands of venues, updated every day from Ticketmaster, See Tickets, Gigsberg and the city tourism sites.
- Be straight about what we can't count: people who walk in without a voucher. Suggest staff ask "did you find us on TheShowFinder?".
- Spaces are limited per city. The aim is about two paying businesses per city (about 80 across 40 cities).

## Packages (prices: Stripe price IDs in Vercel env; shown in src/app/advertise/page.tsx, src/components/AdvertiserOnboardingForm.tsx, src/lib/advertisingPackages.ts)
- Standard listing: £29.95/month or £299.95/year. Local guide on the city page, offer + voucher, booking button, monthly report. Max 6 per city.
- Featured placement: £44.95/month or £449.95/year. Everything in Standard, plus the "Make a night of it" box on every show page in the city (src/components/BeforeTheShow.tsx, up to 3 per page, rotating fairly), top of the city guide with logo, walking distance. Max 3 per city.

## How it runs
- Sign-up and payment: /advertise -> /advertise/onboard (ChatGPT's flow): city, package, billing, business details, postcode, booking link, offer, logo -> Stripe Checkout (subscription). Saved in advertiser_applications. The Stripe webhook (/api/stripe/webhook) marks it paid and emails a confirmation. /advertise/join redirects to the onboarding.
- Approval: /admin/advertiser-applications -> "Approve & publish" creates the live listing in local_businesses (logo copied to the public business-logos bucket, postcode turned into a map position via postcodes.io), saves contact + Stripe details and a 4-digit staff PIN in local_business_accounts, and emails the advertiser their live link, PIN and how vouchers work (copy to hello@).
- Running listings: /admin/local-businesses (Pause / Cancel / Make featured; edit offer, booking link, postcode; see the PIN and this month's vouchers). A cancelled Stripe subscription sets the listing to cancelled automatically.
- Vouchers: "Get voucher" posts to /offer/<business id>(?e=<event id>) -> /voucher/<code> (code + QR, optional email to self + newsletter opt-in) -> staff scan -> /redeem/<code> (PIN, one use, locks after 5 wrong PINs). Show-page vouchers are valid on the show's UK day; city-page vouchers for 7 days. One voucher per visitor per business per day (same one returned). Tables: business_vouchers, business_clicks (migration 095).
- Clicks: ad links go through /out/biz/<id>?k=website|booking; only real clicks (h=1 from OutboundLinkMarker) count in reports.
- Monthly report: /api/cron/advertiser-reports on the 1st (09:05 UTC), previous month's numbers, one per advertiser per month, copy to hello@. ?dry=1 previews without sending.
