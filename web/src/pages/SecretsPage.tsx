import { FormEvent, useEffect, useState } from 'react'
import api, { apiError } from '../services/api'
import type { VaultSnapshot, VaultVariable } from '../types'
import { useScope } from '../components/Layout'

export default function SecretsPage() {
  const { query, env } = useScope()
  const [vault, setVault] = useState<VaultSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [keyName, setKeyName] = useState('')
  const [value, setValue] = useState('')
  const [projectRef, setProjectRef] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    return api
      .get('/api/telemetry/vault')
      .then((res) => {
        setVault(res.data)
        setProjectRef((current) => current || (res.data.projects[0] ? `${res.data.projects[0].connectionId}:${res.data.projects[0].project.id}` : ''))
      })
      .catch((err) => setError(apiError(err, 'Vault indisponible')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const needle = query.trim().toLowerCase()
  const envNeedle = env.toLowerCase()
  const rows = (vault?.variables || []).filter((item) => {
    if (needle && !`${item.key} ${item.projectName} ${item.providerName}`.toLowerCase().includes(needle)) return false
    if (!item.targets.length) return true
    return item.targets.some((target) => target.toLowerCase().includes(envNeedle.slice(0, 4)))
  })
  const driftKeys = new Set((vault?.drifts || []).map((item) => `${item.connectionId}:${item.key}`))

  async function save(event: FormEvent) {
    event.preventDefault()
    const [connectionId, projectId] = projectRef.split(':')
    if (!connectionId || !projectId) return
    setSaving(true)
    setError('')
    try {
      await api.put(`/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/env`, {
        key: keyName,
        value,
        secret: true,
      })
      setKeyName('')
      setValue('')
      await load()
    } catch (err) {
      setError(apiError(err, 'Écriture refusée'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: VaultVariable) {
    if (!item.canWrite) return
    if (!window.confirm(`Supprimer ${item.key} ?`)) return
    setError('')
    try {
      await api.delete(
        `/api/connections/${item.connectionId}/projects/${encodeURIComponent(item.projectId)}/env/${encodeURIComponent(item.key)}?secret=${item.secret ? '1' : '0'}`,
      )
      await load()
    } catch (err) {
      setError(apiError(err, 'Suppression refusée'))
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Sec-vault</div>
        <h1 className="text-2xl font-semibold">Unified Environment Vault</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Variables lues chez les hébergeurs connectés. Les valeurs non lisibles restent masquées.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="Variables" value={vault ? String(vault.total) : '—'} />
        <Tile label="Lisibles" value={vault ? `${vault.readable}/${vault.total}` : '—'} />
        <Tile label="Drift" value={vault ? String(vault.driftCount) : '—'} warn={Boolean(vault?.driftCount)} />
      </section>
      {vault && vault.driftCount > 0 && (
        <div className="rounded-lg border border-tertiary/50 bg-tertiary/10 px-4 py-3 text-sm text-amber-100">
          {vault.driftCount} clé(s) absente(s) ou différente(s) entre projets d’une même connexion.
        </div>
      )}
      {error && <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      <section className="pulse-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="font-mono text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Clé</th>
                <th className="px-4 py-2">Valeur</th>
                <th className="px-4 py-2">Cibles</th>
                <th className="px-4 py-2" />
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
              {rows.map((item) => {
                const id = `${item.connectionId}:${item.projectId}:${item.key}`
                const drifted = driftKeys.has(`${item.connectionId}:${item.key}`)
                const shown = revealed[id] && item.readable && item.value
                return (
                  <tr key={id} className={`border-t border-line ${drifted ? 'bg-tertiary/10' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{item.key}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {item.projectName} · {item.providerName}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {shown ? item.value : '••••••••'}
                      {item.readable && (
                        <button
                          type="button"
                          className="ml-2 text-primary"
                          onClick={() => setRevealed((current) => ({ ...current, [id]: !current[id] }))}
                        >
                          {shown ? 'hide' : 'show'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{item.targets.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {item.canWrite && (
                        <button type="button" className="text-xs text-red-300" onClick={() => remove(item)}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <form onSubmit={save} className="pulse-card grid gap-3 p-4 md:grid-cols-4">
        <select value={projectRef} onChange={(event) => setProjectRef(event.target.value)} className="rounded-md border border-line bg-ink px-2 py-2 text-sm">
          {(vault?.projects || []).map((item) => (
            <option key={`${item.connectionId}:${item.project.id}`} value={`${item.connectionId}:${item.project.id}`}>
              {item.project.name}
            </option>
          ))}
        </select>
        <input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="KEY" required className="rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm" />
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="value" required className="rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm" />
        <button type="submit" disabled={saving} className="rounded-md bg-primary px-3 py-2 text-sm text-white">
          {saving ? '…' : 'New variable'}
        </button>
      </form>
    </div>
  )
}

function Tile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="pulse-card p-4">
      <div className="font-mono text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? 'text-tertiary' : ''}`}>{value}</div>
    </div>
  )
}
