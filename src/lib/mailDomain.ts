// Does an email address's domain accept mail at all? (26 Nov 2026: hard bounces paused outreach three times in a
// day; several were domains with no mail server.) Checks the domain's MX records, falling back to an A record as
// mail servers do. A DNS error other than "no such record" counts as OK, so a slow DNS server never blocks a send.
import { resolveMx, resolve4 } from 'dns/promises'

const cache = new Map<string, boolean>()

export async function domainTakesMail(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.trim().toLowerCase()
  if (!domain) return false
  const hit = cache.get(domain)
  if (hit !== undefined) return hit
  const missing = (e: unknown) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes((e as { code?: string })?.code ?? '')
  let ok = true
  try {
    const mx = await resolveMx(domain)
    ok = mx.some(r => r.exchange && r.exchange !== '.')
  } catch (e) {
    if (missing(e)) {
      try { ok = (await resolve4(domain)).length > 0 } catch (e2) { ok = !missing(e2) }
    }
  }
  cache.set(domain, ok)
  return ok
}

/**
 * Checks the mailbox itself with MillionVerifier (26 Nov 2026), when MILLIONVERIFIER_API_KEY is in Vercel: most of our
 * hard bounces are "info@" addresses on real domains where that mailbox no longer exists, which an MX check cannot
 * see. 'invalid' and 'disposable' are not sent to; 'ok', 'catch_all' and 'unknown' are. Without a key, or if the
 * service fails, falls back to the domain check alone so sending never stops.
 */
export async function addressLooksDeliverable(email: string): Promise<{ ok: boolean; reason?: string }> {
  if (!(await domainTakesMail(email))) return { ok: false, reason: 'No mail server for this domain' }
  const key = process.env.MILLIONVERIFIER_API_KEY
  if (!key) return { ok: true }
  try {
    const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&timeout=10`
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return { ok: true }
    const j = await r.json() as { result?: string }
    if (j.result === 'invalid' || j.result === 'disposable') return { ok: false, reason: `Mailbox check: ${j.result}` }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}
