"use client"

import { useNavigation } from "@/lib/navigation-context"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Header } from "@/components/header"
import { TopNavigation } from "@/components/top-navigation"
import { CategoryLinksBar } from "@/components/category-links-bar"
import { CriticalNotificationsProvider } from "@/lib/critical-notifications-context"
import { Toaster } from "@/components/ui/toaster"
import { TelemedicineFloatingProvider, useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { TelemedicineFloatingPanel } from "@/components/telemedicine-floating-panel"
import { TelemedicineScopeGuard } from "@/components/telemedicine-scope-guard"
import { cn } from "@/lib/utils"

interface MainLayoutContentProps {
  children: React.ReactNode
}

/**
 * While the telemedicine dock is open (not minimized), hide the fixed sidebar and drop left margin
 * so the encounter + video dock can use the full viewport width. Minimize or close telemedicine
 * to bring the sidebar back. On mobile the sidebar is off-canvas (no content offset). On desktop
 * margin follows collapsed (ml-16) vs expanded (ml-64) nav.
 */
function MainLayoutShell({ children }: { children: React.ReactNode }) {
  const { activeCategory, setActiveCategory } = useNavigation()
  const { sessionId, minimized } = useTelemedicineFloating()
  const { isCollapsed } = useSidebar()
  const telemedicineDockExpanded = Boolean(sessionId && !minimized)

  return (
    <div className="flex h-screen">
      {!telemedicineDockExpanded && <AppSidebar activeCategory={activeCategory} />}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out",
          // Mobile always full-width; desktop follows collapse via md: breakpoints
          telemedicineDockExpanded ? "ml-0" : isCollapsed ? "ml-0 md:ml-16" : "ml-0 md:ml-64",
        )}
      >
        <Header />
        <TopNavigation activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        <CategoryLinksBar />
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

export function MainLayoutContent({ children }: MainLayoutContentProps) {
  return (
    <TelemedicineFloatingProvider>
      <CriticalNotificationsProvider>
        <SidebarProvider>
          <TelemedicineScopeGuard />
          <MainLayoutShell>{children}</MainLayoutShell>
          <Toaster />
          <TelemedicineFloatingPanel />
        </SidebarProvider>
      </CriticalNotificationsProvider>
    </TelemedicineFloatingProvider>
  )
}