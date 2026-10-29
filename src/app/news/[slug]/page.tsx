export const revalidate = 1800

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { fetchStory, fetchLatestStories, saleStatus, storyImage, type NewsStory } from '@/lib/newsStoriesData'
import { longDayLabel, clockLabel, storyUrl } from '@/lib/newsStories'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { jsonLdScript, buildNewsArticleSchema, buildBreadcrumbSchema } from '@/lib/jsonld'
import { londonTimeOrNull } from '@/lib/displayTitle'
import NewsletterInline from '@/components/NewsletterInline'
import StoryCard from '@/components/StoryCard'

interface Props { params: Promise<{ slug: string }> }

interface StoryEditorial {
  standfirst: string
  presaleEligibility: string
  tourNote: string
}

function storyEditorial(slug: string): StoryEditorial | null {
  if (slug !== 'sam-fender-uk-tour-dates-announced-oct-2026') return null
  return {
    standfirst: 'Sam Fender takes his biggest headline tour yet to eight UK stadium dates across five cities, with Wunderhorse as special guest. Album presale access requires a qualifying preorder by 9am Monday 26 October; general sale starts Friday 30 October at 9:30am.',
    presaleEligibility: 'To qualify for the album presale, preorder the new album from Sam Fender’s official store by 9am Monday 26 October. The presale code and link are due by email by 8pm Tuesday 27 October.',
    tourNote: 'Wunderhorse is confirmed as special guest on the UK stadium dates.',
  }
}

function displayVenueName(name: string | null): string | null {
  return name === 'St James Park' ? 'St James’ Park' : name
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const story = await fetchStory(createPublicClient(), slug)
  if (!story) return { title: 'News story not found', robots: { index: false } }
  const url = storyUrl(story.slug)
  const image = storyImage(story, true)
  const standfirst = storyEditorial(story.slug)?.standfirst ?? story.standfirst
  return {
    title: story.template_headline,
    description: standfirst.slice(0, 160),
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: story.headline,
      description: standfirst,
      url,
      publishedTime: story.published_at,
      images: [{ url: image, alt: story.artist_name }],
    },
    twitter: { card: 'summary_large_image', title: story.headline, description: standfirst, images: [image] },
  }
}

interface LiveDate {
  id: string
  slug: string | null
  start_date: string
  status: string
  venue_name: string | null
  venue_city: string | null
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' })
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
const publishedFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })

function saleLine(at: string): string {
  return `${longDayLabel(at)} at ${clockLabel(at)}`
}

