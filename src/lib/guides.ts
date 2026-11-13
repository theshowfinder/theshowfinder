// Evergreen ticket-buying guides at /guides/[slug]. Plain module (no '@/'
// imports) so the content can be checked under node --test.
//
// Accuracy rules for this file: general UK consumer advice only. No figures
// from our own listings, no claims about specific sellers' policies that can
// change, and no legal advice beyond what UK consumer bodies publish.

export interface GuideSection {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export interface Guide {
  slug: string
  title: string
  /** Under 60 characters for search results. */
  seoTitle: string
  /** Under 160 characters. */
  description: string
  intro: string
  sections: GuideSection[]
  /** Shown at the end as a short FAQ (also marked up for search engines). */
  faq: { q: string; a: string }[]
  updated: string // YYYY-MM-DD
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-presales-work',
    title: 'How presales work: a UK guide to getting gig tickets early',
    seoTitle: 'How Presales Work: Get Gig Tickets Early (UK Guide)',
    description: 'How UK ticket presales work, the different types (artist, venue, promoter, card), the usual on-sale week, and how to give yourself the best chance.',
    intro: 'A presale is an early chance to buy tickets before they go on general sale. For popular tours, most of the best seats go during presales, so knowing how they work makes a real difference.',
    sections: [
      {
        heading: 'The usual on-sale week',
        paragraphs: [
          'Most UK tours follow a similar pattern after they are announced. Presales usually run in the days before general sale, often Tuesday to Thursday, and general sale tends to open on Friday morning, very often at 10am. Times vary, so always check the listing for the show you want.',
        ],
      },
      {
        heading: 'The main types of presale',
        bullets: [
          'Artist presale: sign up to the artist\'s mailing list or fan club. You are usually sent a code or a private link.',
          'Venue presale: many venues give their newsletter subscribers early access.',
          'Promoter presale: promoters such as Live Nation, SJM and Kilimanjaro run their own presales, usually for people signed up to their emails.',
          'Card and network presales: some bank cards and mobile networks offer presales to their customers, such as American Express or O2 Priority.',
        ],
      },
      {
        heading: 'How to give yourself the best chance',
        bullets: [
          'Sign up early. Registration for an artist presale can close days before it starts.',
          'Log in to the ticket seller\'s website or app before the sale, with your payment details already saved.',
          'Join the queue as soon as it opens, usually a little before the sale starts. Refreshing the page can send you to the back.',
          'Use one device and one browser tab per account. Lots of tabs can get you flagged or slow you down.',
          'Know which seats and price you want in advance, so you can check out quickly.',
        ],
      },
      {
        heading: 'Ballots and registration',
        paragraphs: [
          'For some very high-demand tours, there is no normal queue. Instead you register weeks in advance and fans are picked at random to get access to the sale. If you see a registration or ballot, sign up as soon as it opens, as it is usually the only way in.',
        ],
      },
      {
        heading: 'Prices can change',
        paragraphs: [
          'Some sellers use "in-demand" or dynamic pricing, where prices for some tickets rise when demand is high. Check the price before you check out, and look at all ticket types, as standard tickets can still be available at face value.',
        ],
      },
      {
        heading: 'If you miss out',
        paragraphs: [
          'Presale allocations can be small, so do not give up if you miss one. Try the general sale, check back nearer the date as extra tickets and production holds are sometimes released, and look for the artist\'s or venue\'s official resale option.',
        ],
      },
    ],
    faq: [
      { q: 'What time do presales start?', a: 'Many UK presales start at 9am or 10am, but times vary by artist and seller. Always check the listing for the show you want.' },
      { q: 'Do I need a code for a presale?', a: 'Often, yes. Artist and promoter presales usually send a code or a private link to people who signed up. Card and network presales may ask for the first digits of your card, or for you to get a code through the card or network\'s app.' },
      { q: 'Are presale tickets more expensive?', a: 'Not usually. Presale tickets are normally the same price as general sale, although some sellers offer premium or VIP packages during presales too.' },
    ],
    updated: '2026-11-13',
  },
  {
    slug: 'how-to-avoid-ticket-scams',
    title: 'How to spot and avoid ticket scams',
    seoTitle: 'How to Spot and Avoid Ticket Scams (UK Guide)',
    description: 'The warning signs of a ticket scam, the safest ways to buy and pay for gig, theatre and comedy tickets in the UK, and what to do if you have been caught out.',
    intro: 'Ticket scams are common, especially for sold-out shows. Most can be avoided by knowing the warning signs and choosing where and how you pay.',
    sections: [
      {
        heading: 'Warning signs',
        bullets: [
          'The seller asks you to pay by bank transfer, PayPal "friends and family" or gift cards. These give you little or no protection.',
          'The tickets are offered in social media posts, comments or private messages. Hacked accounts selling "spare tickets I can no longer use" are a common scam.',
          'The price looks too good to be true, especially for a sold-out show.',
          'You are put under pressure to pay quickly because "other people are interested".',
          'The website looks almost like an official one. Check the web address carefully.',
          'The seller will not tell you the seat details (block, row and seat) or what kind of ticket you will get.',
        ],
      },
      {
        heading: 'Buy from somewhere you can trust',
        bullets: [
          'Buy from the venue, the official ticket seller for the show, or an established marketplace that offers a buyer guarantee.',
          'Look for membership of STAR, the Society of Ticket Agents and Retailers. Members follow a code of practice and STAR runs a free complaints service.',
          'Check whether the artist or venue has an official way to resell tickets between fans.',
          'Get to the seller from a site you trust rather than an ad or a link in a message.',
        ],
      },
      {
        heading: 'Pay in a way that protects you',
        bullets: [
          'Credit card: under Section 75 of the Consumer Credit Act, the card company can be jointly responsible if something goes wrong, where a single item costs more than £100 and no more than £30,000.',
          'Debit card: you may be able to ask your bank for a chargeback if you do not get what you paid for.',
          'PayPal "goods and services" offers buyer protection; "friends and family" does not.',
          'Never pay by bank transfer to someone you do not know.',
        ],
      },
      {
        heading: 'Know how your tickets will arrive',
        paragraphs: [
          'Many tickets are now mobile tickets that stay in the official app and only appear close to the show. A screenshot or PDF of a mobile ticket is a warning sign, as it may not scan or may have been sold more than once.',
        ],
      },
      {
        heading: 'If you think you have been scammed',
        bullets: [
          'Contact your bank or card company straight away.',
          'Report it to Action Fraud (England, Wales and Northern Ireland) or to Police Scotland on 101.',
          'Report the seller\'s account or listing to the website or social network it was on.',
          'If you bought from a STAR member, you can use STAR\'s complaints service.',
        ],
      },
    ],
    faq: [
      { q: 'Is it safe to buy tickets on social media?', a: 'It is risky. Many ticket scams start with posts, comments or messages on social media. If you do buy this way, never pay by bank transfer and use a payment method with buyer protection.' },
      { q: 'Does paying by credit card protect me?', a: 'It can. Section 75 of the Consumer Credit Act covers single items costing more than £100 and up to £30,000. For smaller amounts, ask your card provider about a chargeback.' },
      { q: 'Where do I report a ticket scam?', a: 'Tell your bank first, then report it to Action Fraud in England, Wales and Northern Ireland, or to Police Scotland on 101.' },
    ],
    updated: '2026-11-13',
  },
]

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}
