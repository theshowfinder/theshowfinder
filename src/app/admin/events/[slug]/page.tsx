export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateEventOwnTicketUrlAction } from '../../actions'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import type { Event } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ saved?: string }>
}

export default async function EditEventPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { slug } = await params
  const { saved } = await searchParams
  const db = createAdminClient()

  const { data: event } = await db
    .from('events')
    .select('*')
    .eq('slug', slug)
    .single() as unknown as { data: Event | null }

  if (!event) notFound()

  const updateAction = updateEventOwnTicketUrlAction.bind(null, event.id, slug)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/events" className="text-slate-400 hover:text-slate-600 text-sm">← Events</Link>
        <h1 className="text-xl font-extrabold text-slate-900">{event.title}</h1>
        <Link href={`/events/${slug}`} className="text-slate-400 hover:text-slate-600 text-sm ml-auto" target="_blank">
          View page →
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Saved successfully
          </div>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Our own tickets</h2>
          <p className="text-sm text-slate-500 mb-5">
            Paste the URL of your own listing (Viagogo, StubHub, etc.) when you personally hold tickets for this event.
          </p>
          <form action={updateAction} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Own ticket URL</label>
              <input
                name="own_ticket_url"
                type="url"
                placeholder="https://www.viagogo.co.uk/..."
                defaultValue={event.own_ticket_url ?? ''}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="font-bold text-white px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#E8003D' }}
            >
              Save
            </button>
          </form>

          {event.own_ticket_url && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-2">Shareable link</p>
              <CopyLinkButton link={`https://theshowfinder.com/go/${event.slug}`} />
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
