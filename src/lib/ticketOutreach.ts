// Ticket-selling outreach: a short email to event organisers (found by the organiser finder) about selling their
// tickets through TheShowFinder. Separate from backlink outreach. Nothing is sent until Chris approves it on
// /admin/organisers. While paid tickets are still in Stripe's test mode the email offers free listings and free
// tickets only, and never promises paid ticket sales. Pure module (no '@/' imports) for node --test.

export const SITE = 'https://www.theshowfinder.com'
export const TICKET_OUTREACH_PER_DAY = 20
export const TICKET_FOLLOW_UP_DAYS = 7

export interface TicketProspect {
  id: string; name: string | null; city: string | null; email: string | null; sample_event: string | null; sample_venue: string | null
  events_seen: number | null; unsubscribe_token: string
}

const signOff = (p: TicketProspect) => ['', 'Chris', 'TheShowFinder', SITE, '', '—', `Don't want emails from us? ${SITE}/unsubscribe/${p.unsubscribe_token}`]

export function buildTicketEmail(p: TicketProspect, step: 'first' | 'follow_up', paidLive: boolean): { subject: string; text: string } {
  const name = p.name?.trim() || 'your events'
  const subject = paidLive ? `Selling tickets for ${name}: keep 100% of your price` : `Free listings and free tickets for ${name}`
  if (step === 'follow_up') {
    return {
      subject: `Re: ${subject}`,
      text: ['Hi there,', '', `Just checking this reached you. ${paidLive ? 'Setting up takes about two minutes and there is no contract or monthly fee.' : 'Listing is free and takes about two minutes.'} If it isn't for you, no problem, I won't email again.`, ...signOff(p)].join('\n'),
    }
  }
  const seen = p.sample_event ? ` I came across ${p.sample_event}${p.sample_venue ? ` at ${p.sample_venue}` : ''}.` : ''
  const lines = paidLive ? [
    'Hi there,', '',
    `I'm Chris from TheShowFinder, a UK site where people find what's on near them${p.city ? `, including ${p.city}` : ''}.${seen}`,
    '',
    'If you sell tickets for your events, you can sell them through us:',
    '',
    '- You keep 100% of your ticket price. Buyers pay a small booking fee on top.',
    `- You're paid as you sell, straight to your bank, not weeks after the event.`,
    '- Your event is listed free on our city and venue pages, where people look for things to do.',
    '- QR tickets by email, a door scanner on your phone and your guest list to download.',
    '- Free events cost nothing at all. No contract, no monthly fee.',
    '',
    `How it works: ${SITE}/sell-tickets`,
    `Set up your first event (about two minutes): ${SITE}/list-your-event?ticketing=paid`,
    '',
    'Any questions, just reply.',
  ] : [
    'Hi there,', '',
    `I'm Chris from TheShowFinder, a UK site where people find what's on near them${p.city ? `, including ${p.city}` : ''}.${seen}`,
    '',
    'You can list your events on TheShowFinder free. They show on our city and venue pages, where people look for things to do, with a button to wherever you sell tickets.',
    '',
    `Running a free event? You can also give out free tickets through us: QR tickets by email, a door scanner on your phone and your guest list to download, all free. ${SITE}/sell-tickets/free-event-tickets`,
    '',
    `List an event (about two minutes): ${SITE}/list-your-event`,
    '',
    'Any questions, just reply.',
  ]
  return { subject, text: [...lines, ...signOff(p)].join('\n') }
}
