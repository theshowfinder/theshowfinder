import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function requireAdmin() {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }
}
