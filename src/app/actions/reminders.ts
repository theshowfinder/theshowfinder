'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeEmail, isValidEmail } from '@/lib/subscribers'
import { isValidSlug } from '@/lib/savedShows'
import { reissuedEventIds } from '@/lib/onsaleReissued'
import { canRemind, MAX_REMINDER_SLUGS, MAX_REMINDERS_PER_EMAIL } from '@/lib/reminders'
import { subscribeNewsletter } from './newsletter'

export interface ReminderResult {
  error?: string
  /** Reminders set up (including ones that already existed). */
  saved?: number
  /** Shows that cannot be reminded (already on sale, cancelled, unknown). */
  skipped?: number
}

interface EventRow {
  id: string
  slug: string
  title: string
  status: string
  onsale_date: string | null
  venue: { city: string | null } | null
}

// "Email me when tickets go on sale" for one or more shows. A daily job sends
// one email per address, up to 24 hours before the on-sale time.
export async function requestOnSaleReminders(
  email: string,
  slugs: string[],
  opts?: { source?: string; alsoNewsletter?: boolean },
): Promise<ReminderResult> {
  const address = normalizeEmail(email)
  if (!isValidEmail(address)) return { error: 'Please enter a valid email address.' }

  const wanted = [...new Set((slugs ?? []).filter(isValidSlug))].slice(0, MAX_REMINDER_SLUGS)
  if (wanted.length === 0) return { error: 'Pick at least one show first.' }

  try {
    const db = createAdminClient()

    const { data, error } = await db
      .from('events')
      .select('id, slug, title, status, onsale_date, venue:venues(city)')
      .in('slug', wanted)
    if (error) throw error

    const events = (data ?? []) as unknown as EventRow[]
    const reissued = await reissuedEventIds(db, events.map(e => e.id))
    const eligible = events.filter(e => !reissued.has(e.id) && canRemind(e.onsale_date, e.status))
    const skipped = wanted.length - eligible.length
    if (eligible.length === 0) {
      return { error: 'Tickets for this show are already on sale or no on-sale date has been announced yet.', skipped }
    }

    const { count } = await db
      .from('event_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('email', address)
      .is('sent_at', null)
    if ((count ?? 0) + eligible.length > MAX_REMINDERS_PER_EMAIL) {
      return { error: 'You already have plenty of reminders set up. They will go out as each show goes on sale.' }
    }

    const { error: upsertError } = await db
      .from('event_reminders')
      .upsert(
        eligible.map(e => ({ email: address, event_id: e.id, source: opts?.source ?? null })),
        { onConflict: 'email,event_id', ignoreDuplicates: true },
      )
    if (upsertError) throw upsertError

    if (opts?.alsoNewsletter) {
      // Only when they ticked the box. Never blocks or fails the reminder.
      try {
        await subscribeNewsletter(address, eligible[0].venue?.city ?? undefined, { source: 'reminder', interest: eligible[0].title })
      } catch (err) {
        console.error('[reminders] newsletter opt-in failed', err)
      }
    }

    return { saved: eligible.length, skipped }
  } catch (err) {
    console.error('[reminders] request failed (has migration 050 been run?)', err)
    return { error: 'Something went wrong. Please try again in a moment.' }
  }
}
