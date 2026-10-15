// Tiny "something happened" message shown at the bottom of the screen (see
// components/Toast.tsx). Any client code can call showToast; it does nothing on
// the server. Pure browser event, no state library.

export const TOAST_EVENT = 'tsf-toast'

export interface ToastDetail {
  message: string
  href?: string
  linkLabel?: string
}

export function showToast(message: string, link?: { href: string; label: string }): void {
  if (typeof window === 'undefined') return
  const detail: ToastDetail = { message, href: link?.href, linkLabel: link?.label }
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }))
}
