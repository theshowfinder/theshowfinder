export interface DigestEvent {
  title: string
  slug: string
  start_date: string
  onsale_date: string | null
  venue_name: string
  venue_city: string
  price_from: number | null
  currency: string | null
  image_url: string | null
  tickets_url: string | null
  category: string
}

interface Props {
  events: DigestEvent[]
  weekOf: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatPrice(price: number | null, currency: string | null) {
  if (!price) return null
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  return `From ${symbol}${price.toFixed(2)}`
}

const categoryEmoji: Record<string, string> = {
  concert: '🎤',
  theatre: '🎭',
  comedy: '😂',
  sports: '⚽',
  family: '👨‍👩‍👧',
}

export default function WeeklyDigest({ events, weekOf }: Props) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>On Sale This Week — TheShowFinder</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F5F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', padding: '40px 16px' }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: '600px', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                  <tbody>

                    {/* Header */}
                    <tr>
                      <td style={{ backgroundColor: '#1A1A2E', padding: '32px 40px' }}>
                        <table width="100%" cellPadding="0" cellSpacing="0">
                          <tbody>
                            <tr>
                              <td>
                                <span style={{ fontSize: '24px' }}>🎟️</span>
                                <span style={{ display: 'block', marginTop: '6px', fontWeight: 800, fontSize: '20px', color: '#ffffff' }}>
                                  TheShow<span style={{ color: '#E8003D' }}>Finder</span>
                                </span>
                              </td>
                              <td align="right" style={{ verticalAlign: 'bottom' }}>
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                  Week of {weekOf}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ marginTop: '20px' }}>
                          <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: '#026CDF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Tickets just released
                          </p>
                          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>
                            On Sale This Week
                          </h1>
                        </div>
                      </td>
                    </tr>

                    {/* Intro */}
                    <tr>
                      <td style={{ padding: '28px 40px 8px' }}>
                        <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.6', color: '#475569' }}>
                          Here are the hottest events that just went on sale. Grab your tickets before they sell out.
                        </p>
                      </td>
                    </tr>

                    {/* Event list */}
                    <tr>
                      <td style={{ padding: '16px 40px 32px' }}>
                        {events.map((event, i) => (
                          <table
                            key={event.slug}
                            width="100%"
                            cellPadding="0"
                            cellSpacing="0"
                            style={{
                              marginTop: i === 0 ? '8px' : '16px',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <tbody>
                              <tr>
                                <td style={{ padding: '20px 24px' }}>
                                  {/* Category pill */}
                                  <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    {categoryEmoji[event.category] ?? '🎟️'} {event.category}
                                  </p>

                                  {/* Title */}
                                  <p style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 800, color: '#0f172a', lineHeight: '1.3' }}>
                                    {event.title}
                                  </p>

                                  {/* Date & Venue */}
                                  <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#475569' }}>
                                    📅 &nbsp;{formatDate(event.start_date)}
                                  </p>
                                  <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#475569' }}>
                                    📍 &nbsp;{event.venue_name}, {event.venue_city}
                                  </p>

                                  {/* Price */}
                                  {formatPrice(event.price_from, event.currency) && (
                                    <p style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                                      {formatPrice(event.price_from, event.currency)}
                                    </p>
                                  )}

                                  {/* CTA */}
                                  <table cellPadding="0" cellSpacing="0">
                                    <tbody>
                                      <tr>
                                        <td>
                                          <a
                                            href={`https://www.theshowfinder.com/events/${event.slug}`}
                                            style={{
                                              display: 'inline-block',
                                              backgroundColor: '#E8003D',
                                              color: '#ffffff',
                                              fontWeight: 700,
                                              fontSize: '13px',
                                              padding: '10px 20px',
                                              borderRadius: '8px',
                                              textDecoration: 'none',
                                            }}
                                          >
                                            View event →
                                          </a>
                                        </td>
                                        {event.tickets_url && (
                                          <td style={{ paddingLeft: '10px' }}>
                                            <a
                                              href={event.tickets_url}
                                              style={{
                                                display: 'inline-block',
                                                backgroundColor: '#F5F5F0',
                                                color: '#1A1A2E',
                                                fontWeight: 700,
                                                fontSize: '13px',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                textDecoration: 'none',
                                              }}
                                            >
                                              Get tickets
                                            </a>
                                          </td>
                                        )}
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        ))}
                      </td>
                    </tr>

                    {/* Browse all CTA */}
                    <tr>
                      <td style={{ padding: '0 40px 36px', textAlign: 'center' }}>
                        <a
                          href="https://www.theshowfinder.com/events"
                          style={{
                            display: 'inline-block',
                            border: '2px solid #E8003D',
                            color: '#E8003D',
                            fontWeight: 800,
                            fontSize: '14px',
                            padding: '12px 28px',
                            borderRadius: '10px',
                            textDecoration: 'none',
                          }}
                        >
                          Browse all events →
                        </a>
                      </td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td style={{ backgroundColor: '#F5F5F0', padding: '24px 40px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' }}>
                          © 2026 TheShowFinder · Part of Chamieville LLC
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                          You&apos;re receiving this because you subscribed at theshowfinder.com. &nbsp;
                          <a href="https://www.theshowfinder.com/unsubscribe" style={{ color: '#94a3b8' }}>Unsubscribe</a>
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
