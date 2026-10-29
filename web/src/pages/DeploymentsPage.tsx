import { useEffect, useState } from 'react'
import api, { apiError } from '../services/api'
import type { BoardDeployment, DeploymentBoard } from '../types'
import { useScope } from '../components/Layout'
import { formatDate } from '../components/ui'

function durationLabel(ms: number | null) {
  if (ms == null) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

export default function DeploymentsPage() {
  const { query } = useScope()
  const [board, setBoard] = useState<DeploymentBoard | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  function load() {
    return api
      .get('/api/telemetry/deployments')
      .then((res) => setBoard(res.data))
      .catch((err) => setError(apiError(err, 'Déploiements indisponibles')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function redeploy(row: BoardDeployment) {
    setBusy(row.id)
    setError('')
    try {
      await api.post(`/api/connections/${row.connectionId}/projects/${encodeURIComponent(row.projectId)}/redeploy`, {
        deploymentId: row.id,
      })
      await load()
    } catch (err) {
      setError(apiError(err, 'Relance impossible'))
    } finally {
      setBusy('')
    }
  }

  const needle = query.trim().toLowerCase()
  const history = (board?.history || []).filter((row) => {
    if (!needle) return true
    return `${row.projectName} ${row.branch || ''} ${row.commitSha || ''} ${row.providerName}`.toLowerCase().includes(needle)
  })
  const active = history.find((row) => ['building', 'queued', 'deploying', 'pending', 'initializing'].includes((row.status || '').toLowerCase()))

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">CI/CD</div>
          <h1 className="text-2xl font-semibold">Deployments & Build Orchestration</h1>
        </div>
        <div className="font-mono text-xs text-slate-400">
          {board?.inFlight ?? '—'} in flight · {board?.queued ?? '—'} queued
        </div>
      </header>
      {error && <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      <section className="pulse-card p-4">
        <div className="font-mono text-[10px] uppercase text-secondary">Build in flight</div>
        {active ? (
          <div className="mt-2">
            <div className="text-sm">
              {active.projectName} · {active.providerName}
            </div>
            <div className="mt-1 font-mono text-[11px] text-slate-500">
              {active.status} · {active.branch || '—'} · {active.commitSha?.slice(0, 7) || '—'}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{loading ? 'Chargement…' : 'Aucun build en cours.'}</p>
        )}
      </section>
      <section className="pulse-card overflow-hidden">
        <header className="border-b border-line px-4 py-3 font-mono text-xs uppercase text-slate-400">
          History · {history.length}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="font-mono text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Commit</th>
                <th className="px-4 py-2">Projet</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Durée</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={`${row.connectionId}-${row.id}`} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.commitSha ? row.commitSha.slice(0, 7) : row.id.slice(0, 7)}
                    <div className="text-slate-500">{row.branch || formatDate(row.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">{row.projectName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.providerName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{durationLabel(row.durationMs)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-secondary">{row.status || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => redeploy(row)}
                      className="rounded-md border border-line px-2 py-1 text-xs hover:border-primary"
                    >
                      {busy === row.id ? '…' : 'Redeploy'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
