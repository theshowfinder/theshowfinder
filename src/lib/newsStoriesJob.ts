import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import {
  type StoryEventRow,
  type StoryFacts,
  STORY_LISTED_WITHIN_DAYS,
  SALE_STARTED_GRACE_DAYS,
  buildStoryDrafts,
  draftFromFacts,
  mergeFacts,
  largeImageCandidate,
} from './newsStories.ts'
import { requestHook, hookProblem } from './newsHooks.ts'

// Runs after each new-show detection (05:00 and 17:00 UTC): turns just-announced tours into news stories with an
// image, a hook headline and their own page. New stories are published straight away (they are built only from
// our own listings); an existing story for the same artist this month is refreshed with any extra dates, without
// moving it back to the top. Hide a story with: update news_stories set status = 'hidden' where slug = '...'.

const MAX_AI_CALLS_PER_RUN = 15
const EVENT_SELECT =
  'id,slug,title,category,start_date,created_at,public_onsale_start,presale_start,presale_name,image_url,' +
  'venue:venues(name,city,capacity),' +
  'event_artists(is_headliner,artist:artists(id,name,slug,image_url,created_at,wikipedia_url))'

interface EventRow {
  id: string
  slug: string | null
  title: string
  category: string | null
  start_date: string
  created_at: string
  public_onsale_start: string | null
  presale_start: string | null
  presale_name: string | null
  image_url: string | null
  venue: { name: string | null; city: string | null; capacity: number | null } | null
  event_artists: {
    is_headliner: boolean | null
    artist: { id: string; name: string; slug: string; image_url: string | null; created_at: string; wikipedia_url: string | null } | null
  }[] | null
}

function flatten(rows: EventRow[]): StoryEventRow[] {
  return rows.map(e => {
    const eas = e.event_artists ?? []
    const head = eas.find(x => x.is_headliner && x.artist) ?? eas.find(x => x.artist)
    const a = head?.artist ?? null
    return {
      event_id: e.id,
      event_slug: e.slug,
      title: e.title,
      category: e.category,
      start_date: e.start_date,
      created_at: e.created_at,
      public_onsale_start: e.public_onsale_start,
      presale_start: e.presale_start,
      presale_name: e.presale_name,
      image_url: e.image_url,
      venue_name: e.venue?.name ?? null,
      venue_city: e.venue?.city ?? null,
      venue_capacity: e.venue?.capacity ?? null,
      artist_id: a?.id ?? null,
      artist_name: a?.name ?? null,
      artist_slug: a?.slug ?? null,
      artist_image_url: a?.image_url ?? null,
      artist_created_at: a?.created_at ?? null,
      artist_wikipedia_url: a?.wikipedia_url ?? null,
    }
  })
}

async function imageExists(url: string): Promise<boolean> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export interface StoriesResult {
  candidates: number
  inserted: number
  refreshed: number
  aiHooks: number
  templateHooks: number
  hookProblems: string[]
  headlines: string[]
}

interface ExistingStory {
  id: string
  dedupe_key: string
  slug: string
  headline: string
  headline_source: string
  facts: StoryFacts
  image_url: string | null
  image_url_large: string | null
}

