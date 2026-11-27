// Extra outreach mailboxes (26 Nov 2026): more cold email without risking theshowfinder.com or the main Resend account.
// Each mailbox sits on its own domain (e.g. chris@showfinderpartners.co.uk), sends plain personal emails over SMTP,
// and warms up slowly: a new mailbox starts at a handful a day and climbs over four weeks. Configured in Vercel as
// OUTREACH_MAILBOXES, a JSON list, e.g.
//   [{"user":"chris@showfinderpartners.co.uk","pass":"<app password>","host":"smtp.zoho.eu","start":"2026-12-01"}]
// Optional per mailbox: "from" (display, default "Chris at TheShowFinder <user>"), "replyTo", "port" (465),
// "max" (daily ceiling once warm, default 40). Nothing is sent from a mailbox before its start date.

export interface Mailbox { user: string; pass: string; host: string; port: number; from: string; replyTo: string; start: string; max: number }

export const MAILBOX_CHANNEL_PREFIX = 'mbx:'
export const mailboxChannel = (m: Pick<Mailbox, 'user'>) => `${MAILBOX_CHANNEL_PREFIX}${m.user.toLowerCase()}`

export function parseMailboxes(raw: string | undefined): Mailbox[] {
  if (!raw?.trim()) return []
  let list: unknown
  try { list = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(list)) return []
  const out: Mailbox[] = []
  for (const x of list as Array<Record<string, unknown>>) {
    const user = typeof x?.user === 'string' ? x.user.trim() : ''
    const pass = typeof x?.pass === 'string' ? x.pass : ''
    const host = typeof x?.host === 'string' ? x.host.trim() : ''
    const start = typeof x?.start === 'string' && !Number.isNaN(Date.parse(x.start)) ? x.start : ''
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user) || !pass || !host || !start) continue
    if (out.some(m => m.user.toLowerCase() === user.toLowerCase())) continue
    out.push({
      user, pass, host, start,
      port: typeof x.port === 'number' ? x.port : 465,
      from: typeof x.from === 'string' && x.from.trim() ? x.from.trim() : `Chris at TheShowFinder <${user}>`,
      replyTo: typeof x.replyTo === 'string' && x.replyTo.trim() ? x.replyTo.trim() : user,
      max: typeof x.max === 'number' && x.max > 0 ? Math.min(x.max, 60) : 40,
    })
  }
  return out
}

/**
 * Warm-up: emails a mailbox may send today, by days since its start date. Week 1: 5 a day, week 2: 10,
 * week 3: 20, week 4: 30, then its ceiling (default 40). Before the start date: 0.
 */
export function warmupLimit(m: Pick<Mailbox, 'start' | 'max'>, now = new Date()): number {
  const days = Math.floor((now.getTime() - Date.parse(m.start)) / 86_400_000)
  if (days < 0) return 0
  const step = days < 7 ? 5 : days < 14 ? 10 : days < 21 ? 20 : days < 28 ? 30 : m.max
  return Math.min(step, m.max)
}

export const outreachMailboxes = () => parseMailboxes(process.env.OUTREACH_MAILBOXES)

/** Why OUTREACH_MAILBOXES gives no usable mailbox, in plain words and without ever showing a password. */
export function mailboxSettingProblems(raw: string | undefined): string[] {
  if (!raw?.trim()) return ['OUTREACH_MAILBOXES is empty or missing in this deployment (add it for Production, then redeploy)']
  if (/[\u201c\u201d\u2018\u2019]/.test(raw)) return ['it contains curly quotes (\u201c \u201d): retype them as straight quotes (")']
  let list: unknown
  // Only the character position is reported: the parser's own message can quote part of the text, passwords included.
  try { list = JSON.parse(raw) } catch (e) { const at = (e instanceof Error ? e.message : '').match(/position (\d+)/)?.[1]; return [`it isn't valid JSON${at ? ` (the problem is around character ${at} of ${raw.length})` : ''}: check every quote, comma and bracket`] }
  if (!Array.isArray(list)) return ['it must start with [ and end with ]']
  const out: string[] = []
  list.forEach((x: Record<string, unknown>, i) => {
    const n = `mailbox ${i + 1}${typeof x?.user === 'string' ? ` (${x.user})` : ''}`
    if (typeof x?.user !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.user.trim())) out.push(`${n}: "user" must be the full email address`)
    if (typeof x?.pass !== 'string' || !x.pass) out.push(`${n}: "pass" is missing`)
    else if (/\s/.test(x.pass)) out.push(`${n}: "pass" has spaces in it (paste the app password without spaces)`)
    if (typeof x?.host !== 'string' || !x.host.trim()) out.push(`${n}: "host" is missing (smtppro.zoho.com)`)
    if (typeof x?.start !== 'string' || Number.isNaN(Date.parse(x.start))) out.push(`${n}: "start" must be a date like 2026-12-04`)
  })
  return out
}
