// Read-only preview of the headline news stories the next run would build from live listings:
//   npx tsx --env-file=.env.local scripts/preview-news-stories.ts
import { createClient } from '@supabase/supabase-js'
import { buildStoryDrafts, STORY_LISTED_WITHIN_DAYS, SALE_STARTED_GRACE_DAYS, type StoryEventRow } from '../src/lib/newsStories'

const SELECT = 'id,slug,title,category,start_date,created_at,public_onsale_start,presale_start,presale_name,image_url,status,' +
  'venue:venues(name,city,capacity),event_artists(is_headliner,artist:artists(id,name,slug,image_url,created_at,wikipedia_url))'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const now = Date.now()
  const { data, error } = await db.from('events').select(SELECT)
    .gte('created_at', new Date(now - STORY_LISTED_WITHIN_DAYS * 864e5).toISOString())
    .gte('start_date', new Date(now).toISOString())
    .in('status', ['upcoming', 'on_sale', 'sold_out'])
    .or(`public_onsale_start.gt.${new Date(now - SALE_STARTED_GRACE_DAYS * 864e5).toISOString()},presale_start.gt.${new Date(now - SALE_STARTED_GRACE_DAYS * 864e5).toISOString()}`)
    .limit(3000)
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: StoryEventRow[] = (data as any[]).map(e => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = (e.event_artists ?? []).find((x: any) => x.is_headliner && x.artist) ?? (e.event_artists ?? []).find((x: any) => x.artist)
    const a = h?.artist
    return { event_id: e.id, event_slug: e.slug, title: e.title, category: e.category, start_date: e.start_date, created_at: e.created_at,
      public_onsale_start: e.public_onsale_start, presale_start: e.presale_start, presale_name: e.presale_name, image_url: e.image_url,
      venue_name: e.venue?.name ?? null, venue_city: e.venue?.city ?? null, venue_capacity: e.venue?.capacity ?? null,
      artist_id: a?.id ?? null, artist_name: a?.name ?? null, artist_slug: a?.slug ?? null, artist_image_url: a?.image_url ?? null,
      artist_created_at: a?.created_at ?? null, artist_wikipedia_url: a?.wikipedia_url ?? null }
  })
  const drafts = buildStoryDrafts(rows, now)
  console.log(`${rows.length} fresh listings -> ${drafts.length} stories, ${drafts.filter(d => d.isHeadline).length} headline\n`)
  for (const d of drafts) {
    console.log(`${d.isHeadline ? '★' : ' '} [${d.score}] ${d.hookTemplate}`)
    console.log(`     ${d.standfirst}`)
    console.log(`     /news/${d.slug}  img:${d.imageUrl ? 'yes' : 'NO'}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
