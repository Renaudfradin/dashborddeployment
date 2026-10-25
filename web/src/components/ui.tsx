export function statusClass(status: string | null) {
  const value = (status || '').toLowerCase()
  if (['ready', 'success', 'successful', 'built', 'published', 'active', 'ready'].includes(value)) {
    return 'border-emerald-800 bg-emerald-950/60 text-emerald-200'
  }
  if (['error', 'failed', 'failure', 'crashed', 'canceled', 'cancelled'].includes(value)) {
    return 'border-red-800 bg-red-950/60 text-red-200'
  }
  if (['building', 'queued', 'deploying', 'pending', 'enqueued', 'initializing', 'creating', 'waiting'].includes(value)) {
    return 'border-amber-800 bg-amber-950/60 text-amber-100'
  }
  return 'border-slate-700 bg-slate-900 text-slate-300'
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-500">—</span>
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(status)}`}>{status}</span>
}

export function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function projectPath(connectionId: string, projectId: string) {
  return `/connections/${connectionId}/projects/${encodeURIComponent(projectId)}`
}

export const fieldClass =
  'mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-teal-500'
