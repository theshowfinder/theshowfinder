'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createArtistAction } from '../../actions'

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80)
}

const INPUT  = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const LABEL  = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="mb-5">
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

interface DateRow { id: number }

export default function NewArtistForm() {
  const [name, setName]           = useState('')
  const [slug, setSlug]           = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [dateRows, setDateRows]   = useState<DateRow[]>([{ id: 0 }])

  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name))
  }, [name, slugEdited])

  const addRow    = () => setDateRows(r => [...r, { id: Date.now() }])
  const removeRow = (id: number) => setDateRows(r => r.filter(x => x.id !== id))

  return (
    <form action={createArtistAction} className="space-y-5">

      {/* ── Basic Info ─────────────────────────────────── */}
      <Card title="Basic Info">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Artist Name *</label>
            <input
              name="name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Donny Osmond"
              className={INPUT}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Slug (auto-generated)</label>
            <input
              name="slug"
              value={slug}
              onChange={e => { setSlug(e.target.value); setSlugEdited(true) }}
              placeholder="e.g. donny-osmond"
              className={INPUT}
            />
            <p className="text-xs text-slate-400 mt-1">URL: /artists/{slug || '…'}</p>
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Image URL</label>
            <input name="image_url" type="url" placeholder="https://…" className={INPUT} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Description</label>
            <textarea name="description" rows={3} placeholder="Brief bio or tour description…" className={`${INPUT} resize-none`} />
          </div>
        </div>
      </Card>

      {/* ── Tour Info ──────────────────────────────────── */}
      <Card title="Tour Info">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>Tour Name</label>
            <input name="tour_name" placeholder="e.g. The Great Aloha Tour" className={INPUT} />
            <p className="text-xs text-slate-400 mt-1">Required to save tour dates below.</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>General On Sale — Date & Time (GMT)</label>
            <input name="onsale_date" type="datetime-local" className={INPUT} />
          </div>
          <div className="col-span-2 flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              name="featured_onsale"
              id="featured_onsale"
              defaultChecked
              className="w-4 h-4 accent-blue-600 shrink-0"
            />
            <label htmlFor="featured_onsale" className="text-sm font-semibold text-slate-700 cursor-pointer">
              Show in On Sale This Week section
            </label>
          </div>
        </div>
      </Card>

      {/* ── Primary Tickets ────────────────────────────── */}
      <Card title="Primary Tickets" subtitle="Official ticket sellers — shown as main CTA buttons on artist page">
        <div className="space-y-2.5">
          {([
            { label: 'Ticketmaster', field: 'tickets_url',     color: '#026CDF' },
            { label: 'See Tickets',  field: 'see_tickets_url', color: '#e4022d' },
            { label: 'Eventim',      field: 'eventim_url',     color: '#00a4e0' },
            { label: 'AXS',          field: 'axs_url',         color: '#000000' },
            { label: 'Gigantic',     field: 'gigantic_url',    color: '#e4022d' },
          ] as const).map(({ label, field, color }) => (
            <div key={field} className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: color }} />
              <span className="text-sm font-semibold text-slate-700 w-28 shrink-0">{label}</span>
              <input name={field} type="url" placeholder="https://…" className={INPUT} />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Secondary Market ───────────────────────────── */}
      <Card title="Secondary Market" subtitle="Resale platforms — shown in Available Now section on artist page">
        <div className="space-y-2.5">
          {([
            { label: 'Gigsberg',    field: 'gigsberg_url',    color: '#1a1f6e' },
            { label: 'Viagogo',     field: 'viagogo_url',     color: '#00a650' },
            { label: 'StubHub',     field: 'stubhub_url',     color: '#400078' },
            { label: 'Vivid Seats', field: 'vivid_seats_url', color: '#02044a' },
          ] as const).map(({ label, field, color }) => (
            <div key={field} className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm font-semibold text-slate-700 w-28 shrink-0">{label}</span>
              <input name={field} type="url" placeholder="https://…" className={INPUT} />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Tour Dates ─────────────────────────────────── */}
      <Card title="Tour Dates" subtitle="Leave blank if no dates to add yet">
        <input type="hidden" name="tour_date_count" value={dateRows.length} />

        {/* Column headers — desktop */}
        <div className="hidden sm:grid grid-cols-12 gap-2 mb-2">
          {[
            { h: 'Date',  cls: 'col-span-3' },
            { h: 'Time',  cls: 'col-span-2' },
            { h: 'Venue', cls: 'col-span-4' },
            { h: 'City',  cls: 'col-span-2' },
            { h: '',      cls: 'col-span-1' },
          ].map(({ h, cls }) => (
            <div key={h} className={`${cls} text-xs font-semibold text-slate-400 uppercase tracking-wider`}>{h}</div>
          ))}
        </div>

        <div className="space-y-2 mb-4">
          {dateRows.map((row, i) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
              {/* Date */}
              <div className="col-span-12 sm:col-span-3">
                <label className={`${LABEL} sm:hidden`}>Date</label>
                <input name={`tour_date_${i}_date`} type="date" className={INPUT} />
              </div>
              {/* Time */}
              <div className="col-span-5 sm:col-span-2">
                <label className={`${LABEL} sm:hidden`}>Time</label>
                <input name={`tour_date_${i}_time`} type="time" defaultValue="19:30" className={INPUT} />
              </div>
              {/* Venue */}
              <div className="col-span-12 sm:col-span-4">
                <label className={`${LABEL} sm:hidden`}>Venue</label>
                <input name={`tour_date_${i}_venue`} placeholder="Venue name" className={INPUT} />
              </div>
              {/* City */}
              <div className="col-span-6 sm:col-span-2">
                <label className={`${LABEL} sm:hidden`}>City</label>
                <input name={`tour_date_${i}_city`} placeholder="City" className={INPUT} />
              </div>
              {/* Remove */}
              <div className="col-span-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={dateRows.length === 1}
                  className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-20 text-xl leading-none font-light"
                  title="Remove"
                  aria-label="Remove date"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          + Add another date
        </button>
      </Card>

      {/* ── Submit ─────────────────────────────────────── */}
      <div className="flex items-center gap-4 pb-12">
        <button
          type="submit"
          className="font-bold text-white px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-base shadow-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          Create Artist
        </button>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  )
}
