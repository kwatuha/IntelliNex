"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { patientApi } from "@/lib/api"
import { TelemedicineVitalsCharts } from "@/components/telemedicine-vitals-charts"

function unwrapList(raw: any): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object" && Array.isArray(raw.data)) return raw.data
  return []
}

/** BP / glucose / HbA1c trends on the patient profile (loads its own data). */
export function PatientVitalsTrendCharts({ patientId }: { patientId: string }) {
  const [vitals, setVitals] = useState<any[]>([])
  const [ncdFollowUps, setNcdFollowUps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!patientId) return
      setLoading(true)
      try {
        const [v, ncd] = await Promise.all([
          patientApi.getVitals(patientId).catch(() => []),
          patientApi.getNcd(patientId).catch(() => ({ conditions: [], followUps: [] })),
        ])
        if (cancelled) return
        setVitals(unwrapList(v).slice(0, 40))
        setNcdFollowUps(Array.isArray((ncd as any)?.followUps) ? (ncd as any).followUps : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [patientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border/60 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading vitals trends…
      </div>
    )
  }

  return (
    <TelemedicineVitalsCharts
      vitals={vitals}
      ncdFollowUps={ncdFollowUps}
      title="BP, glucose & HbA1c trends"
      wide
    />
  )
}
