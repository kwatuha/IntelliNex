"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { ConfigurableLanding } from "@/components/configurable-landing"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export function RoleBasedLanding() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [landingConfig, setLandingConfig] = useState<any>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)

  useEffect(() => {
    const roleName = String(user?.role || (user as any)?.roleName || "").toLowerCase()
    if (!isLoading && roleName === "chemist") {
      router.replace("/chemist/referrals")
    }
    if (!isLoading && (roleName === "telemedicine_clinician" || roleName === "telemedicine clinician")) {
      router.replace("/telemedicine")
    }
  }, [isLoading, router, user])
  
  // Use landing config from user object (set during login)
  // The landingConfig is fetched from the database and included in the JWT token
  useEffect(() => {
    if (!user) {
      if (!isLoading) {
        setLandingConfig(null) // Ensure config is cleared if no user
      }
      return
    }

    // First, try to use landingConfig from user object
    if (user.landingConfig) {
      setLandingConfig(user.landingConfig)
      setLoadingConfig(false)
      return
    }
    
    // If not in user object, try to fetch it from API using roleId or roleName
    // This is a fallback for users who logged in before the backend was updated
    const roleName = typeof user.role === 'string' ? user.role : (user as any)?.roleName || ''
    
    if (!roleName) {
      setLoadingConfig(false)
      setLandingConfig(null)
      return
    }

    setLoadingConfig(true)
    
    // Create AbortController for cleanup
    const abortController = new AbortController()
    let isMounted = true
    
    // Get API URL - use relative URL if NEXT_PUBLIC_API_URL is not set (works through nginx)
    const apiUrl = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_URL || '')
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001')
    
    // Try fetching by role name first
    fetch(`${apiUrl}/api/roles/${encodeURIComponent(roleName)}/landing-config`, {
      signal: abortController.signal
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        // Only update state if component is still mounted
        if (!isMounted) return
        
        if (data.landingPageType) {
          const transformedConfig = {
            type: data.landingPageType,
            label: data.landingPageLabel,
            url: data.landingPageUrl,
            icon: data.landingPageIcon,
            description: data.landingPageDescription,
            servicePoint: data.defaultServicePoint || null,
            quickLinks: Array.isArray(data.landingQuickLinks) ? data.landingQuickLinks : []
          }
          setLandingConfig(transformedConfig)
        } else {
          setLandingConfig(null)
        }
      })
      .catch(err => {
        // Ignore abort errors
        if (err.name === 'AbortError') {
          return
        }
        console.error('Error fetching landing config:', err)
        // Only update state if component is still mounted
        if (isMounted) {
          // If API fails, default to dashboard
          setLandingConfig(null)
        }
      })
      .finally(() => {
        // Only update state if component is still mounted
        if (isMounted) {
          setLoadingConfig(false)
        }
      })
    
    // Cleanup function
    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [user, isLoading])
  
  if (isLoading || loadingConfig) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading user configuration...</p>
        </div>
      </div>
    )
  }
  
  return <ConfigurableLanding landingConfig={landingConfig} />
}
