'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { MagnifyingGlassIcon, MapPinIcon } from '@heroicons/react/24/outline'

const cities = [
  'All UK', 'London', 'Manchester', 'Birmingham', 'Glasgow',
  'Edinburgh', 'Cardiff', 'Bristol', 'Leeds', 'Liverpool',
]

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [city,  setCity]  = useState('All UK')
  const router = useRouter()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (city && city !== 'All UK') params.set('city', city)
    router.push(`/events?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full max-w-2xl">
      {/* Keyword */}
      <div className="relative flex-1">
        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Artist, show or venue…"
          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent shadow-sm text-base min-h-[52px]"
          style={{ '--tw-ring-color': '#E8003D' } as React.CSSProperties}
        />
      </div>

      {/* City */}
      <div className="relative">
        <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
        <select
          value={city}
          onChange={e => setCity(e.target.value)}
          className="pl-9 pr-8 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:border-transparent shadow-sm appearance-none cursor-pointer min-h-[52px]"
          style={{ '--tw-ring-color': '#E8003D' } as React.CSSProperties}
        >
          {cities.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="px-6 py-3.5 text-white font-bold rounded-xl hover:opacity-90 transition-opacity shadow-sm whitespace-nowrap min-h-[52px]"
        style={{ backgroundColor: '#E8003D' }}
      >
        Find Shows
      </button>
    </form>
  )
}
