import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import api from '../services/api'
import type { AuthUser } from '../types'

type AuthState = {
  user: AuthUser | null
  authHydrated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function storeSession(data: { token: string; refreshToken: string; user: AuthUser }) {
  localStorage.setItem('dd_token', data.token)
  localStorage.setItem('dd_refresh', data.refreshToken)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authHydrated, setAuthHydrated] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('dd_token')
    const refresh = localStorage.getItem('dd_refresh')
    if (!token && !refresh) {
      setAuthHydrated(true)
      return
    }
    api
      .get('/api/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem('dd_token')
        localStorage.removeItem('dd_refresh')
      })
      .finally(() => setAuthHydrated(true))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    storeSession(data)
    setUser(data.user)
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { data } = await api.post('/api/auth/register', { email, password, name })
    storeSession(data)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('dd_refresh')
    try {
      await api.post('/api/auth/logout', { refreshToken })
    } catch {
      /* la session locale est effacée quand même */
    }
    localStorage.removeItem('dd_token')
    localStorage.removeItem('dd_refresh')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, authHydrated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth hors provider')
  return ctx
}
