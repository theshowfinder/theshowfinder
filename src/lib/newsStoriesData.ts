// Reading our own news stories (news_stories, migration 085) for the homepage strip, /news and article pages.
import type { createPublicClient } from '@/lib/supabase/public'
import type { StoryFacts } from './newsStories.ts'
import { orderStories } from './newsStories.ts'

export interface NewsStory {
  id: string
  slug: string
  artist_id: string | null
  artist_name: string
  artist_slug: string | null
  story_type: string
  headline: string
  template_headline: string
  standfirst: string
  image_url: string | null
  image_url_large: string | null
  facts: StoryFacts
  event_ids: string[]
  score: number
  is_headline: boolean
  published_at: string
  updated_at: string
}

const LIST_COLUMNS = 'id,slug,artist_id,artist_name,artist_slug,story_type,headline,template_headline,standfirst,image_url,image_url_large,facts,event_ids,score,is_headline,published_at,updated_at'

type Db = ReturnType<typeof createPublicClient>

/** Newest first (biggest first within one run). headlineOnly = the homepage strip and alert emails. */
export async function fetchLatestStories(db: Db, opts: { limit: number; headlineOnly?: boolean; excludeId?: string }): Promise<NewsStory[]> {
  let q = db.from('news_stories').select(LIST_COLUMNS).eq('status', 'published')
  if (opts.headlineOnly) q = q.eq('is_headline', true)
  if (opts.excludeId) q = q.neq('id', opts.excludeId)
  const { data, error } = await q.order('published_at', { ascending: false }).limit(Math.max(opts.limit * 3, 30))
  if (error) {
    console.warn('[news-stories] read failed:', error.message)
    return []
  }
  return orderStories((data ?? []) as unknown as NewsStory[]).slice(0, opts.limit)
}

/** Published image-backed stories linked to events in one city. */
export async function fetchStoriesForEventIds(db: Db, eventIds: string[], limit = 5): Promise<NewsStory[]> {
  if (!eventIds.length) return []
  const { data, error } = await db
    .from('news_stories')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .overlaps('event_ids', eventIds)
    .order('published_at', { ascending: false })
    .limit(Math.max(limit * 2, 10))
  if (error) {
    console.warn('[news-stories] city read failed:', error.message)
    return []
  }
  return orderStories((data ?? []) as unknown as NewsStory[]).slice(0, limit)
}

export async function fetchStory(db: Db, slug: string): Promise<NewsStory | null> {
  const { data } = await db.from('news_stories').select(LIST_COLUMNS).eq('slug', slug).eq('status', 'published').maybeSingle()
  return (data as unknown as NewsStory | null) ?? null
}

export type SaleStatus =
  | { kind: 'presale-soon'; at: string; name: string | null; generalAt: string | null }
  | { kind: 'onsale-soon'; at: string }
  | { kind: 'on-sale' }
  | { kind: 'unknown' }

/** Where the sale is right now, from the story's facts (the headline keeps the wording it was published with). */
export function saleStatus(f: StoryFacts, now = Date.now()): SaleStatus {
  if (f.presaleAt && Date.parse(f.presaleAt) > now) return { kind: 'presale-soon', at: f.presaleAt, name: f.presaleName, generalAt: f.onsaleAt }
  if (f.onsaleAt && Date.parse(f.onsaleAt) > now) return { kind: 'onsale-soon', at: f.onsaleAt }
  if (f.onsaleAt) return { kind: 'on-sale' }
  return { kind: 'unknown' }
}

export function storyImage(s: Pick<NewsStory, 'image_url' | 'image_url_large'>, large = false): string {
  return (large ? s.image_url_large ?? s.image_url : s.image_url ?? s.image_url_large) ?? '/event-fallbacks/concert.png'
}
