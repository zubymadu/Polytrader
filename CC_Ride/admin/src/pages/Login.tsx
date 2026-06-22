import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/admin/auth/login', { username, password })
      if (data.Result === 'false') { setError(data.ResponseMsg); return }
      login(data.data.token, data.data.admin)
      navigate('/dashboard')
    } catch {
      setError('Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center shadow-lg mb-4">
            <Car className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">CC Ride</h1>
          <p className="text-gray-400 text-sm mt-1">Admin Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-8 space-y-5 shadow-2xl border border-gray-800">
          <h2 className="text-lg font-semibold text-white">Sign in</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
            <input
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-500"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-500"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
