'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CITIES } from '@/lib/cities'
import type { NewsCandidate } from '@/lib/types/database'

const INPUT = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const LABEL = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1'

const STORY_TYPES = [
  { value: 'presale',               label: 'Presale' },
  { value: 'tour_announcement',     label: 'Tour announcement' },
  { value: 'new_dates',             label: 'New dates' },
  { value: 'venue_news',            label: 'Venue news' },
  { value: 'general_entertainment', label: 'General entertainment' },
] as const

const PRIORITIES = [
  { value: 'low',    label: 'Low' },
  { value: 'normal',  label: 'Normal' },
  { value: 'high',    label: 'High' },
] as const

// 'published' is deliberately excluded — that state is only ever reached
// via the dedicated Publish action, which also writes the city_news row(s).
const REVIEW_STATUSES = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string.
function toDatetimeLocal(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface ArtistOption {
  id: string
  name: string
}

interface Props {
  mode: 'create' | 'edit'
  action: (formData: FormData) => void | Promise<void>
  candidate?: NewsCandidate
  artists: ArtistOption[]
  // The candidate's current target cities (from news_candidate_cities) —
  // may be more than one. Ignored in create mode.
  cityNames?: string[]
  // Pre-fills the URL field after a duplicate/validation error redirect,
  // since the rest of what was typed is otherwise lost (see the comment
  // on createNewsCandidateAction in src/app/admin/actions.ts).
  defaultUrl?: string
}

export default function NewsCandidateForm({ mode, action, candidate, artists, cityNames, defaultUrl }: Props) {
  const [scopeType, setScopeType] = useState<'national' | 'city'>(candidate?.scope_type ?? 'national')
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set(cityNames ?? []))

  function toggleCity(name: string) {
    setSelectedCities(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <form action={action} className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <label className={LABEL}>Headline *</label>
          <input name="headline" required defaultValue={candidate?.headline ?? ''} placeholder="e.g. Oasis add second Wembley date" className={INPUT} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Source name</label>
            <input name="source" defaultValue={candidate?.source ?? ''} placeholder="e.g. NME, GetToTheFront" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Original article date</label>
            <input name="published_at" type="datetime-local" defaultValue={toDatetimeLocal(candidate?.published_at ?? null)} className={INPUT} />
            <p className="text-xs text-slate-400 mt-1">
              For reference only — when this story goes live, its public display date is set to the actual publish time, not this date.
            </p>
          </div>
        </div>

        <div>
          <label className={LABEL}>Article URL *</label>
          <input name="url" type="url" required defaultValue={candidate?.url ?? defaultUrl ?? ''} placeholder="https://… (the specific story)" className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Source URL</label>
          <input name="source_url" type="url" defaultValue={candidate?.source_url ?? ''} placeholder="https://… (the outlet itself, optional)" className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>Scope *</label>
          <select
            name="scope_type"
            required
            className={INPUT}
            value={scopeType}
            onChange={e => setScopeType(e.target.value === 'city' ? 'city' : 'national')}
          >
            <option value="national">National</option>
            <option value="city">City</option>
          </select>
        </div>

        {scopeType === 'city' && (
          <div>
            <label className={LABEL}>Cities * (select one or more)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto bg-slate-50">
              {CITIES.map(c => (
                <label key={c.name} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="city_names"
                    value={c.name}
                    checked={selectedCities.has(c.name)}
                    onChange={() => toggleCity(c.name)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {c.emoji} {c.name}
                </label>
              ))}
            </div>
            {selectedCities.size === 0 && (
              <p className="text-xs text-amber-600 mt-1">Select at least one city.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Story type</label>
            <select name="story_type" defaultValue={candidate?.story_type ?? 'general_entertainment'} className={INPUT}>
              {STORY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Priority</label>
            <select name="priority" defaultValue={candidate?.priority ?? 'normal'} className={INPUT}>
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Artist name</label>
            <input name="artist_name" defaultValue={candidate?.artist_name ?? ''} placeholder="Free text — used even if there's no matching artist page" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Matching artist (optional)</label>
            <select name="artist_id" defaultValue={candidate?.artist_id ?? ''} className={INPUT}>
              <option value="">— No match —</option>
              {artists.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL}>Summary</label>
          <textarea name="summary" rows={3} defaultValue={candidate?.summary ?? ''} placeholder="Manually editable — not shown publicly" className={`${INPUT} resize-none`} />
        </div>

        <div>
          <label className={LABEL}>Editorial note</label>
          <textarea name="editorial_note" rows={2} defaultValue={candidate?.editorial_note ?? ''} placeholder="Internal only — why this matters, anything to double-check" className={`${INPUT} resize-none`} />
        </div>

        <div>
          <label className={LABEL}>Review status</label>
          <select name="review_status" defaultValue={candidate?.review_status === 'published' ? 'approved' : (candidate?.review_status ?? 'pending')} className={INPUT}>
            {REVIEW_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {candidate?.review_status === 'published' && (
            <p className="text-xs text-slate-400 mt-1">
              Already published — saving here only edits the candidate record, it won&rsquo;t change the live news card(s). Use Reopen below to move it back to review.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 pb-4">
        <button
          type="submit"
          className="font-bold text-white px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-base shadow-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          {mode === 'create' ? 'Add to queue' : 'Save changes'}
        </button>
        <Link href="/admin/news" className="text-sm text-slate-500 hover:text-slate-700">
          Cancel
        </Link>
      </div>
    </form>
  )
}
