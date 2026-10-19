import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { loadHealthSnapshot } from '@/lib/healthSnapshot'
import { shouldSendAlert } from '@/lib/jobHealth'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Checks the job history, listing freshness, news sources and database load, and emails
// ALERT_EMAIL (default hello@theshowfinder.com) when something new is wrong, or when the
// same problems have been open for 3 days. Quiet when everything is fine.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const snap = await loadHealthSnapshot()
    const db = createAdminClient()
    const { data: prevRows } = await db.from('job_runs').select('summary').eq('job', 'health-check').eq('status', 'ok').order('started_at', { ascending: false }).limit(1) as unknown as { data: { summary: { issues?: string[]; emailedAt?: string | null } | null }[] | null }
    const prev = prevRows?.[0]?.summary ?? null
    const previous = prev ? { keys: prev.issues ?? [], emailedAt: prev.emailedAt ?? null } : null

    let emailedAt = previous?.emailedAt ?? null
    let emailed = false
    if (shouldSendAlert(previous, snap.issues, snap.now)) {
      const to = process.env.ALERT_EMAIL || 'hello@theshowfinder.com'
      const lines = snap.issues.map(i => `${i.severity === 'high' ? '[HIGH]' : '[check]'} ${i.message}`)
      const text = `TheShowFinder health check found ${snap.issues.length} issue(s):\n\n${lines.join('\n')}\n\nFull panel: https://www.theshowfinder.com/admin/health`
      const html = `<p>TheShowFinder health check found <b>${snap.issues.length}</b> issue(s):</p><ul>${snap.issues.map(i => `<li>${i.severity === 'high' ? '<b>HIGH</b> ' : ''}${i.message.replace(/</g, '&lt;')}</li>`).join('')}</ul><p><a href="https://www.theshowfinder.com/admin/health">Open the health panel</a></p>`
      const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject: `TheShowFinder: ${snap.issues.length} health issue${snap.issues.length === 1 ? '' : 's'}`, html, text })
      if (error) throw new Error(`alert email failed: ${JSON.stringify(error)}`)
      emailedAt = snap.now.toISOString()
      emailed = true
    }

    return NextResponse.json({ success: true, issues: snap.issues.map(i => i.key), issueCount: snap.issues.length, emailed, emailedAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[health-check] failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('health-check', handleGet)
