"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns"
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react"
import { appointmentsApi } from "@/lib/api"
import { useAuth } from "@/lib/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { AddAppointmentForm } from "@/components/add-appointment-form"
import { ExpandableBookingCalendar } from "@/components/booking-month-calendar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type FacilityDay = { date: string; appointmentCount: number; patientCount: number }

type FacilityRow = {
  branchId: number
  branchCode?: string | null
  branchName: string
  days: FacilityDay[]
  totalAppointments: number
  totalPatients: number
}

type LimitRow = {
  limitId: number
  branchId: number
  limitDate: string | null
  maxAppointments: number
  source: "date" | "default"
  notes?: string | null
}

function toYmd(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function statusVariant(status: string | undefined): "default" | "secondary" | "outline" | "destructive" {
  if (status === "confirmed" || status === "in_progress") return "default"
  if (status === "cancelled" || status === "no_show") return "destructive"
  if (status === "completed") return "secondary"
  return "outline"
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—"
  const s = String(value)
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5)
  try {
    return format(parseISO(s), "HH:mm")
  } catch {
    return s
  }
}

function resolveLimitForDay(limits: LimitRow[], branchId: number, date: string): LimitRow | null {
  const dateLimit = limits.find((l) => l.branchId === branchId && l.limitDate === date)
  if (dateLimit) return dateLimit
  return limits.find((l) => l.branchId === branchId && l.limitDate == null) || null
}

