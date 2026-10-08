export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import SocialBatchExport from './SocialBatchExport'
import type { SocialPack } from '@/lib/types/database'

interface SearchParams { pack_ids?: string | string[] }

function asIds(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(values.filter(value => /^[0-9a-f-]{36}$/i.test(value)))]
}

export default async function SocialBatchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const ids = asIds((await searchParams).pack_ids)
  const db = createAdminClient()
  const { data } = ids.length
    ? await db.from('social_packs').select('*').in('id', ids).order('city_name', { ascending: true }) as unknown as { data: SocialPack[] | null }
    : { data: [] as SocialPack[] }
  const selected = data ?? []
  const approved = selected.filter(pack => pack.status === 'approved')
  const excluded = selected.filter(pack => pack.status !== 'approved')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/social" className="text-slate-400 hover:text-slate-600 text-sm">← Social Packs</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Meta batch export</h1>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <p className="font-bold">Ready for Facebook and Instagram</p>
          <p className="mt-1">These packs are approved and ready to publish. Use the square image and matching city caption for Meta; nothing is published from this page.</p>
        </section>
        {excluded.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"><p className="font-bold">{excluded.length} selected pack{excluded.length === 1 ? '' : 's'} not included</p><p className="mt-1">Only packs marked Approved can be exported. Move them through review first.</p></section>}
        {approved.length === 0 ? <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><p className="text-slate-500">No approved Social Packs selected.</p><Link href="/admin/social" className="mt-3 inline-block text-sm font-bold text-blue-600 hover:underline">Back to Social Packs</Link></section> : <SocialBatchExport packs={approved} />}
      </main>
    </div>
  )
}
