import Link from 'next/link'
import type { NewsStory } from '@/lib/newsStoriesData'
import { storyImage } from '@/lib/newsStoriesData'

export default function CityNewsMosaic({ cityName, stories }: { cityName: string; stories: NewsStory[] }) {
  if (!stories.length) return null
  const [lead, ...rest] = stories.slice(0, 5)
  return (
    <section id="news" className="scroll-mt-20 order-1" aria-labelledby="city-news-heading">
      <div className="flex items-end justify-between mb-5 sm:mb-6">
        <div>
          <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>Latest event news</p>
          <h2 id="city-news-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900">What&apos;s happening in {cityName}</h2>
        </div>
        <Link href="/news" className="text-sm font-semibold hover:underline" style={{ color: '#E8003D' }}>All news →</Link>
      </div>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        <Link href={`/news/${lead.slug}`} className="group relative block overflow-hidden rounded-2xl lg:col-span-3 min-h-[260px] sm:min-h-[360px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={storyImage(lead, true)} alt={lead.headline} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 text-white">
            <span className="inline-block rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white mb-2" style={{ backgroundColor: '#E8003D' }}>Latest news</span>
            <h3 className="text-xl sm:text-3xl font-extrabold leading-tight group-hover:underline">{lead.headline}</h3>
            <p className="mt-2 text-sm text-white/75 line-clamp-2">{lead.standfirst}</p>
          </div>
        </Link>
        {rest.length > 0 && <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2">
          {rest.map(story => (
            <Link key={story.id} href={`/news/${story.slug}`} className="group relative min-h-[150px] overflow-hidden rounded-2xl bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={storyImage(story)} alt={story.headline} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
              <h3 className="absolute inset-x-0 bottom-0 p-3 text-sm sm:text-base font-extrabold leading-snug text-white line-clamp-3">{story.headline}</h3>
            </Link>
          ))}
        </div>}
      </div>
    </section>
  )
}
