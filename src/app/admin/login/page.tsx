import { loginAction } from '../actions'

export default function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Admin</h1>
        <p className="text-slate-500 text-sm mb-6">TheShowFinder management</p>

        <form action={loginAction} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full font-bold text-white py-2.5 rounded-xl transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#E8003D' }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
