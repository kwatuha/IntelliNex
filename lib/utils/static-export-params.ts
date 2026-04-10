"use client"

import { useParams, usePathname } from "next/navigation"
import { useMemo } from "react"

/** Value generated for `output: 'export'` dynamic segments (see `generateStaticParams`). */
export const STATIC_EXPORT_PARAM_PLACEHOLDER = "__export_placeholder__"

/**
 * Regexes against `usePathname()` (includes `/hmis` basePath when configured).
 * Used when `useParams()` still returns the placeholder after a deep link / rewrite to placeholder HTML.
 */
export const StaticRouteRegex = {
  patientId: /\/patients\/([^/]+)/,
  appointmentId: /\/appointments\/([^/]+)/,
  doctorId: /\/doctors\/([^/]+)/,
  departmentSlug: /\/departments\/([^/]+)/,
  procurementOrderId: /\/procurement\/orders\/([^/]+)/,
  procurementVendorId: /\/procurement\/vendors\/([^/]+)/,
  assetVerifyId: /\/assets\/verify\/([^/]+)/,
  telemedicineSessionId: /\/telemedicine\/([^/]+)/,
} as const

/**
 * Resolve a dynamic `[param]` for static export + host rewrites to placeholder HTML.
 * Falls back to pathname parsing when `useParams()` is still the build placeholder.
 */
export function useResolvedRouteParam(paramName: string, pathRegex: RegExp): string {
  const params = useParams()
  const pathname = usePathname() || ""
  return useMemo(() => {
    const raw = params?.[paramName] as string | undefined
    if (raw && raw !== STATIC_EXPORT_PARAM_PLACEHOLDER) return raw
    const m = pathname.match(pathRegex)
    const fromPath = m?.[1]
    if (fromPath && fromPath !== STATIC_EXPORT_PARAM_PLACEHOLDER) return fromPath
    return raw || ""
  }, [params, pathname, paramName, pathRegex])
}
