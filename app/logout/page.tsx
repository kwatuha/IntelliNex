"use client"

import { useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"

const AUTH_KEYS = ["auth_token", "token", "jwt_token", "current_branch_id"] as const

function clearAuthStorage() {
  try {
    for (const key of AUTH_KEYS) {
      localStorage.removeItem(key)
    }
  } catch {
    // ignore storage errors
  }
}

function loginHref() {
  // Static export uses basePath `/hmis`; hard navigate avoids soft-router races with AuthProvider.
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "/hmis").replace(/\/$/, "")
  return `${basePath}/login`
}

export default function LogoutPage() {
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    clearAuthStorage()
    // Immediate hard redirect — do not wait on AuthProvider verify / soft router.push
    window.location.replace(loginHref())
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className="text-gray-600">Logging out...</p>
      </div>
    </div>
  )
}
