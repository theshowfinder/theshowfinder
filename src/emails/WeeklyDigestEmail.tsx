// The automatic weekly digest (cron: src/app/api/cron/weekly-digest). Same look as the "Just announced" alert
// (NewsAlertEmail.tsx): a big picture for the week's top announcement, then picture rows for everything else.
// Plain React with inline styles and table layout for email-client compatibility. Every link goes through
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
const SITE = 'https://www.theshowfinder.com'

function absolute(src: string | null | undefined): string | null {
  if (!src) return null
  return src.startsWith('http') ? src.replace(/^http:\/\//, 'https://') : `${SITE}${src.startsWith('/') ? '' : '/'}${src}`
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
}

function SectionTitle({ kicker, title, color }: { kicker: string; title: string; color: string }) {
  return (
    <>
      <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{kicker}</p>
      <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>{title}</h2>
    </>
  )
}

/** One picture row: thumbnail left, title, a coloured label and a grey line on the right. */
function PictureRow({ href, image, title, label, labelColor, meta, cta }: {
  href: string; image: string | null; title: string; label?: string | null; labelColor?: string; meta?: string | null; cta: string
}) {
  return (
    <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderTop: '1px solid #e2e8f0' }}>
      <tbody>
        <tr>
          {image && (
            <td width="120" style={{ padding: '12px 14px 12px 0', verticalAlign: 'top' }}>
              <a href={href}>
                <img src={image} alt="" width="120" style={{ display: 'block', width: '120px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: 0 }} />
              </a>
            </td>
          )}
          <td style={{ padding: '12px 0', verticalAlign: 'top' }}>
            <a href={href} style={{ fontSize: '16px', lineHeight: '1.3', fontWeight: 800, color: '#0f172a', textDecoration: 'none' }}>{title}</a>
            {label && <p style={{ margin: '5px 0 0', fontSize: '12px', fontWeight: 800, color: labelColor ?? RED }}>{label}</p>}
            {meta && <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>{meta}</p>}
            <p style={{ margin: '6px 0 0' }}>
              <a href={href} style={{ fontSize: '13px', fontWeight: 800, color: RED, textDecoration: 'none' }}>{cta} →</a>
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default function WeeklyDigestEmail({ content, weekKey, unsubscribeUrl }: Props) {
  const { onSale, events, shows, cityName } = content
  const news = content.news ?? []
  const [lead, ...moreNews] = news
  const preheader = lead ? lead.headline : onSale[0] ? `${onSale[0].name} and more on sale this week` : 'This week in live events'
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>This week on TheShowFinder</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F5F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <span style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>{preheader}</span>
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', padding: '24px 12px' }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden' }}>
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: NAVY, padding: '20px 28px' }}>
                        <span style={{ fontWeight: 800, fontSize: '18px', color: '#ffffff' }}>
                          TheShow<span style={{ color: RED }}>Finder</span>
                        </span>
                        <span style={{ float: 'right', fontSize: '11px', fontWeight: 800, color: '#ffffff', backgroundColor: RED, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {cityName ? `Your week in ${cityName}` : 'Your week in live events'}
                        </span>
                      </td>
                    </tr>

                    {lead && (
                      <>
                        <tr>
                          <td>
                            <a href={digestLink(`/news/${lead.slug}`, weekKey, 'news-lead-image')}>
                              <img src={absolute(lead.image) ?? ''} alt="" width="600" style={{ display: 'block', width: '100%', maxWidth: '600px', height: 'auto', border: 0 }} />
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '22px 28px 6px' }}>
                            <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              {lead.saleLabel ?? 'Biggest announcement this week'}
                            </p>
                            <a href={digestLink(`/news/${lead.slug}`, weekKey, 'news-lead-title')} style={{ textDecoration: 'none' }}>
                              <h1 style={{ margin: 0, fontSize: '26px', lineHeight: '1.2', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>{lead.headline}</h1>
                            </a>
                            <p style={{ margin: '10px 0 18px', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>{lead.standfirst}</p>
                            <a href={digestLink(`/news/${lead.slug}`, weekKey, 'news-lead-button')} style={{ display: 'inline-block', backgroundColor: RED, color: '#ffffff', fontWeight: 800, fontSize: '14px', padding: '12px 24px', borderRadius: '10px', textDecoration: 'none' }}>
                              Dates and how to get tickets →
                            </a>
                          </td>
                        </tr>
                      </>
                    )}

                    {moreNews.length > 0 && (
                      <tr>
                        <td style={{ padding: '26px 28px 4px' }}>
                          <SectionTitle kicker="Just announced" title="New tours this week" color={RED} />
                          {moreNews.map(n => (
                            <PictureRow key={n.slug} href={digestLink(`/news/${n.slug}`, weekKey, 'news')} image={absolute(n.image)} title={n.headline} label={n.saleLabel} cta="See the dates" />
                          ))}
                        </td>
                      </tr>
                    )}

                    {onSale.length > 0 && (
                      <tr>
                        <td style={{ padding: '26px 28px 4px' }}>
                          <SectionTitle kicker="Set a reminder" title={cityName ? `On sale this week in ${cityName}` : 'On sale this week'} color={BLUE} />
                          {onSale.map(o => (
                            <PictureRow
                              key={o.slug}
                              href={digestLink(`/on-sale-this-week/${o.slug}`, weekKey, 'on-sale')}
                              image={absolute(o.image)}
                              title={o.name}
                              label={`${o.saleType === 'presale' ? 'Presale' : 'On sale'} ${o.whenLabel}`}
                              labelColor={o.saleType === 'presale' ? RED : BLUE}
                              meta={`${o.dateCount} UK date${o.dateCount === 1 ? '' : 's'}`}
                              cta="Find tickets"
                            />
                          ))}
                        </td>
                      </tr>
                    )}

                    {events.length > 0 && (
                      <tr>
                        <td style={{ padding: '26px 28px 4px' }}>
                          <SectionTitle kicker="Next 7 days" title={cityName ? `Happening in ${cityName}` : 'Happening this week'} color={RED} />
                          {events.map(e => (
                            <PictureRow
                              key={e.slug}
                              href={digestLink(`/events/${e.slug}`, weekKey, 'this-week')}
                              image={absolute(e.image)}
                              title={e.title}
                              label={fmtDay(e.startDate)}
                              meta={`${e.venueName}${e.venueCity && !e.venueName.includes(e.venueCity) ? `, ${e.venueCity}` : ''}`}
                              cta="Tickets"
                            />
                          ))}
                          {cityName && (
                            <p style={{ margin: '10px 0 0', fontSize: '13px' }}>
                              <a href={digestLink(cityWeekendPath(cityName), weekKey, 'city-weekend')} style={{ color: RED, fontWeight: 700, textDecoration: 'none' }}>
                                Everything on in {cityName} this weekend →
                              </a>
                            </p>
                          )}
                        </td>
                      </tr>
                    )}

                    {shows.length > 0 && (
                      <tr>
                        <td style={{ padding: '26px 28px 4px' }}>
                          <SectionTitle kicker="London theatre" title="West End picks" color={RED} />
                          {shows.map(s => (
                            <PictureRow
                              key={s.slug}
                              href={digestLink(`/west-end/${s.slug}`, weekKey, 'west-end')}
                              image={absolute(s.image)}
                              title={s.title}
                              meta={`${s.venueName} · next ${fmtDay(s.nextDate)}`}
                              cta="Dates & tickets"
                            />
                          ))}
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td style={{ padding: '26px 28px 30px', textAlign: 'center' }}>
                        <a href={digestLink('/events', weekKey, 'browse-all')} style={{ display: 'inline-block', backgroundColor: RED, color: '#ffffff', fontWeight: 800, fontSize: '14px', padding: '13px 28px', borderRadius: '10px', textDecoration: 'none' }}>
                          Browse all events →
                        </a>
                      </td>
                    </tr>

                    <tr>
                      <td style={{ backgroundColor: '#F5F5F0', padding: '20px 28px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#94a3b8' }}>
                          You&apos;re getting this because you subscribed at theshowfinder.com.
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                          <a href={unsubscribeUrl} style={{ color: '#94a3b8' }}>Unsubscribe</a>
                          {' · '}
                          <a href={`${SITE}/privacy-policy`} style={{ color: '#94a3b8' }}>Privacy</a>
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
