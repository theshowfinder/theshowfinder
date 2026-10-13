'use client'

import { toggleSaved } from '@/lib/savedShows'
import ReminderForm from './ReminderForm'
import { useSavedSlugs, writeSaved } from './savedStore'

// Event-page wrapper: after a reminder is set up, the show is also saved to
// the visitor's list so it is waiting on /saved when they come back.
export default function EventReminder({ slug, heading, blurb }: { slug: string; heading: string; blurb: string }) {
  const saved = useSavedSlugs()
  return (
    <ReminderForm
      slugs={[slug]}
      source="event"
      heading={heading}
      blurb={blurb}
      onDone={() => { if (!saved.includes(slug)) writeSaved(toggleSaved(saved, slug)) }}
    />
  )
}
