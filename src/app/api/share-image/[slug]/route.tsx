// 1200x630 share card for an event: artwork, name, date/time (London) and venue.
// Used as og:image so a pasted link in WhatsApp / Facebook / X / iMessage shows
// the date and place, not just the artwork. The artwork is fetched here and
// inlined (only JPEG/PNG, size-capped) so a slow or odd image can never break
// the card: it simply falls back to the plain branded background.
import { ImageResponse } from 'next/og'
import { createPublicClient } from '@/lib/supabase/public'
import { eventImageUrl } from '@/lib/eventImages'
import { formatShareWhen } from '@/lib/shareText'
import type { EventCategory } from '@/lib/types/database'

export const revalidate = 3600

const SITE = 'https://www.theshowfinder.com'
const MAX_IMAGE_BYTES = 3_000_000

async function loadArtwork(url: string): Promise<string | null> {
  try {
    const abs = new URL(url, SITE)
    if (abs.protocol !== 'https:') return null
    const res = await fetch(abs.toString(), { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'image/jpeg' && type !== 'image/png') return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null
    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select('title, category, image_url, start_date, status, venue:venues(name, city)')
    .eq('slug', slug)
    .maybeSingle()

  const event = data as unknown as {
    title: string
    category: EventCategory
    image_url: string | null
    start_date: string
    status: string
    venue: { name: string; city: string } | null
  } | null
  if (!event) return new Response('Not found', { status: 404 })

  const artwork = await loadArtwork(eventImageUrl(event.image_url, event.category, event.title))
  const when = formatShareWhen(event.start_date)
  const where = event.venue ? `${event.venue.name}, ${event.venue.city}` : null
  const titleSize = event.title.length <= 28 ? 84 : event.title.length <= 50 ? 66 : 52
  const badge = event.status === 'sold_out' ? 'SOLD OUT' : event.status === 'cancelled' ? 'CANCELLED' : event.status === 'postponed' ? 'POSTPONED' : null

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#1A1A2E', color: 'white' }}>
        {artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artwork} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(to top, rgba(26,26,46,0.97) 38%, rgba(26,26,46,0.55) 100%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 14, height: 630, display: 'flex', background: '#E8003D' }} />
        <div style={{ position: 'absolute', top: 44, left: 64, display: 'flex', alignItems: 'center', fontSize: 34 }}>
          <span style={{ color: 'white' }}>The</span>
          <span style={{ color: '#E8003D', marginLeft: 6 }}>ShowFinder</span>
        </div>
        {badge && (
          <div style={{ position: 'absolute', top: 40, right: 64, display: 'flex', background: '#E8003D', color: 'white', fontSize: 28, padding: '8px 22px', borderRadius: 999 }}>
            {badge}
          </div>
        )}
        <div style={{ position: 'absolute', left: 64, right: 64, bottom: 56, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.05, fontWeight: 800, maxWidth: 1070 }}>{event.title}</div>
          {when && <div style={{ display: 'flex', fontSize: 42, marginTop: 22, color: '#ffffff' }}>{when}</div>}
          {where && <div style={{ display: 'flex', fontSize: 36, marginTop: 8, color: 'rgba(255,255,255,0.78)' }}>{where}</div>}
          <div style={{ display: 'flex', fontSize: 28, marginTop: 26, color: '#E8003D' }}>Compare tickets · theshowfinder.com</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    },
  )
}
