"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import {
  Building2,
  Calendar,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  Video,
} from "lucide-react"
import { appointmentsApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type DoctorAppointmentsProps = {
  doctorId: string
  /** Compact title for embedding on Telemedicine hub */
  embedded?: boolean
}

function toYmd(d: Date) {
  return format(d, "yyyy-MM-dd")
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

function statusVariant(status: string | undefined): "default" | "secondary" | "outline" | "destructive" {
  if (status === "confirmed" || status === "in_progress") return "default"
  if (status === "cancelled" || status === "no_show") return "destructive"
  if (status === "completed") return "secondary"
  return "outline"
}

export function DoctorAppointments({ doctorId, embedded = false }: DoctorAppointmentsProps) {
  const { toast } = useToast()
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()))
  const [facilityFilter, setFacilityFilter] = useState<string>("all")
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "mine" | "open">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    if (!doctorId) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const data = await appointmentsApi.getDoctorInbox({
          forDoctorId: doctorId,
          date: selectedDate,
          limit: 300,
        })
        if (!cancelled) setRows(data || [])
      } catch (err: any) {
        if (!cancelled) {
          console.error(err)
          toast({
            title: "Could not load bookings",
            description: err?.message || "Failed to load telemedicine bookings",
            variant: "destructive",
          })
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doctorId, selectedDate, refreshKey, toast])

  const facilities = useMemo(() => {
    const map = new Map<string, { branchId: string; branchName: string; count: number }>()
    for (const row of rows) {
      if (row.status === "cancelled" || row.status === "no_show") continue
      const branchId = String(row.resolvedBranchId || row.branchId || "unknown")
      const branchName = row.branchName || (branchId === "unknown" ? "Unassigned facility" : `Facility #${branchId}`)
      const prev = map.get(branchId)
      if (prev) prev.count += 1
      else map.set(branchId, { branchId, branchName, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.branchName.localeCompare(b.branchName))
  }, [rows])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return rows.filter((row) => {
      if (row.status === "cancelled" || row.status === "no_show") return false

      const branchId = String(row.resolvedBranchId || row.branchId || "unknown")
      if (facilityFilter !== "all" && branchId !== facilityFilter) return false

      const isMine = row.doctorId != null && String(row.doctorId) === String(doctorId)
      const isOpen = row.doctorId == null || row.doctorId === ""
      if (assignmentFilter === "mine" && !isMine) return false
      if (assignmentFilter === "open" && !isOpen) return false

      if (!q) return true
      const name = `${row.patientFirstName || ""} ${row.patientLastName || ""}`.trim().toLowerCase()
      const number = String(row.patientNumber || "").toLowerCase()
      const reason = String(row.reason || "").toLowerCase()
      const facility = String(row.branchName || "").toLowerCase()
      return name.includes(q) || number.includes(q) || reason.includes(q) || facility.includes(q)
    })
  }, [rows, facilityFilter, assignmentFilter, searchTerm, doctorId])

  const mineCount = filtered.filter((r) => r.doctorId != null && String(r.doctorId) === String(doctorId)).length
  const openCount = filtered.filter((r) => r.doctorId == null || r.doctorId === "").length

  return (
    <Card className={embedded ? "border-0 shadow-none bg-transparent" : undefined}>
      <CardHeader className={embedded ? "px-0 pt-0" : undefined}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4" />
              Booked telemedicine patients
            </CardTitle>
            <CardDescription>
              Patients booked for you, plus open bookings with no doctor yet. Filter by the facility that sent them.
            </CardDescription>
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
      </CardHeader>
      <CardContent className={cn("space-y-4", embedded && "px-0")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="doctor-booking-date">
              Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="doctor-booking-date"
                type="date"
                className="w-[170px] pl-8"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value)
                  setFacilityFilter("all")
                }}
              />
            </div>
          </div>

          <div className="space-y-1 min-w-[220px] flex-1">
            <label className="text-xs text-muted-foreground">Sending facility</label>
            <Select value={facilityFilter} onValueChange={setFacilityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All facilities ({rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show").length})
                </SelectItem>
                {facilities.map((f) => (
                  <SelectItem key={f.branchId} value={f.branchId}>
                    {f.branchName} ({f.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Assignment</label>
            <Select
              value={assignmentFilter}
              onValueChange={(v) => setAssignmentFilter(v as "all" | "mine" | "open")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Assigned + open</SelectItem>
                <SelectItem value="mine">Booked for me</SelectItem>
                <SelectItem value="open">No doctor specified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 min-w-[200px] flex-1">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Patient, number, reason…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{filtered.length} showing</Badge>
          <Badge variant="outline">{mineCount} for you</Badge>
          <Badge variant="outline">{openCount} open</Badge>
          {facilityFilter !== "all" ? (
            <Badge variant="default" className="gap-1">
              <Building2 className="h-3 w-3" />
              {facilities.find((f) => f.branchId === facilityFilter)?.branchName || "Facility"}
            </Badge>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No booked patients for this date
            {facilityFilter !== "all" ? " from the selected facility" : ""}.
            Facilities book from their calendar; open bookings (no doctor) appear here for you to pick up.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Sending facility</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const name =
                    `${row.patientFirstName || ""} ${row.patientLastName || ""}`.trim() || "—"
                  const isMine = row.doctorId != null && String(row.doctorId) === String(doctorId)
                  const isOpen = row.doctorId == null || row.doctorId === ""
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
                      <TableCell>
                        <Badge variant="outline" className="gap-1 font-normal">
                          <Building2 className="h-3 w-3" />
                          {row.branchName || "Unassigned"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isMine ? (
                          <Badge>For you</Badge>
                        ) : isOpen ? (
                          <Badge variant="secondary" className="gap-1">
                            <UserRound className="h-3 w-3" />
                            Open
                          </Badge>
                        ) : (
                          <Badge variant="outline">Other doctor</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {(row.status || "scheduled").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={row.reason || ""}>
                        {row.reason || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {row.patientId ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/patients/${row.patientId}`}>Patient</Link>
                            </Button>
                          ) : null}
                          <Button size="sm" asChild>
                            <Link href="/telemedicine/create">Start visit</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
