'use client'

// Downloads an admin-rendered image (social graphics) as a real PNG file. A plain <a download> made Safari save a
// ~25 KB non-image file (the download request is not the page's own fetch, so it can get an HTML response instead of
// the image). Fetching the image from the page and saving the blob avoids that in every browser.
import { useState } from 'react'

export default function DownloadImageLink({ href, filename, children, className }: { href: string; filename: string; children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(href, { cache: 'no-store', credentials: 'same-origin' })
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) throw new Error(`Got ${res.status} ${type}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <a href={href} onClick={download} className={className}>
      {busy ? 'Preparing…' : failed ? 'Download failed: try again' : children}
    </a>
  )
}
