"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { isPathScopedDown, isTelemedicineExperiencePack } from "@/lib/telemedicine-scope"

/**
 * Soft-blocks direct URLs to modules scoped down for the telemedicine POC.
 * Restore access by flipping status in lib/telemedicine-scope.ts (or disabling the pack).
 */
export function TelemedicineScopeGuard() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isTelemedicineExperiencePack()) return
    if (!isPathScopedDown(pathname)) return
    router.replace("/telemedicine")
  }, [pathname, router])

  return null
}