async function liveDates(db: ReturnType<typeof createPublicClient>, story: NewsStory): Promise<LiveDate[]> {
  if (!story.event_ids.length) return []
  const { data } = await db
    .from('listed_events_with_venue')
    .select('id,slug,start_date,status,venue_name,venue_city')
    .in('id', story.event_ids.slice(0, 300))
    .in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
  // One row per venue per day (ticket feeds repeat shows for presale/premium variants).
  const seen = new Set<string>()
  return ((data ?? []) as LiveDate[]).filter(d => {
    const key = `${d.venue_name}|${d.start_date.slice(0, 10)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default async function NewsStoryPage({ params }: Props) {
  const { slug } = await params
  const db = createPublicClient()
  const story = await fetchStory(db, slug)
  if (!story) notFound()

  const [dates, more, artist] = await Promise.all([
    liveDates(db, story),
    fetchLatestStories(db, { limit: 4, excludeId: story.id }),
    story.artist_id
      ? db.from('artists').select('bio,bio_source').eq('id', story.artist_id).maybeSingle().then(r => r.data as { bio: string | null; bio_source: string | null } | null)
      : Promise.resolve(null),
  ])

  const f = story.facts
  const status = saleStatus(f)
  const url = storyUrl(story.slug)
  const artistHref = story.artist_slug ? `/artists/${story.artist_slug}` : null
  const firstName = story.artist_name
  const editorial = storyEditorial(story.slug)
  const standfirst = editorial?.standfirst ?? story.standfirst

  const schema = buildNewsArticleSchema({
    headline: story.headline, description: standfirst, url, image: storyImage(story, true),
    datePublished: story.published_at, dateModified: story.updated_at, about: story.artist_name,
  })
  const crumbs = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: 'News', url: 'https://www.theshowfinder.com/news' },
    { name: story.headline, url },
  ])

  const alertBox = (variant: string, stacked = false) => (
    <NewsletterInline
      source={variant}
      subject={story.artist_name}
      heading="Hear about the next big tour first"
      blurb="We email you as soon as new tours are announced, with the presale and on-sale times, so you are ready the moment tickets drop. Free, and you can unsubscribe any time."
      buttonLabel="Get tour alerts"
      stacked={stacked}
    />
  )

  return (
    <article className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />

      {/* ── Hero image with the headline over it ── */}
      <header className="relative overflow-hidden text-white" style={{ backgroundColor: '#1A1A2E' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={storyImage(story, true)}
          alt={story.artist_name}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(10,10,25,0.15) 0%, rgba(10,10,25,0.55) 45%, rgba(10,10,25,0.95) 100%)' }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-40 sm:pt-56 pb-8 sm:pb-12">
          <nav aria-label="Breadcrumb" className="text-xs text-white/70 mb-3">
            <Link href="/" className="hover:text-white">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href="/news" className="hover:text-white">News</Link>
          </nav>
          <p className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest mb-4" style={{ backgroundColor: '#E8003D' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
            {story.story_type === 'tour_announcement' ? 'Just announced' : 'New dates'}
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight max-w-3xl">{story.headline}</h1>
          <p className="mt-4 text-base sm:text-lg text-white/85 max-w-2xl leading-relaxed">{standfirst}</p>
          <p className="mt-4 text-xs text-white/60">
            By TheShowFinder · {publishedFmt.format(new Date(story.published_at))} · From the official ticket listings
          </p>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8 min-w-0">
          {/* ── When to get tickets ── */}
          <section aria-labelledby="tickets-when" className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
            <h2 id="tickets-when" className="text-lg font-extrabold text-slate-900 mb-4">How to get tickets</h2>
            <ul className="space-y-3 text-sm sm:text-base">
              {status.kind === 'presale-soon' && (
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 self-start rounded-md px-2 py-0.5 text-xs font-extrabold text-white" style={{ backgroundColor: '#E8003D' }}>PRESALE</span>
                  <span><strong>{status.name ?? 'Presale'}</strong> opens {saleLine(status.at)}.</span>
                </li>
              )}
              {f.onsaleAt && status.kind !== 'on-sale' && (
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 self-start rounded-md px-2 py-0.5 text-xs font-extrabold text-white" style={{ backgroundColor: '#026CDF' }}>GENERAL</span>
                  <span>General sale starts {saleLine(f.onsaleAt)}.</span>
                </li>
              )}
              {status.kind === 'on-sale' && (
                <li className="flex gap-3">
                  <span className="mt-0.5 shrink-0 self-start rounded-md px-2 py-0.5 text-xs font-extrabold text-white" style={{ backgroundColor: '#00a650' }}>ON SALE</span>
                  <span>Tickets are on sale now. See where to buy, from official sellers to resale, on each date below.</span>
                </li>
              )}
              <li className="flex gap-3 text-slate-600">
                <span className="mt-0.5 shrink-0 self-start rounded-md px-2 py-0.5 text-xs font-extrabold bg-slate-100 text-slate-700">TIP</span>
                <span>Popular shows can go fast. Be ready a few minutes early, signed in to your ticket account.</span>
              </li>
            </ul>
            {editorial?.presaleEligibility && (
              <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm leading-relaxed text-amber-950">{editorial.presaleEligibility}</p>
            )}
            {artistHref && (
              <Link
                href={artistHref}
                className="mt-5 inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-xl px-5 py-3 font-extrabold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#E8003D' }}
              >
                See all {firstName} dates and tickets →
              </Link>
            )}
          </section>

          <div className="lg:hidden">{alertBox('news-article-top')}</div>

          {editorial?.tourNote && (
            <section aria-label="Tour information" className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
              <h2 className="text-lg font-extrabold text-slate-900 mb-2">Special guest</h2>
              <p className="text-slate-700 leading-relaxed">{editorial.tourNote}</p>
            </section>
          )}

          {/* ── The dates ── */}
          {dates.length > 0 && (
            <section aria-labelledby="tour-dates">
              <h2 id="tour-dates" className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-4">
                {firstName} UK dates
              </h2>
              <ol className="divide-y divide-slate-200 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                {dates.map(d => {
                  const time = londonTimeOrNull(d.start_date)
                  return (
                    <li key={d.id} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                      <div className="w-16 shrink-0 text-center">
                        <p className="text-[11px] font-bold uppercase text-slate-500">{dayFmt.format(new Date(d.start_date))}</p>
                        <p className="text-sm font-extrabold text-slate-900 leading-tight">{dateFmt.format(new Date(d.start_date))}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">{d.venue_city ?? d.venue_name}</p>
                        <p className="text-sm text-slate-500 truncate">{displayVenueName(d.venue_name)}{time ? ` · ${time}` : ''}</p>
                      </div>
                      {d.slug && (
                        <Link
                          href={`/events/${d.slug}`}
                          className="shrink-0 rounded-lg px-3.5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                          style={{ backgroundColor: '#1A1A2E' }}
                        >
                          Tickets
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ol>
              <p className="mt-2 text-xs text-slate-500">Dates and times are from the official ticket listings. Each Tickets button opens the Showfinder event page, where you can check the latest availability and ticket links.</p>
            </section>
          )}

          {artist?.bio && (
            <section aria-labelledby="about-artist" className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
              <h2 id="about-artist" className="text-lg font-extrabold text-slate-900 mb-2">About {firstName}</h2>
              <p className="text-slate-700 leading-relaxed">{artist.bio.length > 600 ? `${artist.bio.slice(0, 600).replace(/\s+\S*$/, '')}…` : artist.bio}</p>
              {artist.bio_source && <p className="mt-2 text-xs text-slate-400">Source: {artist.bio_source === 'wikipedia' ? 'Wikipedia' : artist.bio_source === 'musicbrainz' ? 'MusicBrainz' : artist.bio_source}</p>}
            </section>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">{alertBox('news-article', true)}</div>
        </aside>
      </div>

      {more.length > 0 && (
        <section className="border-t border-slate-200 bg-white py-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">More tour news</h2>
              <Link href="/news" className="text-sm font-semibold hover:underline" style={{ color: '#E8003D' }}>All news →</Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {more.map(s => <StoryCard key={s.id} story={s} />)}
            </div>
          </div>
        </section>
      )}
    </article>
  )
}
