import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import api from '../services/api'
import type { FleetSummary } from '../types'
import { useAuth } from '../hooks/useAuth'

const links = [
  { to: '/', label: 'Overview', end: true, short: 'Ov' },
  { to: '/deployments', label: 'Deployments & Builds', short: 'De' },
  { to: '/logs', label: 'Live Logs & Terminal', short: 'Lo' },
  { to: '/secrets', label: 'Secrets & Environments', short: 'Se' },
  { to: '/services', label: 'Services', short: 'Sv' },
  { to: '/connectors', label: 'Connectors', short: 'Co' },
]

const Scope = createContext({ query: '', env: 'Production' })

export function useScope() {
  return useContext(Scope)
}

export default function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [fleet, setFleet] = useState<FleetSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [env, setEnv] = useState('Production')

  useEffect(() => {
    api
      .get('/api/telemetry/fleet')
      .then((res) => setFleet(res.data))
      .catch(() => setFleet(null))
  }, [])

  const operational = fleet && fleet.total ? `${fleet.healthy}/${fleet.total}` : '0/0'
  const providers = fleet?.providers?.length ? fleet.providers.map((item) => item.name) : []

  return (
    <div className="min-h-screen bg-[#07080c] text-[#e2e2e9]" style={{ backgroundImage: 'radial-gradient(#2a2c33 0.6px, transparent 0.6px)', backgroundSize: '14px 14px' }}>
      <div className="min-h-screen border border-[#8083ff]/40 bg-[#0c0e13] shadow-[0_0_0_1px_rgba(128,131,255,0.15)] md:m-2 md:min-h-[calc(100vh-16px)] md:rounded-md">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-[#1e2025] bg-[rgba(12,14,19,0.92)] px-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="rounded-sm border border-[#33353a] px-2 py-1 font-mono text-[11px] md:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
              Menu
            </button>
            <span className="font-mono text-[14px] font-semibold uppercase tracking-[-0.35px]">PulseOps</span>
            <span className="hidden h-4 w-px bg-[#464554] sm:block" />
            <span className="hidden items-center gap-1 rounded-sm bg-[#1a1b21] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.275px] text-[#4edea3] sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-[#4edea3]" />
              Operational ({operational})
            </span>
            <span className="hidden h-4 w-px bg-[#464554] lg:block" />
            <label className="hidden items-center gap-1 rounded-sm bg-[#1a1b21] px-1.5 py-1 font-mono text-[11px] uppercase tracking-[0.44px] text-[#c7c4d7] lg:flex">
              Env:
              <select value={env} onChange={(event) => setEnv(event.target.value)} className="bg-transparent text-[#e2e2e9] outline-none">
                <option>Production</option>
                <option>Preview</option>
                <option>Development</option>
              </select>
            </label>
            <span className="hidden h-4 w-px bg-[#464554] xl:block" />
            <div className="hidden items-center gap-1 xl:flex">
              {providers.slice(0, 3).map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-sm bg-[#1e2025] px-1 py-0.5 font-mono text-[11px] text-[#c7c4d7]">
                  <img src="/icons/dot.svg" alt="" width={10} height={10} />
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="hidden w-56 items-center gap-2 rounded-sm bg-[#1e2025] px-3 py-1.5 md:flex">
              <img src="/icons/search.svg" alt="" width={12} height={12} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find service, pod, log..."
                className="w-full bg-transparent font-mono text-[11px] tracking-[0.44px] text-[#c7c4d7] outline-none placeholder:text-[#c7c4d7]"
              />
              <span className="rounded-sm bg-[#0c0e13] px-1 font-mono text-[11px] text-[#c7c4d7]">⌘K</span>
            </label>
            <button type="button" onClick={() => navigate('/deployments')} className="inline-flex items-center gap-1 rounded-sm bg-[#8083ff] px-3 py-1.5 font-mono text-[12px] font-semibold tracking-[0.24px] text-[#0d0096]">
              <img src="/icons/deploy.svg" alt="" width={13} height={13} />
              <span className="hidden sm:inline">Deploy Service</span>
            </button>
            <button type="button" onClick={() => logout()} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c0c1ff]" title="Déconnexion">
              <img src="/icons/user.svg" alt="" width={12} height={12} />
            </button>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-56px)] md:min-h-[calc(100vh-72px)]">
          <aside className="sticky top-0 hidden h-[calc(100vh-72px)] w-60 shrink-0 flex-col justify-between bg-[#0c0e13] py-3 shadow-[1px_0_6px_rgba(0,0,0,0.5)] xl:flex">
            <div>
              <div className="px-3 pb-2 pt-1.5 font-mono text-[11px] uppercase tracking-[0.55px] text-[#908fa0]">Terminal mission control</div>
              <nav className="flex flex-col gap-0.5 px-1.5">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `rounded-sm px-3 py-2 font-mono ${isActive ? 'bg-[#1e2025] text-[16px] font-semibold leading-6 text-[#e2e2e9]' : 'text-[12px] leading-[18px] tracking-[0.12px] text-[#c7c4d7]'}`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="px-1.5 pb-1.5">
              <div className="rounded-sm bg-[#1a1b21] p-1.5">
                <div className="flex items-center justify-between font-mono text-[11px] text-[#c7c4d7]">
                  <span>CLUSTER: us-east-1</span>
                  <span className="text-[#4edea3]">{fleet?.uptime != null ? `${fleet.uptime}%` : '—'}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-sm bg-[#33353a]">
                  <div className="h-full bg-[#4edea3]" style={{ width: `${fleet?.uptime ?? 0}%` }} />
                </div>
              </div>
            </div>
          </aside>

          <aside className="sticky top-0 hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-[#1e2025] py-3 md:flex xl:hidden">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                title={link.label}
                className={({ isActive }) =>
                  `flex h-10 w-10 items-center justify-center rounded-sm font-mono text-[11px] ${isActive ? 'bg-[#1e2025] text-[#e2e2e9]' : 'text-[#c7c4d7]'}`
                }
              >
                {link.short}
              </NavLink>
            ))}
          </aside>

          <main className="min-w-0 flex-1 px-3 py-4 md:px-6">
            <Scope.Provider value={{ query, env }}>{children}</Scope.Provider>
          </main>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Fermer" onClick={() => setOpen(false)} />
          <nav className="relative h-full w-72 max-w-[80vw] bg-[#0c0e13] p-3">
            <div className="px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.55px] text-[#908fa0]">Terminal mission control</div>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `mb-0.5 block rounded-sm px-3 py-2 font-mono text-[12px] ${isActive ? 'bg-[#1e2025] text-[#e2e2e9]' : 'text-[#c7c4d7]'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
