import axios from 'axios'
import { useAuthStore } from '../store/auth'

export const api = axios.create({
  baseURL: '/api',
  timeout: 15_000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// Typed helper — unwraps { Result, data } envelope
export async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get(path, { params })
  if (data.Result === 'false') throw new Error(data.ResponseMsg)
  return data.data as T
}

export async function post<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await api.post(path, body)
  if (data.Result === 'false') throw new Error(data.ResponseMsg)
  return data.data as T
}