export function TelemedicineProviderCalendar() {
  const { toast } = useToast()
  const { user, currentBranch, accessibleBranches } = useAuth()
  const role = String(user?.role || "").toLowerCase()
  const isNurseLike = role === "nurse" || role.includes("triage") || role.includes("reception")
  const isAdminLike = role === "admin" || role.includes("admin") || Boolean(user?.canAccessAllBranches)
  // Only nurses/reception get single-facility schedule; doctors/admins get multi-clinic board
  const preferFacilityScope = isNurseLike && !isAdminLike

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [dayTotals, setDayTotals] = useState<Array<{ date: string; appointmentCount: number }>>([])
  const [limits, setLimits] = useState<LimitRow[]>([])
  const [facilityScoped, setFacilityScoped] = useState(false)
  const [canManageLimits, setCanManageLimits] = useState(false)

  const [selectedFacility, setSelectedFacility] = useState<FacilityRow | null>(null)
  const [patientsLoading, setPatientsLoading] = useState(false)
  const [patients, setPatients] = useState<any[]>([])

  const [limitDialogOpen, setLimitDialogOpen] = useState(false)
  const [limitMode, setLimitMode] = useState<"date" | "default">("date")
  const [limitValue, setLimitValue] = useState("20")
  const [limitSaving, setLimitSaving] = useState(false)
  const [addAppointmentOpen, setAddAppointmentOpen] = useState(false)
  const [calendarExpandOpen, setCalendarExpandOpen] = useState(false)

  const selectedYmd = toYmd(selectedDate)
  const from = toYmd(startOfMonth(month))
  const to = toYmd(endOfMonth(month))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await appointmentsApi.getCalendar(from, to)
        if (cancelled) return
        setFacilities(res.facilities || [])
        setDayTotals(res.dayTotals || [])
        setLimits(res.limits || [])
        setFacilityScoped(Boolean(res.facilityScoped) && preferFacilityScope)
        setCanManageLimits(Boolean(res.canManageLimits))
        // Provider board: never keep a sticky single-clinic selection from a prior nurse session
        if (!(Boolean(res.facilityScoped) && preferFacilityScope)) {
          setSelectedFacility(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error(err)
          toast({
            title: "Could not load provider calendar",
            description: err?.message || "Failed to load facility bookings",
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
  }, [from, to, refreshKey, toast, preferFacilityScope])

  const homeFacility = useMemo(() => {
    if (facilities.length === 1) return facilities[0]
    if (currentBranch?.branchId) {
      return facilities.find((f) => Number(f.branchId) === Number(currentBranch.branchId)) || null
    }
    if (accessibleBranches[0]?.branchId) {
      return (
        facilities.find((f) => Number(f.branchId) === Number(accessibleBranches[0].branchId)) || null
      )
    }
    return facilities[0] || null
  }, [facilities, currentBranch, accessibleBranches])

  const scopedMode = preferFacilityScope && (facilityScoped || Boolean(homeFacility))
  const activeFacility = scopedMode ? homeFacility : selectedFacility

  useEffect(() => {
    if (scopedMode && homeFacility && !selectedFacility) {
      setSelectedFacility(homeFacility)
    }
    if (!scopedMode && selectedFacility && facilities.length > 1) {
      // keep drill-down selection
    }
  }, [scopedMode, homeFacility, selectedFacility, facilities.length])

  useEffect(() => {
    if (!activeFacility) {
      setPatients([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setPatientsLoading(true)
        const rows = await appointmentsApi.getAll(
          selectedYmd,
          undefined,
          undefined,
          undefined,
          1,
          200,
          activeFacility.branchId
        )
        if (cancelled) return
        const active = (rows || []).filter(
          (r) => r.status !== "cancelled" && r.status !== "no_show"
        )
        setPatients(active)
      } catch (err: any) {
        if (!cancelled) {
          console.error(err)
          toast({
            title: "Could not load patients",
            description: err?.message || "Failed to load clinic patient list",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setPatientsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeFacility, selectedYmd, refreshKey, toast])

  const countsByDate = useMemo(() => {
    const map = new Map<string, number>()
    // Nurse / single facility: that clinic's day counts; otherwise network totals
    if (scopedMode && homeFacility) {
      for (const d of homeFacility.days) {
        map.set(d.date, Number(d.appointmentCount) || 0)
      }
    } else {
      for (const d of dayTotals) {
        map.set(d.date, Number(d.appointmentCount) || 0)
      }
    }
    return map
  }, [dayTotals, homeFacility, scopedMode])

  const facilitiesForDay = useMemo(() => {
    return facilities
      .map((f) => {
        const day = f.days.find((d) => d.date === selectedYmd)
        return {
          ...f,
          appointmentCount: day?.appointmentCount || 0,
          patientCount: day?.patientCount || 0,
        }
      })
      .filter((f) => f.appointmentCount > 0)
      .sort((a, b) => b.appointmentCount - a.appointmentCount || a.branchName.localeCompare(b.branchName))
  }, [facilities, selectedYmd])

  const dayTotal = facilitiesForDay.reduce((sum, f) => sum + f.appointmentCount, 0)

  const activeDayCount =
    activeFacility?.days.find((d) => d.date === selectedYmd)?.appointmentCount || patients.length || 0
  const activeLimit = activeFacility
    ? resolveLimitForDay(limits, activeFacility.branchId, selectedYmd)
    : null
  const remaining =
    activeLimit?.maxAppointments != null
      ? Math.max(0, activeLimit.maxAppointments - activeDayCount)
      : null

  const openLimitDialog = (mode: "date" | "default") => {
    setLimitMode(mode)
    const existing =
      mode === "date"
        ? resolveLimitForDay(limits, activeFacility!.branchId, selectedYmd)
        : limits.find((l) => l.branchId === activeFacility!.branchId && l.limitDate == null)
    setLimitValue(String(existing?.maxAppointments || 20))
    setLimitDialogOpen(true)
  }

  const saveLimit = async () => {
    if (!activeFacility) return
    const maxAppointments = Number(limitValue)
    if (!Number.isFinite(maxAppointments) || maxAppointments < 1) {
      toast({
        title: "Invalid limit",
        description: "Enter a whole number of at least 1.",
        variant: "destructive",
      })
      return
    }
    try {
      setLimitSaving(true)
      await appointmentsApi.setLimit({
        branchId: activeFacility.branchId,
        maxAppointments,
        date: limitMode === "date" ? selectedYmd : null,
      })
      toast({
        title: "Booking limit saved",
        description:
          limitMode === "date"
            ? `Limit for ${format(selectedDate, "d MMM yyyy")}: ${maxAppointments}`
            : `Default daily limit: ${maxAppointments}`,
      })
      setLimitDialogOpen(false)
      setRefreshKey((n) => n + 1)
    } catch (err: any) {
      toast({
        title: "Could not save limit",
        description: err?.message || "Failed to update booking limit",
        variant: "destructive",
      })
    } finally {
      setLimitSaving(false)
    }
  }

  if (loading && facilities.length === 0) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const limitReached = remaining === 0 && activeLimit != null

  const addAppointmentButton = (
    <Button
      type="button"
      size="sm"
      disabled={limitReached}
      onClick={() => setAddAppointmentOpen(true)}
      title={limitReached ? "Daily booking limit reached" : undefined}
    >
      <Plus className="mr-2 h-4 w-4" />
      Add appointment
    </Button>
  )

  const appointmentForm = (
    <AddAppointmentForm
      open={addAppointmentOpen}
      onOpenChange={setAddAppointmentOpen}
      defaultDate={selectedYmd}
      defaultBranchId={activeFacility?.branchId ?? currentBranch?.branchId ?? null}
      onSuccess={() => setRefreshKey((n) => n + 1)}
    />
  )

  const patientTable = (
    <div className="rounded-md border overflow-x-auto bg-background/50">
      {patientsLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : patients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            No booked patients for this clinic on the selected day.
          </p>
          {addAppointmentButton}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((row) => {
              const name =
                `${row.patientFirstName || ""} ${row.patientLastName || ""}`.trim() || "—"
              const doctor =
                `${row.doctorFirstName || ""} ${row.doctorLastName || ""}`.trim() || "—"
              return (
                <TableRow key={row.appointmentId}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {formatTime(row.appointmentTime)}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{name}</p>
                    {row.patientNumber ? (
                      <p className="text-xs text-muted-foreground">{row.patientNumber}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{doctor}</TableCell>
                  <TableCell>{row.department || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>
                      {(row.status || "scheduled").replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={row.reason || ""}>
                    {row.reason || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {row.patientId ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/patients/${row.patientId}`}>Patient</Link>
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/appointments">Book / manage</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )

  const limitDialog = (
    <Dialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set booking limit</DialogTitle>
          <DialogDescription>
            {limitMode === "date"
              ? `Maximum appointments for ${activeFacility?.branchName || "this facility"} on ${format(selectedDate, "d MMMM yyyy")}.`
              : `Default daily maximum for ${activeFacility?.branchName || "this facility"} (used when no date override is set).`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="max-appointments">Max appointments</Label>
          <Input
            id="max-appointments"
            type="number"
            min={1}
            max={10000}
            value={limitValue}
            onChange={(e) => setLimitValue(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setLimitDialogOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={limitSaving} onClick={() => void saveLimit()}>
            {limitSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save limit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // Nurse / single-facility view
  if (scopedMode && homeFacility) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Facility booking calendar
            </h3>
            <p className="text-sm text-muted-foreground">
              {homeFacility.branchName} — your facility only. Set a daily booking cap as needed.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setRefreshKey((n) => n + 1)}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <ExpandableBookingCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selectedDate}
            onSelect={setSelectedDate}
            countsByDate={countsByDate}
            expandOpen={calendarExpandOpen}
            onExpandOpenChange={setCalendarExpandOpen}
            title={`${homeFacility.branchName} — booking calendar`}
            description="Each day shows how many appointments are booked. Click a day to view or add patients."
          />

          <div className="space-y-3">
            <div className="rounded-md border bg-background/50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{format(selectedDate, "EEEE, d MMMM yyyy")}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeDayCount} booked
                    {activeLimit
                      ? ` · limit ${activeLimit.maxAppointments} (${activeLimit.source === "date" ? "this day" : "default"})`
                      : " · no limit set"}
                    {remaining != null ? ` · ${remaining} remaining` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {addAppointmentButton}
                  {canManageLimits ? (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => openLimitDialog("date")}>
                        <Settings2 className="mr-2 h-4 w-4" />
                        Limit this day
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => openLimitDialog("default")}>
                        Default limit
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              {limitReached ? (
                <p className="mt-2 text-sm text-destructive">
                  Daily booking limit reached. Raise the limit or choose another day.
                </p>
              ) : null}
            </div>
            {patientTable}
          </div>
        </div>
        {limitDialog}
        {appointmentForm}
      </div>
    )
  }

  // Multi-facility provider / admin view
  if (selectedFacility && !scopedMode) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => setSelectedFacility(null)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to facilities
            </Button>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {selectedFacility.branchName}
              </h3>
              <p className="text-sm text-muted-foreground">
                Booked patients for{" "}
                <span className="font-medium text-foreground">
                  {format(selectedDate, "EEEE, d MMMM yyyy")}
                </span>
                {activeLimit
                  ? ` · ${activeDayCount}/${activeLimit.maxAppointments} (limit)`
                  : ` · ${activeDayCount} booked`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {addAppointmentButton}
            {canManageLimits ? (
              <Button type="button" size="sm" variant="outline" onClick={() => openLimitDialog("date")}>
                <Settings2 className="mr-2 h-4 w-4" />
                Set limit
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={patientsLoading}
              onClick={() => setRefreshKey((n) => n + 1)}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", patientsLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
        {patientTable}
        {limitDialog}
        {appointmentForm}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Provider calendar — all facilities
          </h3>
          <p className="text-sm text-muted-foreground">
            Select a day to see which clinics have bookings and how many. Click a clinic for that day’s patient list.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setRefreshKey((n) => n + 1)}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <ExpandableBookingCalendar
          month={month}
          onMonthChange={(d) => {
            setMonth(d)
            setSelectedFacility(null)
          }}
          selected={selectedDate}
          onSelect={(d) => {
            setSelectedDate(d)
            setSelectedFacility(null)
          }}
          countsByDate={countsByDate}
          expandOpen={calendarExpandOpen}
          onExpandOpenChange={setCalendarExpandOpen}
          title="Provider booking calendar"
          description="Each day shows how many appointments are booked across facilities. Click a day, then open a clinic."
        />

        <div className="rounded-md border bg-background/50 min-h-[280px]">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div>
              <p className="text-sm font-medium">{format(selectedDate, "EEEE, d MMMM yyyy")}</p>
              <p className="text-xs text-muted-foreground">
                {dayTotal === 0
                  ? "No bookings on this day"
                  : `${dayTotal} booking${dayTotal === 1 ? "" : "s"} across ${facilitiesForDay.length} clinic${facilitiesForDay.length === 1 ? "" : "s"} — click a clinic for the patient list`}
              </p>
            </div>
            {dayTotal > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3.5 w-3.5" />
                {dayTotal}
              </Badge>
            ) : null}
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : facilitiesForDay.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No facilities have booked patients on this day. Pick another date or wait for facility nurses to schedule teleconsults.
            </p>
          ) : (
            <>
              <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Facilities with bookings
              </div>
              <ul className="divide-y">
              {facilitiesForDay.map((facility) => {
                const lim = resolveLimitForDay(limits, facility.branchId, selectedYmd)
                return (
                  <li key={facility.branchId}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelectedFacility(facility)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{facility.branchName}</p>
                        <p className="text-xs text-muted-foreground">
                          {facility.patientCount} patient{facility.patientCount === 1 ? "" : "s"}
                          {lim ? ` · limit ${lim.maxAppointments}` : ""}
                        </p>
                      </div>
                      <Badge className="shrink-0 tabular-nums">{facility.appointmentCount}</Badge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>
            </>
          )}
        </div>
      </div>
      {limitDialog}
    </div>
  )
}
