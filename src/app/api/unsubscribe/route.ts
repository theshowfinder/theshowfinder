import { NextResponse } from 'next/server'
import { unsubscribeNewsletter } from '@/app/actions/newsletter'

export const dynamic = 'force-dynamic'

// One-click unsubscribe (RFC 8058): Gmail / Yahoo / Outlook POST here when someone presses their own
// "Unsubscribe" button on a newsletter (List-Unsubscribe header, src/lib/resend.ts). It must act at once,
// with no page to confirm. A GET (someone opening the address) is sent to the normal confirm page.
export async function POST(request: Request) {
  const email = new URL(request.url).searchParams.get('email') ?? ''
  const result = await unsubscribeNewsletter(email)
  return NextResponse.json({ ok: !result.error }, { status: result.error ? 400 : 200 })
}

export function GET(request: Request) {
  const email = new URL(request.url).searchParams.get('email') ?? ''
  return NextResponse.redirect(new URL(`/unsubscribe?email=${encodeURIComponent(email)}`, request.url))
}
