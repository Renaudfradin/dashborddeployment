import { FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { apiError } from '../services/api'
import { fieldClass } from '../components/ui'

export default function LoginPage() {
  const { login, user, authHydrated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (authHydrated && user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(apiError(err, 'Connexion impossible'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <div className="mb-6">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-teal-400">Hébergement</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Dashboard déploiements</h1>
          <p className="mt-2 text-sm text-slate-400">Connectez-vous pour voir vos services déployés.</p>
        </div>
        {error && <div className="mb-4 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
        <label className="mb-3 block text-sm text-slate-300">
          Email
          <input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="mb-6 block text-sm text-slate-300">
          Mot de passe
          <input className={fieldClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit" disabled={loading} className="w-full rounded-md bg-teal-600 px-4 py-2 font-medium text-white hover:bg-teal-500 disabled:opacity-60">
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="mt-4 text-sm text-slate-400">
          Pas de compte ? <Link className="text-teal-300 hover:text-teal-200" to="/register">Créer un compte</Link>
        </p>
      </form>
    </div>
  )
}
