'use client'

// "Share with friends" for event pages and cards. On phones it opens the
// native share sheet; elsewhere it expands a row of WhatsApp / Facebook / X /
// email / copy-link pills. The link shared is OUR page (never an affiliate
// link) with utm parameters per channel, so shares show up in analytics and
// bring friends to the site.

import { useState, useSyncExternalStore } from 'react'
import { trackEvent } from '@/lib/gtag'
import {
  trackedShareUrl, whatsappHref, facebookHref, xHref, mailtoHref, type ShareChannel,
} from '@/lib/shareText'

interface ShareButtonProps {
  /** Clean canonical page URL (no utm). */
  url: string
  title: string
  /** Pre-written sentence that goes before the link (see buildShareText). */
  text: string
  /** For analytics, e.g. the event slug. */
  itemId: string
  variant?: 'dark' | 'light'
  label?: string
  /** For analytics: what is being shared. */
  contentType?: 'event' | 'artist' | 'venue'
}

export default function ShareButton({ url, title, text, itemId, variant = 'light', label = 'Share with friends', contentType = 'event' }: ShareButtonProps) {
  // Server render and first paint assume no native sharing; phones switch to it on hydration.
  const canNative = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false,
  )
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  function track(method: ShareChannel) {
    trackEvent('share', { method, content_type: contentType, item_id: itemId })
  }

  async function onMainClick() {
    if (canNative) {
      track('native')
      try {
        await navigator.share({ title, text, url: trackedShareUrl(url, 'native') })
      } catch {
        // cancelled by the user (AbortError) or unsupported: nothing to do
      }
      return
    }
    setOpen(o => !o)
  }

  async function copy() {
    track('copy')
    try {
      await navigator.clipboard.writeText(trackedShareUrl(url, 'copy'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked: the other share options still work
    }
  }

  const mainClass = variant === 'dark'
    ? 'bg-white/10 border-white/30 text-white hover:bg-white/20'
    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
  const pillClass = variant === 'dark'
    ? 'bg-white text-slate-900 hover:bg-slate-100'
    : 'bg-slate-900 text-white hover:bg-slate-700'

  const links: { channel: ShareChannel; label: string; href: string }[] = [
    { channel: 'whatsapp', label: 'WhatsApp', href: whatsappHref(text, trackedShareUrl(url, 'whatsapp')) },
    { channel: 'facebook', label: 'Facebook', href: facebookHref(trackedShareUrl(url, 'facebook')) },
    { channel: 'x', label: 'X', href: xHref(text, trackedShareUrl(url, 'x')) },
    { channel: 'email', label: 'Email', href: mailtoHref(title, text, trackedShareUrl(url, 'email')) },
  ]

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        type="button"
        onClick={onMainClick}
        aria-expanded={canNative ? undefined : open}
        className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border text-sm font-bold transition-colors ${mainClass}`}
      >
        <span aria-hidden="true">↗</span> {label}
      </button>
      {open && !canNative && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Share options">
          {links.map(l => (
            <a
              key={l.channel}
              href={l.href}
              target={l.channel === 'email' ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={() => track(l.channel)}
              className={`inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-bold ${pillClass}`}
            >
              {l.label}
            </a>
          ))}
          <button
            type="button"
            onClick={copy}
            className={`inline-flex items-center min-h-[44px] px-4 rounded-xl text-sm font-bold ${pillClass}`}
          >
            {copied ? '✓ Link copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  )
}
