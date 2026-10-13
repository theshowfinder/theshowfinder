// "Remind me when tickets go on sale": which events qualify, which reminders
// are due, and how they are grouped into one email per address.
// Pure module (no '@/' imports) so it runs under `node --test`.

export const MAX_REMINDER_SLUGS = 20
export const MAX_REMINDERS_PER_EMAIL = 50
const DAY_MS = 24 * 3600_000

// A reminder only makes sense for a show that has not gone on sale yet and is
// not cancelled or postponed.
export function canRemind(onsaleISO: string | null | undefined, status: string | null | undefined, now: Date = new Date()): boolean {
  if (!onsaleISO) return false
  const t = new Date(onsaleISO).getTime()
  if (Number.isNaN(t) || t <= now.getTime()) return false
  return status === 'upcoming' || status === 'on_sale'
}

// The daily job sends everything going on sale in the next 24 hours. Each
// instant falls in exactly one daily window, so a reminder is never missed or
// sent twice.
export function dueWindow(now: Date): { fromISO: string; toISO: string } {
  return { fromISO: now.toISOString(), toISO: new Date(now.getTime() + DAY_MS).toISOString() }
}

export interface DueReminder {
  id: string
  email: string
  title: string
  slug: string
  onsaleISO: string
  venueName: string | null
  city: string | null
}

export interface ReminderBatch {
  email: string
  reminderIds: string[]
  items: DueReminder[]
}

// One email per address, soonest on-sale first.
export function groupRemindersByEmail(rows: DueReminder[]): ReminderBatch[] {
  const byEmail = new Map<string, DueReminder[]>()
  for (const r of rows) {
    const key = r.email.trim().toLowerCase()
    const list = byEmail.get(key)
    if (list) list.push(r)
    else byEmail.set(key, [r])
  }
  return [...byEmail.entries()].map(([email, items]) => {
    const sorted = [...items].sort((a, b) => a.onsaleISO.localeCompare(b.onsaleISO))
    return { email, reminderIds: sorted.map(i => i.id), items: sorted }
  })
}
