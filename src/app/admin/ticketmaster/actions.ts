'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { syncTicketmasterTargeted } from '@/lib/ticketmaster'

export async function targetedTicketmasterImportAction(formData: FormData) {
  await requireAdmin()
  const keyword = String(formData.get('keyword') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const from = String(formData.get('from') ?? '').trim()
  const to = String(formData.get('to') ?? '').trim()

  if (!keyword || !city || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    redirect('/admin/ticketmaster?error=Enter an artist or event, city, and a valid date range.')
  }

  try {
    const result = await syncTicketmasterTargeted({ keyword, city, from, to })
    revalidatePath('/admin/ticketmaster')
    revalidatePath('/admin/gigsberg')
    redirect(`/admin/ticketmaster?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city)}&from=${from}&to=${to}&fetched=${result.fetched}&saved=${result.inserted}&skipped=${result.skipped}&errors=${result.errors}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The targeted Ticketmaster import failed.'
    redirect(`/admin/ticketmaster?error=${encodeURIComponent(message)}`)
  }
}
