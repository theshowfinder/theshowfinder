export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOutreachEmail, subjectVariantFor, type Prospect } from '@/lib/outreach'
import { loadOutreachShow } from '@/lib/outreachShow'

// The outreach email exactly as the sender would build it right now, including the real upcoming show at the
// business's nearest venue. Nothing is sent from here.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function OutreachPreview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminClient() as Loose
  const { data: p } = await db.from('outreach_prospects').select('*').eq('id', id).maybeSingle()
  if (!p) return <div className="p-6 text-sm">Not found. <Link href="/admin/outreach" className="text-blue-600">Back</Link></div>
  const kind = ['sent'].includes(p.status) ? 'follow_up' : 'first'
  const prospect = (kind === 'first' ? { ...p, subject_variant: p.subject_variant ?? subjectVariantFor(p.id) } : p) as Prospect
  const show = await loadOutreachShow(db, prospect)
  const email = buildOutreachEmail(prospect, kind, { show })
  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-[640px] mx-auto space-y-3">
        <Link href="/admin/outreach" className="text-sm font-semibold text-blue-600">← Outreach</Link>
        <div className="rounded-xl bg-white border border-slate-200 p-4 text-sm">
          <p><span className="text-slate-500">To:</span> {p.business_name} &lt;{p.email}&gt;</p>
          <p><span className="text-slate-500">Subject:</span> <b>{email.subject}</b> <span className="text-xs text-slate-500">({kind === 'first' ? `version ${prospect.subject_variant}` : 'follow-up'})</span></p>
          <p className="text-xs text-slate-500 mt-1">{show ? `Show card: ${show.title}, ${show.when}` : 'No upcoming show with a picture at this venue, so the email goes without the show card.'}</p>
        </div>
        <iframe title="Email preview" srcDoc={email.html} className="w-full h-[1400px] rounded-xl border border-slate-200 bg-white" />
      </div>
    </div>
  )
}
