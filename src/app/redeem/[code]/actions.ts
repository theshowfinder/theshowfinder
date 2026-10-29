'use server'

import { redirect } from 'next/navigation'
import { redeemVoucher } from '@/lib/businessVouchers'
import { isVoucherCode } from '@/lib/businessOffers'

export async function redeemAction(code: string, formData: FormData) {
  if (!isVoucherCode(code)) redirect('/')
  const pin = String(formData.get('pin') ?? '').replace(/\D/g, '').slice(0, 4)
  const r = await redeemVoucher(code, pin)
  if (r.ok) redirect(`/redeem/${code}?done=1`)
  redirect(`/redeem/${code}?err=${r.reason}${r.reason === 'wrong-pin' ? `&left=${r.triesLeft}` : ''}`)
}
