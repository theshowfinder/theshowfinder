# Local business advertising (for Claude and ChatGPT)

## How we pitch it (Chris, 26 Oct 2026)
- Say what we are, what we do and what we can offer. Big up our strengths; don't claim to be established, and don't say we're new or won't bring business.
- Never quote visitor, click or view numbers. "Growing" is fine, with no figures.
- Many buyers are café, restaurant, bar and salon owners who just want customers. Sell the picture in plain words: people use TheShowFinder to plan a night out in their city, and your business is there when they decide where to eat, drink or stay.
- Our strengths (true, check the live counts before quoting): concerts, theatre, comedy, sport, family and local what's on across 40 UK cities, tens of thousands of upcoming shows and thousands of venues, updated every day from Ticketmaster, See Tickets, Gigsberg and the city tourism sites.
- Spaces are limited per city. The aim is about two paying businesses per city (about 80 across 40 cities).

## Packages (src/lib/advertisingPackages.ts is the single source for prices)
- Standard listing: £24.95/month (12-month commitment) or £249.95/year. A place in the city page's local business guide.
- Featured placement: £49.95/month or £499.95/year. Top of the city guide, plus the "Before the show in <city>" box on every show page in that city (src/components/BeforeTheShow.tsx). Up to 3 per page, rotating fairly when there are more.

## How it runs
- Sign-up: /advertise/join (add ?city=Derby&package=featured to pre-fill). Saves the business as PENDING (never public) with private contact details in local_business_accounts, and emails hello@.
- Chris sets it live in /admin/local-businesses (Set live / Pause / Cancel / Make featured). Only status 'active' (and not past active_until) is readable by the public site (RLS, migration 091).
- Payment: Stripe to be added (account to be decided). Until then, payment is arranged directly after sign-up.
