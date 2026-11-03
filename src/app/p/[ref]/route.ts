import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// The link in an outreach email: notes the first click, then opens the city mock-up with the business's own name in
// the first Featured slot; the package buttons carry the code to a pre-filled sign-up.
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const code = /^[a-f0-9]{6,20}$/.test(ref) ? ref : null
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
  let city: string | null = null
  if (code) {
    const { data } = await db.from('outreach_prospects').select('id, city, clicked_at').eq('ref_code', code).maybeSingle()
    if (data) {
      city = data.city
      // Mail scanners open links too; count it only for something that looks like a browser.
      const ua = request.headers.get('user-agent') ?? ''
      if (!data.clicked_at && /Mozilla/.test(ua) && !/bot|crawl|spider|preview|scan/i.test(ua)) {
        await db.from('outreach_prospects').update({ clicked_at: new Date().toISOString() }).eq('id', data.id)
      }
    }
  }
  const q = new URLSearchParams({ ...(city ? { city } : {}), ...(code ? { ref: code } : {}) })
  return NextResponse.redirect(new URL(`/advertise/mockup?${q.toString()}`, request.url), 302)
}
