export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNewsCandidateAction } from '../../actions'
import NewsCandidateForm from '../NewsCandidateForm'

interface PageProps {
  searchParams: Promise<{ error?: string; url?: string }>
}

export default async function NewNewsCandidatePage({ searchParams }: PageProps) {
  await requireAdmin()
  const db = createAdminClient()
  const { error, url } = await searchParams

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
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ⚠ {error}
          </div>
        )}
        <NewsCandidateForm mode="create" action={createNewsCandidateAction} artists={artists ?? []} defaultUrl={url} />
      </main>
    </div>
  )
}
