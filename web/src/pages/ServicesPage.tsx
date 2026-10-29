import { useEffect, useState } from 'react'
import api, { apiError } from '../services/api'
import type { ServiceMesh } from '../types'
import { useScope } from '../components/Layout'
import { formatDate } from '../components/ui'

export default function ServicesPage() {
  const { query } = useScope()
  const [mesh, setMesh] = useState<ServiceMesh | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/api/telemetry/services')
      .then((res) => setMesh(res.data))
      .catch((err) => setError(apiError(err, 'Services indisponibles')))
      .finally(() => setLoading(false))
  }, [])

  const needle = query.trim().toLowerCase()
  const rows = (mesh?.services || []).filter((item) => {
    if (!needle) return true
    return `${item.project.name} ${item.providerName}`.toLowerCase().includes(needle)
  })
  const logs = rows.flatMap((item) =>
    item.logSample.map((line) => ({ ...line, project: item.project.name, provider: item.providerName })),
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Services pool" value={mesh ? `${mesh.nominal}/${mesh.total}` : '—'} />
        <Stat label="Nominal" value={mesh ? String(mesh.nominal) : '—'} />
        <Stat label="Degraded" value={mesh ? String(mesh.degraded) : '—'} />
        <Stat label="CPU / RAM" value="—" />
      </div>
      {error && <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      {(mesh?.errors || []).map((item) => (
        <div key={item.connectionId + item.label} className="rounded-md border border-amber-800/70 px-3 py-2 text-sm text-amber-100">
          {item.label} : {item.message}
        </div>
      ))}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="pulse-card overflow-hidden">
          <header className="border-b border-line px-4 py-3 font-mono text-xs uppercase tracking-wider text-slate-400">
            Service mesh execution pool
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="font-mono text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Service</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Revision</th>
                  <th className="px-4 py-2">Load</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={4}>
                      Chargement…
                    </td>
                  </tr>
                )}
                {rows.map((item) => (
                  <tr key={`${item.connectionId}-${item.project.id}`} className="border-t border-line">
                    <td className="px-4 py-3">
                      <div>{item.project.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{item.providerName}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-secondary">{item.project.status || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">
                      {item.latest?.commitSha ? item.latest.commitSha.slice(0, 7) : '—'}
                      <div>{item.latest?.branch || formatDate(item.latest?.createdAt || null)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="pulse-card flex max-h-[32rem] flex-col">
          <header className="border-b border-line px-4 py-3 font-mono text-xs uppercase tracking-wider text-secondary">
            Live stdout
          </header>
          <div className="pulse-scroll flex-1 overflow-auto p-3 font-mono text-[11px] leading-5">
            {logs.length === 0 && <div className="text-slate-500">Aucun extrait de journal.</div>}
            {logs.map((line, index) => (
              <div key={index} className="text-slate-300">
                <span className="text-slate-500">{line.project}</span> {line.level || 'info'} {line.message}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pulse-card p-4">
      <div className="font-mono text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}
