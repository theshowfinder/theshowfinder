export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateSocialPackAction, advanceSocialPackStatusAction } from '../../actions'
import SocialPackEditor from '../SocialPackEditor'
import { canAdvanceSocialPackStatus } from '@/lib/socialPack'
import type { SocialPack, SocialPackStatus } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}

const STATUS_STYLE: Record<SocialPackStatus, string> = {
  draft:            'bg-slate-100 text-slate-500',
  ready_for_review: 'bg-amber-100 text-amber-700',
  approved:         'bg-blue-100 text-blue-700',
  posted:           'bg-green-100 text-green-700',
}

const STATUS_LABEL: Record<SocialPackStatus, string> = {
  draft:            'Draft',
  ready_for_review: 'Ready for review',
  approved:         'Approved',
  posted:           'Posted',
}

const FORWARD_STEP: Record<SocialPackStatus, SocialPackStatus | null> = {
  draft:            'ready_for_review',
  ready_for_review: 'approved',
  approved:         'posted',
  posted:           null,
}

const BACK_STEPS: Record<SocialPackStatus, SocialPackStatus[]> = {
  draft:            [],
  ready_for_review: ['draft'],
  approved:         ['draft', 'ready_for_review'],
  posted:           ['draft', 'ready_for_review', 'approved'],
}

export default async function SocialPackDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { id } = await params
  const { saved, error } = await searchParams
  const db = createAdminClient()

  const { data: pack } = await db
    .from('social_packs')
    .select('*')
    .eq('id', id)
    .single() as unknown as { data: SocialPack | null }

  if (!pack) notFound()

  const updateAction = updateSocialPackAction.bind(null, pack.id)
  const forwardTo = FORWARD_STEP[pack.status]
  const forwardAction = forwardTo ? advanceSocialPackStatusAction.bind(null, pack.id, forwardTo) : null
  const backSteps = BACK_STEPS[pack.status].filter(to => canAdvanceSocialPackStatus(pack.status, to))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/social" className="text-slate-400 hover:text-slate-600 text-sm">← Social Packs</Link>
        <h1 className="text-xl font-extrabold text-slate-900 truncate">{pack.headline}</h1>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[pack.status]}`}>
          {STATUS_LABEL[pack.status]}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Saved successfully
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ⚠ {error}
          </div>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Status</h2>
          <p className="text-sm text-slate-500 mb-4">
            {pack.city_name ?? 'National'} · {pack.source_type === 'news_candidate' ? 'From a published news story' : 'From an event'} ·
            Draft → Ready for review → Approved → Posted, one step at a time. Posted only means you confirmed, by hand,
            that you posted it yourself — nothing here ever posts for you.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {forwardAction && (
              <form action={forwardAction}>
                <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90 transition-opacity">
                  Mark as &ldquo;{STATUS_LABEL[forwardTo!]}&rdquo;
                </button>
              </form>
            )}
            {backSteps.map(to => (
              <form key={to} action={advanceSocialPackStatusAction.bind(null, pack.id, to)}>
                <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  Back to &ldquo;{STATUS_LABEL[to]}&rdquo;
                </button>
              </form>
            ))}
          </div>
          {pack.approved_at && <p className="text-xs text-slate-400 mt-3">Approved {new Date(pack.approved_at).toLocaleString('en-GB')}</p>}
          {pack.posted_at && <p className="text-xs text-slate-400 mt-1">Posted {new Date(pack.posted_at).toLocaleString('en-GB')}</p>}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Branded image</h2>
          <p className="text-xs text-slate-400">
            Always a TheShowFinder-branded graphic — never a photo pulled from Ticketmaster, a venue, or a third-party
            article. Preview below, right-click (or long-press) to save, or use the download link.
          </p>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Square (Facebook / Instagram)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/admin/social/${pack.id}/image?format=square`} alt="Square social graphic" className="w-56 h-56 rounded-xl border border-slate-200 object-cover" />
              <a href={`/admin/social/${pack.id}/image?format=square`} download={`social-${pack.id}-square.png`} className="block text-xs font-semibold text-blue-600 hover:underline">
                Download square
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vertical (TikTok / Story)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/admin/social/${pack.id}/image?format=vertical`} alt="Vertical social graphic" className="w-32 h-56 rounded-xl border border-slate-200 object-cover" />
              <a href={`/admin/social/${pack.id}/image?format=vertical`} download={`social-${pack.id}-vertical.png`} className="block text-xs font-semibold text-blue-600 hover:underline">
                Download vertical
              </a>
            </div>
          </div>
        </section>

        <SocialPackEditor pack={pack} updateAction={updateAction} />

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Destination &amp; tracking</h2>
          <dl className="text-sm text-slate-600 space-y-1.5">
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-500 w-32 shrink-0">Destination</dt>
              <dd className="truncate"><a href={pack.destination_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{pack.destination_url}</a></dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-500 w-32 shrink-0">UTM campaign</dt>
              <dd>{pack.utm_campaign}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-500 w-32 shrink-0">Facebook link</dt>
              <dd className="truncate">{pack.facebook_link}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-500 w-32 shrink-0">Instagram link</dt>
              <dd className="truncate">{pack.instagram_link}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-500 w-32 shrink-0">TikTok link</dt>
              <dd className="truncate">{pack.tiktok_link}</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  )
}
