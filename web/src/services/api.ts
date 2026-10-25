import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8024',
})

export function apiError(err: unknown, fallback: string) {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data
  return data?.error || fallback
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dd_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing: Promise<string | null> | null = null

async function refreshAccess(): Promise<string | null> {
  const refreshToken = localStorage.getItem('dd_refresh')
  if (!refreshToken) return null
  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/api/auth/refresh`, { refreshToken })
    localStorage.setItem('dd_token', data.token)
    localStorage.setItem('dd_refresh', data.refreshToken)
    return data.token as string
  } catch {
    localStorage.removeItem('dd_token')
    localStorage.removeItem('dd_refresh')
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const url = String(original?.url || '')
    const isAuth = url.includes('/api/auth/login') || url.includes('/api/auth/register') || url.includes('/api/auth/refresh')
    if (error.response?.status === 401 && original && !original._retry && !isAuth) {
      original._retry = true
      refreshing = refreshing || refreshAccess()
      const token = await refreshing
      refreshing = null
      if (!token) throw error
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    }
    throw error
  },
)

export default api
