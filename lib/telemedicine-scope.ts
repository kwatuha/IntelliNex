/**
 * Telemedicine POC — scoped-down modules registry.
 *
 * When NEXT_PUBLIC_EXPERIENCE_PACK=telemedicine, modules with status `scoped_down`
 * are hidden from navigation. To restore a module later: set its status to `active`
 * (or remove it from this list) and rebuild the frontend image.
 *
 * Role menu SQL (70_telemedicine_showcase_pack.sql) mirrors this allow-list for
 * defense in depth; this registry is the product source of truth for the POC.
 */

import type { NavigationCategory, NavigationItem } from "./navigation"

export type ScopeStatus = "scoped_down" | "active"

export type ScopedModule = {
  id: string
  label: string
  status: ScopeStatus
  /** Hide this top-level nav category when scoped_down */
  categoryId?: string
  /** Exact menu hrefs to hide (app paths without /hmis prefix) */
  paths?: string[]
  /** Why it was scoped for the POC */
  reason: string
}

/**
 * Modules intentionally deferred for the telemedicine showcase.
 * Flip `status` to `"active"` to bring a module back in a later POC iteration.
 */
export const TELEMEDICINE_SCOPED_MODULES: ScopedModule[] = [
  {
    id: "procurement",
    label: "Procurement & Inventory",
    status: "scoped_down",
    categoryId: "procurement",
    reason: "Not part of telemedicine POC surface; restore when inventory workflows are demoed.",
  },
  {
    id: "finance",
    label: "Financial Management",
    status: "scoped_down",
    categoryId: "financial",
    reason: "Finance / billing / insurance deferred for telemedicine-first demo.",
  },
  {
    id: "hr-employees",
    label: "Employee Management",
    status: "scoped_down",
    paths: ["/hr/employees"],
    reason: "HR admin not needed for telemedicine clinician showcase.",
  },
  {
    id: "chemist-referrals",
    label: "Chemist Referrals",
    status: "scoped_down",
    paths: ["/chemist/referrals"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "chemist-drugs",
    label: "Chemist Drug Availability",
    status: "scoped_down",
    paths: ["/chemist/drugs"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "chemist-stock-requests",
    label: "Chemist Stock Requests",
    status: "scoped_down",
    paths: ["/chemist/stock-requests"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "chemist-labs",
    label: "Chemist Labs",
    status: "scoped_down",
    paths: ["/chemist/labs"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "chemist-history",
    label: "Chemist Pickup History",
    status: "scoped_down",
    paths: ["/chemist/history"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "chemist-profile",
    label: "Chemist Profile",
    status: "scoped_down",
    paths: ["/chemist/profile"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "chemist-users",
    label: "Chemist Users",
    status: "scoped_down",
    paths: ["/chemist/users"],
    reason: "External chemist portal deferred.",
  },
  {
    id: "radiology",
    label: "Radiology",
    status: "scoped_down",
    paths: ["/radiology"],
    reason: "In-facility imaging deferred for remote-care POC.",
  },
  {
    id: "laboratory",
    label: "Laboratory",
    status: "scoped_down",
    paths: ["/laboratory"],
    reason: "In-facility lab deferred for remote-care POC.",
  },
  {
    id: "inpatient",
    label: "Inpatient",
    status: "scoped_down",
    paths: ["/inpatient"],
    reason: "Ward management out of telemedicine POC scope.",
  },
  {
    id: "maternity",
    label: "Maternity",
    status: "scoped_down",
    paths: ["/maternity"],
    reason: "Ward management out of telemedicine POC scope.",
  },
  {
    id: "icu",
    label: "ICU",
    status: "scoped_down",
    paths: ["/icu"],
    reason: "Ward management out of telemedicine POC scope.",
  },
  {
    id: "ambulance",
    label: "Ambulance",
    status: "scoped_down",
    paths: ["/ambulance"],
    reason: "Emergency transport out of telemedicine POC scope.",
  },
]

export function isTelemedicineExperiencePack(): boolean {
  return (process.env.NEXT_PUBLIC_EXPERIENCE_PACK || "").toLowerCase() === "telemedicine"
}

export function getScopedDownCategoryIds(): Set<string> {
  return new Set(
    TELEMEDICINE_SCOPED_MODULES.filter((m) => m.status === "scoped_down" && m.categoryId).map(
      (m) => m.categoryId as string
    )
  )
}

export function getScopedDownPaths(): Set<string> {
  const paths = new Set<string>()
  for (const m of TELEMEDICINE_SCOPED_MODULES) {
    if (m.status !== "scoped_down" || !m.paths) continue
    for (const p of m.paths) paths.add(p)
  }
  return paths
}

/** Apply POC scope-down on top of role-filtered categories. No-op unless experience pack is telemedicine. */
export function applyTelemedicineScopeToCategories(
  categories: NavigationCategory[]
): NavigationCategory[] {
  if (!isTelemedicineExperiencePack()) return categories
  const hiddenCategories = getScopedDownCategoryIds()
  const hiddenPaths = getScopedDownPaths()
  return categories
    .filter((c) => !hiddenCategories.has(c.id))
    .map((c) => ({
      ...c,
      items: c.items.filter((item) => !hiddenPaths.has(item.href)),
    }))
    .filter((c) => c.items.length > 0)
}

/** Apply POC scope-down to sidebar / category link items. */
export function applyTelemedicineScopeToItems(items: NavigationItem[]): NavigationItem[] {
  if (!isTelemedicineExperiencePack()) return items
  const hiddenPaths = getScopedDownPaths()
  return items.filter((item) => !hiddenPaths.has(item.href))
}

/** True if a path is currently scoped down for the telemedicine pack. */
export function isPathScopedDown(pathname: string): boolean {
  if (!isTelemedicineExperiencePack()) return false
  const normalized = pathname.replace(/^\/hmis/, "") || "/"
  const hiddenCategories = getScopedDownCategoryIds()
  if (hiddenCategories.has("procurement") && normalized.startsWith("/procurement")) return true
  if (hiddenCategories.has("procurement") && normalized.startsWith("/inventory")) return true
  if (hiddenCategories.has("financial") && (
    normalized.startsWith("/finance") ||
    normalized.startsWith("/billing") ||
    normalized.startsWith("/insurance")
  )) return true
  for (const p of getScopedDownPaths()) {
    if (normalized === p || normalized.startsWith(p + "/")) return true
  }
  return false
}
