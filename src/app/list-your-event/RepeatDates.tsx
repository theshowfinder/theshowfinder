'use client'

import { useMemo, useState } from 'react'
import { repeatDates, monthlyLabel, MAX_EXTRA_DATES, type RepeatPattern, type ExtraDate } from '@/lib/repeatDates'

const input = 'min-h-[44px] px-3 rounded-xl border border-slate-300 text-base bg-white'

function nice(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// "Does it happen more than once?": a pattern (weekly / fortnightly / monthly) or dates picked one by one.
// Sends the extra dates as hidden JSON `extra_dates`; each becomes its own listing.
export default function RepeatDates({ date, time }: { date: string; time: string }) {
  const [mode, setMode] = useState<'once' | RepeatPattern | 'pick'>('once')
  const [count, setCount] = useState(4)
  const [picked, setPicked] = useState<ExtraDate[]>([])
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [pickDate, setPickDate] = useState('')
  const [pickTime, setPickTime] = useState('')

  const extras: ExtraDate[] = useMemo(() => {
    if (mode === 'once') return []
    if (mode === 'pick') return picked
    return repeatDates(date, mode, count).filter(d => !removed.has(d)).map(d => ({ date: d, time }))
  }, [mode, count, picked, removed, date, time])

  const add = () => {
    if (!pickDate || picked.length >= MAX_EXTRA_DATES) return
    setPicked(p => [...p.filter(x => !(x.date === pickDate && x.time === (pickTime || time))), { date: pickDate, time: pickTime || time }].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)))
    setPickDate('')
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <input type="hidden" name="extra_dates" value={JSON.stringify(extras)} />
      <label className="block text-sm font-bold text-slate-800" htmlFor="repeat">Does it happen more than once?</label>
      <select id="repeat" value={mode} onChange={e => { setMode(e.target.value as typeof mode); setRemoved(new Set()) }} className={`${input} w-full`}>
        <option value="once">Just this date</option>
        <option value="weekly">Weekly</option>
        <option value="fortnightly">Every two weeks</option>
        <option value="monthly">{date ? monthlyLabel(date) : 'Monthly'}</option>
        <option value="pick">Other dates (pick them)</option>
      </select>

      {(mode === 'weekly' || mode === 'fortnightly' || mode === 'monthly') && (
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <span>How many dates in total?</span>
          <select value={count} onChange={e => { setCount(Number(e.target.value)); setRemoved(new Set()) }} className={input}>
            {Array.from({ length: MAX_EXTRA_DATES }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {mode === 'pick' && (
        <div className="flex flex-wrap gap-2">
          <input type="date" value={pickDate} onChange={e => setPickDate(e.target.value)} className={input} aria-label="Another date" />
          <input type="time" value={pickTime || time} onChange={e => setPickTime(e.target.value)} className={input} aria-label="Start time" />
          <button type="button" onClick={add} className="min-h-[44px] px-4 rounded-xl text-sm font-bold text-white bg-slate-800">Add date</button>
        </div>
      )}

      {mode !== 'once' && !date && <p className="text-sm text-slate-500">Choose the first date above and the rest appear here.</p>}

      {mode !== 'once' && (date || mode === 'pick') && (
        <ul className="text-sm text-slate-700 space-y-1">
          {date && <li className="font-semibold">{nice(date)}, {time} <span className="text-slate-400 font-normal">(first date)</span></li>}
          {extras.map(x => (
            <li key={`${x.date}${x.time}`} className="flex items-center justify-between gap-2">
              <span>{nice(x.date)}, {x.time}</span>
              <button type="button" className="text-xs font-semibold text-slate-500 underline" onClick={() => mode === 'pick' ? setPicked(p => p.filter(y => y !== x)) : setRemoved(r => new Set(r).add(x.date))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {extras.length > 0 && <p className="text-xs text-slate-500">Each date gets its own listing{' '}and its own tickets, all from this one form. Up to {MAX_EXTRA_DATES + 1} dates at a time.</p>}
    </div>
  )
}
