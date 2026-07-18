"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { ComprehensiveDashboard } from "@/components/comprehensive-dashboard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Activity, Home, ArrowRight } from "lucide-react"
import Link from "next/link"
import * as Icons from "lucide-react"
import { Header } from "@/components/header"
import { CriticalNotificationsProvider } from "@/lib/critical-notifications-context"
import { MainLayoutContent } from "@/components/main-layout-content"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { NavigationProvider } from "@/lib/navigation-context"

interface LandingQuickLink {
  label: string
  url: string
  icon?: string
}

interface ConfigurableLandingProps {
  landingConfig?: {
    type: 'dashboard' | 'app_view' | 'redirect'
    label: string | null
    url: string | null
    icon: string | null
    description: string | null
    servicePoint?: string | null
    quickLinks?: LandingQuickLink[]
  } | null
}

const LANDING_ENTERED_KEY = "landing_entered"

export function ConfigurableLanding({ landingConfig }: ConfigurableLandingProps) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [hasEnteredApp, setHasEnteredApp] = useState(false)
  // Only fetch menu access if user exists and has an id
  const userId = user?.id ? String(user.id) : undefined
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(userId)

  // Restore "entered" state from session so refresh keeps user in the app
  useEffect(() => {
    if (typeof window === "undefined") return
    setHasEnteredApp(sessionStorage.getItem(LANDING_ENTERED_KEY) === "1")
  }, [])

  // Full shell (top nav + sidebar):
  // - Legacy: no rows in role_menu_* → menuConfigPresent false → still use full shell.
  // - After Menu & Tab Access save: menuConfigPresent true; need ≥1 allowed category/item, else minimal shell.
  const hasTopMenuAccess =
    !!menuAccess &&
    (!menuAccess.menuConfigPresent ||
      (menuAccess.categories?.length ?? 0) > 0 ||
      (menuAccess.menuItems?.length ?? 0) > 0)

  // Normalize landing config early - handle both formats (before hooks that need it)
  // This needs to be computed before hooks, but we can safely use optional chaining
  let normalizedConfig = landingConfig || user?.landingConfig || null

  // If config has database format, transform it
  if (normalizedConfig && (normalizedConfig as any).landingPageType) {
    normalizedConfig = {
      type: (normalizedConfig as any).landingPageType || 'dashboard',
      label: (normalizedConfig as any).landingPageLabel || null,
      url: (normalizedConfig as any).landingPageUrl || null,
      icon: (normalizedConfig as any).landingPageIcon || 'Home',
      description: (normalizedConfig as any).landingPageDescription || null,
      servicePoint: (normalizedConfig as any).servicePoint || (normalizedConfig as any).defaultServicePoint || null,
      quickLinks: Array.isArray((normalizedConfig as any).quickLinks) ? (normalizedConfig as any).quickLinks : []
    }
  }

  // If no landing config, default to dashboard
  const config = normalizedConfig || {
    type: 'dashboard' as const,
    label: null,
    url: null,
    icon: 'Home',
    description: null,
    servicePoint: null,
    quickLinks: [] as LandingQuickLink[]
  }
  const quickLinks = Array.isArray((config as any).quickLinks) ? (config as any).quickLinks : []

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  // Handle redirect type - must be at top level (React hooks rule)
  useEffect(() => {
    if (config.type === 'redirect' && config.url) {
      router.replace(config.url)
    }
  }, [config.type, config.url, router])

  // Wait for auth and menu access so we don't flash a Header-only shell
  // (SidebarTrigger requires SidebarProvider when the full shell is shown).
  if (isLoading || menuLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  // Build the final URL - if it's a queue service URL and we have a service point, append it
  let finalUrl = config.url
  if (config.url && config.servicePoint && (config.url.includes('/queue/service') || config.url === '/queue/service')) {
    finalUrl = `${config.url}?servicePoint=${config.servicePoint}`
  }

  if (config.type === 'redirect' && config.url) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Handle app_view type - only show for users without top menu access
  // If user has top menu access but app_view is configured, ignore it and show normal dashboard
  if (config.type === 'app_view') {
    // If user has menu access, ignore app_view config and show normal dashboard
    if (hasTopMenuAccess && !menuLoading) {
      return (
        <NavigationProvider>
          <MainLayoutContent>
            <ComprehensiveDashboard />
          </MainLayoutContent>
        </NavigationProvider>
      )
    }

    // User has no menu access - show app view
    // Get icon component dynamically
    const IconComponent = (Icons as any)[config.icon || 'Activity'] || Activity

    // Quick links: show one button that opens the app; links live in sidebar/top bar
    if (quickLinks.length > 0) {
      const enterApp = () => {
        if (typeof window !== "undefined") sessionStorage.setItem(LANDING_ENTERED_KEY, "1")
        setHasEnteredApp(true)
      }

      if (hasEnteredApp) {
        return (
          <NavigationProvider>
            <MainLayoutContent>
              <ComprehensiveDashboard />
            </MainLayoutContent>
          </NavigationProvider>
        )
      }

      return (
        <CriticalNotificationsProvider>
          <div className="flex flex-col h-screen">
            <Header />
            <main className="flex-1 overflow-auto">
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
                <Card className="w-full max-w-md border-2 border-primary">
                  <CardHeader className="text-center">
                    <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconComponent className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">{config.label || "Open"}</CardTitle>
                    {config.description && (
                      <CardDescription>{config.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="lg" onClick={enterApp}>
                      Open
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-3">
                      Your links will appear in the menu and sidebar.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        </CriticalNotificationsProvider>
      )
    }

    // If URL is provided, show a single app card with header
    if (config.url) {
      return (
        <CriticalNotificationsProvider>
          <div className="flex flex-col h-screen">
            <Header />
            <main className="flex-1 overflow-auto">
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
                <Card className="w-full max-w-md border-2 border-primary">
                  <CardHeader className="text-center">
                    <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconComponent className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">{config.label || 'Service Point'}</CardTitle>
                    {config.description && (
                      <CardDescription>{config.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button asChild className="w-full" size="lg">
                      <Link href={finalUrl || config.url || '#'}>
                        Open {config.label || 'Service'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        </CriticalNotificationsProvider>
      )
    }

    // If no URL, show a message with header
    return (
      <CriticalNotificationsProvider>
        <div className="flex flex-col h-screen">
          <Header />
          <main className="flex-1 overflow-auto">
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
              <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <IconComponent className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle>{config.label || 'Welcome'}</CardTitle>
                  {config.description && (
                    <CardDescription>{config.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center">
                    Please configure a landing page URL for this role.
                  </p>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </CriticalNotificationsProvider>
    )
  }

  // Default: Show dashboard
  // If user has top menu access (like admins), use the normal layout with sidebar and top navigation
  // Otherwise, show simplified view with just header
  if (hasTopMenuAccess && !menuLoading) {
    // User has menu access - use normal layout (for admins, doctors, etc.)
    return (
      <NavigationProvider>
        <MainLayoutContent>
          <ComprehensiveDashboard />
        </MainLayoutContent>
      </NavigationProvider>
    )
  }

  // User has no menu access - show simplified dashboard with just header (for triage, etc.)
  return (
    <CriticalNotificationsProvider>
      <div className="flex flex-col h-screen">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <ComprehensiveDashboard />
        </main>
      </div>
    </CriticalNotificationsProvider>
  )
}
