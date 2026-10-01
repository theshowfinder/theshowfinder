// Phase 5A: the actual email a newsletter send renders per recipient —
// styled like WelcomeEmail.tsx/WeeklyDigest.tsx (plain React with inline
// styles, a table-based layout for email-client compatibility), content
// supplied by the admin newsletter workflow rather than hard-coded.
//
// Split into NewsletterEmailBody (just the table content — no <html>/
// <head>/<body>) and the default NewsletterEmail (that content wrapped in
// a full document) so the admin preview (src/app/admin/newsletter/[id]/
// page.tsx) can render the body directly as a nested Server Component
// instead of a second, full HTML document nested inside the admin page's
// own <html> — which would be invalid markup, and which Next.js also
// won't let a Server Component render via react-dom/server directly
// ("render or return the content directly as a Server Component
// instead"). Only the actual Resend send (src/app/admin/newsletter/
// actions.tsx) needs the full-document version.

export interface NewsletterEmailArticle {
  headline: string
  summary: string | null
  source: string | null
  url: string
}

interface BodyProps {
  intro: string
  articles: NewsletterEmailArticle[]
  unsubscribeUrl: string
}

export function NewsletterEmailBody({ intro, articles, unsubscribeUrl }: BodyProps) {
  return (
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

        {/* Intro */}
        {intro && (
          <tr>
            <td style={{ padding: '32px 40px 8px' }}>
              <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.6', color: '#475569', whiteSpace: 'pre-wrap' }}>
                {intro}
              </p>
            </td>
          </tr>
        )}

        {/* Articles */}
        <tr>
          <td style={{ padding: '24px 40px 8px' }}>
            {articles.length === 0 ? (
              <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontStyle: 'italic' }}>No articles selected yet.</p>
            ) : (
              articles.map((article, i) => (
                <table key={i} width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '16px' }}>
                  <tbody>
                    <tr>
                      <td style={{ backgroundColor: '#F5F5F0', borderRadius: '12px', padding: '20px' }}>
                        <a href={article.url} style={{ textDecoration: 'none' }}>
                          <p style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800, color: '#0f172a', lineHeight: '1.35' }}>
                            {article.headline}
                          </p>
                        </a>
                        {article.summary && (
                          <p style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: '1.6', color: '#475569' }}>
                            {article.summary}
                          </p>
                        )}
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                          {article.source ?? 'Source'} &nbsp;·&nbsp;{' '}
                          <a href={article.url} style={{ color: '#E8003D', fontWeight: 700, textDecoration: 'none' }}>
                            Read more →
                          </a>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ))
            )}
          </td>
        </tr>

        {/* Browse all CTA */}
        <tr>
          <td style={{ padding: '8px 40px 36px', textAlign: 'center' }}>
            <a
              href="https://www.theshowfinder.com/news"
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
              More news on TheShowFinder →
            </a>
          </td>
        </tr>

        {/* Footer */}
        <tr>
          <td style={{ backgroundColor: '#F5F5F0', padding: '24px 40px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' }}>
              © 2026 TheShowFinder
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              You&apos;re receiving this because you subscribed at theshowfinder.com. &nbsp;
              <a href={unsubscribeUrl} style={{ color: '#94a3b8' }}>Unsubscribe</a>
            </p>
          </td>
        </tr>

      </tbody>
    </table>
  )
}

interface Props extends BodyProps {
  subject: string
}

export default function NewsletterEmail({ subject, intro, articles, unsubscribeUrl }: Props) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{subject}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#F5F5F0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <table width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: '#F5F5F0', padding: '40px 16px' }}>
          <tbody>
            <tr>
              <td align="center">
                <NewsletterEmailBody intro={intro} articles={articles} unsubscribeUrl={unsubscribeUrl} />
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
