"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, CheckCircle2, Clock3, Loader2, RefreshCw, Users, Video } from "lucide-react"
import { telemedicineApi } from "@/lib/api"
import { getTelemedicineProviderLabel } from "@/lib/telemedicine-providers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/hooks/use-toast"

type Period = "daily" | "weekly" | "monthly"

export function TelemedicineMetrics() {
  const [period, setPeriod] = useState<Period>("monthly")
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await telemedicineApi.getAnalytics(period)
        if (!cancelled) setData(result)
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
  }, [period, refreshKey])

  const maxSessions = useMemo(
    () => Math.max(1, ...(data?.timeSeries || []).map((row: any) => Number(row.sessionsHeld || 0))),
    [data]
  )

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{data?.branch?.branchName || "Selected facility"}</h2>
          <p className="text-sm text-muted-foreground">
            Sessions held are counted only after the consultation starts.
            {!data?.branch?.branchName
              ? " Select a facility in the header if totals look empty."
              : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="weekly">Last 7 days</SelectItem>
              <SelectItem value="monthly">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="sr-only">Refresh metrics</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions today</CardDescription>
            <CardTitle className="text-3xl">{overview.sessionsToday || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions this week</CardDescription>
            <CardTitle className="text-3xl">{overview.sessionsWeek || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sessions this month</CardDescription>
            <CardTitle className="text-3xl">{overview.sessionsMonth || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Video} label="Held in period" value={summary.sessionsHeld || 0} />
        <MetricCard icon={Users} label="Unique patients" value={summary.uniquePatients || 0} />
        <MetricCard icon={CheckCircle2} label="Completion rate" value={`${summary.completionRate || 0}%`} />
        <MetricCard icon={Clock3} label="Average duration" value={`${summary.averageMinutes || 0} min`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sessions held over time</CardTitle>
            <CardDescription>
              {summary.totalMinutes || 0} total consultation minutes · {summary.activeSessions || 0} active now ·{" "}
              {summary.notStartedSessions || 0} created but not started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 min-w-full items-end gap-1 overflow-x-auto border-b px-1 pt-4">
              {timeSeries.map((row: any) => {
                const height = Math.max(4, (Number(row.sessionsHeld || 0) / maxSessions) * 150)
                return (
                  <div
                    key={row.date}
                    className="group flex min-w-5 flex-1 flex-col items-center justify-end gap-1"
                    title={`${row.date}: ${row.sessionsHeld} session(s), ${row.uniquePatients} patient(s)`}
                  >
                    <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100">
                      {row.sessionsHeld}
                    </span>
                    <div className="w-full max-w-8 rounded-t bg-primary/80" style={{ height }} />
                    {(period !== "monthly" || Number(row.date.slice(-2)) % 5 === 0) && (
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
          <CardDescription>Teleconsultations handled during the selected period.</CardDescription>
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
                    No clinician activity in this period.
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
