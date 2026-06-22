import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdminUser {
  id: number
  username: string
  email: string
  isSuperAdmin: boolean
}

interface AuthState {
  token: string | null
  admin: AdminUser | null
  login: (token: string, admin: AdminUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      login:  (token, admin) => set({ token, admin }),
      logout: () => set({ token: null, admin: null }),
    }),
    { name: 'ccride-admin-auth' },
  ),
)
