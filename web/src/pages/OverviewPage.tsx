import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../services/api'
import type { ActivityEvent, FleetSummary } from '../types'
import { useScope } from '../components/Layout'
import { formatDate } from '../components/ui'

export default function OverviewPage() {
  const { query } = useScope()
  const [fleet, setFleet] = useState<FleetSummary | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/api/telemetry/fleet'), api.get('/api/telemetry/activity')])
      .then(([fleetRes, activityRes]) => {
        setFleet(fleetRes.data)
        setEvents(activityRes.data.events)
      })
      .catch((err) => setError(apiError(err, 'Flotte indisponible')))
      .finally(() => setLoading(false))
  }, [])

  const needle = query.trim().toLowerCase()
  const services = (fleet?.services || []).filter((item) => {
    if (!needle) return true
    return `${item.project.name} ${item.providerName} ${item.connectionLabel}`.toLowerCase().includes(needle)
  })
  const cells = (fleet?.cells || []).filter((cell) => !needle || cell.name.toLowerCase().includes(needle))

  return (
    <div className="space-y-4">
      {error && <div className="rounded-sm border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}
      {loading && <p className="font-mono text-xs text-[#908fa0]">Chargement de la flotte…</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active cluster" value={fleet ? `${fleet.healthy}/${fleet.total}` : '—'} hint="Nodes synced" />
        <Metric label="30-day uptime" value={fleet?.uptime != null ? `${fleet.uptime}%` : '—'} hint="Part de statuts sains" />
        <Metric label="Avg latency" value="—" hint="Non exposé par les hébergeurs" />
        <Metric label="Tethered stacks" value={fleet ? String(fleet.providers.length) : '—'} hint={`${fleet?.connectionCount ?? 0} connexions`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="pulse-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate-400">Active microservices</h2>
            <span className="font-mono text-[10px] text-slate-500">{services.length} online</span>
          </div>
          <div className="space-y-2">
            {services.length === 0 && !loading && (
              <p className="text-sm text-slate-500">Aucun service. Reliez un hébergeur dans Connectors.</p>
            )}
            {services.map((item) => (
              <Link
                key={`${item.connectionId}-${item.project.id}`}
                to="/services"
                className="grid gap-2 rounded-lg border border-line bg-ink/60 p-3 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.project.name}</div>
                  <div className="truncate font-mono text-[11px] text-slate-500">
                    {item.providerName} · {item.connectionLabel}
                    {item.project.region ? ` · ${item.project.region}` : ''}
                  </div>
                </div>
                <div className="font-mono text-[11px] text-secondary">{item.project.status || 'unknown'}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="pulse-card p-4">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate-400">Fleet health matrix</h2>
            <div className="mt-3 grid grid-cols-8 gap-1">
              {cells.length === 0 && <span className="col-span-8 font-mono text-[11px] text-slate-500">—</span>}
              {cells.map((cell) => (
                <span
                  key={cell.id}
                  title={`${cell.name} · ${cell.status || 'unknown'}`}
                  className={`aspect-square rounded-sm ${
                    cell.state === 'fault' ? 'bg-red-500' : cell.state === 'degraded' ? 'bg-tertiary' : 'bg-secondary'
                  }`}
                />
              ))}
            </div>
            <div className="mt-3 font-mono text-[10px] text-slate-500">
              {fleet?.healthy ?? 0} nominal · {fleet?.degraded ?? 0} fault
            </div>
          </div>
          <div className="pulse-card max-h-80 overflow-auto p-4 pulse-scroll">
            <h2 className="font-mono text-xs uppercase tracking-wider text-slate-400">Audit stream</h2>
            <ul className="mt-3 space-y-2">
              {events.length === 0 && <li className="font-mono text-[11px] text-slate-500">Aucun événement.</li>}
              {events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="border-b border-line/70 pb-2 font-mono text-[11px]">
                  <div className="text-slate-500">{formatDate(event.at)}</div>
                  <div className="text-slate-200">
                    [{event.kind}] {event.title}
                  </div>
                  <div className="text-slate-500">{event.detail}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-sm border border-[#1e2025] bg-[#12141a] p-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.44px] text-[#908fa0]">{label}</div>
      <div className="mt-2 font-mono text-[28px] font-medium leading-none text-[#e2e2e9]">{value}</div>
      <div className="mt-2 font-mono text-[11px] text-[#c7c4d7]">{hint}</div>
    </div>
  )
}
