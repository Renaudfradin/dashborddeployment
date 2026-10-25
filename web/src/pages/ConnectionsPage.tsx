import { FormEvent, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../services/api'
import type { Connection, CredentialField, ProviderInfo } from '../types'
import { fieldClass, formatDate, StatusBadge } from '../components/ui'

const emptyCredentials = (fields: CredentialField[]) => {
  const next: Record<string, string> = {}
  for (const field of fields) next[field.name] = field.defaultValue || ''
  return next
}

export default function ConnectionsPage() {
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
    const [providerRes, connectionRes] = await Promise.all([
      api.get('/api/providers'),
      api.get('/api/connections'),
    ])
    setProviders(providerRes.data.providers)
    setConnections(connectionRes.data.connections)
    const first = providerRes.data.providers[0]
    setProviderKey((current: string) => current || first?.key || '')
    if (first && !providerKey) setCredentials(emptyCredentials(first.credentials))
  }

  useEffect(() => {
    load()
      .catch((err) => setError(apiError(err, 'Impossible de charger les connexions')))
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
    if (!window.confirm('Retirer cette connexion ? Les tokens seront effacés de ce dashboard.')) return
    await api.delete(`/api/connections/${id}`)
    await load()
  }

  async function retest(id: string) {
    setError('')
    try {
      await api.post(`/api/connections/${id}/test`)
      await load()
    } catch (err) {
      setError(apiError(err, 'Le test a échoué'))
      await load()
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h2 className="text-2xl font-semibold text-white">Connexions</h2>
        <p className="mt-1 text-sm text-slate-400">Les tokens restent chiffrés et ne sont plus affichés après l’enregistrement.</p>
        {error && <div className="mt-4 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Chargement…</p>
        ) : connections.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Aucune connexion pour le moment.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {connections.map((connection) => (
              <li key={connection.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{connection.label}</div>
                    <div className="text-sm text-slate-400">{connection.providerName} · {connection.accountName || 'compte'}</div>
                    <div className="mt-2"><StatusBadge status={connection.status} /></div>
                    {connection.statusMessage && <p className="mt-2 text-xs text-amber-200">{connection.statusMessage}</p>}
                    <p className="mt-2 text-xs text-slate-500">Vérifié {formatDate(connection.lastCheckedAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded border border-slate-700 px-3 py-1 text-sm hover:border-slate-500" onClick={() => retest(connection.id)}>
                      Tester
                    </button>
                    <button type="button" className="rounded border border-red-900 px-3 py-1 text-sm text-red-200 hover:border-red-700" onClick={() => remove(connection.id)}>
                      Retirer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-lg font-semibold text-white">Ajouter un hébergeur</h3>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-300">
            Hébergeur
            <select className={fieldClass} value={selected?.key || ''} onChange={(e) => onProvider(e.target.value)}>
              {providers.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select>
          </label>
          {selected && <p className="text-sm text-slate-400">{selected.description}</p>}
          <label className="block text-sm text-slate-300">
            Libellé
            <input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="Perso" />
          </label>
          {selected?.credentials.map((field) => (
            <label key={field.name} className="block text-sm text-slate-300">
              {field.label}{field.required ? '' : ' (optionnel)'}
              {field.options ? (
                <select
                  className={fieldClass}
                  value={credentials[field.name] || field.defaultValue || ''}
                  onChange={(e) => setCredentials({ ...credentials, [field.name]: e.target.value })}
                >
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  className={fieldClass}
                  type={field.secret ? 'password' : 'text'}
                  value={credentials[field.name] || ''}
                  required={field.required}
                  autoComplete="off"
                  onChange={(e) => setCredentials({ ...credentials, [field.name]: e.target.value })}
                />
              )}
              {field.help && <span className="mt-1 block text-xs text-slate-500">{field.help}</span>}
            </label>
          ))}
          {selected?.capabilities.notes.map((note) => (
            <p key={note} className="text-xs text-slate-500">{note}</p>
          ))}
          <button type="submit" disabled={saving || !selected} className="w-full rounded-md bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-500 disabled:opacity-60">
            {saving ? 'Vérification…' : 'Enregistrer'}
          </button>
        </form>
      </section>
    </div>
  )
}
