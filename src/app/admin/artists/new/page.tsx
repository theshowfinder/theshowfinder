import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import NewArtistForm from './NewArtistForm'

export default async function NewArtistPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Add Artist</h1>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <NewArtistForm />
      </main>
    </div>
  )
}
