import { createClient } from '@/lib/supabase/server'

// Short branded redirect for self-held ticket listings — shareable as
// https://theshowfinder.com/go/[slug] without exposing the underlying
// Viagogo/StubHub/etc. URL. Falls back to the normal event page when no
// own_ticket_url is set, so a shared link never dead-ends.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('own_ticket_url')
    .eq('slug', slug)
    .single() as unknown as { data: { own_ticket_url: string | null } | null }

  const destination = event?.own_ticket_url || `/events/${slug}`
  return Response.redirect(new URL(destination, request.url), 302)
}