export async function generateNewsStories(now = new Date(), opts: { dryRun?: boolean } = {}): Promise<StoriesResult> {
  const db = createAdminClient()
  const nowMs = now.getTime()
  const listedSince = new Date(nowMs - STORY_LISTED_WITHIN_DAYS * 86_400_000).toISOString()
  const saleSince = new Date(nowMs - SALE_STARTED_GRACE_DAYS * 86_400_000).toISOString()

  const { data, error } = await db
    .from('events')
    .select(EVENT_SELECT)
    .gte('created_at', listedSince)
    .gte('start_date', now.toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .or(`public_onsale_start.gt.${saleSince},presale_start.gt.${saleSince}`)
    .order('created_at', { ascending: false })
    .limit(3000)
  if (error) throw new Error(error.message)

  const drafts = buildStoryDrafts(flatten((data ?? []) as unknown as EventRow[]), nowMs)
  const result: StoriesResult = { candidates: drafts.length, inserted: 0, refreshed: 0, aiHooks: 0, templateHooks: 0, hookProblems: [], headlines: [] }
  if (!drafts.length) return result

  const { data: existingRows } = await db
    .from('news_stories')
    .select('id,dedupe_key,slug,headline,headline_source,facts,image_url,image_url_large')
    .in('dedupe_key', drafts.map(d => d.dedupeKey))
  const existing = new Map(((existingRows ?? []) as ExistingStory[]).map(r => [r.dedupe_key, r]))

  let aiCalls = 0
  const touched: string[] = []
  for (const fresh of drafts) {
    const prev = existing.get(fresh.dedupeKey)
    const draft = prev ? draftFromFacts(fresh.artistId, mergeFacts(prev.facts, fresh.facts, nowMs), fresh.imageUrl ?? prev.image_url, nowMs) : fresh
    const nowISO = new Date().toISOString()

    // Headline: keep an existing AI hook while it still matches the (possibly extended) facts.
    let headline = draft.hookTemplate
    let standfirst = draft.standfirst
    let source = 'template'
    if (prev && prev.headline_source === 'ai' && !hookProblem(prev.headline, draft.facts, { requireName: true })) {
      headline = prev.headline
      source = 'ai'
    } else if (!prev || prev.headline_source !== 'ai') {
      if (aiCalls < MAX_AI_CALLS_PER_RUN && !opts.dryRun) {
        aiCalls++
        const { hook, problem } = await requestHook(draft.facts)
        if (hook) {
          headline = hook.headline
          if (hook.standfirst) standfirst = hook.standfirst
          source = 'ai'
        } else if (problem) {
          result.hookProblems.push(`${draft.artistName}: ${problem}`)
        }
      }
    }
    if (source === 'ai') result.aiHooks++
    else result.templateHooks++
    if (draft.isHeadline) result.headlines.push(headline)

    let large = prev?.image_url_large ?? null
    if (!large && !opts.dryRun) {
      const candidate = largeImageCandidate(draft.imageUrl)
      if (candidate && (await imageExists(candidate))) large = candidate
    }

    const row = {
      artist_id: draft.artistId,
      artist_name: draft.artistName,
      artist_slug: draft.artistSlug,
      story_type: draft.facts.storyType,
      headline,
      template_headline: draft.templateHeadline,
      standfirst,
      headline_source: source,
      image_url: draft.imageUrl,
      image_url_large: large,
      facts: draft.facts,
      event_ids: draft.facts.dates.map(d => d.eventId),
      score: draft.score,
      is_headline: draft.isHeadline,
      updated_at: nowISO,
    }
    if (opts.dryRun) continue

    if (prev) {
      const { error: upErr } = await db.from('news_stories').update(row).eq('id', prev.id)
      if (!upErr) { result.refreshed++; touched.push(prev.slug) }
    } else {
      const { error: insErr } = await db.from('news_stories').insert({
        ...row, slug: draft.slug, dedupe_key: draft.dedupeKey, published_at: nowISO, status: 'published',
      })
      if (!insErr) { result.inserted++; touched.push(draft.slug) }
      else if (insErr.code === '23505') {
        // Same slug already used by another story this month (rare): add the artist id fragment.
        const { error: retryErr } = await db.from('news_stories').insert({
          ...row, slug: `${draft.slug}-${draft.artistId.slice(0, 6)}`, dedupe_key: draft.dedupeKey, published_at: nowISO, status: 'published',
        })
        if (!retryErr) { result.inserted++; touched.push(`${draft.slug}-${draft.artistId.slice(0, 6)}`) }
      }
    }
  }

  if (!opts.dryRun && touched.length) {
    try {
      revalidatePath('/')
      revalidatePath('/news')
      for (const slug of touched) revalidatePath(`/news/${slug}`)
    } catch {
      // Outside a Next.js request (scripts): nothing to revalidate.
    }
  }
  return result
}
