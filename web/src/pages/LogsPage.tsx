import { useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../services/api'
import type { LogTail } from '../types'
import { useScope } from '../components/Layout'
import { formatDate } from '../components/ui'

export default function LogsPage() {
  const { query } = useScope()
  const [tail, setTail] = useState<LogTail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState('all')
  const [level, setLevel] = useState('all')

  useEffect(() => {
    api
      .get('/api/telemetry/logs')
      .then((res) => setTail(res.data))
      .catch((err) => setError(apiError(err, 'Journaux indisponibles')))
      .finally(() => setLoading(false))
  }, [])

  const providers = useMemo(
    () => Array.from(new Set((tail?.lines || []).map((line) => line.providerName))),
    [tail],
  )
  const needle = query.trim().toLowerCase()
  const lines = (tail?.lines || []).filter((line) => {
    if (provider !== 'all' && line.providerName !== provider) return false
    const normalized = (line.level || 'info').toLowerCase()
    if (level !== 'all' && !normalized.includes(level)) return false
    if (!needle) return true
    return `${line.message} ${line.projectName}`.toLowerCase().includes(needle)
  })

  return (
    <div className="flex min-h-[70vh] flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-secondary/40 px-2 py-0.5 font-mono text-[10px] text-secondary">Live feed</span>
        <span className="font-mono text-[11px] text-slate-500">
          {tail?.linesPerSec != null ? `${tail.linesPerSec} lines/sec` : 'throughput —'} · buffer {tail?.total ?? '—'}
        </span>
        <select value={provider} onChange={(event) => setProvider(event.target.value)} className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs">
          <option value="all">All providers</option>
          {providers.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select value={level} onChange={(event) => setLevel(event.target.value)} className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs">
          <option value="all">All levels</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="err">error</option>
          <option value="debug">debug</option>
        </select>
      </header>
      {error && <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="flex flex-wrap gap-3 font-mono text-[11px] text-slate-400">
        <span>INFO {tail?.levels.info ?? '—'}</span>
        <span className="text-tertiary">WARN {tail?.levels.warn ?? '—'}</span>
        <span className="text-red-300">ERR {tail?.levels.error ?? '—'}</span>
        <span>DEBUG {tail?.levels.debug ?? '—'}</span>
      </div>
      <section className="pulse-card pulse-scroll min-h-[24rem] flex-1 overflow-auto p-3 font-mono text-[11px] leading-5">
        {loading && <div className="text-slate-500">Chargement…</div>}
        {!loading && lines.length === 0 && <div className="text-slate-500">Aucune ligne.</div>}
        {lines.map((line, index) => (
          <div key={`${line.deploymentId}-${index}`} className="grid grid-cols-1 gap-1 border-b border-line/40 py-1 md:grid-cols-[9rem_6rem_1fr]">
            <span className="text-slate-500">{formatDate(line.timestamp)}</span>
            <span className="text-primary">
              {line.providerName} {line.level || 'info'}
            </span>
            <span className="text-slate-200">
              {line.projectName} {line.message}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}
