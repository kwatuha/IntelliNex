"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { navigationCategories } from "@/lib/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { filterSidebarItems } from "@/lib/role-menu-filter"
import { applyTelemedicineScopeToItems } from "@/lib/telemedicine-scope"
import { useNavigation } from "@/lib/navigation-context"
import { cn } from "@/lib/utils"

/**
 * Compact link strip for phones/tablets: shows all sidebar items for the active
 * top-nav category so users can reach pages like Field app without hunting the drawer.
 */
export function CategoryLinksBar() {
  const pathname = usePathname()
  const { activeCategory } = useNavigation()
  const { user } = useAuth()
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(user?.id)

  const items = useMemo(() => {
    const category = navigationCategories.find((c) => c.id === activeCategory) || navigationCategories[0]
    const roleFiltered =
      menuLoading || !menuAccess
        ? category.items
        : filterSidebarItems(category.items, category.id, menuAccess)
    return applyTelemedicineScopeToItems(roleFiltered)
  }, [activeCategory, menuAccess, menuLoading])

  if (items.length === 0) return null

  return (
    <div className="border-b bg-muted/30 lg:hidden">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-none">
        <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Menu
        </span>
        {items.map((item) => {
          const Icon = item.icon
          const active =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.description || item.title}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-foreground hover:bg-accent border",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{item.title}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
