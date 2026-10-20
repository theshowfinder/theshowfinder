import Link from 'next/link'
import { artistPhotoUrl } from '@/lib/eventImages'
import { dateCountLabel, type ArtistListRow } from '@/lib/artistSearch'

// Compact artist tile for search results and the /artists directory.
export default function ArtistResultCard({ artist }: { artist: ArtistListRow }) {
  const photo = artistPhotoUrl(artist.name, artist.image_url)
  return (
    <Link
      href={`/artists/${artist.slug}`}
      className="group flex items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-sm p-3 hover:shadow-md hover:border-slate-300 transition"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-900">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={artist.name} loading="lazy" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl" style={{ background: 'linear-gradient(135deg, #1A1A2E, #E8003D)' }}>🎤</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-extrabold text-slate-900 group-hover:text-red-600 transition-colors">{artist.name}</p>
        <p className="truncate text-sm text-slate-500">{artist.subtitle ?? dateCountLabel(artist.upcoming_count, artist.next_date)}</p>
      </div>
    </Link>
  )
}
