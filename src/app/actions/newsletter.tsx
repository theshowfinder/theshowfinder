'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { normalizeEmail, isValidEmail } from '@/lib/subscribers'
import WelcomeEmail from '@/emails/WelcomeEmail'

export async function subscribeNewsletter(email: string, city?: string): Promise<{ error?: string }> {
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
      //   clear, explicit re-opt-in — clear unsubscribed_at so they start
      //   receiving mail again. Nothing here re-sends the welcome email on
      //   a resubscribe; it's covered by Resend's own welcome-email send
      //   below, which runs for every call that reaches this point.
      if (cityTag) {
        await db.from('subscribers').update({ city: cityTag }).eq('email', trimmed).is('city', null)
      }
      await db.from('subscribers').update({ unsubscribed_at: null }).eq('email', trimmed).not('unsubscribed_at', 'is', null)
      return {}
    }
    console.error('[newsletter] insert failed:', dbError.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  // Await the send — fire-and-forget breaks in Vercel serverless because the
  // function freezes the moment it returns, killing any non-awaited promise.
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
    } else {
      console.log('[newsletter] welcome email sent — id:', data?.id, '— to:', trimmed)
    }
  } catch (err) {
    console.error('[newsletter] resend threw exception:', err)
  }

  return {}
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
