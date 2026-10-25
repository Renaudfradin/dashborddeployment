import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { apiError } from '../services/api'
import type { Capabilities, Deployment, EnvVar, LogLine, Project } from '../types'
import { fieldClass, formatDate } from '../components/ui'
import { useAuth } from '../hooks/useAuth'

type Panel = 'deployments' | 'logs' | 'variables' | null

const READY = ['ready', 'success', 'successful', 'built', 'published', 'active']

function hostOf(url: string | null) {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}

function isReady(status: string | null) {
  return READY.includes((status || '').toLowerCase())
}

function shortDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" strokeLinecap="round" />
      <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBranch() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  )
}

function IconCommit() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h6M15 12h6" strokeLinecap="round" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M14 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 19 5" strokeLinecap="round" />
      <path d="M19 13v6H5V5h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevron({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ProjectPage() {
  const { connectionId = '', projectId = '' } = useParams()
  const { user, logout } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [accountName, setAccountName] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const [logId, setLogId] = useState('')
  const [env, setEnv] = useState<EnvVar[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [envKey, setEnvKey] = useState('')
  const [envValue, setEnvValue] = useState('')
  const [envSecret, setEnvSecret] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)

  async function loadProject() {
    const [projectRes, connectionRes] = await Promise.all([
      api.get(`/api/connections/${connectionId}/projects`),
      api.get('/api/connections'),
    ])
    const found = (projectRes.data.projects as Project[]).find((item) => item.id === projectId) || null
    const connection = (connectionRes.data.connections as { id: string; accountName: string | null; label: string }[]).find(
      (item) => item.id === connectionId,
    )
    setProject(found)
    setAccountName(connection?.accountName || connection?.label || null)
    setCapabilities(projectRes.data.capabilities)
    return projectRes.data.capabilities as Capabilities
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
    setPreviewFailed(false)
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
  }, [connectionId, projectId, reloadKey])

  useEffect(() => {
    if (panel !== 'logs' || !logId || !capabilities?.logs) return
    loadLogs(logId).catch((err) => setError(apiError(err, 'Logs indisponibles')))
  }, [panel, logId, capabilities?.logs])

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
      setReloadKey((value) => value + 1)
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

  const latest = deployments[0]
  const status = latest?.status || project?.status || null
  const visitUrl = project?.url || latest?.url || null
  const deploymentHost = hostOf(latest?.url || project?.url || null)
  const domainHost = hostOf(project?.url || latest?.url || null)
  const branch = latest?.branch
  const ready = isReady(status)
  const notes = capabilities?.notes || []
  const initial = (project?.name || 'P').slice(0, 1).toUpperCase()

  function togglePanel(next: Exclude<Panel, null>) {
    setPanel((current) => (current === next ? null : next))
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-white/10 px-4">
        <Link to="/" className="flex items-center gap-2 text-sm text-white">
          <span className="grid h-5 w-5 place-items-center rounded-sm bg-white text-[10px] font-semibold text-black">{initial}</span>
          <span className="max-w-[16rem] truncate">{project?.name || 'Projet'}</span>
        </Link>
        <div className="text-sm text-white">Overview</div>
        <div className="flex items-center justify-end gap-3 text-sm text-neutral-400">
          <span className="hidden sm:inline">{user?.email}</span>
          <button type="button" onClick={() => logout()} className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {error && <div className="mb-4 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
        {notice && <div className="mb-4 rounded-md border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">{notice}</div>}

        <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h1 className="text-sm font-medium">Production Deployment</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Rafraîchir"
                disabled={loading}
                onClick={() => setReloadKey((value) => value + 1)}
                className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-neutral-300 hover:bg-white/5 disabled:opacity-50"
              >
                <IconRefresh />
              </button>
              {capabilities?.redeploy && (
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => redeploy(latest?.id)}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  Redeploy
                </button>
              )}
              {visitUrl && (
                <a href={visitUrl} target="_blank" rel="noreferrer" className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200">
                  Visit
                </a>
              )}
            </div>
          </div>

          {loading ? (
            <p className="px-4 py-10 text-sm text-neutral-500">Chargement…</p>
          ) : (
            <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:p-5">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
                {visitUrl && !previewFailed ? (
                  <img
                    alt={`Aperçu de ${project?.name || 'service'}`}
                    src={`https://image.thum.io/get/width/1280/crop/800/noanimate/${visitUrl}`}
                    className="aspect-[16/10] w-full bg-black object-cover object-top"
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="flex aspect-[16/10] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%)] px-6 text-center">
                    <div>
                      <div className="text-3xl font-semibold tracking-tight">{project?.name || 'Aucun aperçu'}</div>
                      {domainHost && <div className="mt-2 text-sm text-neutral-500">{domainHost}</div>}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-5 text-sm">
                <div>
                  <div className="text-neutral-400">Deployment</div>
                  <div className="mt-1 break-all font-medium text-white">{deploymentHost || '—'}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Domains</div>
                  {domainHost ? (
                    <a className="mt-1 inline-flex items-center gap-1.5 text-white hover:underline" href={visitUrl || '#'} target="_blank" rel="noreferrer">
                      {domainHost}
                      <IconExternal />
                    </a>
                  ) : (
                    <div className="mt-1 text-neutral-500">Aucun domaine</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-8">
                  <div>
                    <div className="text-neutral-400">Status</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${ready ? 'bg-emerald-400' : status ? 'bg-amber-400' : 'bg-neutral-500'}`} />
                      <span>{status || 'Unknown'}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-400">Created</div>
                    <div className="mt-1">
                      {shortDate(latest?.createdAt || project?.updatedAt || null)}
                      {accountName ? <span className="text-neutral-400"> by {accountName}</span> : null}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-neutral-400">Source</div>
                  <div className="mt-1 flex items-center gap-2 text-white">
                    <IconBranch />
                    <span>{branch || '—'}</span>
                  </div>
                  <div className="mt-1 flex items-start gap-2 text-neutral-300">
                    <IconCommit />
                    <span className="break-all">
                      <span className="font-mono text-neutral-400">{(latest?.commitSha || '').slice(0, 7) || '—'}</span>
                      {latest?.commitMessage ? <span> {latest.commitMessage}</span> : null}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            className="flex w-full items-center gap-2 border-t border-white/10 px-4 py-3 text-left text-sm hover:bg-white/[0.03]"
          >
            <IconChevron open={settingsOpen} />
            <span>Deployment Settings</span>
            {notes.length > 0 && (
              <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-medium text-white">{notes.length}</span>
            )}
          </button>
          {settingsOpen && (
            <div className="space-y-2 border-t border-white/10 px-4 py-3 text-sm text-neutral-400">
              {notes.length === 0 && <p>Aucun réglage supplémentaire exposé par cet hébergeur.</p>}
              {notes.map((note) => <p key={note}>{note}</p>)}
              {project?.region && <p>Région : {project.region}</p>}
            </div>
          )}
          <p className="border-t border-white/10 px-4 py-3 text-sm text-neutral-500">
            {branch
              ? `To update your Production Deployment, push to the ${branch} branch.`
              : 'To update your Production Deployment, push a new commit or redeploy.'}
          </p>
        </section>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryCard
            title="Deployments"
            meta="recent"
            active={panel === 'deployments'}
            onClick={() => togglePanel('deployments')}
            headline={`${deployments.length} deployment${deployments.length === 1 ? '' : 's'}`}
            detail={latest?.status || 'Aucun déploiement'}
          />
          <SummaryCard
            title="Logs"
            meta="build"
            active={panel === 'logs'}
            onClick={() => togglePanel('logs')}
            headline={capabilities?.logs ? 'Build logs' : 'Indisponible'}
            detail={latest ? shortDate(latest.createdAt) : '—'}
          />
          <SummaryCard
            title="Variables"
            meta="env"
            active={panel === 'variables'}
            onClick={() => togglePanel('variables')}
            headline={`${env.length} variable${env.length === 1 ? '' : 's'}`}
            detail={capabilities?.envWrite ? 'Édition ouverte' : 'Lecture seule'}
          />
        </div>

        {panel === 'deployments' && (
          <div className="mt-4 space-y-3">
            {deployments.length === 0 && <p className="text-sm text-neutral-500">Aucun déploiement.</p>}
            {deployments.map((deployment) => (
              <article key={deployment.id} className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{deployment.commitMessage || deployment.id}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {deployment.branch || '—'} · {(deployment.commitSha || '').slice(0, 7) || 'sans commit'} · {formatDate(deployment.createdAt)}
                    </div>
                  </div>
                  <span className="text-sm text-neutral-300">{deployment.status || '—'}</span>
                </div>
                <div className="mt-3 flex gap-3 text-sm">
                  {deployment.url && (
                    <a className="text-neutral-300 hover:text-white" href={deployment.url} target="_blank" rel="noreferrer">Visit</a>
                  )}
                  {capabilities?.redeploy && (
                    <button type="button" disabled={busy} className="text-neutral-300 hover:text-white disabled:opacity-50" onClick={() => redeploy(deployment.id)}>
                      Redeploy
                    </button>
                  )}
                  {capabilities?.logs && (
                    <button type="button" className="text-neutral-300 hover:text-white" onClick={() => { setLogId(deployment.id); setPanel('logs') }}>
                      Logs
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {panel === 'logs' && (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
            <label className="block text-sm text-neutral-300">
              Déploiement
              <select className={fieldClass} value={logId} onChange={(event) => setLogId(event.target.value)}>
                {deployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.id}>
                    {formatDate(deployment.createdAt)} · {deployment.status || deployment.id}
                  </option>
                ))}
              </select>
            </label>
            <pre className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-white/10 bg-black p-4 font-mono text-xs leading-5 text-neutral-200">
              {logs.length === 0 ? 'Aucun journal.' : logs.map((line) => `${line.level ? `[${line.level}] ` : ''}${line.message}`).join('\n')}
            </pre>
          </div>
        )}

        {panel === 'variables' && (
          <div className="mt-4 rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
            <ul className="space-y-2">
              {env.length === 0 && <li className="text-sm text-neutral-500">Aucune variable.</li>}
              {env.map((item) => (
                <li key={`${item.key}-${item.secret}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 px-4 py-3">
                  <div>
                    <div className="font-mono text-sm">{item.key}</div>
                    <div className="text-xs text-neutral-500">
                      {item.readable ? item.value : 'valeur non lisible'}
                      {item.secret ? ' · secret' : ''}
                      {item.targets.length ? ` · ${item.targets.join(', ')}` : ''}
                    </div>
                  </div>
                  {capabilities?.envWrite && (
                    <button type="button" disabled={busy} className="text-sm text-red-300 hover:text-red-200 disabled:opacity-50" onClick={() => removeEnv(item)}>
                      Supprimer
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {capabilities?.envWrite && (
              <form className="mt-6 grid gap-3 md:grid-cols-2" onSubmit={saveEnv}>
                <label className="text-sm text-neutral-300">
                  Clé
                  <input className={fieldClass} value={envKey} onChange={(event) => setEnvKey(event.target.value)} required />
                </label>
                <label className="text-sm text-neutral-300">
                  Valeur
                  <input className={fieldClass} value={envValue} onChange={(event) => setEnvValue(event.target.value)} required />
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300 md:col-span-2">
                  <input type="checkbox" checked={envSecret} onChange={(event) => setEnvSecret(event.target.checked)} />
                  Secret
                </label>
                <button type="submit" disabled={busy} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50 md:col-span-2">
                  Enregistrer la variable
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function SummaryCard({
  title,
  meta,
  headline,
  detail,
  active,
  onClick,
}: {
  title: string
  meta: string
  headline: string
  detail: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left ${active ? 'border-white/30 bg-white/[0.04]' : 'border-white/10 bg-[#0a0a0a] hover:bg-white/[0.03]'}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span>
          {title} <span className="text-neutral-500">{meta}</span>
        </span>
        <IconChevron open={active} />
      </div>
      <div className="mt-8 text-sm text-sky-400">{headline}</div>
      <div className="mt-1 text-sm text-neutral-400">{detail}</div>
    </button>
  )
}
