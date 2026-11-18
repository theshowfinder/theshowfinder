// Organiser search pages under /sell-tickets/: one page per thing an organiser searches for
// ("free event ticketing", "ticket scanning app", "sell comedy tickets"). Each says only what the
// product really does today. No other companies named, no fee percentage in headlines.
// Pure module (no '@/' imports) for node --test.

export interface SellPage {
  slug: string
  title: string          // <title>, the layout adds " | TheShowFinder"
  description: string
  kicker: string
  h1: string
  intro: string
  cta: 'paid' | 'free'
  points: [string, string][]
  faqs: [string, string][]
}

const PAID_FAQ: [string, string] = ['What does it cost me?', 'Nothing. Your buyers pay a small booking fee on top of your ticket price, and you keep 100% of the price you set.']
const PAYOUT_FAQ: [string, string] = ['When do I get paid?', 'Ticket money goes into your own Stripe account as each ticket sells and is paid into your bank, usually within a few days. You don’t wait until after the event.']
const DOOR_FAQ: [string, string] = ['How do I check tickets on the door?', 'You get a door link. Open it on any phone, scan each QR code, and it tells you if the ticket is valid and stops it being used twice.']

export const SELL_PAGES: SellPage[] = [
  {
    slug: 'free-event-tickets',
    title: 'Free Event Ticketing | Free QR Tickets for Free Events',
    description: 'Free tickets for free events: guests book online, get QR tickets by email and you scan them on the door. No fees for you or your guests.',
    kicker: 'Free events', h1: 'Free tickets for free events. Really free.', cta: 'free',
    intro: 'Running a free event but need to know who’s coming? Guests book online in seconds, get a QR ticket by email, and you scan them in on the night. There is no fee for you and no fee for your guests.',
    points: [
      ['No fees at all', 'Free tickets cost nothing, for you or your guests.'],
      ['Set your capacity', 'Choose how many tickets to give out. Booking closes when they’re gone.'],
      ['QR tickets by email', 'Guests get their tickets straight away, with a link to open them again.'],
      ['Scan on the door', 'Check guests in from any phone and stop tickets being used twice.'],
      ['Your guest list', 'Download the list of who has booked at any time.'],
      ['Listed where people look', 'Your event goes on your town’s page and in search on TheShowFinder, free.'],
    ],
    faqs: [
      ['Is it really free?', 'Yes. Free tickets carry no booking fee and there is no charge to list the event.'],
      ['How many free tickets can I give out?', 'You choose the number when you list your event, and booking stops when they have all gone.'],
      DOOR_FAQ,
    ],
  },
  {
    slug: 'ticket-scanning-app',
    title: 'Ticket Scanning on Your Phone | QR Check-In for Events',
    description: 'Scan QR tickets on the door with any phone, no app to install. See who’s in, stop tickets being used twice, and download your guest list.',
    kicker: 'On the door', h1: 'Scan tickets on the door with your phone', cta: 'paid',
    intro: 'Every ticket sold or booked through TheShowFinder has its own QR code. On the night you open your door link on any phone and scan people in. There is no app to download and nothing to set up.',
    points: [
      ['No app to install', 'The scanner opens in the phone’s web browser from your door link.'],
      ['Stops double use', 'Each ticket can be scanned in once. A second scan shows it has already been used.'],
      ['See who’s in', 'A running count of how many people have arrived.'],
      ['Type a code if needed', 'If a screen won’t scan, type the code printed under the QR.'],
      ['Several people on the door', 'Share the door link with whoever is checking tickets.'],
      ['Guest list download', 'Download every attendee before or after the night.'],
    ],
    faqs: [DOOR_FAQ, ['Do I need to download an app?', 'No. The scanner works in the phone’s web browser.'], ['Can more than one person scan?', 'Yes. Share the door link with everyone on the door.']],
  },
  {
    slug: 'gigs',
    title: 'Sell Gig Tickets Online | Keep 100% of Your Ticket Price',
    description: 'Selling tickets for a gig? Keep your full ticket price, get paid as you sell, and get your gig listed free where music fans in your town are looking.',
    kicker: 'Bands, promoters and venues', h1: 'Sell tickets for your gig and keep every penny', cta: 'paid',
    intro: 'Whether it’s a pub gig, a headline show or a night of local bands, you keep 100% of your ticket price and your buyers pay a small booking fee. Your gig is listed free on our gig pages for your town, where people go to find what’s on.',
    points: [
      ['Keep your full price', 'Buyers pay the booking fee, shown before they pay.'],
      ['Paid as you sell', 'Money goes to your Stripe account and on to your bank within days.'],
      ['Found by music fans', 'Listed on your town’s gig pages and on the venue’s page.'],
      ['QR tickets and door scanning', 'Tickets by email and a phone scanner for the door.'],
    ],
    faqs: [PAID_FAQ, PAYOUT_FAQ, ['Can I list a gig that sells tickets somewhere else?', 'Yes. You can list it free with a link to your own ticket page instead.']],
  },
  {
    slug: 'comedy-nights',
    title: 'Sell Comedy Night Tickets Online | Low Booking Fee',
    description: 'Run a comedy night? Sell tickets, keep 100% of your ticket price, and get listed on the comedy pages people search in your town.',
    kicker: 'Comedy clubs and promoters', h1: 'Sell tickets for your comedy night', cta: 'paid',
    intro: 'Comedy nights live and die on a full room. Sell tickets through us, keep your whole ticket price, and get your night listed on the comedy page for your town, which people find when they search for comedy near them.',
    points: [
      ['Keep your full price', 'Your buyers pay a small booking fee on top.'],
      ['On your town’s comedy page', 'Listed free where people look for comedy.'],
      ['Paid as you sell', 'No waiting until after the show for your money.'],
      ['Quick door check-in', 'Scan QR tickets from your phone as people arrive.'],
    ],
    faqs: [PAID_FAQ, PAYOUT_FAQ, DOOR_FAQ],
  },
  {
    slug: 'club-nights',
    title: 'Sell Club Night Tickets Online | Keep Your Full Ticket Price',
    description: 'Sell tickets for club nights and DJ events. Keep 100% of your ticket price, get paid as you sell and scan tickets on the door with your phone.',
    kicker: 'Club nights and DJs', h1: 'Sell tickets for your club night', cta: 'paid',
    intro: 'Sell tickets for club nights, DJ sets and parties. You keep 100% of your ticket price, money reaches your bank within days of each sale, and your door team scans QR tickets from their phones.',
    points: [
      ['Keep your full price', 'The booking fee is paid by your buyers.'],
      ['Paid as you sell', 'Pay your DJs and venue without waiting for the night.'],
      ['Fast door scanning', 'Share the door link with your whole door team.'],
      ['Listed free', 'On your town’s pages and in search on TheShowFinder.'],
    ],
    faqs: [PAID_FAQ, PAYOUT_FAQ, ['Can my door staff scan tickets?', 'Yes. Share your door link and they can scan from their own phones.']],
  },
  {
    slug: 'theatre-shows',
    title: 'Sell Theatre Tickets Online | Amateur & Professional Shows',
    description: 'Sell tickets for theatre, panto and drama groups. Keep 100% of your ticket price, get paid as you sell, and get listed on your town’s theatre pages.',
    kicker: 'Theatres and drama groups', h1: 'Sell tickets for your show', cta: 'paid',
    intro: 'For theatres, drama groups and panto companies. Sell tickets for each performance, keep 100% of your ticket price, and get listed on the theatre page for your town.',
    points: [
      ['Keep your full price', 'Buyers pay a small booking fee on top.'],
      ['Listed on theatre pages', 'Found by people searching for shows in your town.'],
      ['Paid as you sell', 'Money in your bank within days of each sale.'],
      ['Easy front of house', 'Scan tickets on your phone and download your audience list.'],
    ],
    faqs: [PAID_FAQ, PAYOUT_FAQ, DOOR_FAQ],
  },
  {
    slug: 'community-events',
    title: 'Sell Tickets for Community Events, Quizzes & Fundraisers',
    description: 'Sell or give away tickets for quizzes, fundraisers, talks and community events. Keep 100% of your ticket price, and free events are free.',
    kicker: 'Clubs, charities and community groups', h1: 'Tickets for quizzes, fundraisers and community events', cta: 'paid',
    intro: 'From quiz nights and fundraisers to talks and village events. Sell tickets and keep your whole ticket price, or give free tickets away at no cost. Every event is listed free on your town’s page.',
    points: [
      ['Keep your full price', 'Every penny of your ticket price goes to you or your cause.'],
      ['Free events are free', 'No fees at all on free tickets.'],
      ['Listed in your town', 'On your town’s page and in search on TheShowFinder.'],
      ['Know who’s coming', 'Download your guest list and scan tickets on the door.'],
    ],
    faqs: [PAID_FAQ, ['Can I give tickets away for free?', 'Yes. Choose free tickets when you list your event. There are no fees.'], PAYOUT_FAQ],
  },
]

export function sellPageBySlug(slug: string): SellPage | undefined {
  return SELL_PAGES.find(p => p.slug === slug)
}
