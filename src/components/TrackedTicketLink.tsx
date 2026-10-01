'use client'

// Phase 5A, requirement 4: wraps an outbound ticket/affiliate <a> so a
// click fires a GA4 'ticket_click' custom event before the browser
// navigates away. Drop-in replacement for a plain <a target="_blank">
// in the ticket comparison panels — same props (href/className/style/
// children), so existing styling is untouched.
//
// onClick fires synchronously and does not call preventDefault, so
// navigation is never delayed or blocked by this — if gtag hasn't
// loaded yet, trackEvent() no-ops and the link still works normally.

import type { CSSProperties, ReactNode } from 'react'
import { trackEvent } from '@/lib/gtag'
import { buildTicketClickEvent, type TicketClickSection } from '@/lib/analytics'

interface TrackedTicketLinkProps {
  href: string
  provider: string
  section: TicketClickSection
  context: string
  target?: string
  rel?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function TrackedTicketLink({
  href,
  provider,
  section,
  context,
  target = '_blank',
  rel = 'noopener noreferrer',
  className,
  style,
  children,
}: TrackedTicketLinkProps) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      style={style}
      onClick={() => trackEvent('ticket_click', buildTicketClickEvent({ provider, section, context }))}
    >
      {children}
    </a>
  )
}
