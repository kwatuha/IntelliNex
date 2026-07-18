"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Building2, Users, ClipboardList, DollarSign, Pill, RefreshCw, FlaskConical, Video } from "lucide-react"
import { dashboardApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"

function money(n: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(
    Number(n) || 0
  )
}

export default function FacilityPerformancePage() {
  const [days, setDays] = useState("30")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    facilities: any[]
    totals: Record<string, number>
    generatedAt?: string
    days?: number
  } | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await dashboardApi.getFacilityPerformance({ days: Number(days) })
      setData(res)
    } catch (error: any) {
      toast({
        title: "Could not load facility performance",
        description: error.message || "Request failed",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const facilities = data?.facilities || []
  const totals = data?.totals || {}

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Facility Performance
          </h1>
          <p className="text-muted-foreground">
            Compare patient load, queues, telemedicine, clinical activity, revenue and pharmacy stock across hospital branches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Patients (period)
                </CardDescription>
                <CardTitle className="text-2xl">{totals.patientsPeriod ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Today: {totals.patientsToday ?? 0} · All time registered: {totals.patientsRegistered ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Video className="h-3.5 w-3.5" /> Telemedicine held
                </CardDescription>
                <CardTitle className="text-2xl">{totals.telemedicineSessionsPeriod ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Today {totals.telemedicineToday ?? 0} · Active {totals.telemedicineActive ?? 0} · Patients{" "}
                {totals.telemedicinePatientsPeriod ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5" /> Active queue
                </CardDescription>
                <CardTitle className="text-2xl">{totals.activeQueue ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Queue arrivals today: {totals.queueToday ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> Collected (period)
                </CardDescription>
                <CardTitle className="text-2xl">{money(totals.collectedPeriod || 0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Billed {money(totals.billedPeriod || 0)} · Outstanding {money(totals.outstandingBalance || 0)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <FlaskConical className="h-3.5 w-3.5" /> Clinical activity
                </CardDescription>
                <CardTitle className="text-2xl">{totals.encountersPeriod ?? 0}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Rx {totals.prescriptionsPeriod ?? 0} · Lab {totals.labOrdersPeriod ?? 0} · Stock units{" "}
                {totals.stockUnits ?? 0}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Performance by facility</CardTitle>
              <CardDescription>
                Period: last {data?.days || days} days
                {data?.generatedAt ? ` · Generated ${String(data.generatedAt).replace("T", " ").slice(0, 19)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Facility</TableHead>
                    <TableHead className="text-right">Patients</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">Queue</TableHead>
                    <TableHead className="text-right">Encounters</TableHead>
                    <TableHead className="text-right">Telemedicine</TableHead>
                    <TableHead className="text-right">Rx</TableHead>
                    <TableHead className="text-right">Lab</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Transfers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facilities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        No branch data yet. Seed demo data or register patients while a branch is selected.
                      </TableCell>
                    </TableRow>
                  ) : (
                    facilities.map((f) => (
                      <TableRow key={f.branchId}>
                        <TableCell>
                          <div className="font-medium">{f.branchName}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            {f.branchCode}
                            {f.isMainBranch ? <Badge variant="secondary">Main</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{f.patientsPeriod}</TableCell>
                        <TableCell className="text-right">{f.patientsToday}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">{f.activeQueue}</span>
                          <span className="text-xs text-muted-foreground"> / {f.queueToday} today</span>
                        </TableCell>
                        <TableCell className="text-right">{f.encountersPeriod}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">{f.telemedicineSessionsPeriod}</span>
                          <div className="text-xs text-muted-foreground">
                            {f.telemedicinePatientsPeriod} patients · {f.telemedicineAverageMinutes || 0} min avg
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{f.prescriptionsPeriod}</TableCell>
                        <TableCell className="text-right">{f.labOrdersPeriod}</TableCell>
                        <TableCell className="text-right">{money(f.collectedPeriod)}</TableCell>
                        <TableCell className="text-right">{money(f.outstandingBalance)}</TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1">
                            <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                            {f.stockUnits}
                          </span>
                          <div className="text-xs text-muted-foreground">{f.storeCount} store(s)</div>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          in {f.transfersIn} · out {f.transfersOut}
                          {f.transfersPending ? (
                            <div className="text-amber-700">{f.transfersPending} pending</div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </>
      )}
    </div>
  )
}
