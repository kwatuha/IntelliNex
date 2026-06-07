"use client"

import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, LogOut, Building2 } from "lucide-react"
import { BreadcrumbsEnhanced } from "@/components/breadcrumbs-enhanced"
import { CriticalAlertsHeaderBadge } from "@/components/critical-alerts-header-badge"
import { memo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"

export const Header = memo(function Header() {
  const router = useRouter()
  const { currentBranch, accessibleBranches, setCurrentBranch } = useAuth()
  const canSwitchBranch = accessibleBranches.length > 1

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <BreadcrumbsEnhanced />
        <div className="relative hidden lg:flex ml-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search..." className="w-64 rounded-full bg-background pl-8" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {currentBranch && (
          <div className="hidden items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm md:flex">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {canSwitchBranch ? (
              <select
                className="bg-transparent text-sm font-medium outline-none"
                value={String(currentBranch.branchId)}
                onChange={(event) => setCurrentBranch(event.target.value)}
                aria-label="Current branch"
              >
                {accessibleBranches.map((branch) => (
                  <option key={branch.branchId} value={branch.branchId}>
                    {branch.branchName}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium">{currentBranch.branchName}</span>
            )}
          </div>
        )}
        <CriticalAlertsHeaderBadge />
        <ModeToggle />
        
        {/* Logout Button - More Visible */}
        <Button 
          variant="destructive" 
          size="default"
          onClick={() => router.push("/logout")}
          className="gap-2 font-medium"
        >
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </Button>
      </div>
    </header>
  )
})
