'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { normalizeEmail, isValidEmail } from '@/lib/subscribers'
import { isValidSlug } from '@/lib/savedShows'
import { isFollowKind, MAX_FOLLOWS_PER_EMAIL, type FollowKind } from '@/lib/follows'
import { buildFollowConfirmEmail } from '@/lib/followEmail'
import { buildUnsubscribeLink } from '@/lib/newsletterContent'
import { subscribeNewsletter } from './newsletter'

export interface FollowResult {
  error?: string
  /** Display name of what was followed. */
  name?: string
}

async function lookupTarget(kind: FollowKind, slug: string) {
  const db = createAdminClient()
  if (kind === 'artist') {
    const { data } = await db.from('artists').select('id, name, slug').eq('slug', slug).maybeSingle()
    return data ? { id: data.id as string, name: data.name as string, slug: data.slug as string, city: null as string | null } : null
  }
  const { data } = await db.from('venues').select('id, name, slug, city').eq('slug', slug).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string, slug: data.slug as string, city: (data.city as string | null) ?? null } : null
}

// "Email me when new shows are added" for one artist or venue. The first follow
// for an address also sends a short confirmation with a stop link; after that a
// daily job emails new shows (see /api/cron/follow-alerts).
export async function followTarget(
  email: string,
  kind: string,
  slug: string,
  opts?: { source?: string; alsoNewsletter?: boolean },
): Promise<FollowResult> {
  const address = normalizeEmail(email)
  if (!isValidEmail(address)) return { error: 'Please enter a valid email address.' }
  if (!isFollowKind(kind) || !isValidSlug(slug)) return { error: 'We could not find that page to follow.' }

  try {
    const db = createAdminClient()
    const target = await lookupTarget(kind, slug)
    if (!target) return { error: 'We could not find that page to follow.' }

    const { data: mine, error: listError } = await db
      .from('follows')
      .select('id, kind, target_id, unsubscribed_at')
      .eq('email', address)
    if (listError) throw listError

    const active = (mine ?? []).filter(r => !r.unsubscribed_at)
    const existing = (mine ?? []).find(r => r.kind === kind && r.target_id === target.id)

    if (existing && !existing.unsubscribed_at) {
      return { name: target.name } // already following
    }
    if (active.length >= MAX_FOLLOWS_PER_EMAIL) {
      return { error: 'You are following a lot already. Stop some emails first, or contact us.' }
    }

    const now = new Date().toISOString()
    if (existing) {
      // Re-following after a stop: a fresh start, so no backlog of old shows.
      const { error } = await db.from('follows').update({ unsubscribed_at: null, last_notified_at: now, source: opts?.source ?? null }).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await db.from('follows').insert({
        email: address, kind, target_id: target.id, source: opts?.source ?? null, last_notified_at: now,
      })
      if (error) throw error
    }

    // Confirmation only for someone's first active follow. Never blocks the follow.
    if (active.length === 0) {
      try {
        const mail = buildFollowConfirmEmail(target.name, kind, target.slug, buildUnsubscribeLink(address))
        await resend.emails.send({ from: FROM_EMAIL, to: address, subject: mail.subject, html: mail.html, text: mail.text })
      } catch (err) {
        console.error('[follow] confirmation email failed', err)
      }
    }

    if (opts?.alsoNewsletter) {
      try {
        await subscribeNewsletter(address, target.city ?? undefined, { source: 'follow', interest: target.name })
      } catch (err) {
        console.error('[follow] newsletter opt-in failed', err)
      }
    }

    return { name: target.name }
  } catch (err) {
    console.error('[follow] failed (has migration 051 been run?)', err)
    return { error: 'Something went wrong. Please try again in a moment.' }
  }
}

// Stops emails for one artist or venue. Always reports success for an address
// that was not following, so it cannot be used to probe who follows what.
export async function unfollowTarget(email: string, kind: string, slug: string): Promise<{ error?: string }> {
  const address = normalizeEmail(email)
  if (!isValidEmail(address) || !isFollowKind(kind) || !isValidSlug(slug)) return { error: 'Something went wrong.' }
  try {
    const target = await lookupTarget(kind, slug)
    if (!target) return {}
    const db = createAdminClient()
    const { error } = await db
      .from('follows')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('email', address).eq('kind', kind).eq('target_id', target.id).is('unsubscribed_at', null)
    if (error) throw error
    return {}
  } catch (err) {
    console.error('[follow] unfollow failed', err)
    return { error: 'Something went wrong. Please try again.' }
  }
}
