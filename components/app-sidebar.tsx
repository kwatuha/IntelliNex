"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState, type ComponentType } from "react"
import {
  navigationCategories,
  CLINICAL_SIDEBAR_GROUP_ORDER,
  FINANCIAL_SIDEBAR_GROUP_ORDER,
  type NavigationItem,
} from "@/lib/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { filterSidebarItems } from "@/lib/role-menu-filter"
import * as LucideIcons from "lucide-react"
import {
  HelpCircle,
  ArrowRight,
  ChevronDown,
  Loader2,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarOverlay,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { ModeToggle } from "./mode-toggle"
import { HospitalLogoImage } from "./hospital-logo-image"
import { memo } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useChemistScope } from "@/lib/hooks/use-chemist-scope"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface AppSidebarProps {
  activeCategory: string
}

function partitionNavItems(items: NavigationItem[]) {
  const ungrouped: NavigationItem[] = []
  const byGroup = new Map<string, NavigationItem[]>()
  for (const item of items) {
    if (item.group) {
      if (!byGroup.has(item.group)) byGroup.set(item.group, [])
      byGroup.get(item.group)!.push(item)
    } else {
      ungrouped.push(item)
    }
  }
  return { ungrouped, byGroup }
}

function sortGroupKeys(keys: string[], categoryId: string): string[] {
  const orderByCategory: Record<string, readonly string[]> = {
    "clinical-services": CLINICAL_SIDEBAR_GROUP_ORDER,
    financial: FINANCIAL_SIDEBAR_GROUP_ORDER,
  }
  const order = (orderByCategory[categoryId] as unknown as string[]) || []
  const known = keys.filter((k) => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const unknown = keys.filter((k) => !order.includes(k)).sort()
  return [...known, ...unknown]
}

function pathMatchesItem(pathname: string, href: string) {
  if (pathname === href) return true
  if (href === "/" || href === "") return false
  return pathname.startsWith(`${href}/`)
}

function SidebarNavLink({
  href,
  title,
  icon: Icon,
  isActive,
  isCollapsed,
  className,
}: {
  href: string
  title: string
  icon: ComponentType<{ className?: string }>
  isActive: boolean
  isCollapsed: boolean
  className?: string
}) {
  const link = (
    <Link
      href={href}
      title={isCollapsed ? title : undefined}
      className={cn(
        "flex w-full items-center rounded-md text-sm font-medium transition-colors",
        "hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive ? "bg-white/20 text-white font-semibold" : "",
        isCollapsed ? "justify-center px-2 py-2.5" : "flex-row gap-2 px-3 py-2",
        className,
      )}
    >
      <Icon className={cn("flex-shrink-0", isCollapsed ? "h-5 w-5" : "h-4 w-4")} />
      {!isCollapsed && <span className="truncate">{title}</span>}
      {isCollapsed && <span className="sr-only">{title}</span>}
    </Link>
  )

  if (!isCollapsed) return link

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

// Memoize the sidebar to prevent unnecessary re-renders
export const AppSidebar = memo(function AppSidebar({ activeCategory }: AppSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { isCollapsed, isMobile, setMobileOpen, consumeSkipCloseOnNextNav } = useSidebar()
  const showCollapsed = !isMobile && isCollapsed
  // Phones: flat labeled list so Field app etc. aren't hidden inside closed groups
  const flatLabeledNav = isMobile || showCollapsed
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(user?.id)
  const { displayName: chemistDisplayName, loading: chemistLoading, isChemistUser } = useChemistScope()

  useEffect(() => {
    if (!isMobile) return
    if (consumeSkipCloseOnNextNav()) return
    setMobileOpen(false)
  }, [pathname, isMobile, setMobileOpen, consumeSkipCloseOnNextNav])

  // Get the current category
  const currentCategory = navigationCategories.find(cat => cat.id === activeCategory) || navigationCategories[0]

  // Filter sidebar items based on role access
  const allowedItems = menuLoading || !menuAccess
    ? currentCategory.items // Show all while loading or if no access data
    : filterSidebarItems(currentCategory.items, currentCategory.id, menuAccess)

  // User's landing quick links – shown in sidebar like standard nav for consistency
  const quickLinks = (user?.landingConfig as any)?.quickLinks
  const hasQuickLinks = Array.isArray(quickLinks) && quickLinks.length > 0

  const isQuickLinkActive = (url: string) => {
    const path = url?.split("?")[0] || url
    return pathname === path || (path !== "/" && pathname.startsWith(path + "/"))
  }

  const { ungrouped, byGroup } = useMemo(() => partitionNavItems(allowedItems), [allowedItems])
  const groupKeys = useMemo(
    () => sortGroupKeys([...byGroup.keys()], currentCategory.id),
    [byGroup, currentCategory.id],
  )
  const hasGroupedNav = groupKeys.length > 0

  const activeGroupKey = useMemo(
    () =>
      groupKeys.find((k) => (byGroup.get(k) || []).some((i) => pathMatchesItem(pathname, i.href))),
    [groupKeys, byGroup, pathname],
  )

  /**
   * User open/closed choice per group. Only keys the user toggled are set — use
   * hasOwnProperty so `false` is not treated as "unset" (fixes first group not closing).
   */
  const [groupOpenOverride, setGroupOpenOverride] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setGroupOpenOverride({})
  }, [currentCategory.id])

  const flattenedGroupedItems = useMemo(
    () => groupKeys.flatMap((k) => byGroup.get(k) || []),
    [groupKeys, byGroup],
  )

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarOverlay />
      <Sidebar style={{ backgroundColor: "#0f4c75" }} className="text-white">
        <SidebarHeader
          className={cn(
            "flex shrink-0 items-center justify-center border-b border-white/10",
            showCollapsed ? "px-2 py-4" : "px-3 py-5",
          )}
        >
          <Link
            href="/"
            className={cn(
              "flex w-full flex-col items-center justify-center text-center",
              showCollapsed && "gap-0",
            )}
            title="Home"
          >
            {showCollapsed ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15 text-sm font-bold tracking-tight text-white">
                IN
              </div>
            ) : isChemistUser ? (
              chemistLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-white/80" />
              ) : chemistDisplayName ? (
                <div className="space-y-1">
                  <div className="text-lg font-extrabold leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.45)]">
                    {chemistDisplayName}
                  </div>
                  <div className="text-xs font-medium text-white/80">External chemist portal</div>
                </div>
              ) : (
                <HospitalLogoImage variant="sidebar" className="w-full max-w-[min(100%,15rem)]" />
              )
            ) : (
              <HospitalLogoImage variant="sidebar" className="w-full max-w-[min(100%,15rem)]" />
            )}
          </Link>
        </SidebarHeader>
        <SidebarContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {hasQuickLinks && (
            <SidebarGroup className={cn(showCollapsed && "mb-2")}>
              {!showCollapsed && <SidebarGroupLabel className="text-white/70">My links</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {quickLinks.map((link: { label: string; url: string; icon?: string }, idx: number) => {
                    const IconComponent = (LucideIcons as any)[link.icon || "ArrowRight"] || ArrowRight
                    const active = isQuickLinkActive(link.url || "")
                    return (
                      <SidebarMenuItem key={`quick-${idx}-${link.url}`}>
                        <SidebarNavLink
                          href={link.url || "#"}
                          title={link.label}
                          icon={IconComponent}
                          isActive={active}
                          isCollapsed={showCollapsed}
                        />
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup className={cn(hasGroupedNav && !showCollapsed && "mb-2", showCollapsed && "mb-1")}>
            {!showCollapsed && (
              <SidebarGroupLabel className="text-white/70">{currentCategory.title}</SidebarGroupLabel>
            )}
            <SidebarGroupContent className="space-y-1">
              {ungrouped.length > 0 && (
                <SidebarMenu>
                  {ungrouped.map((item) => {
                    const Icon = item.icon
                    const isActive = pathMatchesItem(pathname, item.href)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarNavLink
                          href={item.href}
                          title={item.title}
                          icon={Icon}
                          isActive={isActive}
                          isCollapsed={showCollapsed}
                        />
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              )}
              {hasGroupedNav &&
                (flatLabeledNav ? (
                  <SidebarMenu>
                    {flattenedGroupedItems.map((item) => {
                      const Icon = item.icon
                      const isActive = pathMatchesItem(pathname, item.href)
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarNavLink
                            href={item.href}
                            title={item.title}
                            icon={Icon}
                            isActive={isActive}
                            isCollapsed={showCollapsed}
                          />
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                ) : (
                  groupKeys.map((groupName) => {
                    const items = byGroup.get(groupName) || []
                    const isActiveGroup = items.some((i) => pathMatchesItem(pathname, i.href))
                    const defaultOpenWhenIdle =
                      !activeGroupKey && groupKeys[0] === groupName
                    const hasUserOverride = Object.prototype.hasOwnProperty.call(
                      groupOpenOverride,
                      groupName,
                    )
                    // User toggle wins so groups (including the first / active route) can be collapsed to scroll less.
                    const open = hasUserOverride
                      ? groupOpenOverride[groupName]
                      : isActiveGroup
                        ? true
                        : defaultOpenWhenIdle
                    return (
                      <Collapsible
                        key={groupName}
                        open={open}
                        onOpenChange={(o) => {
                          setGroupOpenOverride((prev) => ({ ...prev, [groupName]: o }))
                        }}
                        className="group rounded-md border border-white/10 bg-white/5"
                      >
                        <CollapsibleTrigger
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-white/75",
                            "hover:bg-white/10 hover:text-white outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                          )}
                        >
                          <span className="truncate">{groupName}</span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden">
                          <SidebarMenu className="border-t border-white/10 px-1 py-1">
                            {items.map((item) => {
                              const Icon = item.icon
                              const isActive = pathMatchesItem(pathname, item.href)
                              return (
                                <SidebarMenuItem key={item.href}>
                                  <SidebarNavLink
                                    href={item.href}
                                    title={item.title}
                                    icon={Icon}
                                    isActive={isActive}
                                    isCollapsed={false}
                                    className="py-1.5 text-[13px] leading-snug"
                                  />
                                </SidebarMenuItem>
                              )
                            })}
                          </SidebarMenu>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })
                ))}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarNavLink
                href="/help"
                title="Help"
                icon={HelpCircle}
                isActive={pathname === "/help"}
                isCollapsed={showCollapsed}
              />
            </SidebarMenuItem>
          </SidebarMenu>
          {!showCollapsed && (
            <div className="p-4">
              <ModeToggle />
            </div>
          )}
        </SidebarFooter>
        <SidebarRail className="bg-white/10" />
      </Sidebar>
    </TooltipProvider>
  )
})
