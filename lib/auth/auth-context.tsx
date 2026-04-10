"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { UserRole } from "./permissions"
import { AuthService, type User } from "./auth-service"

interface AuthContextType {
  user: User | null
  userRole: UserRole
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true) // Start with true to check auth on mount

  const userRole = user?.role || "registration"

  // Check for existing authentication on mount
  useEffect(() => {
    // Safety timeout: always set loading to false after 10 seconds max
    const safetyTimeout = setTimeout(() => {
      console.warn('Auth check timeout - forcing loading to false')
      setIsLoading(false)
    }, 10000)

    const checkAuth = async () => {
      // Always set loading to false on server-side
      if (typeof window === 'undefined') {
        clearTimeout(safetyTimeout)
        setIsLoading(false)
        return
      }

      // Check for JWT token in localStorage (check all possible token keys)
      const token = localStorage.getItem('token') || localStorage.getItem('jwt_token') || localStorage.getItem('auth_token')

      // If no token, immediately set loading to false (no async operations needed)
      if (!token) {
        clearTimeout(safetyTimeout)
        setIsLoading(false)
        setIsAuthenticated(false)
        return
      }

      // Verify token with backend (with timeout)
      // Use relative URL when NEXT_PUBLIC_API_URL is empty (works through nginx)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const verifyUrl = apiUrl ? `${apiUrl}/api/auth/verify` : '/api/auth/verify'

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          controller.abort()
        }, 5000) // 5 second timeout

        let response: Response | null = null
        try {
          response = await fetch(verifyUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            // Add credentials for CORS
            credentials: 'include',
          })
          clearTimeout(timeoutId)
        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          // If fetch fails (network error, timeout, CORS, etc.), try JWT decode fallback
          console.warn('API verify failed, using JWT decode fallback:', fetchError.message)
          throw new Error('Network error or timeout')
        }

        if (response && response.ok) {
          const data = await response.json()
          if (data.user) {
            // Normalize privileges - handle both array of strings and array of objects
            let privileges: Array<{ privilegeName: string; module?: string }> = []
            if (data.user.privileges) {
              if (Array.isArray(data.user.privileges)) {
                privileges = data.user.privileges.map((priv: any) => {
                  if (typeof priv === 'string') {
                    return { privilegeName: priv }
                  }
                  return { privilegeName: priv.privilegeName || priv, module: priv.module }
                })
              }
            }
            
            setUser({
              id: data.user.id?.toString() || data.user.userId?.toString() || '',
              username: data.user.username,
              role: data.user.role?.toLowerCase() || 'registration',
              name: `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
              email: data.user.email,
              department: data.user.department || '',
              privileges: privileges,
              dashboardCards: data.user.dashboardCards || null,
              landingConfig: data.user.landingConfig || null,
            })
            setIsAuthenticated(true)
            setIsLoading(false)
            return
          } else {
            // No user data in response, token invalid
            localStorage.removeItem('token')
            localStorage.removeItem('jwt_token')
            localStorage.removeItem('auth_token')
            setIsAuthenticated(false)
            setIsLoading(false)
            return
          }
        } else if (response) {
          // Token invalid (non-200 response)
          localStorage.removeItem('token')
          localStorage.removeItem('jwt_token')
          localStorage.removeItem('auth_token')
          setIsAuthenticated(false)
          setIsLoading(false)
          return
        }
      } catch (error: any) {
        // If verify endpoint fails (network error, timeout, etc.), try to decode JWT token as fallback
        try {
          // Simple JWT decode (without verification for now)
          const parts = token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]))
            if (payload.user && payload.exp && payload.exp * 1000 > Date.now()) {
              // Token not expired, use stored user data
              // Normalize privileges from JWT payload
              let privileges: Array<{ privilegeName: string; module?: string }> = []
              if (payload.user.privileges) {
                if (Array.isArray(payload.user.privileges)) {
                  privileges = payload.user.privileges.map((priv: any) => {
                    if (typeof priv === 'string') {
                      return { privilegeName: priv }
                    }
                    return { privilegeName: priv.privilegeName || priv, module: priv.module }
                  })
                }
              }
              
              setUser({
                id:
                  payload.user.id?.toString() ||
                  payload.user.userId?.toString() ||
                  '',
                username: payload.user.username,
                role: payload.user.roleName?.toLowerCase() || payload.user.role?.toLowerCase() || 'registration',
                name: `${payload.user.firstName || ''} ${payload.user.lastName || ''}`.trim(),
                email: payload.user.email,
                department: payload.user.department || '',
                privileges: privileges,
                dashboardCards: payload.user.dashboardCards || null,
                landingConfig: payload.user.landingConfig || null,
              })
              setIsAuthenticated(true)
              setIsLoading(false)
              return
            }
          }
        } catch (decodeError) {
          // Token decode failed, clear it
          console.warn('Token decode failed:', decodeError)
        }

        // If all verification methods fail, clear token and set unauthenticated
        localStorage.removeItem('token')
        localStorage.removeItem('jwt_token')
        localStorage.removeItem('auth_token')
        setIsAuthenticated(false)
      } finally {
        // Always ensure loading is set to false
        clearTimeout(safetyTimeout)
        setIsLoading(false)
      }
    }

    checkAuth()

    // Cleanup safety timeout on unmount
    return () => {
      clearTimeout(safetyTimeout)
    }
  }, [])

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true)

      // Try backend API login first
      try {
        // Use relative URL in browser, or public URL if set
        const apiUrl = typeof window !== 'undefined'
          ? (process.env.NEXT_PUBLIC_API_URL || '')
          : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
        const response = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        })

        if (response.ok) {
          const data = await response.json()
          // Store the JWT token from backend
          if (data.token) {
            localStorage.setItem('token', data.token)
            localStorage.setItem('jwt_token', data.token)
            // Also store user data
            if (data.user) {
            // Normalize privileges - handle both array of strings and array of objects
            let privileges: Array<{ privilegeName: string; module?: string }> = []
            if (data.user.privileges) {
              if (Array.isArray(data.user.privileges)) {
                privileges = data.user.privileges.map((priv: any) => {
                  if (typeof priv === 'string') {
                    return { privilegeName: priv }
                  }
                  return { privilegeName: priv.privilegeName || priv, module: priv.module }
                })
              }
            }
            
            setUser({
              id: data.user.id.toString(),
              username: data.user.username,
              role: data.user.role?.toLowerCase() || 'registration',
              name: `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim(),
              email: data.user.email,
              department: data.user.department || '',
              privileges: privileges,
              dashboardCards: data.user.dashboardCards || null,
              landingConfig: data.user.landingConfig || null,
            })
              setIsAuthenticated(true)
              return { success: true }
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({}))
          return { success: false, error: errorData.error || 'Invalid username or password' }
        }
      } catch (apiError) {
        const configuredApi = Boolean(
          (process.env.NEXT_PUBLIC_API_URL || '').trim(),
        )
        const isProdBuild = process.env.NODE_ENV === 'production'
        // Production builds with a configured API must not fall back to mock users — that
        // shows "wrong password" when the real failure is mixed content, CORS, or network.
        if (isProdBuild && configuredApi) {
          console.error('HMIS API login request failed:', apiError)
          return {
            success: false,
            error:
              'Cannot reach the HMIS API from this page. Check that NEXT_PUBLIC_API_URL matches where the API is reachable (e.g. http://YOUR_IP:3001 when using published ports). If the page is HTTPS but NEXT_PUBLIC_API_URL is http://, the browser blocks the request — use HTTPS for the API or same-origin proxy.',
          }
        }
        console.warn('Backend login failed, using mock auth:', apiError)
        const user = await AuthService.login({ username, password })

        if (user) {
          const token = AuthService.generateToken(user)
          localStorage.setItem('auth_token', token)
          setUser(user)
          setIsAuthenticated(true)
          return { success: true }
        } else {
          return { success: false, error: 'Invalid username or password' }
        }
      }

      return { success: false, error: 'Login failed. Please try again.' }
    } catch (error) {
      return { success: false, error: 'Login failed. Please try again.' }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('token')
    localStorage.removeItem('jwt_token')
    setUser(null)
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{
      user,
      userRole,
      isAuthenticated,
      isLoading,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
