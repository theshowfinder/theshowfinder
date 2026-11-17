import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadDoorAccess, doorCounts } from '@/lib/ticketOrders'
import { formatShareWhen } from '@/lib/shareText'
import DoorScanner from '@/components/tickets/DoorScanner'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Door scanner', robots: { index: false, follow: false } }

// The organiser's door: scan QR tickets with the phone camera (or type the code), see who's in, download the list.
export default async function DoorPage({ searchParams }: { searchParams: Promise<{ s?: string; t?: string }> }) {
  const { s = '', t = '' } = await searchParams
  const db = createAdminClient()
  const access = await loadDoorAccess(db, s, t)
  if (!access) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-black">Door link not valid</h1>
          <p className="mt-3 text-white/70">Please open the door link from your listing email.</p>
        </div>
      </main>
    )
  }
  const counts = await doorCounts(db, access.eventId)
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-extrabold uppercase tracking-widest text-white/50">Door scanner</p>
        <h1 className="text-xl font-black leading-tight">{access.title}</h1>
        <p className="text-sm text-white/60">{formatShareWhen(access.startDate)}</p>
        <DoorScanner s={s} t={t} initialCounts={counts} />
        <a href={`/api/tickets/attendees?s=${encodeURIComponent(s)}&t=${encodeURIComponent(t)}`} className="mt-6 block rounded-xl border border-white/20 px-4 py-3 text-center text-sm font-bold">Download attendee list (spreadsheet)</a>
        <p className="mt-4 text-xs text-white/40 text-center">Keep this link private: anyone with it can check tickets in. Works for as many door staff as you like.</p>
      </div>
    </main>
  )
}
