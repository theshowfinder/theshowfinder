import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { dueWindow, groupRemindersByEmail, type DueReminder } from '@/lib/reminders'
import { buildReminderEmail } from '@/lib/reminderEmail'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_EMAILS_PER_RUN = 200

interface DueRow {
  id: string
  email: string
  events: {
    slug: string
    title: string
    onsale_date: string
    status: string
    venue: { name: string | null; city: string | null } | null
  }
}

// Daily: email everyone who asked to be reminded about a show going on sale in
// the next 24 hours (one email per address), then mark those reminders sent.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fromISO, toISO } = dueWindow(new Date())
  const db = createAdminClient()
  const { data, error } = await db
    .from('event_reminders')
    .select('id, email, events!inner(slug, title, onsale_date, status, venue:venues(name, city))')
    .is('sent_at', null)
    .gte('events.onsale_date', fromISO)
    .lt('events.onsale_date', toISO)
    .in('events.status', ['upcoming', 'on_sale'])
    .limit(2000)

  if (error) {
    console.error('[event-reminders] query failed (has migration 050 been run?)', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows: DueReminder[] = ((data ?? []) as unknown as DueRow[]).map(r => ({
    id: r.id,
    email: r.email,
    title: r.events.title,
    slug: r.events.slug,
    onsaleISO: r.events.onsale_date,
    venueName: r.events.venue?.name ?? null,
    city: r.events.venue?.city ?? null,
  }))

  const batches = groupRemindersByEmail(rows).slice(0, MAX_EMAILS_PER_RUN)
  let sent = 0
  let failed = 0
  for (const batch of batches) {
    const mail = buildReminderEmail(batch.items)
    try {
      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: batch.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      })
      if (sendError) throw new Error(JSON.stringify(sendError))
      const { error: markError } = await db
        .from('event_reminders')
        .update({ sent_at: new Date().toISOString() })
        .in('id', batch.reminderIds)
      if (markError) console.error('[event-reminders] could not mark sent', markError.message)
      sent++
    } catch (err) {
      failed++
      console.error('[event-reminders] send failed', err)
    }
  }

  return NextResponse.json({ due: rows.length, emails: batches.length, sent, failed })
}
