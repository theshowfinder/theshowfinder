export default function IntelligenceDashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <span className="text-slate-400 text-sm">← Admin</span>
        <h1 className="text-xl font-extrabold text-slate-900">Daily Intelligence</h1>
        <span className="text-xs text-slate-400 ml-auto">Loading…</span>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {[0, 1, 2].map(i => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map(j => (
              <div key={j} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 animate-pulse">
                <div className="h-3 w-24 bg-slate-200 rounded mb-4" />
                <div className="h-3 w-full bg-slate-100 rounded mb-2" />
                <div className="h-3 w-5/6 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ))}
      </main>
    </div>
  )
}
