// "Follow an artist or venue": browser-side list of what this visitor follows,
// plus the logic that turns newly added shows into one email per follower.
// Pure module (no '@/' imports) so it runs under `node --test`.

export type FollowKind = 'artist' | 'venue'

export const FOLLOW_STORAGE_KEY = 'tsf_follow_v1'
export const FOLLOW_EMAIL_KEY = 'tsf_follow_email'
export const MAX_FOLLOWED = 100
export const MAX_FOLLOWS_PER_EMAIL = 50
export const MAX_SHOWS_PER_FOLLOW = 5
export const MAX_SHOWS_PER_EMAIL = 12
// Only shows added in this window are ever considered, so a long gap between
// runs can never turn into a flood of old announcements.
export const LOOKBACK_DAYS = 7

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,159}$/

export function isFollowKind(value: unknown): value is FollowKind {
  return value === 'artist' || value === 'venue'
}

export function followKey(kind: FollowKind, slug: string): string {
  return `${kind}:${slug}`
}

function isValidKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const i = value.indexOf(':')
  if (i < 0) return false
  return isFollowKind(value.slice(0, i)) && SLUG_RE.test(value.slice(i + 1))
}

// Never throws: anything unreadable is treated as "following nothing".
export function parseFollowed(raw: string | null | undefined): string[] {
  if (!raw) return []
  let data: unknown
  try { data = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of data) {
    if (isValidKey(item) && !seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
    if (out.length >= MAX_FOLLOWED) break
  }
  return out
}

export function serializeFollowed(keys: string[]): string {
  return JSON.stringify(keys.filter(isValidKey).slice(0, MAX_FOLLOWED))
}

// Adds to the front (newest first) or removes if already followed.
export function toggleFollowed(keys: string[], key: string): string[] {
  if (!isValidKey(key)) return keys
  if (keys.includes(key)) return keys.filter(k => k !== key)
  return [key, ...keys].slice(0, MAX_FOLLOWED)
}

// ── Daily alert matching ──────────────────────────────────────────────────

export interface FollowRow {
  id: string
  email: string
  kind: FollowKind
  targetId: string
  targetName: string
  targetSlug: string
  /** Only shows added after this are announced (last_notified_at). */
  floorISO: string
}

export interface NewShow {
  id: string
  slug: string
  title: string
  startISO: string
  createdISO: string
  venueId: string | null
  venueName: string | null
  city: string | null
  artistIds: string[]
}

export interface FollowAlertItem {
  followId: string
  kind: FollowKind
  name: string
  slug: string
  shows: NewShow[]
  /** Matching shows left out by the per-follow cap. */
  more: number
}

export interface FollowAlertBatch {
  email: string
  items: FollowAlertItem[]
  totalShows: number
}

function matches(f: FollowRow, s: NewShow): boolean {
  return f.kind === 'artist' ? s.artistIds.includes(f.targetId) : s.venueId === f.targetId
}

// One batch per address that has at least one new show to hear about. A show
// that matches several of someone's follows (an artist and the venue they play)
// is listed once, under the artist. Only shows added after the follow's floor
// and no later than runISO count.
export function buildFollowAlerts(follows: FollowRow[], shows: NewShow[], runISO: string): FollowAlertBatch[] {
  const runT = new Date(runISO).getTime()
  const byEmail = new Map<string, FollowRow[]>()
  for (const f of follows) {
    const key = f.email.trim().toLowerCase()
    const list = byEmail.get(key)
    if (list) list.push(f)
    else byEmail.set(key, [f])
  }

  const batches: FollowAlertBatch[] = []
  for (const [email, rows] of byEmail) {
    // artists first so a show is credited to the artist, not just the venue
    const ordered = [...rows].sort((a, b) => (a.kind === b.kind ? a.targetName.localeCompare(b.targetName) : a.kind === 'artist' ? -1 : 1))
    const used = new Set<string>()
    const items: FollowAlertItem[] = []
    let total = 0

    for (const f of ordered) {
      const floor = new Date(f.floorISO).getTime()
      const mine = shows
        .filter(s => !used.has(s.id) && matches(f, s))
        .filter(s => {
          const t = new Date(s.createdISO).getTime()
          return t > floor && t <= runT
        })
        .sort((a, b) => a.startISO.localeCompare(b.startISO))
      if (mine.length === 0) continue

      const room = Math.max(0, MAX_SHOWS_PER_EMAIL - total)
      const take = mine.slice(0, Math.min(MAX_SHOWS_PER_FOLLOW, room))
      for (const s of mine) used.add(s.id) // even left-out shows are not repeated under another follow
      if (take.length === 0) continue
      items.push({ followId: f.id, kind: f.kind, name: f.targetName, slug: f.targetSlug, shows: take, more: mine.length - take.length })
      total += take.length
    }

    if (items.length > 0) batches.push({ email, items, totalShows: total })
  }
  return batches
}
