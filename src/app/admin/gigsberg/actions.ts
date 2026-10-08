'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { syncGigsbergCatalogue } from '@/lib/gigsbergCatalogue'

export async function runGigsbergCatalogueSyncAction() {
  await requireAdmin()

  try {
    const result = await syncGigsbergCatalogue()
    revalidatePath('/admin/gigsberg')
    redirect(`/admin/gigsberg?synced=${result.fetched}&updated=${result.updated}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The catalogue import failed.'
    redirect(`/admin/gigsberg?syncError=${encodeURIComponent(message)}`)
  }
}
