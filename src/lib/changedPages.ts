import { revalidatePath } from 'next/cache'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Changed = { slug: string | null; venue_slug: string | null; artist_slugs: string[] | null }

/**
 * Rebuild only the show pages whose content changed (migration 103). Event, artist and venue pages otherwise stay
 * cached for a week however often they are crawled, so the Vercel bill follows how much changed, not how many bots
 * visited. Returns counts for the job log.
 */
export async function revalidateChangedShowPages(admin: Loose): Promise<{ events: number; artists: number; venues: number } | { error: string }> {
  const { data, error } = await admin.rpc('take_changed_event_pages', { max_rows: 8000 }) as { data: Changed[] | null; error: { message: string } | null }
  if (error) return { error: error.message }
  const events = new Set<string>(), artists = new Set<string>(), venues = new Set<string>()
  for (const r of data ?? []) {
    if (r.slug) events.add(r.slug)
    if (r.venue_slug) venues.add(r.venue_slug)
    for (const a of r.artist_slugs ?? []) artists.add(a)
  }
  for (const s of events) revalidatePath(`/events/${s}`)
  for (const s of artists) revalidatePath(`/artists/${s}`)
  for (const s of venues) revalidatePath(`/venues/${s}`, 'layout')   // includes its /p/<n> pages
  return { events: events.size, artists: artists.size, venues: venues.size }
}

/** Rebuild just these shows' pages straight away (admin actions), instead of every event page on the site. */
export async function revalidateEventPages(admin: Loose, ids: Array<string | null | undefined>): Promise<void> {
  const list = [...new Set(ids.filter((id): id is string => !!id))]
  if (!list.length) return
  const { data } = await admin.from('events').select('slug').in('id', list) as { data: Array<{ slug: string | null }> | null }
  for (const r of data ?? []) if (r.slug) revalidatePath(`/events/${r.slug}`)
}
