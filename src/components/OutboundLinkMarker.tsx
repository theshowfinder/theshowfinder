'use client'

import { useEffect } from 'react'

// Marks an affiliate ticket button (/out/<provider>) as clicked by a person.
//
// Ticketmaster buttons point at our own /out/tm redirect. When someone presses,
// taps, focuses or right-clicks one of those links, this adds `h=1` to the link
// just before the browser follows it. The redirect treats `h=1` as proof that a
// real person is using a real browser and always credits the click to our
// Impact account, even if some browser quirk made the request look unusual.
// Crawlers and scrapers never run this script and `h=1` is not in the HTML, so
// they are still sent to the plain Ticketmaster page. One listener on the
// document covers every Ticketmaster button on every page.
export default function OutboundLinkMarker() {
  useEffect(() => {
    function mark(event: Event) {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      let url: URL
      try {
        url = new URL(link.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/out/') || url.searchParams.get('h') === '1') return
      url.searchParams.set('h', '1')
      link.href = url.toString()
    }
    const events = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'focusin', 'contextmenu', 'click'] as const
    for (const name of events) document.addEventListener(name, mark, { capture: true, passive: true })
    return () => {
      for (const name of events) document.removeEventListener(name, mark, { capture: true })
    }
  }, [])
  return null
}
