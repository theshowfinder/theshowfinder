'use client'

export default function SelectAllPendingCheckbox({ count }: { count: number }) {
  return (
    <input
      type="checkbox"
      aria-label={`Select all ${count} pending stories`}
      title={`Select all ${count} pending stories`}
      disabled={count === 0}
      onChange={(event) => {
        const form = event.currentTarget.form
        if (!form) return
        form.querySelectorAll<HTMLInputElement>('input[name="candidate_ids"]:not(:disabled)')
          .forEach(input => { input.checked = event.currentTarget.checked })
      }}
      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
    />
  )
}
