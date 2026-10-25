import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api, { apiError } from '../services/api'
import type { Capabilities, Deployment, EnvVar, LogLine, Project } from '../types'
import { fieldClass, formatDate, StatusBadge } from '../components/ui'

const TABS = [
  { id: 'apercu', label: 'Aperçu' },
  { id: 'deploiements', label: 'Déploiements' },
  { id: 'logs', label: 'Logs' },
  { id: 'variables', label: 'Variables' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function ProjectPage() {
  const { connectionId = '', projectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'apercu'
  const [project, setProject] = useState<Project | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const [logId, setLogId] = useState('')
  const [env, setEnv] = useState<EnvVar[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [envKey, setEnvKey] = useState('')
  const [envValue, setEnvValue] = useState('')
  const [envSecret, setEnvSecret] = useState(false)

  function setTab(next: TabId) {
    setParams({ tab: next })
  }

  async function loadProject() {
    const res = await api.get(`/api/connections/${connectionId}/projects`)
    const found = (res.data.projects as Project[]).find((item) => item.id === projectId) || null
    setProject(found)
    setCapabilities(res.data.capabilities)
    return res.data.capabilities as Capabilities
  }

  async function loadDeployments() {
    const res = await api.get(`/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/deployments`)
    const list = res.data.deployments as Deployment[]
    setDeployments(list)
    setLogId((current) => current || list[0]?.id || '')
    return list
  }

  async function loadEnv() {
    const res = await api.get(`/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/env`)
    setEnv(res.data.env)
  }

  async function loadLogs(deploymentId: string) {
    const res = await api.get(
      `/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/logs`,
    )
    setLogs(res.data.logs)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    loadProject()
      .then(async (caps) => {
        if (cancelled) return
        if (caps.listDeployments) await loadDeployments()
        if (caps.envRead) await loadEnv()
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err, 'Service introuvable'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, projectId])

  useEffect(() => {
    if (tab !== 'logs' || !logId || !capabilities?.logs) return
    loadLogs(logId).catch((err) => setError(apiError(err, 'Logs indisponibles')))
  }, [tab, logId, capabilities?.logs])

  async function redeploy(deploymentId?: string) {
    if (!window.confirm('Relancer ce déploiement ?')) return
    setBusy(true)
    setNotice('')
    setError('')
    try {
      await api.post(`/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/redeploy`, {
        deploymentId: deploymentId || null,
      })
      setNotice('Déploiement relancé.')
      await loadDeployments()
    } catch (err) {
      setError(apiError(err, 'Redéploiement impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function saveEnv(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.put(`/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/env`, {
        key: envKey,
        value: envValue,
        secret: envSecret,
      })
      setEnvKey('')
      setEnvValue('')
      setEnvSecret(false)
      setNotice('Variable enregistrée.')
      await loadEnv()
    } catch (err) {
      setError(apiError(err, 'Enregistrement impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function removeEnv(item: EnvVar) {
    if (!window.confirm(`Supprimer ${item.key} ?`)) return
    setBusy(true)
    setError('')
    try {
      const secret = item.secret ? '?secret=1' : ''
      await api.delete(`/api/connections/${connectionId}/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(item.key)}${secret}`)
      await loadEnv()
    } catch (err) {
      setError(apiError(err, 'Suppression impossible'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Link className="text-sm text-teal-300 hover:text-teal-200" to="/">← Services</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">{project?.name || projectId}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <StatusBadge status={project?.status || null} />
            {project?.region && <span>{project.region}</span>}
            <span>{formatDate(project?.updatedAt || null)}</span>
          </div>
        </div>
        {project?.url && (
          <a className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500" href={project.url} target="_blank" rel="noreferrer">
            Ouvrir le service
          </a>
        )}
      </div>
      {error && <div className="mt-4 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
      {notice && <div className="mt-4 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">{notice}</div>}
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-3 py-2 text-sm ${tab === item.id ? 'bg-teal-700/40 text-teal-100' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-slate-400">Chargement…</p>
      ) : (
        <div className="mt-6">
          {tab === 'apercu' && (
            <div className="rounded-2xl border border-slate-800 p-5">
              <p className="text-sm text-slate-300">URL : {project?.url || 'aucune URL publique'}</p>
              <p className="mt-2 text-sm text-slate-400">Dernier déploiement : {deployments[0]?.commitMessage || deployments[0]?.status || '—'}</p>
              {capabilities?.notes.map((note) => <p key={note} className="mt-3 text-sm text-slate-500">{note}</p>)}
              {capabilities?.redeploy && (
                <button type="button" disabled={busy} onClick={() => redeploy()} className="mt-5 rounded-md border border-slate-600 px-4 py-2 text-sm hover:border-teal-500 disabled:opacity-60">
                  Relancer le dernier déploiement
                </button>
              )}
            </div>
          )}
          {tab === 'deploiements' && (
            <div className="space-y-3">
              {deployments.length === 0 && <p className="text-sm text-slate-400">Aucun déploiement.</p>}
              {deployments.map((deployment) => (
                <article key={deployment.id} className="rounded-2xl border border-slate-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{deployment.commitMessage || deployment.id}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {deployment.branch || '—'} · {(deployment.commitSha || '').slice(0, 7) || 'sans commit'} · {formatDate(deployment.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={deployment.status} />
                  </div>
                  <div className="mt-3 flex gap-3 text-sm">
                    {deployment.url && <a className="text-teal-300 hover:text-teal-200" href={deployment.url} target="_blank" rel="noreferrer">Ouvrir</a>}
                    {capabilities?.redeploy && (
                      <button type="button" disabled={busy} className="text-slate-300 hover:text-white disabled:opacity-60" onClick={() => redeploy(deployment.id)}>
                        Relancer
                      </button>
                    )}
                    {capabilities?.logs && (
                      <button type="button" className="text-slate-300 hover:text-white" onClick={() => { setLogId(deployment.id); setTab('logs') }}>
                        Logs
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === 'logs' && (
            <div>
              <label className="block text-sm text-slate-300">
                Déploiement
                <select className={fieldClass} value={logId} onChange={(e) => setLogId(e.target.value)}>
                  {deployments.map((deployment) => (
                    <option key={deployment.id} value={deployment.id}>
                      {formatDate(deployment.createdAt)} · {deployment.status || deployment.id}
                    </option>
                  ))}
                </select>
              </label>
              <pre className="mt-4 max-h-[32rem] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-200">
                {logs.length === 0 ? 'Aucun journal.' : logs.map((line) => `${line.level ? `[${line.level}] ` : ''}${line.message}`).join('\n')}
              </pre>
            </div>
          )}
          {tab === 'variables' && (
            <div>
              <ul className="space-y-2">
                {env.length === 0 && <li className="text-sm text-slate-400">Aucune variable.</li>}
                {env.map((item) => (
                  <li key={`${item.key}-${item.secret}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 px-4 py-3">
                    <div>
                      <div className="font-mono text-sm text-white">{item.key}</div>
                      <div className="text-xs text-slate-500">
                        {item.readable ? item.value : 'valeur non lisible'}
                        {item.secret ? ' · secret' : ''}
                        {item.targets.length ? ` · ${item.targets.join(', ')}` : ''}
                      </div>
                    </div>
                    {capabilities?.envWrite && (
                      <button type="button" disabled={busy} className="text-sm text-red-200 hover:text-red-100 disabled:opacity-60" onClick={() => removeEnv(item)}>
                        Supprimer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {capabilities?.envWrite && (
                <form className="mt-6 grid gap-3 rounded-2xl border border-slate-800 p-4 md:grid-cols-2" onSubmit={saveEnv}>
                  <label className="text-sm text-slate-300">
                    Clé
                    <input className={fieldClass} value={envKey} onChange={(e) => setEnvKey(e.target.value)} required />
                  </label>
                  <label className="text-sm text-slate-300">
                    Valeur
                    <input className={fieldClass} value={envValue} onChange={(e) => setEnvValue(e.target.value)} required />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                    <input type="checkbox" checked={envSecret} onChange={(e) => setEnvSecret(e.target.checked)} />
                    Secret (la valeur ne sera pas relisible ensuite sur GitHub et Scaleway)
                  </label>
                  <button type="submit" disabled={busy} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-60 md:col-span-2">
                    Enregistrer la variable
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
