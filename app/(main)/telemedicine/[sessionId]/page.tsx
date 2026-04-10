"use client"

import { TelemedicineSessionPanel } from "@/components/telemedicine-session-panel"
import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"

export default function TelemedicineSessionPage() {
  const sessionId = useResolvedRouteParam("sessionId", StaticRouteRegex.telemedicineSessionId)
  if (!sessionId) return null
  return <TelemedicineSessionPanel sessionId={sessionId} variant="page" />
}
