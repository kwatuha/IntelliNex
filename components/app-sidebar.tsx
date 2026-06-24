"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
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
  Activity,
  Calendar,
  ClipboardList,
  FileText,
  Home,
  Pill,
  HelpCircle,
  Users,
  CreditCard,
  BarChart3,
  Building2,
  Stethoscope,
  BedDouble,
  Baby,
  HeartPulse,
  ShoppingCart,
  DollarSign,
  UserCog,
  Boxes,
  Receipt,
  Clipboard,
  FlaskConical,
  ImageIcon,
  Package,
  Grid,
  PlusCircle,
  Layers,
  ListOrdered,
  UserPlus,
  MapPin,
  ArrowRight,
  ChevronDown,
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
  SidebarRail,
} from "@/components/ui/sidebar"
import { ModeToggle } from "./mode-toggle"
import { HospitalLogoImage } from "./hospital-logo-image"
import { memo } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useChemistScope } from "@/lib/hooks/use-chemist-scope"
import { Loader2 } from "lucide-react"

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

// Memoize the sidebar to prevent unnecessary re-renders
export const AppSidebar = memo(function AppSidebar({ activeCategory }: AppSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(user?.id)
  const { displayName: chemistDisplayName, loading: chemistLoading, isChemistUser } = useChemistScope()

  // Get the current category
  const currentCategory = navigationCategories.find(cat => cat.id === activeCategory) || navigationCategories[0]

  // Filter sidebar items based on role access
  const allowedItems = menuLoading || !menuAccess
    ? currentCategory.items // Show all while loading or if no access data
    : filterSidebarItems(currentCategory.items, currentCategory.id, menuAccess)

  // User's landing quick links – shown in sidebar like standard nav for consistency
  const quickLinks = (user?.landingConfig as any)?.quickLinks
  const hasQuickLinks = Array.isArray(quickLinks) && quickLinks.length > 0

  const sidebarLinkClass = (isActive: boolean) =>
    `flex flex-row items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium
     transition-colors hover:bg-white/10 hover:text-white focus:bg-white/10
     focus:text-white focus:outline-none disabled:pointer-events-none disabled:opacity-50
     ${isActive ? "bg-white/20 text-white font-semibold" : ""}`

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

  return (
    <Sidebar style={{ backgroundColor: "#0f4c75" }} className="text-white">
      <SidebarHeader className="flex shrink-0 items-center justify-center border-b border-white/10 px-3 py-5">
        <Link href="/" className="flex w-full flex-col items-center justify-center text-center">
          {isChemistUser ? (
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
          <SidebarGroup>
            <SidebarGroupLabel className="text-white/70">My links</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {quickLinks.map((link: { label: string; url: string; icon?: string }, idx: number) => {
                  const IconComponent = (LucideIcons as any)[link.icon || "ArrowRight"] || ArrowRight
                  const active = isQuickLinkActive(link.url || "")
                  return (
                    <SidebarMenuItem key={`quick-${idx}-${link.url}`}>
                      <Link href={link.url || "#"} className={sidebarLinkClass(active)}>
                        <IconComponent className="h-4 w-4 flex-shrink-0" />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup className={cn(hasGroupedNav && "mb-2")}>
          <SidebarGroupLabel className="text-white/70">{currentCategory.title}</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-1">
            {ungrouped.length > 0 && (
              <SidebarMenu>
                {ungrouped.map((item) => {
                  const Icon = item.icon
                  const isActive = pathMatchesItem(pathname, item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <Link href={item.href} className={sidebarLinkClass(isActive)}>
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
            {hasGroupedNav &&
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
                              <Link
                                href={item.href}
                                className={cn(
                                  sidebarLinkClass(isActive),
                                  "py-1.5 text-[13px] leading-snug",
                                )}
                              >
                                <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
                                <span className="line-clamp-2">{item.title}</span>
                              </Link>
                            </SidebarMenuItem>
                          )
                        })}
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/help" className={sidebarLinkClass(pathname === "/help")}>
              <HelpCircle className="h-4 w-4 flex-shrink-0" />
              <span>Help</span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="p-4">
          <ModeToggle />
        </div>
      </SidebarFooter>
      <SidebarRail className="bg-white/10" />
    </Sidebar>
  )
})
