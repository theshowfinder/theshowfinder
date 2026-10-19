// Records every authorised cron run (start, finish, outcome, summary) in job_runs so the
// health panel and alerts can tell "ran" from "worked". Recording is best-effort: a failure
// to write history never changes what the job itself does.
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_SUMMARY_CHARS = 4000

type Admin = ReturnType<typeof createAdminClient>

function compactSummary(body: unknown): unknown {
  try {
    const text = JSON.stringify(body)
    if (text.length <= MAX_SUMMARY_CHARS) return body
    const keys = body && typeof body === 'object' ? Object.keys(body as object) : []
    return { truncated: true, keys, success: (body as { success?: unknown })?.success ?? null }
  } catch {
    return null
  }
}

export function withJobRun<A extends unknown[]>(job: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const request = args[0] as Request | undefined
    const secret = process.env.CRON_SECRET
    const authorised = !!secret && request?.headers?.get('authorization') === `Bearer ${secret}`
    if (!authorised) return handler(...args)   // the handler returns its own 401; not a run

    let db: Admin | null = null
    let runId: number | null = null
    try {
      db = createAdminClient()
      const { data } = await db.from('job_runs').insert({ job, status: 'running' }).select('id').single() as unknown as { data: { id: number } | null }
      runId = data?.id ?? null
    } catch (e) {
      console.error(`[job_runs] could not start record for ${job}:`, e instanceof Error ? e.message : e)
    }

    const finish = async (patch: { status: 'ok' | 'error'; http_status?: number; summary?: unknown; error?: string | null }) => {
      if (!db || runId == null) return
      try {
        await db.from('job_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', runId)
      } catch (e) {
        console.error(`[job_runs] could not finish record for ${job}:`, e instanceof Error ? e.message : e)
      }
    }

    try {
      const response = await handler(...args)
      let body: unknown = null
      try { body = await response.clone().json() } catch { /* non-JSON response */ }
      const failed = response.status >= 400 || (body as { success?: boolean } | null)?.success === false
      await finish({
        status: failed ? 'error' : 'ok',
        http_status: response.status,
        summary: compactSummary(body),
        error: failed ? String((body as { error?: unknown } | null)?.error ?? `HTTP ${response.status}`).slice(0, 500) : null,
      })
      return response
    } catch (e) {
      await finish({ status: 'error', error: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
      throw e
    }
  }
}
