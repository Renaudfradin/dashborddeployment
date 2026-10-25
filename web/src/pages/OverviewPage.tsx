import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../services/api'
import type { OverviewError, ServiceRow } from '../types'
import { formatDate, projectPath, StatusBadge } from '../components/ui'

export default function OverviewPage() {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [errors, setErrors] = useState<OverviewError[]>([])
  const [provider, setProvider] = useState('all')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/overview')
      .then((res) => {
        setServices(res.data.services)
        setErrors(res.data.errors)
      })
      .catch((err) => setError(apiError(err, 'Impossible de charger les services')))
      .finally(() => setLoading(false))
  }, [])

  const providers = useMemo(() => Array.from(new Set(services.map((item) => item.providerName))), [services])
  const statuses = useMemo(
    () => Array.from(new Set(services.map((item) => item.project.status).filter(Boolean))) as string[],
    [services],
  )
  const visible = services.filter((item) => {
    if (provider !== 'all' && item.providerName !== provider) return false
    if (status !== 'all' && item.project.status !== status) return false
    return true
  })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Services déployés</h2>
          <p className="mt-1 text-sm text-slate-400">Tous les projets reliés à vos comptes d’hébergement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">Tous les hébergeurs</option>
            {providers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tous les statuts</option>
            {statuses.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="mb-4 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
      {errors.map((item) => (
        <div key={item.connectionId} className="mb-3 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          {item.label} : {item.message}
        </div>
      ))}
      {loading ? (
        <p className="text-sm text-slate-400">Chargement des hébergeurs…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center">
          <p className="text-slate-300">Aucun service à afficher.</p>
          <Link className="mt-3 inline-block text-teal-300 hover:text-teal-200" to="/connections">Ajouter une connexion</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Hébergeur</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Mis à jour</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={`${item.connectionId}-${item.project.id}`} className="border-t border-slate-800">
                  <td className="px-4 py-3">
                    <Link className="font-medium text-white hover:text-teal-200" to={projectPath(item.connectionId, item.project.id)}>
                      {item.project.name}
                    </Link>
                    <div className="text-xs text-slate-500">{item.connectionLabel}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.providerName}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.project.status} /></td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(item.project.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {item.project.url && (
                      <a className="text-teal-300 hover:text-teal-200" href={item.project.url} target="_blank" rel="noreferrer">
                        Ouvrir
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
