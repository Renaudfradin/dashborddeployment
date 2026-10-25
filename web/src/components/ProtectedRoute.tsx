import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, authHydrated } = useAuth()
  if (!authHydrated) {
    return <div className="px-4 py-10 text-sm text-slate-400">Chargement…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}
