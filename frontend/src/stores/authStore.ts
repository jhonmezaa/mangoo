import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authService } from '../services/auth'

interface AuthState {
  isAuthenticated: boolean
  user: any | null
  setAuth: (user: any) => void
  clearAuth: () => void
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,

      setAuth: (user) => set({ isAuthenticated: true, user }),

      clearAuth: () => set({ isAuthenticated: false, user: null }),

      signIn: async (username: string, password: string) => {
        const tokens = await authService.signIn(username, password)
        // After login, you might want to fetch user info from your API
        set({ isAuthenticated: true, user: { username } })
      },

      signOut: () => {
        authService.signOut()
        set({ isAuthenticated: false, user: null })
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)
