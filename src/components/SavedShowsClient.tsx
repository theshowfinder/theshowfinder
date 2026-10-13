'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { SavedEventRow } from '@/app/api/saved/route'
import { removeSaved } from '@/lib/savedShows'
import { canRemind } from '@/lib/reminders'
import { formatShareWhen } from '@/lib/shareText'
import { eventImageUrl } from '@/lib/eventImages'
import type { EventCategory } from '@/lib/types/database'
import { useSavedSlugs, writeSaved } from './savedStore'
import ReminderForm from './ReminderForm'

type LoadState = 'loading' | 'ready' | 'error'

const STATUS_LABEL: Record<string, string> = { sold_out: 'Sold out', cancelled: 'Cancelled', postponed: 'Postponed' }

export default function SavedShowsClient() {
  const saved = useSavedSlugs()
  const key = saved.join(',')
  const [events, setEvents] = useState<SavedEventRow[]>([])
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetch(`/api/saved?slugs=${encodeURIComponent(key)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { events: SavedEventRow[] }) => {
        if (cancelled) return
        setEvents(json.events)
        setState('ready')
        // Drop shows that no longer exist or have finished (only after a good response).
        const found = new Set(json.events.map(e => e.slug))
        const stale = saved.filter(s => !found.has(s))
        if (stale.length > 0) writeSaved(saved.filter(s => found.has(s)))
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const visible = useMemo(() => events.filter(e => saved.includes(e.slug)), [events, saved])
  const remindable = useMemo(() => visible.filter(e => canRemind(e.onsale_date, e.status)), [visible])

  if (key && state === 'loading') {
    return <p className="text-slate-500 py-10">Loading your shows…</p>
  }
  if (key && state === 'error') {
    return <p className="text-slate-600 py-10">We couldn&rsquo;t load your saved shows just now. Please refresh in a moment.</p>
  }

  if (!key || visible.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <p className="text-4xl mb-3" aria-hidden="true">♡</p>
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">Nothing saved yet</h2>
        <p className="text-slate-600 mb-5 max-w-md mx-auto">
          Tap the heart on any show to keep it here. We&rsquo;ll remember it on this device, no account needed.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/on-sale-this-week" className="px-5 min-h-[48px] inline-flex items-center rounded-xl text-white font-bold" style={{ backgroundColor: '#E8003D' }}>On sale this week</Link>
          <Link href="/events" className="px-5 min-h-[48px] inline-flex items-center rounded-xl border border-slate-300 font-bold text-slate-700 bg-white">Browse all shows</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {visible.map(e => {
          const img = eventImageUrl(e.image_url, e.category as EventCategory, e.title)
          const when = formatShareWhen(e.start_date)
          const onSaleLabel = canRemind(e.onsale_date, e.status) ? formatShareWhen(e.onsale_date) : null
          return (
            <li key={e.id} className="flex gap-4 bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
              <Link href={`/events/${e.slug}`} className="relative shrink-0 h-24 w-24 sm:h-28 sm:w-36 rounded-xl overflow-hidden bg-slate-100" aria-label={e.title}>
                <span className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${img}")` }} />
              </Link>
              <div className="min-w-0 flex-1 flex flex-col">
                <Link href={`/events/${e.slug}`} className="font-bold text-slate-900 leading-snug line-clamp-2 hover:opacity-80">{e.title}</Link>
                {when && <p className="text-sm text-slate-500 mt-1">📅 {when}</p>}
                {(e.venue_name || e.venue_city) && <p className="text-sm text-slate-500 truncate">📍 {[e.venue_name, e.venue_city].filter(Boolean).join(', ')}</p>}
                {onSaleLabel && <p className="text-sm font-semibold mt-1" style={{ color: '#E8003D' }}>Tickets on sale {onSaleLabel}</p>}
                {STATUS_LABEL[e.status] && <p className="text-sm font-semibold text-slate-600 mt-1">{STATUS_LABEL[e.status]}</p>}
                <div className="mt-auto pt-2 flex items-center gap-4 text-sm">
                  <Link href={`/events/${e.slug}`} className="font-bold" style={{ color: '#E8003D' }}>View tickets</Link>
                  <button type="button" onClick={() => writeSaved(removeSaved(saved, e.slug))} className="text-slate-500 hover:text-slate-800 min-h-[44px]">Remove</button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {remindable.length > 0 && (
        <ReminderForm
          slugs={remindable.map(e => e.slug)}
          source="saved"
          heading={remindable.length === 1 ? 'Get an email before tickets go on sale' : `Get an email before these ${remindable.length} shows go on sale`}
          blurb="Popular shows can sell out in minutes. We'll tell you up to a day before each on-sale time."
          buttonLabel="Remind me"
        />
      )}
    </div>
  )
}
