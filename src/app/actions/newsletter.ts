'use server'

import { createAdminClient } from '@/lib/supabase/admin'

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

  return {}
}
