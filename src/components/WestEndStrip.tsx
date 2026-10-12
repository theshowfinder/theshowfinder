import Link from 'next/link'
import ShowCard from '@/components/ShowCard'
import { getWestEndShows } from '@/lib/showPool'

// A compact "West End" section for the homepage and the London page: the
// longest-running shows, one card each, linking into /west-end. Renders
// nothing if there are no shows (e.g. while the data is being refreshed).
export default async function WestEndStrip({ limit = 4, inline = false }: { limit?: number; inline?: boolean }) {
  const shows = (await getWestEndShows()).slice(0, limit)
  if (shows.length === 0) return null

  const body = (
    <>
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
              London theatre
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">West End Shows</h2>
          </div>
          <Link href="/west-end" className="text-sm font-semibold whitespace-nowrap hover:underline" style={{ color: '#E8003D' }}>
            See all shows →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {shows.map(show => <ShowCard key={show.slug} show={show} kind="west-end" />)}
        </div>
    </>
  )

  // `inline` is for pages that already provide their own width/padding (the
  // London city page); otherwise render as a full-width homepage section.
  if (inline) return <section>{body}</section>
  return (
    <section className="bg-[#F5F5F0] py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{body}</div>
    </section>
  )
}
