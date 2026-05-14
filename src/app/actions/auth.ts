'use server'

import { createClient } from '@/lib/supabase/server'

type SignUpResult =
  | { error: string }
  | { needsConfirmation: true }
  | { ok: true }

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }
  // Session is null when Supabase requires email confirmation
  if (!data.session) return { needsConfirmation: true }
  return { ok: true }
}

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  return {}
}
