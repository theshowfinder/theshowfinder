import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { fetchLatestStories, storyImage } from '@/lib/newsStoriesData'
import StoryCard, { saleChip } from '@/components/StoryCard'

// The top of the homepage: our newest headline tour news, newest first. The lead story is the biggest of the
// latest run; as new stories arrive they take the top spot and older ones move down and then off the strip.
export default async function HeadlineNews() {
  const stories = await fetchLatestStories(createPublicClient(), { limit: 5, headlineOnly: true })
  if (!stories.length) return null
  const [lead, ...rest] = stories
  const chip = saleChip(lead)

  return (
    <section aria-labelledby="headline-news" className="py-6 sm:py-8" style={{ backgroundColor: '#12121F' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 id="headline-news" className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-white">
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: '#E8003D' }} aria-hidden="true" />
            Latest tour news
          </h2>
          <Link href="/news" className="text-sm font-semibold text-white/60 hover:text-white transition-colors">All news →</Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Lead story */}
          <Link href={`/news/${lead.slug}`} className="group relative block overflow-hidden rounded-2xl lg:col-span-3 min-h-[280px] sm:min-h-[380px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={storyImage(lead, true)}
              alt={lead.artist_name}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 100%)' }} />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 text-white">
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ backgroundColor: '#E8003D' }}>
                  {lead.story_type === 'tour_announcement' ? 'Just announced' : 'New dates'}
                </span>
                {chip && (
                  <span className="rounded-md bg-white/15 px-2 py-1 text-[11px] font-extrabold backdrop-blur">{chip.text}</span>
                )}
              </div>
              <h3 className="text-2xl sm:text-4xl font-extrabold leading-tight tracking-tight max-w-2xl group-hover:underline decoration-2 underline-offset-4">
                {lead.headline}
              </h3>
              <p className="mt-2 hidden sm:block text-sm text-white/80 max-w-xl line-clamp-2">{lead.standfirst}</p>
            </div>
          </Link>

          {/* The next stories */}
          {rest.length > 0 && (
            <div className="grid gap-4 grid-cols-2 lg:col-span-2">
              {rest.map((s, i) => (
                // On phones only the next two show, so the search is not pushed too far down.
                <div key={s.id} className={i >= 2 ? 'hidden sm:block' : undefined}>
                  <StoryCard story={s} dark />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
