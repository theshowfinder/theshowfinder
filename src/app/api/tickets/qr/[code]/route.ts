import QRCode from 'qrcode'
import { parseTicketCode, ticketQrPayload } from '@/lib/tickets'

export const runtime = 'nodejs'

// The QR image in ticket emails. The code is the ticket (unguessable, used once at the door), so the image
// is the same forever and can be cached anywhere.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = parseTicketCode((await params).code.replace(/\.png$/i, ''))
  if (!code) return new Response('Not found', { status: 404 })
  const png = await QRCode.toBuffer(ticketQrPayload(code), { type: 'png', width: 400, margin: 2, errorCorrectionLevel: 'M' })
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } })
}
