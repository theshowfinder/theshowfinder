import Link from 'next/link'
import { type NewsStory, saleStatus, storyImage } from '@/lib/newsStoriesData'
import { saleDayLabel, clockLabel } from '@/lib/newsStories'

/** Short "when can I buy" label for a story card. */
export function saleChip(story: NewsStory): { text: string; color: string } | null {
  const s = saleStatus(story.facts)
  if (s.kind === 'presale-soon') return { text: `Presale ${saleDayLabel(s.at)}, ${clockLabel(s.at)}`, color: '#E8003D' }
  if (s.kind === 'onsale-soon') return { text: `On sale ${saleDayLabel(s.at)}, ${clockLabel(s.at)}`, color: '#026CDF' }
  if (s.kind === 'on-sale') return { text: 'On sale now', color: '#00a650' }
  return null
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })

export default function StoryCard({ story, dark = false }: { story: NewsStory; dark?: boolean }) {
  const chip = saleChip(story)
  return (
    <Link
      href={`/news/${story.slug}`}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg ${dark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white'}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={storyImage(story)}
          alt={story.artist_name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {chip && (
          <span className="absolute left-3 bottom-3 rounded-md px-2 py-1 text-[11px] font-extrabold text-white shadow" style={{ backgroundColor: chip.color }}>
            {chip.text}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className={`text-[11px] font-bold uppercase tracking-widest mb-1.5 ${dark ? 'text-white/50' : 'text-slate-400'}`}>
          {story.story_type === 'tour_announcement' ? 'Just announced' : 'New dates'} · {dayFmt.format(new Date(story.published_at))}
        </p>
        <h3 className={`font-extrabold leading-snug ${dark ? 'text-white' : 'text-slate-900'} group-hover:underline decoration-2 underline-offset-2`}>
          {story.headline}
        </h3>
      </div>
    </Link>
  )
}
