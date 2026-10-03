export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  updateSocialPackAction,
  advanceSocialPackStatusAction,
  regenerateSocialPackImageAction,
  skipSocialPackAction,
  unskipSocialPackAction,
} from '../../actions'
import SocialPackEditor from '../SocialPackEditor'
import {
  canAdvanceSocialPackStatus,
  canSkipSocialPack,
  canUnskipSocialPack,
  isSocialImageKind,
  resolveStoredVenueVerified,
  SOCIAL_IMAGE_THEMES,
  type SocialImageKind,
} from '@/lib/socialPack'
import type { SocialPack, SocialPackStatus } from '@/lib/types/database'

const IMAGE_KIND_OPTIONS: SocialImageKind[] = ['tour_announcement', 'onsale', 'presale', 'city_event', 'tonight']

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; error?: string; regenerated?: string }>
}

const STATUS_STYLE: Record<SocialPackStatus, string> = {
  draft:            'bg-slate-100 text-slate-500',
  ready_for_review: 'bg-amber-100 text-amber-700',
  approved:         'bg-blue-100 text-blue-700',
  posted:           'bg-green-100 text-green-700',
  skipped:          'bg-slate-200 text-slate-500',
}

const STATUS_LABEL: Record<SocialPackStatus, string> = {
  draft:            'Draft',
  ready_for_review: 'Ready for review',
  approved:         'Approved',
  posted:           'Posted',
  skipped:          'Skipped',
}

const FORWARD_STEP: Record<SocialPackStatus, SocialPackStatus | null> = {
  draft:            'ready_for_review',
  ready_for_review: 'approved',
  approved:         'posted',
  posted:           null,
  // 'skipped' is reached and left only via the dedicated Skip/Unskip
  // buttons below, never via this forward/back ladder.
  skipped:          null,
}

const BACK_STEPS: Record<SocialPackStatus, SocialPackStatus[]> = {
  draft:            [],
  ready_for_review: ['draft'],
  approved:         ['draft', 'ready_for_review'],
  posted:           ['draft', 'ready_for_review', 'approved'],
  skipped:          [],
}

export default async function SocialPackDetailPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { id } = await params
  const { saved, error, regenerated } = await searchParams
  const db = createAdminClient()

  const { data: pack } = await db
    .from('social_packs')
    .select('*')
    .eq('id', id)
    .single() as unknown as { data: SocialPack | null }

  if (!pack) notFound()

  const updateAction = updateSocialPackAction.bind(null, pack.id)
  const regenerateImageAction = regenerateSocialPackImageAction.bind(null, pack.id)
  const skipAction = skipSocialPackAction.bind(null, pack.id)
  const unskipAction = unskipSocialPackAction.bind(null, pack.id)
  const storedImageParams = pack.image_params as Record<string, unknown> | null
  const storedKind = storedImageParams?.kind
  const currentImageKind: SocialImageKind = isSocialImageKind(storedKind) ? storedKind : 'city_event'
  const venueVerified = resolveStoredVenueVerified(storedImageParams?.venueVerified)
  // Cache-busts the <img> below so "Regenerate image" visibly updates the
  // preview instead of the browser quietly serving its old cached bytes
  // for an unchanged URL.
  const imageVersion = encodeURIComponent(pack.updated_at)
  const forwardTo = FORWARD_STEP[pack.status]
  const forwardAction = forwardTo ? advanceSocialPackStatusAction.bind(null, pack.id, forwardTo) : null
  const backSteps = BACK_STEPS[pack.status].filter(to => canAdvanceSocialPackStatus(pack.status, to))
  const showSkip = canSkipSocialPack(pack.status)
  const showUnskip = canUnskipSocialPack(pack.status)

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
        {regenerated && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Image regenerated
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ⚠ {error}
          </div>
        )}
        {!venueVerified && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ⚠ Venue &amp; date not verified against a real event — confirm before posting. The branded image omits the
            date rather than guessing one.
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
            {showSkip && (
              <form action={skipAction}>
                <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                  Skip this pack
                </button>
              </form>
            )}
            {showUnskip && (
              <form action={unskipAction}>
                <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90 transition-opacity">
                  Unskip (back to Draft)
                </button>
              </form>
            )}
          </div>
          {pack.approved_at && <p className="text-xs text-slate-400 mt-3">Approved {new Date(pack.approved_at).toLocaleString('en-GB')}</p>}
          {pack.posted_at && <p className="text-xs text-slate-400 mt-1">Posted {new Date(pack.posted_at).toLocaleString('en-GB')}</p>}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Branded image</h2>
          <p className="text-xs text-slate-400">
            Always a TheShowFinder-branded graphic, in one of five vibrant templates — never a photo scraped or pasted
            from a third-party article. When the event or artist has its own Ticketmaster photo it&rsquo;s used as the
            background; otherwise the template falls back to its own gradient design. Preview below, right-click (or
            long-press) to save, or use the download link.
          </p>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Square (Facebook / Instagram)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/admin/social/${pack.id}/image?format=square&v=${imageVersion}`} alt="Square social graphic" className="w-56 h-56 rounded-xl border border-slate-200 object-cover" />
              <a href={`/admin/social/${pack.id}/image?format=square&v=${imageVersion}`} download={`social-${pack.id}-square.png`} className="block text-xs font-semibold text-blue-600 hover:underline">
                Download square
              </a>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vertical (TikTok / Story)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/admin/social/${pack.id}/image?format=vertical&v=${imageVersion}`} alt="Vertical social graphic" className="w-32 h-56 rounded-xl border border-slate-200 object-cover" />
              <a href={`/admin/social/${pack.id}/image?format=vertical&v=${imageVersion}`} download={`social-${pack.id}-vertical.png`} className="block text-xs font-semibold text-blue-600 hover:underline">
                Download vertical
              </a>
            </div>
          </div>

          <form action={regenerateImageAction} className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Template</label>
              <select
                name="kind"
                defaultValue={currentImageKind}
                className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {IMAGE_KIND_OPTIONS.map(kind => (
                  <option key={kind} value={kind}>{SOCIAL_IMAGE_THEMES[kind].badgeLabel}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90 transition-opacity">
              Regenerate image
            </button>
            <p className="text-xs text-slate-400 basis-full">
              Re-reads the date, status and any approved photo from the source record. Pick a different template
              above first if the automatic one isn&rsquo;t right for this post (e.g. a &ldquo;Tonight&rdquo; post).
            </p>
          </form>
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
