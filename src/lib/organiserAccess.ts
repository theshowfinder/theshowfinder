// Organiser dashboard links: no passwords. An organiser types their email at /organiser and gets a signed link
// (/organiser?o=<organiser id>&e=<expiry>&k=<signature>), good for 30 days. The signature is an HMAC of the id and
// expiry with ORGANISER_LINK_SECRET (falls back to CRON_SECRET), so links can't be made up or extended.
// Pure module (node:crypto only) so it runs under node --test.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const LINK_DAYS = 30

function sign(organiserId: string, exp: number, secret: string): string {
  return createHmac('sha256', secret).update(`organiser:${organiserId}:${exp}`).digest('base64url').slice(0, 32)
}

export function organiserLinkParams(organiserId: string, secret: string, now: number = Date.now()): { o: string; e: string; k: string } {
  const exp = Math.floor(now / 1000) + LINK_DAYS * 86400
  return { o: organiserId, e: String(exp), k: sign(organiserId, exp, secret) }
}

/** The organiser id when the link is genuine and not expired, else null. */
export function verifyOrganiserLink(p: { o?: string | null; e?: string | null; k?: string | null }, secret: string, now: number = Date.now()): string | null {
  const o = String(p.o ?? ''), e = Number(p.e), k = String(p.k ?? '')
  if (!secret || !/^[0-9a-f-]{36}$/i.test(o) || !Number.isInteger(e) || k.length !== 32) return null
  if (e * 1000 < now) return null
  const want = Buffer.from(sign(o, e, secret)), got = Buffer.from(k)
  return want.length === got.length && timingSafeEqual(want, got) ? o : null
}

export function organiserQuery(p: { o: string; e: string; k: string }): string {
  return `o=${encodeURIComponent(p.o)}&e=${encodeURIComponent(p.e)}&k=${encodeURIComponent(p.k)}`
}
