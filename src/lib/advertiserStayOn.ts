// "Stay on" links for local advertisers (no card to join, Chris 26 Nov 2026): a business joins free for a month
// with no card. Near the end of it they get their results and a personal link (/advertise/stay?a=<application id>&k=<sig>)
// that opens Stripe checkout for the monthly price (Featured £9.95 / Standard £4.95), cancel any time.
// The signature is an HMAC of the application id with ADVERTISER_LINK_SECRET (falls back to CRON_SECRET), so links can't
// be made up. Pure module (node:crypto only) so it runs under node --test.
import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (applicationId: string, secret: string) =>
  createHmac('sha256', secret).update(`stay-on:${applicationId}`).digest('base64url').slice(0, 32)

export function stayOnPath(applicationId: string, secret: string): string {
  return `/advertise/stay?a=${encodeURIComponent(applicationId)}&k=${sign(applicationId, secret)}`
}

/** The application id when the link is genuine, else null. */
export function verifyStayOn(p: { a?: string | null; k?: string | null }, secret: string): string | null {
  const a = String(p.a ?? ''), k = String(p.k ?? '')
  if (!secret || !/^[0-9a-f-]{36}$/i.test(a) || k.length !== 32) return null
  const want = Buffer.from(sign(a, secret)), got = Buffer.from(k)
  return want.length === got.length && timingSafeEqual(want, got) ? a : null
}

export const stayOnSecret = () => process.env.ADVERTISER_LINK_SECRET || process.env.CRON_SECRET || ''
