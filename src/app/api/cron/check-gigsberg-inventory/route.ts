import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { checkGigsbergInventoryBatch } from '@/lib/gigsbergInventory'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const limitParam = Number(new URL(request.url).searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 400) : 150
    const result = await checkGigsbergInventoryBatch({ limit })
    revalidatePath('/gigsberg')
    revalidatePath('/')
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
