"use client"

import { PatientHistory } from "@/components/patient-history"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"

export default function PatientHistoryPage() {
  const patientId = useResolvedRouteParam("id", StaticRouteRegex.patientId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href={`/patients/${patientId}`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to patient profile</span>
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Patient Medical History</h1>
      </div>

      <PatientHistory patientId={patientId} />
    </div>
  )
}
