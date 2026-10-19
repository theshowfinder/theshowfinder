// The automatic weekly digest (cron: src/app/api/cron/weekly-digest). Plain
// React with inline styles and table layout for email-client compatibility,
// matching WelcomeEmail.tsx / NewsletterEmail.tsx. Every link goes through
// digestLink() so GA4 can attribute the traffic to this week's digest.

import { digestLink, cityWeekendPath, type DigestContent } from '@/lib/weeklyDigest'

interface Props {
  content: DigestContent
  weekKey: string
  unsubscribeUrl: string
}

const NAVY = '#1A1A2E'
const RED = '#E8003D'
const BLUE = '#026CDF'

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London',
  })
}

function SectionTitle({ kicker, title, color }: { kicker: string; title: string; color: string }) {
  return (
    <>
      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{kicker}</p>
      <h2 style={{ margin: '0 0 14px', fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>{title}</h2>
    </>
  )
}

function Row({ href, title, meta, cta }: { href: string; title: string; meta: string; cta: string }) {
  return (
    <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderTop: '1px solid #e2e8f0' }}>
      <tbody>
        <tr>
          <td style={{ padding: '12px 0' }}>
            <a href={href} style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', textDecoration: 'none' }}>{title}</a>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>{meta}</p>
          </td>
          <td align="right" style={{ padding: '12px 0 12px 12px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
            <a href={href} style={{ fontSize: '13px', fontWeight: 700, color: RED, textDecoration: 'none' }}>{cta} →</a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default function WeeklyDigestEmail({ content, weekKey, unsubscribeUrl }: Props) {
  const { onSale, events, shows, cityName } = content
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>This week on TheShowFinder</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F5F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', padding: '32px 12px' }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden' }}>
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: NAVY, padding: '28px 32px' }}>
                        <span style={{ fontWeight: 800, fontSize: '20px', color: '#ffffff' }}>
                          TheShow<span style={{ color: RED }}>Finder</span>
                        </span>
                        <h1 style={{ margin: '14px 0 0', fontSize: '26px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>
                          {cityName ? `Your week in ${cityName}` : 'Your week in live events'}
                        </h1>
                        <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#94a3b8' }}>
                          {cityName ? `What's on in ${cityName}, tickets going on sale, and West End picks.` : 'Tickets going on sale, what&apos;s on, and West End picks.'}
                        </p>
                      </td>
                    </tr>

                    {onSale.length > 0 && (
                      <tr>
                        <td style={{ padding: '28px 32px 8px' }}>
                          <SectionTitle kicker="Tickets just released" title="On sale this week" color={BLUE} />
                          {onSale.map(o => (
                            <Row
                              key={o.slug}
                              href={digestLink(`/on-sale-this-week/${o.slug}`, weekKey, 'on-sale')}
                              title={o.name}
                              meta={`${o.saleType === 'presale' ? 'Presale' : 'On sale'} ${o.whenLabel} · ${o.dateCount} UK date${o.dateCount === 1 ? '' : 's'}`}
                              cta="Find tickets"
                            />
                          ))}
                        </td>
                      </tr>
                    )}

                    {events.length > 0 && (
                      <tr>
                        <td style={{ padding: '24px 32px 8px' }}>
                          <SectionTitle kicker="Next 7 days" title={cityName ? `Happening in ${cityName}` : 'Happening this week'} color={RED} />
                          {events.map(e => (
                            <Row
                              key={e.slug}
                              href={digestLink(`/events/${e.slug}`, weekKey, 'this-week')}
                              title={e.title}
                              meta={`${fmtDay(e.startDate)} · ${e.venueName}, ${e.venueCity}`}
                              cta="Tickets"
                            />
                          ))}
                          {cityName && (
                            <p style={{ margin: '12px 0 0', fontSize: '14px' }}>
                              <a href={digestLink(cityWeekendPath(cityName), weekKey, 'city-weekend')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>
                                Everything on this weekend in {cityName} →
                              </a>
                            </p>
                          )}
                        </td>
                      </tr>
                    )}

                    {shows.length > 0 && (
                      <tr>
                        <td style={{ padding: '24px 32px 8px' }}>
                          <SectionTitle kicker="London theatre" title="West End picks" color={RED} />
                          {shows.map(s => (
                            <Row
                              key={s.slug}
                              href={digestLink(`/west-end/${s.slug}`, weekKey, 'west-end')}
                              title={s.title}
                              meta={`${s.venueName} · next ${fmtDay(s.nextDate)}`}
                              cta="Dates & tickets"
                            />
                          ))}
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td style={{ padding: '24px 32px 32px', textAlign: 'center' }}>
                        <a
                          href={digestLink('/events', weekKey, 'browse-all')}
                          style={{ display: 'inline-block', backgroundColor: RED, color: '#ffffff', fontWeight: 800, fontSize: '14px', padding: '13px 28px', borderRadius: '10px', textDecoration: 'none' }}
                        >
                          Browse all events →
                        </a>
                      </td>
                    </tr>

                    <tr>
                      <td style={{ backgroundColor: '#F5F5F0', padding: '20px 32px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#94a3b8' }}>
                          You&apos;re getting this because you subscribed at theshowfinder.com.
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                          <a href={unsubscribeUrl} style={{ color: '#94a3b8' }}>Unsubscribe</a>
                          {' · '}
                          <a href="https://www.theshowfinder.com/privacy-policy" style={{ color: '#94a3b8' }}>Privacy</a>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
