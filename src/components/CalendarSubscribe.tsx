import { webcalUrl, googleSubscribeUrl } from '@/lib/calendarFeeds'

// "Add these shows to your calendar": a live feed that keeps itself up to date.
// webcal:// opens Apple Calendar / Outlook; the second link adds it to Google Calendar.
export default function CalendarSubscribe({
  path, label = 'Add to calendar', variant = 'dark',
}: { path: string; label?: string; variant?: 'dark' | 'light' }) {
  const pill = variant === 'dark'
    ? 'bg-white/10 text-white hover:bg-white/20'
    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
  return (
    <span className="inline-flex items-center gap-1">
      <a href={webcalUrl(path)} className={`inline-flex items-center rounded-full px-4 min-h-[44px] text-sm font-semibold ${pill}`}
        title="Subscribe: the calendar updates itself">
        <span aria-hidden="true" className="mr-1.5">📅</span>{label}
      </a>
      <a href={googleSubscribeUrl(path)} target="_blank" rel="noopener" className={`inline-flex items-center rounded-full px-3 min-h-[44px] text-xs font-semibold ${pill}`}>
        Google
      </a>
    </span>
  )
}
