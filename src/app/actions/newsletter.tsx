'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import WelcomeEmail from '@/emails/WelcomeEmail'

export async function subscribeNewsletter(email: string): Promise<{ error?: string }> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Please enter a valid email address.' }
  }

  const db = createAdminClient()
  const { error: dbError } = await db.from('subscribers').insert({ email: trimmed })

  if (dbError) {
    if (dbError.code === '23505') {
      // Already subscribed — still try to return success, but skip the email
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
