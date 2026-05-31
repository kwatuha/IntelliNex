"use client"

import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { navigationCategories } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth/auth-context"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { filterNavigationCategories, filterSidebarItems } from "@/lib/role-menu-filter"
import * as LucideIcons from "lucide-react"
import { ArrowRight } from "lucide-react"

interface TopNavigationProps {
  onCategoryChange: (categoryId: string) => void
  activeCategory: string
}

export function TopNavigation({ onCategoryChange, activeCategory }: TopNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(user?.id)

  const handleCategoryClick = (categoryId: string) => {
    onCategoryChange(categoryId)

    // Navigate to the first item in the category
    const category = navigationCategories.find(cat => cat.id === categoryId)
    if (category && category.items.length > 0) {
      const allowedItems = menuLoading || !menuAccess
        ? category.items
        : filterSidebarItems(category.items, category.id, menuAccess)
      const firstAllowedItem = allowedItems[0]
      if (firstAllowedItem) {
        router.push(firstAllowedItem.href)
      }
    }
  }

  // User's landing quick links (e.g. Inpatient, Nursing Department)
  const quickLinks = (user?.landingConfig as any)?.quickLinks
  const hasQuickLinks = Array.isArray(quickLinks) && quickLinks.length > 0

  const isQuickLinkActive = (url: string) => {
    const path = url?.split("?")[0] || url
    return pathname === path || (path !== "/" && pathname.startsWith(path + "/"))
  }

  // Filter categories based on role access
  const allowedCategories = menuLoading || !menuAccess
    ? navigationCategories // Show all while loading or if no access data
    : filterNavigationCategories(navigationCategories, menuAccess)

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        {hasQuickLinks && (
          <div className="flex items-center gap-1 border-r border-border pr-4">
            {quickLinks.map((link: { label: string; url: string; icon?: string }, idx: number) => {
              const IconComponent = (LucideIcons as any)[link.icon || "ArrowRight"] || ArrowRight
              const active = isQuickLinkActive(link.url || "")
              return (
                <Link key={`quick-${idx}-${link.url}`} href={link.url || "#"}>
                  <Button
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <IconComponent className="h-4 w-4" />
                    <span>{link.label}</span>
                  </Button>
                </Link>
              )
            })}
          </div>
        )}
        <div className="flex items-center space-x-4">
          {allowedCategories.map((category) => {
            const Icon = category.icon
            const isActive = activeCategory === category.id

            return (
              <Button
                key={category.id}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                onClick={() => handleCategoryClick(category.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{category.title}</span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}