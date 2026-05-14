import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Get the service_role key from Supabase Dashboard → Settings → API.'
    )
  }

  // No Database generic here — admin client bypasses RLS and is server-only.
  // Typed reads go through the browser/server clients (src/lib/supabase/client.ts).
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
