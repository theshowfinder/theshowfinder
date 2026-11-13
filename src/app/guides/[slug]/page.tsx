import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GUIDES, guideBySlug } from '@/lib/guides'
import { jsonLdScript, buildBreadcrumbSchema } from '@/lib/jsonld'
import NewsletterInline from '@/components/NewsletterInline'

const BASE = 'https://www.theshowfinder.com'

export const dynamicParams = false

export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }))
}

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const guide = guideBySlug(slug)
  if (!guide) return {}
  const url = `${BASE}/guides/${guide.slug}`
  return {
    title: guide.seoTitle,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: { title: guide.title, description: guide.description, url, type: 'article' },
  }
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const guide = guideBySlug(slug)
  if (!guide) notFound()
  const url = `${BASE}/guides/${guide.slug}`
  const others = GUIDES.filter(g => g.slug !== guide.slug)

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        dateModified: guide.updated,
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'TheShowFinder', url: BASE },
        publisher: { '@type': 'Organization', name: 'TheShowFinder', url: BASE },
      },
      {
        '@type': 'FAQPage',
        mainEntity: guide.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
      buildBreadcrumbSchema([
        { name: 'Home', url: BASE },
        { name: 'Guides', url: `${BASE}/guides` },
        { name: guide.title, url },
      ]),
    ],
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(schema) }} />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-500 mb-6">
          <Link href="/" className="hover:underline">Home</Link>
          <span aria-hidden="true"> › </span>
          <Link href="/guides" className="hover:underline">Guides</Link>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">{guide.title}</h1>
        <p className="text-sm text-slate-500 mt-3">Updated {fmtDate(guide.updated)}</p>
        <p className="text-lg text-slate-700 leading-relaxed mt-6">{guide.intro}</p>

        <div className="mt-10 space-y-10">
          {guide.sections.map(s => (
            <section key={s.heading}>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-3">{s.heading}</h2>
              {s.paragraphs?.map(p => (
                <p key={p} className="text-slate-700 leading-relaxed mb-3">{p}</p>
              ))}
              {s.bullets && (
                <ul className="list-disc pl-6 space-y-2 text-slate-700 leading-relaxed">
                  {s.bullets.map(b => <li key={b}>{b}</li>)}
                </ul>
              )}
            </section>
          ))}

          <section>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-4">Common questions</h2>
            <div className="space-y-5">
              {guide.faq.map(f => (
                <div key={f.q}>
                  <h3 className="font-bold text-slate-900">{f.q}</h3>
                  <p className="text-slate-700 leading-relaxed mt-1">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-12">
          <NewsletterInline
            source="guide"
            heading="Get presale alerts in your inbox"
            blurb="Our weekly email lists the week's presales and on-sale times for UK gigs, comedy and theatre."
          />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/on-sale-this-week"
            className="inline-block font-bold text-white px-6 py-3 rounded-xl text-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#E8003D' }}
          >
            See what&rsquo;s on sale this week
          </Link>
          {others.map(o => (
            <Link key={o.slug} href={`/guides/${o.slug}`} className="inline-block font-bold px-6 py-3 rounded-xl text-sm border-2 border-slate-300 text-slate-700 hover:border-slate-500">
              {o.title}
            </Link>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-10">
          This guide is general information, not legal or financial advice. Seller rules and prices change, so always check the details for the show you are buying for.
        </p>
      </article>
    </div>
  )
}
