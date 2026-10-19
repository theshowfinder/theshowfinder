// An event page stays "live" for a few hours after the listed start (doors, a late
// finish, a start time the feed only gave as a date), then it is treated as passed.
export const PAST_EVENT_GRACE_HOURS = 6

export function isEventPast(startISO: string, now: Date = new Date()): boolean {
  const start = new Date(startISO).getTime()
  if (Number.isNaN(start)) return false
  return start + PAST_EVENT_GRACE_HOURS * 3_600_000 < now.getTime()
}
