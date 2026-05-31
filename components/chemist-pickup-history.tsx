"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle2, Loader2, Search } from "lucide-react"
import { pharmacyApi } from "@/lib/api"

type Referral = {
  referralId: number
  referralNumber: string
  prescriptionNumber: string
  status: string
  patientFirstName?: string
  patientLastName?: string
  patientNumber?: string
  patientPhone?: string
  pickupCode?: string
  pickedUpAt?: string
  completedAt?: string
  items?: any[]
}

export function ChemistPickupHistory() {
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const loadHistory = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await pharmacyApi.getExternalReferrals()
      setReferrals(data)
    } catch (err: any) {
      setError(err.message || "Failed to load pickup history")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const patientName = (referral: Referral) =>
    `${referral.patientFirstName || ""} ${referral.patientLastName || ""}`.trim() || "Unknown patient"

  const completedReferrals = useMemo(() => {
    const completedStatuses = new Set(["picked_up", "partially_picked", "not_picked", "cancelled"])
    const q = search.trim().toLowerCase()
    return referrals.filter((referral) => {
      if (!completedStatuses.has(referral.status)) return false
      const haystack = [
        referral.referralNumber,
        referral.prescriptionNumber,
        referral.patientNumber,
        referral.patientPhone,
        referral.pickupCode,
        patientName(referral),
        ...(referral.items || []).map((item) => item.medicationName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return !q || haystack.includes(q)
    })
  }, [referrals, search])

  const medicineSummary = (items?: any[]) =>
    (items || [])
      .map((item) => `${item.medicationName} (${item.quantityPicked || 0}/${item.quantityReferred || 1})`)
      .join(", ")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pickup History</h1>
        <p className="text-muted-foreground">Completed and closed referrals for patients sent to your chemist.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Patient Pickup Records
              </CardTitle>
              <CardDescription>Use this page for follow-up calls, audit checks, and pickup reconciliation.</CardDescription>
            </div>
            <Badge variant="secondary">{completedReferrals.length} record(s)</Badge>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search patient, pickup code, prescription, medicine..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Referral</TableHead>
                  <TableHead>Medicines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedReferrals.map((referral) => (
                  <TableRow key={referral.referralId}>
                    <TableCell>
                      <div className="font-medium">{patientName(referral)}</div>
                      <div className="text-xs text-muted-foreground">{referral.patientNumber || "-"} | {referral.patientPhone || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{referral.referralNumber}</div>
                      <div className="text-xs text-muted-foreground">{referral.prescriptionNumber} | {referral.pickupCode || "-"}</div>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      {medicineSummary(referral.items) || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={referral.status === "picked_up" ? "default" : "secondary"}>
                        {referral.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {referral.completedAt || referral.pickedUpAt
                        ? new Date(referral.completedAt || referral.pickedUpAt || "").toLocaleString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {completedReferrals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No completed pickup records match the current search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
