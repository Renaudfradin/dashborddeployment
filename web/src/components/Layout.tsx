import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-teal-700/40 text-teal-100' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-teal-400">Hébergement</div>
            <h1 className="text-xl font-semibold text-white">Dashboard déploiements</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Services
            </NavLink>
            <NavLink to="/connections" className={linkClass}>
              Connexions
            </NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>{user?.email}</span>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded border border-slate-700 px-2 py-1 hover:border-slate-500"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
