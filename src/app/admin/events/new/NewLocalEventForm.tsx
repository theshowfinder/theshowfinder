'use client'

import Link from 'next/link'
import { createLocalEventAction } from '../../actions'
import { CITIES } from '@/lib/cities'

const INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const LABEL = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

export default function NewLocalEventForm() {
  return (
    <form action={createLocalEventAction} className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>Event Title *</label>
            <input name="title" required placeholder="e.g. Derby Indoor Market" className={INPUT} />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>City *</label>
            <select name="city" required className={INPUT} defaultValue="">
              <option value="" disabled>Select a city…</option>
              {CITIES.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-end pb-2.5">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" name="is_free" defaultChecked className="w-4 h-4 accent-blue-600" />
              Free entry
            </label>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Date *</label>
            <input name="date" type="date" required className={INPUT} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Time</label>
            <input name="time" type="time" defaultValue="10:00" className={INPUT} />
          </div>

          <div className="col-span-2">
            <label className={LABEL}>Venue / Location Name *</label>
            <input name="venue_name" required placeholder="e.g. Market Place" className={INPUT} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Address</label>
            <input name="address" placeholder="Optional — defaults to location + city" className={INPUT} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Postcode</label>
            <input name="postcode" placeholder="Optional" className={INPUT} />
          </div>

          <div className="col-span-2">
            <label className={LABEL}>Description</label>
            <textarea name="description" rows={2} placeholder="One or two lines about the event" className={`${INPUT} resize-none`} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>More Info URL</label>
            <input name="info_url" type="url" placeholder="https://… (council page, market website, etc.)" className={INPUT} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 pb-12">
        <button
          type="submit"
          className="font-bold text-white px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-base shadow-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          Add Local Event
        </button>
        <Link href="/admin/events" className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  )
}
