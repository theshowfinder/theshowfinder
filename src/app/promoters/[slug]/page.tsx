import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { dropDuplicateEvents } from '@/lib/listedEvents'

export const revalidate = 3600

type Promoter = { id: string; name: string; slug: string; website: string | null; bio: string | null; logo_url: string | null; instagram: string | null; facebook: string | null }
type Ev = { id: string; slug: string; title: string; start_date: string; image_url: string | null; venue: { name: string | null; city: string | null } | null }

// Promoter plan perk: a page of their own with every upcoming event they list. Only for active plans (RLS).
async function getPromoter(slug: string): Promise<Promoter | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createPublicClient() as any).from('organisers').select('id, name, slug, website, bio, logo_url, instagram, facebook').eq('slug', slug).maybeSingle()
  return (data as Promoter | null) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPromoter((await params).slug)
  if (!p) return { title: 'Promoter not found' }
  // A promoter with nothing coming up is a thin page: still reachable, kept out of search until they list again.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (createPublicClient() as any).from('events').select('id', { count: 'exact', head: true })
    .eq('organiser_id', p.id).gte('start_date', new Date().toISOString()).in('status', LIVE_EVENT_STATUSES)
  return {
    ...(count ? {} : { robots: { index: false, follow: true } }),
    title: `${p.name}: Upcoming Events & Tickets`,
    description: `Every upcoming ${p.name} event, with dates, venues and tickets.`,
    alternates: { canonical: `https://www.theshowfinder.com/promoters/${p.slug}` },
  }
}

export default async function PromoterPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPromoter((await params).slug)
  if (!p) notFound()
  const supabase = createPublicClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('events')
    .select('id, slug, title, start_date, image_url, venue:venues(name, city)')
    .eq('organiser_id', p.id).gte('start_date', new Date().toISOString()).in('status', LIVE_EVENT_STATUSES)
    .order('start_date', { ascending: true }).limit(100)
  const events = await dropDuplicateEvents(supabase, (data ?? []) as Ev[])
  const links = [p.website && { href: p.website, label: 'Website' }, p.instagram && { href: p.instagram, label: 'Instagram' }, p.facebook && { href: p.facebook, label: 'Facebook' }].filter(Boolean) as { href: string; label: string }[]
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <section className="bg-[#1A1A2E] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.logo_url && <img src={p.logo_url} alt="" className="h-20 w-20 rounded-2xl object-cover bg-white" />}
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">Promoter</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold">{p.name}</h1>
            {links.length > 0 && <p className="mt-2 flex flex-wrap gap-3 text-sm">{links.map(l => <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="underline">{l.label} ↗</a>)}</p>}
          </div>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        {p.bio && <p className="text-slate-700 leading-relaxed whitespace-pre-line">{p.bio}</p>}
        <h2 className="text-xl font-extrabold text-slate-900">Upcoming events ({events.length})</h2>
        {events.length === 0 ? <p className="text-slate-600">No upcoming events right now. Check back soon.</p> : (
          <ul className="space-y-3">
            {events.map(e => (
              <li key={e.id}>
                <Link href={`/events/${e.slug}`} className="flex items-center gap-4 rounded-2xl bg-white border border-slate-200 p-4 hover:border-slate-400">
                  <div className="text-center w-14 shrink-0">
                    <div className="text-xs font-bold uppercase text-slate-400">{new Date(e.start_date).toLocaleDateString('en-GB', { month: 'short', timeZone: 'Europe/London' })}</div>
                    <div className="text-3xl font-extrabold text-slate-900 leading-none">{new Date(e.start_date).toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{e.title}</p>
                    <p className="text-sm text-slate-500 truncate">{[e.venue?.name, e.venue?.city].filter(Boolean).join(', ')}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#E8003D' }}>Tickets →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
