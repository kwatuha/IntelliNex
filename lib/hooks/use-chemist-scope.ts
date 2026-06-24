"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { pharmacyApi } from "@/lib/api"

export function isChemistRole(user: { role?: string; roleName?: string } | null | undefined) {
  const roleName = String(user?.role || user?.roleName || "").toLowerCase()
  return roleName === "chemist" || roleName.includes("external_pharmacy") || roleName.includes("chemist")
}

export function useChemistScope() {
  const { user, isLoading: authLoading } = useAuth()
  const [chemist, setChemist] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const isChemistUser = useMemo(() => isChemistRole(user), [user])

  useEffect(() => {
    if (authLoading || !user || !isChemistUser) {
      setChemist(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    pharmacyApi
      .getCurrentChemist()
      .then((scope) => {
        if (!cancelled) setChemist(scope)
      })
      .catch(() => {
        if (!cancelled) setChemist(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authLoading, user, isChemistUser])

  const displayName = chemist?.chemistName || chemist?.chemistCode || null

  return { chemist, displayName, loading, isChemistUser }
}
