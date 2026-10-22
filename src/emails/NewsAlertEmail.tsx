// "Just announced" alert email (cron: src/app/api/cron/news-alerts): our newest headline stories with their
// pictures and when tickets go on sale. Same plain React + inline styles + tables as WeeklyDigestEmail.tsx.

export interface AlertStory {
  slug: string
  headline: string
  standfirst: string
  image: string
  saleLabel: string | null
}

interface Props {
  stories: AlertStory[]
  unsubscribeUrl: string
}

const NAVY = '#1A1A2E'
const RED = '#E8003D'
const SITE = 'https://www.theshowfinder.com'

export function alertLink(slug: string, part: string): string {
  return `${SITE}/news/${slug}?utm_source=alerts&utm_medium=email&utm_campaign=news-alert&utm_content=${encodeURIComponent(part)}`
}

function absolute(src: string): string {
  return src.startsWith('http') ? src : `${SITE}${src}`
}

export default function NewsAlertEmail({ stories, unsubscribeUrl }: Props) {
  const [lead, ...rest] = stories
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{lead.headline}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F5F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <span style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>{lead.standfirst}</span>
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', padding: '24px 12px' }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden' }}>
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: NAVY, padding: '18px 28px' }}>
                        <span style={{ fontWeight: 800, fontSize: '18px', color: '#ffffff' }}>
                          TheShow<span style={{ color: RED }}>Finder</span>
                        </span>
                        <span style={{ float: 'right', fontSize: '11px', fontWeight: 800, color: '#ffffff', backgroundColor: RED, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Just announced
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <a href={alertLink(lead.slug, 'lead-image')}>
                          <img src={absolute(lead.image)} alt="" width="600" style={{ display: 'block', width: '100%', maxWidth: '600px', height: 'auto', border: 0 }} />
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '22px 28px 8px' }}>
                        {lead.saleLabel && (
                          <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lead.saleLabel}</p>
                        )}
                        <a href={alertLink(lead.slug, 'lead-title')} style={{ textDecoration: 'none' }}>
                          <h1 style={{ margin: 0, fontSize: '26px', lineHeight: '1.2', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>{lead.headline}</h1>
                        </a>
                        <p style={{ margin: '10px 0 18px', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>{lead.standfirst}</p>
                        <a
                          href={alertLink(lead.slug, 'lead-button')}
                          style={{ display: 'inline-block', backgroundColor: RED, color: '#ffffff', fontWeight: 800, fontSize: '14px', padding: '12px 24px', borderRadius: '10px', textDecoration: 'none' }}
                        >
                          Dates and how to get tickets →
                        </a>
                      </td>
                    </tr>

                    {rest.length > 0 && (
                      <tr>
                        <td style={{ padding: '26px 28px 8px' }}>
                          <p style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Also just announced</p>
                          {rest.map(s => (
                            <table key={s.slug} width="100%" cellPadding="0" cellSpacing="0" style={{ borderTop: '1px solid #e2e8f0' }}>
                              <tbody>
                                <tr>
                                  <td width="132" style={{ padding: '12px 14px 12px 0', verticalAlign: 'top' }}>
                                    <a href={alertLink(s.slug, 'more-image')}>
                                      <img src={absolute(s.image)} alt="" width="132" style={{ display: 'block', width: '132px', height: 'auto', borderRadius: '8px', border: 0 }} />
                                    </a>
                                  </td>
                                  <td style={{ padding: '12px 0', verticalAlign: 'top' }}>
                                    <a href={alertLink(s.slug, 'more-title')} style={{ fontSize: '16px', lineHeight: '1.3', fontWeight: 800, color: '#0f172a', textDecoration: 'none' }}>{s.headline}</a>
                                    {s.saleLabel && <p style={{ margin: '6px 0 0', fontSize: '12px', fontWeight: 700, color: RED }}>{s.saleLabel}</p>}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          ))}
                        </td>
                      </tr>
                    )}

                    <tr>
                      <td style={{ backgroundColor: '#F5F5F0', padding: '20px 28px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#94a3b8' }}>
                          You&apos;re getting this because you signed up for ticket alerts at theshowfinder.com. Dates and times come from the official ticket listings.
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
