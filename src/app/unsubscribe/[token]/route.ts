import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Outreach opt-out. The link in the email (GET) shows a one-button page, because mail scanners open links on their
// own and must not unsubscribe anyone; pressing the button, or the mail app's own one-click unsubscribe (RFC 8058
// POST), marks the business "do not contact" and the sender never emails it again.
async function unsubscribe(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{32}$/.test(token)) return false
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = new Date().toISOString()
  const { data } = await db.from('outreach_prospects').update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).eq('unsubscribe_token', token).select('id')
  return !!data?.length
}

const shell = (body: string) => new NextResponse(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe | TheShowFinder</title></head>` +
  `<body style="font-family:Arial,Helvetica,sans-serif;background:#F5F5F0;color:#1A1A2E;margin:0;padding:48px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">` +
  `<p style="font-weight:800;font-size:20px;margin:0 0 12px">TheShow<span style="color:#E8003D">Finder</span></p>${body}</div></body></html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } },
)

const page = (ok: boolean) => shell(ok
  ? '<p>You have been unsubscribed. We will not email you again.</p>'
  : '<p>This link is not valid any more. If you would still like us to stop emailing you, reply to our email with "unsubscribe".</p>')

export async function GET() {
  return shell('<p>Stop receiving emails from TheShowFinder about featuring your business?</p>' +
    '<form method="post"><input type="hidden" name="confirm" value="1"><button type="submit" style="background:#E8003D;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:bold;font-size:15px;cursor:pointer">Unsubscribe</button></form>')
}
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ok = await unsubscribe((await params).token)
  const body = await req.text().catch(() => '')
  if (/List-Unsubscribe=One-Click/i.test(body)) return new NextResponse(null, { status: 204 })
  return page(ok)
}
