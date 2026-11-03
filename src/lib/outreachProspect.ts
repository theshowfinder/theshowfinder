// Server-side lookup of an outreach business by its link code, for the mock-up and sign-up pages.
import { createAdminClient } from '@/lib/supabase/admin'

export type OutreachRefProspect = { id: string; business_name: string; category: string; city: string; email: string; contact_name: string | null; status: string }

export async function prospectByRef(ref: string | undefined | null): Promise<OutreachRefProspect | null> {
  if (!ref || !/^[a-f0-9]{6,20}$/.test(ref)) return null
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from('outreach_prospects').select('id, business_name, category, city, email, contact_name, status').eq('ref_code', ref).maybeSingle()
  return data && data.status !== 'unsubscribed' ? data as OutreachRefProspect : null
}
