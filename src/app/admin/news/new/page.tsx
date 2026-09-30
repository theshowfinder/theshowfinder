export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNewsCandidateAction } from '../../actions'
import NewsCandidateForm from '../NewsCandidateForm'

export default async function NewNewsCandidatePage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: artists } = await db
    .from('artists')
    .select('id, name')
    .order('name', { ascending: true }) as unknown as { data: { id: string; name: string }[] | null }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/news" className="text-slate-400 hover:text-slate-600 text-sm">← News Inbox</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Add Story</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <NewsCandidateForm mode="create" action={createNewsCandidateAction} artists={artists ?? []} />
      </main>
    </div>
  )
}
