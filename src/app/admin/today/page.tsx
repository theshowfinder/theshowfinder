import { redirect } from 'next/navigation'

// The morning check is now the admin home page.
export default function TodayRedirect() {
  redirect('/admin')
}
