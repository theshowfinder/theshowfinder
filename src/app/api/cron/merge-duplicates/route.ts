import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { mergeVenueFamilyDuplicates } from '@/lib/venueFamilyMerge'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// One listing per show: merges the same show stored under two rooms / venue records of one building
// (src/lib/venueFamilyMerge.ts). Runs after the imports. ?dry=1 reports without changing anything.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const dryRun = new URL(request.url).searchParams.get('dry') === '1'
    const result = await mergeVenueFamilyDuplicates({ dryRun })
    if (!dryRun && result.merged) {
      revalidatePath('/cities/[city]', 'page')
      revalidatePath('/venues/[slug]', 'page')
      revalidatePath('/events')
      revalidatePath('/')
      revalidatePath('/sitemap.xml')
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('merge-duplicates', handleGet)
