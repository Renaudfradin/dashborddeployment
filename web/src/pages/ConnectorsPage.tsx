import { FormEvent, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../services/api'
import type { Connection, CredentialField, ProviderInfo } from '../types'
import { fieldClass } from '../components/ui'

const CATALOG = [
  { key: 'vercel', blurb: 'Previews, edge et déploiements synchronisés.' },
  { key: 'railway', blurb: 'Services, replicas et redéploiements.' },
  { key: 'netlify', blurb: 'Sites, builds et variables.' },
  { key: 'github_pages', blurb: 'GitHub Pages relié au dépôt.' },
  { key: 'scaleway', blurb: 'Conteneurs et déploiements Scaleway.' },
]

const UNAVAILABLE = [
  { name: 'Fly.io', blurb: 'Adapter absent du registre.' },
  { name: 'Render', blurb: 'Adapter absent du registre.' },
  { name: 'AWS', blurb: 'Adapter absent du registre.' },
  { name: 'Supabase', blurb: 'Adapter absent du registre.' },
]

const emptyCredentials = (fields: CredentialField[]) => {
  const next: Record<string, string> = {}
  for (const field of fields) next[field.name] = field.defaultValue || ''
  return next
}

export default function ConnectorsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [providerKey, setProviderKey] = useState('')
  const [label, setLabel] = useState('')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const selected = useMemo(
    () => providers.find((item) => item.key === providerKey) || providers[0],
    [providers, providerKey],
  )

  async function load() {
    const [providerRes, connectionRes] = await Promise.all([api.get('/api/providers'), api.get('/api/connections')])
    setProviders(providerRes.data.providers)
    setConnections(connectionRes.data.connections)
    const first = providerRes.data.providers[0]
    setProviderKey((current) => current || first?.key || '')
    if (first && !providerKey) setCredentials(emptyCredentials(first.credentials))
  }

  useEffect(() => {
    load()
      .catch((err) => setError(apiError(err, 'Connecteurs indisponibles')))
      .finally(() => setLoading(false))
  }, [])

  function onProvider(next: string) {
    setProviderKey(next)
    const info = providers.find((item) => item.key === next)
    setCredentials(emptyCredentials(info?.credentials || []))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/connections', { provider: selected.key, label, credentials })
      setLabel('')
      setCredentials(emptyCredentials(selected.credentials))
      await load()
    } catch (err) {
      setError(apiError(err, 'Connexion refusée'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Retirer cette connexion ?')) return
    await api.delete(`/api/connections/${id}`)
    await load()
  }

  async function retest(id: string) {
    try {
      await api.post(`/api/connections/${id}/test`)
      await load()
    } catch (err) {
      setError(apiError(err, 'Le test a échoué'))
      await load()
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Ecosystem matrix</div>
        <h1 className="text-2xl font-semibold md:text-3xl">One-Click Runtime Connectors</h1>
      </header>
      {error && <div className="rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CATALOG.map((item) => {
          const info = providers.find((provider) => provider.key === item.key)
          const linked = connections.filter((connection) => connection.provider === item.key)
          const ready = Boolean(info)
          return (
            <article key={item.key} className="pulse-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{info?.name || item.key}</h2>
                <span className={`font-mono text-[10px] ${linked.length ? 'text-secondary' : 'text-slate-500'}`}>
                  {linked.length ? 'CONNECTED' : ready ? 'READY' : '—'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{info?.description || item.blurb}</p>
              <div className="mt-3 font-mono text-[11px] text-slate-500">{linked.length} connexion(s)</div>
              {ready && (
                <button type="button" className="mt-3 text-sm text-primary" onClick={() => onProvider(item.key)}>
                  Configure
                </button>
              )}
            </article>
          )
        })}
        {UNAVAILABLE.map((item) => (
          <article key={item.name} className="pulse-card p-4 opacity-70">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{item.name}</h2>
              <span className="font-mono text-[10px] text-slate-500">DISCONNECTED</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{item.blurb}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={onSubmit} className="pulse-card p-4">
          <h2 className="text-lg font-semibold">Connecter</h2>
          {loading && <p className="mt-3 text-sm text-slate-500">Chargement…</p>}
          {selected && (
            <div className="mt-3 space-y-3">
              <label className="block text-sm text-slate-300">
                Hébergeur
                <select className={fieldClass} value={selected.key} onChange={(event) => onProvider(event.target.value)}>
                  {providers.map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-300">
                Libellé
                <input className={fieldClass} value={label} onChange={(event) => setLabel(event.target.value)} required />
              </label>
              {selected.credentials.map((field) => (
                <label key={field.name} className="block text-sm text-slate-300">
                  {field.label}
                  <input
                    className={fieldClass}
                    type={field.secret ? 'password' : 'text'}
                    value={credentials[field.name] || ''}
                    required={field.required}
                    onChange={(event) => setCredentials((current) => ({ ...current, [field.name]: event.target.value }))}
                  />
                  {field.help && <span className="mt-1 block text-xs text-slate-500">{field.help}</span>}
                </label>
              ))}
              <button type="submit" disabled={saving} className="rounded-md bg-primary px-3 py-2 text-sm text-white">
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          )}
        </form>
        <div className="space-y-3">
          {connections.map((connection) => (
            <article key={connection.id} className="pulse-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{connection.label}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    {connection.providerName} · {connection.accountName || 'compte'} · {connection.status}
                  </div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="rounded-md border border-line px-2 py-1" onClick={() => retest(connection.id)}>
                    Test
                  </button>
                  <button type="button" className="rounded-md border border-line px-2 py-1 text-red-300" onClick={() => remove(connection.id)}>
                    Retirer
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!loading && connections.length === 0 && <p className="text-sm text-slate-500">Aucune connexion.</p>}
        </div>
      </section>
    </div>
  )
}
