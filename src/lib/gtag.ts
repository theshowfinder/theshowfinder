// Thin, defensive wrapper around the GA4 gtag.js queue already loaded
// site-wide by the <Script> tags in src/app/layout.tsx (tag ID
// G-8HE8E2HF4Q). This file has no 'use client' of its own — it's a
// plain function, not a component — but every call site is a client
// component, so it only ever runs in the browser.
//
// gtag may not be ready yet (slow network, ad blocker, consent tooling)
// so this never throws and never blocks navigation: if window.gtag isn't
// a function, the event is simply not recorded rather than breaking the
// click it's attached to.
export function trackEvent(eventName: string, params: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
  if (typeof gtag !== 'function') return
  gtag('event', eventName, params)
}
