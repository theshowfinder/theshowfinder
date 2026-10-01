'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { normalizeEmail, isValidEmail } from '@/lib/subscribers'
import WelcomeEmail from '@/emails/WelcomeEmail'

export interface SubscribeResult {
  error?: string
  // Fulfils Phase 5A requirement 1's "clear success and error messages":
  // the three outcomes below are reached by distinct code paths and were
  // previously indistinguishable to the caller — subscribeNewsletter
  // always returned `{}` on any non-error outcome, so the UI showed the
  // same "check your inbox" message whether or not an email actually
  // went out. That's what let a real delivery failure go completely
  // unnoticed: the signup "worked" (the DB write succeeded) every time,
  // so nothing ever surfaced the difference.
  //
  // true when this address was already an active subscriber — no email
  // sent (it would just be a duplicate of the one they already got).
  alreadySubscribed?: boolean
  // true when this was a genuine re-opt-in (they'd previously
  // unsubscribed) — a welcome-back email was attempted.
  resubscribed?: boolean
  // Only meaningful for a first-time signup or a resubscribe (i.e. when
  // an email was actually attempted): whether Resend confirmed the send.
  // false here — rather than a thrown exception or a generic error —
  // is deliberate: a failed welcome-email send must never fail the
  // signup itself (they're still correctly on the list either way), it
  // only means the UI shouldn't promise an inbox email that didn't go
  // out. See the sendWelcomeEmail() comment below for how a false here
  // gets diagnosed server-side.
  emailDelivered?: boolean
}

// Extracted so both the first-time-signup and genuine-resubscribe paths
// below share one implementation. Never throws — a Resend failure (bad/
// missing API key, unverified domain, network error, suspended account)
// is caught and logged, not propagated, because losing the welcome email
// must never undo a signup that already succeeded in the database.
//
// The only place a failure here was ever visible before this commit was
// Vercel's server function logs — there was no way to tell from the site
// itself, the database, or Resend's own dashboard entries (since Resend
// never received the request at all if, say, the API key was missing).
// That's still true for the *cause* of a failure (Chris still needs
// Vercel's logs to see *why* sendWelcomeEmail returned false — search
// for "[resend] RESEND_API_KEY is not set" or "[newsletter] resend"),
// but callers can now at least tell *whether* it happened.
async function sendWelcomeEmail(trimmed: string): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    console.log('[newsletter] RESEND_API_KEY present:', !!apiKey, '— from:', FROM_EMAIL)

    const { data, error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: trimmed,
      subject: 'Welcome to TheShowFinder 🎟️',
      react: <WelcomeEmail email={trimmed} />,
      text: [
        'Welcome to TheShowFinder!',
        '',
        "You're on the list! You'll now receive alerts when tickets go on sale for",
        'concerts, theatre, comedy, sports, and family shows across the UK.',
        '',
        'WHAT YOU\'LL GET',
        '- On-sale alerts — know the moment tickets are released',
        '- Weekly digests — the best upcoming shows near you',
        '- Venue & artist picks — curated events across 36 UK cities',
        '',
        'Browse events: https://www.theshowfinder.com',
        '',
        '---',
        `You received this because you signed up at theshowfinder.com with ${trimmed}.`,
        `Unsubscribe: https://www.theshowfinder.com/unsubscribe?email=${encodeURIComponent(trimmed)}`,
        '© 2026 TheShowFinder',
      ].join('\n'),
    })

    if (emailError) {
      console.error('[newsletter] resend returned error:', JSON.stringify(emailError))
      return false
    }
    console.log('[newsletter] welcome email sent — id:', data?.id, '— to:', trimmed)
    return true
  } catch (err) {
    console.error('[newsletter] resend threw exception:', err)
    return false
  }
}

export async function subscribeNewsletter(email: string, city?: string): Promise<SubscribeResult> {
  const trimmed = normalizeEmail(email)
  if (!isValidEmail(trimmed)) {
    return { error: 'Please enter a valid email address.' }
  }
  const cityTag = city?.trim() || null

  const db = createAdminClient()
  const { error: dbError } = await db.from('subscribers').insert({ email: trimmed, city: cityTag })

  if (dbError) {
    if (dbError.code === '23505') {
      // Already on the list. Two things can still need doing here:
      // - If they signed up with a city (e.g. from a city page) and don't
      //   have one tagged yet, tag it now — but never overwrite a city
      //   someone already has on file.
      // - If they'd previously unsubscribed, signing up again here is a
      //   clear, explicit re-opt-in: clear unsubscribed_at so they start
      //   receiving mail again, and send a welcome-back email so they
      //   know it worked. `.select('email')` on the update tells us
      //   whether a row actually matched (i.e. whether they really were
      //   unsubscribed) — that's how a genuine resubscribe is told apart
      //   from an already-active subscriber submitting the form again.
      if (cityTag) {
        await db.from('subscribers').update({ city: cityTag }).eq('email', trimmed).is('city', null)
      }
      const { data: resubscribedRows } = await db
        .from('subscribers')
        .update({ unsubscribed_at: null })
        .eq('email', trimmed)
        .not('unsubscribed_at', 'is', null)
        .select('email')

      if (resubscribedRows && resubscribedRows.length > 0) {
        const emailDelivered = await sendWelcomeEmail(trimmed)
        return { resubscribed: true, emailDelivered }
      }

      // A genuinely already-active subscriber resubmitted the form — no
      // email sent (it would just duplicate the one they already got),
      // and the UI should say so rather than re-promising an inbox email.
      return { alreadySubscribed: true }
    }
    console.error('[newsletter] insert failed:', dbError.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  const emailDelivered = await sendWelcomeEmail(trimmed)
  return { emailDelivered }
}

// ── Unsubscribe (Phase 5A) ────────────────────────────────────────────────
//
// Reached from the /unsubscribe page, whose link is the one every welcome
// email already sends (see above) — that link previously 404'd, since no
// page or action existed for it. Always returns a generic success result
// regardless of whether the email was actually found on the list, so this
// can never be used to probe which addresses are subscribed (the same
// reasoning the signup path above already applies to its duplicate case).
export async function unsubscribeNewsletter(email: string): Promise<{ error?: string }> {
  const trimmed = normalizeEmail(email)
  if (!isValidEmail(trimmed)) {
    return { error: 'Please enter a valid email address.' }
  }

  const db = createAdminClient()
  const { error: dbError } = await db
    .from('subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', trimmed)
    .is('unsubscribed_at', null)

  if (dbError) {
    console.error('[newsletter] unsubscribe failed:', dbError.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  return {}
}
