import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Cookie-free Supabase client for PUBLIC reads (anon key, no user session).
//
// Why this exists: the cookie-based client in ./server.ts calls cookies(),
// which opts every route that uses it into dynamic rendering. That silently
// disables `revalidate` — pages were being rebuilt from the database on every
// request and served with `cache-control: private, no-store`, so nothing was
// cached on Vercel's CDN. Public pages (home, events, artists, venues, cities,
// West End, news, on-sale, sitemap) only ever read publicly readable data,
// so they use this client and can be statically cached / ISR-revalidated.
//
// Do NOT use this for anything user-specific (favourites, profile, auth): use
// ./server.ts there. Row-level security still applies exactly as before — this
// is the same anon key the cookie client uses when nobody is signed in.
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
}
