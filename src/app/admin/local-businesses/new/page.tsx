import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import NewLocalBusinessForm from './NewLocalBusinessForm'

export default async function NewLocalBusinessPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/local-businesses" className="text-slate-400 hover:text-slate-600 text-sm">← Local Businesses</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Add Business</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <NewLocalBusinessForm />
      </main>
    </div>
  )
}
