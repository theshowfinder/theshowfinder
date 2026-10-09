'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { syncTicketmasterCityWindow, syncTicketmasterTargeted } from '@/lib/ticketmaster'

export async function targetedTicketmasterImportAction(formData: FormData) {
  await requireAdmin()
  const keyword = String(formData.get('keyword') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const from = String(formData.get('from') ?? '').trim()
  const to = String(formData.get('to') ?? '').trim()

  if (!keyword || !city || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    redirect('/admin/ticketmaster?error=Enter an artist or event, city, and a valid date range.')
  }

  let result
  try {
    result = await syncTicketmasterTargeted({ keyword, city, from, to })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The targeted Ticketmaster import failed.'
    redirect(`/admin/ticketmaster?error=${encodeURIComponent(message)}`)
  }
  revalidatePath('/admin/ticketmaster')
  revalidatePath('/admin/gigsberg')
  redirect(`/admin/ticketmaster?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city)}&from=${from}&to=${to}&fetched=${result.fetched}&saved=${result.inserted}&skipped=${result.skipped}&errors=${result.errors}`)
}

export async function manualTicketmasterCitySyncAction(formData: FormData) {
  await requireAdmin()
  const city = String(formData.get('city') ?? '').trim()
  const from = String(formData.get('city_from') ?? '').trim()
  const to = String(formData.get('city_to') ?? '').trim()
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T23:59:59Z`).getTime()
  const maxWindow = 92 * 24 * 60 * 60 * 1000

  if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > maxWindow) {
    redirect('/admin/ticketmaster?error=Choose a city and a valid date window of no more than 92 days.')
  }

  let result
  try {
    result = await syncTicketmasterCityWindow({ city, from, to })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The manual Ticketmaster city sync failed.'
    redirect(`/admin/ticketmaster?error=${encodeURIComponent(message)}`)
  }
  revalidatePath('/admin/ticketmaster')
  revalidatePath('/admin/gigsberg')
  redirect(`/admin/ticketmaster?city=${encodeURIComponent(city)}&cityFrom=${from}&cityTo=${to}&cityFetched=${result.fetched}&citySaved=${result.inserted}&citySkipped=${result.skipped}&cityErrors=${result.errors}`)
}
