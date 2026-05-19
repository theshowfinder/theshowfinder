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
  const { error } = await db.from('subscribers').insert({ email: trimmed })

  if (error) {
    if (error.code === '23505') return {}  // already subscribed — treat as success
    console.error('[newsletter] insert failed:', error.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  // Send welcome email (non-blocking — don't fail signup if email errors)
  resend.emails.send({
    from: FROM_EMAIL,
    to: trimmed,
    subject: 'Welcome to TheShowFinder 🎟️',
    react: <WelcomeEmail email={trimmed} />,
  }).catch(err => {
    console.error('[newsletter] welcome email failed:', err)
  })

  return {}
}
