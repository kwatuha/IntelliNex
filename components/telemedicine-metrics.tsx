"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  RefreshCw,
  Users,
  Video,
} from "lucide-react"
import { pharmacyApi, telemedicineApi } from "@/lib/api"
import { useAuth } from "@/lib/auth/auth-context"
import { getTelemedicineProviderLabel } from "@/lib/telemedicine-providers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Period = "daily" | "weekly" | "monthly" | "custom"
type Scope = "branch" | "network"
type GenderFilter = "all" | "Male" | "Female" | "Other"

function todayYmd() {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function daysAgoYmd(days: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => {
    const s = String(cell ?? "")
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const body = rows.map((r) => r.map(escape).join(",")).join("\n")
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function TelemedicineMetrics() {
  const { user } = useAuth()
  const canNetwork =
    Boolean(user?.canAccessAllBranches) ||
    String(user?.role || "").toLowerCase().includes("admin")

  const [period, setPeriod] = useState<Period>("monthly")
  const [scope, setScope] = useState<Scope>(canNetwork ? "network" : "branch")
  const [fromDate, setFromDate] = useState(daysAgoYmd(29))
  const [toDate, setToDate] = useState(todayYmd())
  const [facilityFilter, setFacilityFilter] = useState<string>("all")
  const [gender, setGender] = useState<GenderFilter>("all")
  const [provider, setProvider] = useState<string>("all")
  const [includeNotStarted, setIncludeNotStarted] = useState(false)
  const [facilities, setFacilities] = useState<
    { branchId: number; branchName: string; branchCode?: string | null }[]
  >([])

  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canNetwork && scope === "network") setScope("branch")
  }, [canNetwork, scope])

  useEffect(() => {
    if (period === "daily") {
      setFromDate(todayYmd())
      setToDate(todayYmd())
    } else if (period === "weekly") {
      setFromDate(daysAgoYmd(6))
      setToDate(todayYmd())
    } else if (period === "monthly") {
      setFromDate(daysAgoYmd(29))
      setToDate(todayYmd())
    }
  }, [period])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await pharmacyApi.getBranches(undefined, "true")
        if (cancelled) return
        setFacilities(
          (Array.isArray(rows) ? rows : []).map((b: any) => ({
            branchId: Number(b.branchId),
            branchName: b.branchName,
            branchCode: b.branchCode,
          }))
        )
      } catch {
        /* availableFacilities from analytics response is a fallback */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const effectiveScope: Scope = canNetwork ? scope : "branch"
        const facilityIds =
          canNetwork && effectiveScope === "network" && facilityFilter !== "all"
            ? [Number(facilityFilter)]
            : undefined

        const result = await telemedicineApi.getAnalytics(period, {
          scope: effectiveScope,
          from: fromDate,
          to: toDate,
          facilityIds,
          includeNotStarted,
          gender,
          provider: provider === "all" ? undefined : provider,
        })
        if (!cancelled) {
          setData(result)
          if (Array.isArray(result?.availableFacilities) && result.availableFacilities.length) {
            setFacilities((prev) => (prev.length ? prev : result.availableFacilities))
          }
        }
      } catch (err: any) {
        const message = err?.message || "Request failed"
        if (!cancelled) {
          setError(message)
          toast({
            title: "Could not load telemedicine metrics",
            description: message,
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    period,
    scope,
    fromDate,
    toDate,
    facilityFilter,
    gender,
    provider,
    includeNotStarted,
    refreshKey,
    canNetwork,
  ])

  const chartMetric = includeNotStarted ? "sessionsBooked" : "sessionsHeld"
  const maxSessions = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.timeSeries || []).map((row: any) => Number(row[chartMetric] || row.sessionsHeld || 0))
      ),
    [data, chartMetric]
  )

  const providerOptions = useMemo(() => {
    const fromData = (data?.byProvider || []).map((p: any) => String(p.provider)).filter(Boolean)
    return Array.from(new Set(fromData))
  }, [data])

  const exportFacilityCsv = () => {
    const rows = [
      [
        "Facility",
        "Code",
        "Sessions held",
        "Sessions booked",
        "Patients",
        "Male",
        "Female",
        "Other",
      ],
      ...(data?.byFacility || []).map((row: any) => [
        row.branchName,
        row.branchCode || "",
        String(row.sessionsHeld ?? 0),
        String(row.sessionsBooked ?? 0),
        String(row.uniquePatients ?? 0),
        String(row.malePatients ?? 0),
        String(row.femalePatients ?? 0),
        String(row.otherPatients ?? 0),
      ]),
    ]
    downloadCsv(
      `telemedicine-by-facility_${data?.from || fromDate}_${data?.to || toDate}.csv`,
      rows
    )
  }

  if (loading && !data && !error) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Could not load telemedicine metrics</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const overview = data?.overview || {}
  const summary = data?.summary || {}
  const timeSeries = data?.timeSeries || []
  const providers = data?.byProvider || []
  const clinicians = data?.byClinician || []
  const byGender = data?.byGender || { Male: 0, Female: 0, Other: 0 }
  const byFacility = data?.byFacility || []
  const title =
    data?.branch?.branchName ||
    (scope === "network" ? "All facilities" : "Selected facility")
  const patientModeLabel = includeNotStarted
    ? "Patients from booked sessions (includes not started)"
    : "Patients from held sessions only (consultation started)"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {data?.from && data?.to ? `${data.from} → ${data.to}` : null}
            {data?.from && data?.to ? " · " : null}
            {patientModeLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportFacilityCsv} disabled={!byFacility.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={loading}
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="sr-only">Refresh metrics</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow the analysis by period, facility, sex, and platform.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {canNetwork ? (
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select value={scope} onValueChange={(value) => setScope(value as Scope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="network">All facilities</SelectItem>
                    <SelectItem value="branch">Header facility only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select
                value={period}
                onValueChange={(value) => setPeriod(value as Period)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Today</SelectItem>
                  <SelectItem value="weekly">Last 7 days</SelectItem>
                  <SelectItem value="monthly">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>From</Label>
              <Input
                type="date"
                value={fromDate}
                disabled={period !== "custom"}
                onChange={(e) => {
                  setPeriod("custom")
                  setFromDate(e.target.value)
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                type="date"
                value={toDate}
                disabled={period !== "custom"}
                onChange={(e) => {
                  setPeriod("custom")
                  setToDate(e.target.value)
                }}
              />
            </div>

            {canNetwork && scope === "network" ? (
              <div className="space-y-1.5">
                <Label>Facility</Label>
                <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All facilities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All facilities</SelectItem>
                    {(facilities.length
                      ? facilities
                      : data?.availableFacilities || []
                    ).map((f: any) => (
                      <SelectItem key={f.branchId} value={String(f.branchId)}>
                        {f.branchName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Sex</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as GenderFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other / unspecified</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {providerOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {getTelemedicineProviderLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Include booked but not started</p>
              <p className="text-xs text-muted-foreground">
                When on, patient and facility counts include scheduled sessions that never started.
                “Sessions held” still means a consultation began.
              </p>
            </div>
            <Switch checked={includeNotStarted} onCheckedChange={setIncludeNotStarted} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions today (held)</CardDescription>
            <CardTitle className="text-3xl">{overview.sessionsToday || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions this week (held)</CardDescription>
            <CardTitle className="text-3xl">{overview.sessionsWeek || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions this month (held)</CardDescription>
            <CardTitle className="text-3xl">{overview.sessionsMonth || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Video} label="Held in range" value={summary.sessionsHeld || 0} />
        <MetricCard icon={Activity} label="Booked in range" value={summary.sessionsBooked || 0} />
        <MetricCard
          icon={Users}
          label={includeNotStarted ? "Unique patients (booked)" : "Unique patients (held)"}
          value={summary.uniquePatients || 0}
        />
        <MetricCard icon={CheckCircle2} label="Completion rate" value={`${summary.completionRate || 0}%`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Clock3} label="Average duration" value={`${summary.averageMinutes || 0} min`} />
        <MetricCard icon={Clock3} label="Total minutes" value={summary.totalMinutes || 0} />
        <MetricCard icon={Activity} label="Active now" value={summary.activeSessions || 0} />
        <MetricCard icon={Video} label="Not started (in range)" value={summary.notStartedSessions || 0} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Users} label="Male patients" value={byGender.Male || 0} />
        <MetricCard icon={Users} label="Female patients" value={byGender.Female || 0} />
        <MetricCard icon={Users} label="Other / unspecified" value={byGender.Other || 0} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Patients by facility
            </CardTitle>
            <CardDescription>
              {patientModeLabel}
              {gender !== "all" ? ` · Sex filter: ${gender}` : null}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facility</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Patients</TableHead>
                <TableHead className="text-right">Male</TableHead>
                <TableHead className="text-right">Female</TableHead>
                <TableHead className="text-right">Other</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byFacility.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No facility activity for these filters.
                  </TableCell>
                </TableRow>
              ) : (
                byFacility.map((row: any) => (
                  <TableRow key={row.branchId}>
                    <TableCell className="font-medium">
                      {row.branchName}
                      {row.branchCode ? (
                        <span className="ml-2 text-xs text-muted-foreground">{row.branchCode}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{row.sessionsHeld}</TableCell>
                    <TableCell className="text-right">{row.sessionsBooked ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.uniquePatients}</TableCell>
                    <TableCell className="text-right">{row.malePatients}</TableCell>
                    <TableCell className="text-right">{row.femalePatients}</TableCell>
                    <TableCell className="text-right">{row.otherPatients ?? 0}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {includeNotStarted ? "Sessions booked over time" : "Sessions held over time"}
            </CardTitle>
            <CardDescription>
              {summary.totalMinutes || 0} total consultation minutes · {summary.activeSessions || 0}{" "}
              active now · {summary.notStartedSessions || 0} created but not started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 min-w-full items-end gap-1 overflow-x-auto border-b px-1 pt-4">
              {timeSeries.map((row: any) => {
                const value = Number(row[chartMetric] ?? row.sessionsHeld ?? 0)
                const height = Math.max(4, (value / maxSessions) * 150)
                return (
                  <div
                    key={row.date}
                    className="group flex min-w-5 flex-1 flex-col items-center justify-end gap-1"
                    title={`${row.date}: held ${row.sessionsHeld}, booked ${row.sessionsBooked ?? 0}`}
                  >
                    <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100">
                      {value}
                    </span>
                    <div
                      className={cn(
                        "w-full max-w-8 rounded-t",
                        includeNotStarted ? "bg-amber-500/80" : "bg-primary/80"
                      )}
                      style={{ height }}
                    />
                    {(timeSeries.length <= 14 || Number(row.date.slice(-2)) % 5 === 0) && (
                      <span className="whitespace-nowrap text-[9px] text-muted-foreground">
                        {new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platforms used</CardTitle>
            <CardDescription>Held sessions only</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No held sessions in this period.</p>
            ) : (
              providers.map((row: any) => (
                <div key={row.provider} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{getTelemedicineProviderLabel(row.provider)}</span>
                  <span className="font-semibold">{row.sessionsHeld}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clinician activity</CardTitle>
          <CardDescription>Teleconsultations in the selected filters.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinician</TableHead>
                <TableHead className="text-right">Sessions held</TableHead>
                <TableHead className="text-right">Unique patients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinicians.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No clinician activity for these filters.
                  </TableCell>
                </TableRow>
              ) : (
                clinicians.map((row: any) => (
                  <TableRow key={row.doctorId}>
                    <TableCell className="font-medium">{row.clinicianName}</TableCell>
                    <TableCell className="text-right">{row.sessionsHeld}</TableCell>
                    <TableCell className="text-right">{row.uniquePatients}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity
  label: string
  value: number | string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
