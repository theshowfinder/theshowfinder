'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import jsQR from 'jsqr'

type Counts = { issued: number; in: number }
type Result =
  | { result: 'ok'; name: string; ticket: string }
  | { result: 'already'; name: string; ticket: string; at: string }
  | { result: 'cancelled'; name: string }
  | { result: 'not_found' }
  | { result: 'error'; message: string }

// Camera QR scanning: the browser's own BarcodeDetector where it exists (Android Chrome), jsQR everywhere else
// (iPhone Safari). Each code is checked by the server, which marks it used exactly once.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

const time = (iso: string) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '')

export default function DoorScanner({ s, t, initialCounts }: { s: string; t: string; initialCounts: Counts }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const busyRef = useRef(false)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const [camera, setCamera] = useState<'off' | 'on' | 'denied'>('off')
  const [counts, setCounts] = useState<Counts>(initialCounts)
  const [result, setResult] = useState<Result | null>(null)

  const check = useCallback(async (raw: string) => {
    const now = Date.now()
    if (busyRef.current) return
    if (raw === lastRef.current.code && now - lastRef.current.at < 4000) return
    busyRef.current = true
    lastRef.current = { code: raw, at: now }
    try {
      const res = await fetch('/api/tickets/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ s, t, code: raw }) })
      const json = await res.json() as Result & { counts?: Counts; error?: string }
      if (!res.ok) setResult({ result: 'error', message: json.error ?? 'Could not check that ticket.' })
      else { setResult(json); if (json.counts) setCounts(json.counts) }
      if ('vibrate' in navigator) navigator.vibrate(json.result === 'ok' ? 80 : [80, 60, 80])
    } catch {
      setResult({ result: 'error', message: 'No connection. Try again, or type the code.' })
    } finally {
      setTimeout(() => { busyRef.current = false }, 900)
    }
  }, [s, t])

  useEffect(() => {
    if (camera !== 'on') return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
    const detector: Detector | null = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ['qr_code'] }) : null
    let lastScan = 0
    const loop = async () => {
      if (stopped) return
      const v = videoRef.current
      const c = canvasRef.current
      if (v && c && v.readyState >= 2 && Date.now() - lastScan > 200) {
        lastScan = Date.now()
        try {
          let text: string | null = null
          if (detector) {
            const found = await detector.detect(v)
            text = found[0]?.rawValue ?? null
          } else {
            const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 360
            c.width = w; c.height = h
            const ctx = c.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h)
              const img = ctx.getImageData(0, 0, w, h)
              text = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null
            }
          }
          if (text) void check(text)
        } catch { /* keep scanning */ }
      }
      raf = requestAnimationFrame(loop)
    }
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s2 => {
        stream = s2
        if (videoRef.current) { videoRef.current.srcObject = s2; void videoRef.current.play() }
        raf = requestAnimationFrame(loop)
      })
      .catch(() => setCamera('denied'))
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(tr => tr.stop()) }
  }, [camera, check])

  function onType(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = e.currentTarget
    const v = new FormData(f).get('code')
    if (typeof v === 'string' && v.trim()) { lastRef.current = { code: '', at: 0 }; void check(v); f.reset() }
  }

  const panel = !result ? null
    : result.result === 'ok' ? { bg: 'bg-emerald-500', title: '✓ Valid ticket', sub: `${result.name} · ${result.ticket}` }
    : result.result === 'already' ? { bg: 'bg-amber-500', title: '⚠ Already used', sub: `${result.name} · scanned at ${time(result.at)}` }
    : result.result === 'cancelled' ? { bg: 'bg-red-600', title: '✕ Cancelled ticket', sub: result.name }
    : result.result === 'not_found' ? { bg: 'bg-red-600', title: '✕ Not a ticket for this event', sub: 'Check the code, or the event' }
    : { bg: 'bg-slate-600', title: 'Try again', sub: result.message }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-black">{counts.in}</p><p className="text-xs text-white/60">in</p></div>
        <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-black">{counts.issued}</p><p className="text-xs text-white/60">tickets issued</p></div>
      </div>

      <div className="relative mt-4 aspect-square overflow-hidden rounded-2xl bg-black">
        {camera === 'on' ? (
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={() => setCamera('on')} className="flex h-full w-full flex-col items-center justify-center gap-2 font-extrabold">
            <span className="text-5xl">📷</span>
            <span>{camera === 'denied' ? 'Camera blocked: allow it in your browser settings, then tap' : 'Tap to start scanning'}</span>
          </button>
        )}
        {panel && (
          <div className={`absolute inset-x-0 bottom-0 ${panel.bg} p-4 text-center`} role="status" aria-live="assertive">
            <p className="text-2xl font-black">{panel.title}</p>
            <p className="text-sm font-semibold">{panel.sub}</p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <form onSubmit={onType} className="mt-4 flex gap-2">
        <input name="code" placeholder="Or type the code" autoComplete="off" autoCapitalize="characters" className="min-h-[48px] flex-1 rounded-xl bg-white px-4 font-mono text-slate-900" />
        <button type="submit" className="rounded-xl bg-[#E8003D] px-5 font-extrabold">Check</button>
      </form>
    </div>
  )
}
