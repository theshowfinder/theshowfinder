interface Props {
  email: string
}

export default function WelcomeEmail({ email }: Props) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to TheShowFinder</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F5F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

        {/* Preheader — hidden text shown in inbox preview snippet */}
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden', msoHide: 'all' } as React.CSSProperties}>
          You&apos;re on the list! Get alerts the moment tickets go on sale for concerts, theatre, comedy, sports and family shows across the UK.
          {/* Spacer to push Gmail from pulling in body copy */}
          {' ‌'.repeat(60)}
        </div>

        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', padding: '40px 16px' }}>
          <tbody>
            <tr>
              <td align="center">
                <table width="100%" cellPadding="0" cellSpacing="0" style={{ maxWidth: '560px', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                  <tbody>

                    {/* Header */}
                    <tr>
                      <td style={{ backgroundColor: '#1A1A2E', padding: '32px 40px', textAlign: 'center' }}>
                        <span style={{ fontSize: '28px' }}>🎟️</span>
                        <span style={{ display: 'block', marginTop: '8px', fontWeight: 800, fontSize: '22px', color: '#ffffff', letterSpacing: '-0.5px' }}>
                          TheShow<span style={{ color: '#E8003D' }}>Finder</span>
                        </span>
                      </td>
                    </tr>

                    {/* Body */}
                    <tr>
                      <td style={{ padding: '40px 40px 32px' }}>
                        <h1 style={{ margin: '0 0 16px', fontSize: '26px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', lineHeight: '1.2' }}>
                          You&apos;re on the list! 🎉
                        </h1>
                        <p style={{ margin: '0 0 20px', fontSize: '16px', lineHeight: '1.6', color: '#475569' }}>
                          Hi there — welcome to TheShowFinder, the UK&apos;s events discovery platform.
                        </p>
                        <p style={{ margin: '0 0 20px', fontSize: '16px', lineHeight: '1.6', color: '#475569' }}>
                          You&apos;ll now receive alerts when tickets go on sale for top concerts, theatre, comedy, sports, and family shows across the UK — straight to your inbox before they sell out.
                        </p>

                        {/* What to expect box */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', borderRadius: '12px', margin: '24px 0' }}>
                          <tbody>
                            <tr>
                              <td style={{ padding: '24px' }}>
                                <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                  What you&apos;ll get
                                </p>
                                <p style={{ margin: '0 0 10px', fontSize: '15px', color: '#334155' }}>🎤 &nbsp;<strong>On-sale alerts</strong> — know the moment tickets are released</p>
                                <p style={{ margin: '0 0 10px', fontSize: '15px', color: '#334155' }}>📅 &nbsp;<strong>Weekly digests</strong> — the best upcoming shows near you</p>
                                <p style={{ margin: '0', fontSize: '15px', color: '#334155' }}>🏟️ &nbsp;<strong>Venue &amp; artist picks</strong> — curated events across 36 UK cities</p>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p style={{ margin: '0 0 28px', fontSize: '16px', lineHeight: '1.6', color: '#475569' }}>
                          In the meantime, head over to TheShowFinder to browse what&apos;s on near you.
                        </p>

                        {/* CTA */}
                        <table cellPadding="0" cellSpacing="0" style={{ margin: '0 0 32px' }}>
                          <tbody>
                            <tr>
                              <td>
                                <a
                                  href="https://www.theshowfinder.com"
                                  style={{
                                    display: 'inline-block',
                                    backgroundColor: '#E8003D',
                                    color: '#ffffff',
                                    fontWeight: 800,
                                    fontSize: '15px',
                                    padding: '14px 32px',
                                    borderRadius: '10px',
                                    textDecoration: 'none',
                                    letterSpacing: '-0.2px',
                                  }}
                                >
                                  Browse Events →
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', lineHeight: '1.5' }}>
                          We sent this to <strong>{email}</strong> because you signed up at theshowfinder.com.
                          If this wasn&apos;t you, you can safely ignore this email.
                        </p>
                      </td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td style={{ backgroundColor: '#F5F5F0', padding: '24px 40px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' }}>
                          © 2026 TheShowFinder · Part of Chamieville LLC
                        </p>
                        <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' }}>
                          <a href="https://www.theshowfinder.com/privacy-policy" style={{ color: '#94a3b8' }}>Privacy Policy</a>
                          &nbsp;·&nbsp;
                          <a href="https://www.theshowfinder.com/terms" style={{ color: '#94a3b8' }}>Terms</a>
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                          Don&apos;t want these emails?{' '}
                          <a
                            href={`https://www.theshowfinder.com/unsubscribe?email=${encodeURIComponent(email)}`}
                            style={{ color: '#94a3b8', textDecoration: 'underline' }}
                          >
                            Unsubscribe
                          </a>
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
