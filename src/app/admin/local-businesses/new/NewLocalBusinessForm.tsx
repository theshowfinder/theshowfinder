'use client'

import Link from 'next/link'
import { createLocalBusinessAction } from '../../actions'
import { CITIES } from '@/lib/cities'

const INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const LABEL = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar',        label: 'Bar' },
  { value: 'hotel',      label: 'Hotel' },
  { value: 'transport',  label: 'Transport' },
  { value: 'other',      label: 'Other' },
] as const

export default function NewLocalBusinessForm() {
  return (
    <form action={createLocalBusinessAction} className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>City *</label>
            <select name="city" required className={INPUT} defaultValue="">
              <option value="" disabled>Select a city…</option>
              {CITIES.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Category *</label>
            <select name="category" required className={INPUT} defaultValue="restaurant">
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Business Name *</label>
            <input name="name" required placeholder="e.g. The Ivy" className={INPUT} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Description</label>
            <textarea name="description" rows={2} placeholder="One line — what makes it worth a mention" className={`${INPUT} resize-none`} />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Website URL</label>
            <input name="website_url" type="url" placeholder="https://…" className={INPUT} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL}>Display Order</label>
            <input name="display_order" type="number" defaultValue={0} className={INPUT} />
            <p className="text-xs text-slate-400 mt-1">Lower shows first (within sponsored/non-sponsored group).</p>
          </div>
          <div className="col-span-2 sm:col-span-1 flex flex-col justify-center gap-2.5 pt-5">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" name="is_sponsored" className="w-4 h-4 accent-blue-600" />
              Sponsored (paid placement)
            </label>
            <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" name="is_lusso_client" className="w-4 h-4 accent-blue-600" />
              Lusso Digital client
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 pb-12">
        <button
          type="submit"
          className="font-bold text-white px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-base shadow-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          Add Business
        </button>
        <Link href="/admin/local-businesses" className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  )
}
