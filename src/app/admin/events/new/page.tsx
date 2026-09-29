import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import NewLocalEventForm from './NewLocalEventForm'

export default async function NewLocalEventPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/events" className="text-slate-400 hover:text-slate-600 text-sm">← Events</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Add Local Event</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-slate-500 mb-6">
          For markets, art fairs and community events that don&apos;t come through the Ticketmaster sync.
          These show up on the site tagged &ldquo;Local&rdquo; and appear on the relevant city page and in /events.
        </p>
        <NewLocalEventForm />
      </main>
    </div>
  )
}
