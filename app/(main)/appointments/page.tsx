"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { endOfMonth, format, parseISO, startOfMonth } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, CalendarIcon, ChevronLeft, ChevronRight, Search, Plus, Edit, Trash2, MoreHorizontal, Loader2, Eye, ListPlus, UserRound, Users } from "lucide-react"
import { ExpandableBookingCalendar } from "@/components/booking-month-calendar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { AddAppointmentForm } from "@/components/add-appointment-form"
import { appointmentsApi, queueApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { AddToQueueDialog, type QueueServicePointChoice, queueTypeLabel } from "@/components/add-to-queue-dialog"
import { PublicBookingsInbox } from "@/components/public-bookings-inbox"
import { useAuth } from "@/lib/auth/auth-context"

type CalendarFacility = {
  branchId: number
  branchName: string
  days: Array<{ date: string; appointmentCount: number; patientCount: number }>
}

export default function AppointmentsPage() {
  const router = useRouter()
  const { user, currentBranch, accessibleBranches, setCurrentBranch } = useAuth()
  const userDisplayName = (user?.name || user?.username || "").trim()
  const userRoleLabel = user?.role ? String(user.role).replace(/_/g, " ") : ""
  const isMultiClinic = Boolean(user?.canAccessAllBranches) || accessibleBranches.length > 1
  const [addAppointmentOpen, setAddAppointmentOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<any>(null)
  const [deletingAppointment, setDeletingAppointment] = useState<any>(null)
  const [changingStatus, setChangingStatus] = useState<any>(null)
  const [newStatus, setNewStatus] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [appointments, setAppointments] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [addToQueueAppointment, setAddToQueueAppointment] = useState<any>(null)
  const [addToQueueLoading, setAddToQueueLoading] = useState(false)
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [countsByDate, setCountsByDate] = useState<Map<string, number>>(() => new Map())
  const [calendarFacilities, setCalendarFacilities] = useState<CalendarFacility[]>([])
  const [calendarExpandOpen, setCalendarExpandOpen] = useState(false)
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null)

  const selectedDateObj = parseISO(selectedDate)
  const listBranchId = selectedClinicId ?? (currentBranch?.branchId ? Number(currentBranch.branchId) : null)

  const facilitiesForDay = useMemo(() => {
    return calendarFacilities
      .map((f) => {
        const day = f.days.find((d) => d.date === selectedDate)
        return {
          branchId: f.branchId,
          branchName: f.branchName,
          appointmentCount: day?.appointmentCount || 0,
          patientCount: day?.patientCount || 0,
        }
      })
      .filter((f) => f.appointmentCount > 0)
      .sort((a, b) => b.appointmentCount - a.appointmentCount || a.branchName.localeCompare(b.branchName))
  }, [calendarFacilities, selectedDate])

  const showClinicPicker = isMultiClinic && selectedClinicId == null && facilitiesForDay.length > 0
  const activeClinicName =
    calendarFacilities.find((f) => f.branchId === listBranchId)?.branchName ||
    currentBranch?.branchName ||
    "this clinic"

  // Load appointments from API
  useEffect(() => {
    loadAppointments()
  }, [selectedDate, statusFilter, listBranchId])

  useEffect(() => {
    const monthStart = startOfMonth(selectedDateObj)
    if (format(monthStart, "yyyy-MM") !== format(month, "yyyy-MM")) {
      setMonth(monthStart)
    }
  }, [selectedDate])

  useEffect(() => {
    if (!isMultiClinic && currentBranch?.branchId) {
      setSelectedClinicId(Number(currentBranch.branchId))
    }
  }, [isMultiClinic, currentBranch?.branchId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const from = format(startOfMonth(month), "yyyy-MM-dd")
        const to = format(endOfMonth(month), "yyyy-MM-dd")
        const res = await appointmentsApi.getCalendar(from, to)
        if (cancelled) return
        const facilities: CalendarFacility[] = (res?.facilities || []).map((f: any) => ({
          branchId: Number(f.branchId),
          branchName: String(f.branchName || `Facility #${f.branchId}`),
          days: (f.days || []).map((d: any) => ({
            date: String(d.date || "").slice(0, 10),
            appointmentCount: Number(d.appointmentCount) || 0,
            patientCount: Number(d.patientCount) || 0,
          })),
        }))
        setCalendarFacilities(facilities)
        const next = new Map<string, number>()
        const scoped = listBranchId
          ? facilities.find((f) => f.branchId === Number(listBranchId))
          : null
        if (scoped) {
          for (const d of scoped.days) next.set(d.date, d.appointmentCount)
        } else {
          for (const row of res?.dayTotals || []) {
            const key = String(row.date || "").slice(0, 10)
            if (key) next.set(key, Number(row.appointmentCount) || 0)
          }
        }
        setCountsByDate(next)
      } catch (error) {
        console.error("Error loading appointment calendar:", error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [month, appointments, listBranchId])

  const loadAppointments = async () => {
    try {
      setLoading(true)
      const data = await appointmentsApi.getAll(
        selectedDate,
        statusFilter || undefined,
        undefined,
        undefined,
        1,
        200,
        listBranchId || undefined
      )
      setAppointments(data || [])
    } catch (error: any) {
      console.error("Error loading appointments:", error)
      toast({
        title: "Error loading appointments",
        description: error.message || "Failed to load appointments",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingAppointment) return

    try {
      setDeleteLoading(true)
      await appointmentsApi.delete(deletingAppointment.appointmentId.toString())
      toast({
        title: "Appointment deleted",
        description: "The appointment has been deleted successfully.",
      })
      setDeletingAppointment(null)
      loadAppointments()
    } catch (error: any) {
      console.error("Error deleting appointment:", error)
      toast({
        title: "Error deleting appointment",
        description: error.message || "Failed to delete appointment",
        variant: "destructive",
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleStatusChange = async () => {
    if (!changingStatus || !newStatus) return

    try {
      setStatusLoading(true)
      await appointmentsApi.update(changingStatus.appointmentId.toString(), {
        status: newStatus,
      })
      toast({
        title: "Status updated",
        description: `Appointment status has been updated to ${newStatus}.`,
      })
      setChangingStatus(null)
      setNewStatus("")
      loadAppointments()
    } catch (error: any) {
      console.error("Error updating status:", error)
      toast({
        title: "Error updating status",
        description: error.message || "Failed to update appointment status",
        variant: "destructive",
      })
    } finally {
      setStatusLoading(false)
    }
  }

  const handleViewRecords = (appointment: any) => {
    if (appointment.patientId) {
      router.push(`/patients/${appointment.patientId}`)
    } else {
      toast({
        title: "Error",
        description: "Patient ID not found",
        variant: "destructive",
      })
    }
  }

  const patientNameFromAppointment = (a: any) =>
    a?.patientFirstName && a?.patientLastName
      ? `${a.patientFirstName} ${a.patientLastName}`
      : "Unknown Patient"

  const handleConfirmAddToQueue = async (servicePoint: QueueServicePointChoice) => {
    const apt = addToQueueAppointment
    if (!apt?.patientId) {
      toast({
        title: "Missing patient",
        description: "Patient ID is not available for this appointment.",
        variant: "destructive",
      })
      return
    }
    try {
      setAddToQueueLoading(true)
      const queues = await queueApi.getAll(servicePoint, undefined, 1, 100, false)
      const existingEntry = queues.find(
        (entry: any) =>
          entry.patientId?.toString() === String(apt.patientId) &&
          entry.status !== "completed" &&
          entry.status !== "cancelled",
      )
      const label = queueTypeLabel(servicePoint)
      const name = patientNameFromAppointment(apt)
      if (existingEntry) {
        toast({
          title: `Patient Already in ${label} Queue`,
          description: `${name} is already in the ${label.toLowerCase()} queue (Ticket: ${existingEntry.ticketNumber || "N/A"}).`,
        })
        return
      }
      await queueApi.create({
        patientId: apt.patientId,
        servicePoint,
        priority: "normal",
        status: "waiting",
        notes: `Appointment #${apt.appointmentId} — added from Appointments`,
      })
      toast({
        title: `Patient added to ${label} queue`,
        description: `${name} has been added to the ${label.toLowerCase()} queue.`,
      })
    } catch (error: any) {
      console.error("Add to queue failed:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to add patient to queue.",
        variant: "destructive",
      })
    } finally {
      setAddToQueueLoading(false)
      setAddToQueueAppointment(null)
    }
  }

  const handleEdit = (appointment: any) => {
    setEditingAppointment(appointment)
    setAddAppointmentOpen(true)
  }

  const handleCloseForm = (open: boolean) => {
    setAddAppointmentOpen(open)
    if (!open) {
      setEditingAppointment(null)
    }
  }

  const handleDateChange = (days: number) => {
    const next = new Date(selectedDateObj)
    next.setDate(next.getDate() + days)
    setSelectedDate(format(next, "yyyy-MM-dd"))
  }

  // Filter appointments
  const filteredAppointments = appointments.filter((appointment) => {
    const matchesSearch =
      !searchQuery ||
      (appointment.patientFirstName && appointment.patientFirstName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (appointment.patientLastName && appointment.patientLastName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (appointment.patientNumber && appointment.patientNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (appointment.doctorFirstName && appointment.doctorFirstName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (appointment.doctorLastName && appointment.doctorLastName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (appointment.reason && appointment.reason.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesStatus = !statusFilter || appointment.status === statusFilter.toLowerCase()

    return matchesSearch && matchesStatus
  })

  const formatTime = (time: string) => {
    if (!time) return "N/A"
    // Convert 24-hour format to 12-hour format
    const [hours, minutes] = time.split(":")
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? "PM" : "AM"
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case "confirmed":
        return "default"
      case "scheduled":
        return "secondary"
      case "in_progress":
        return "default"
      case "completed":
        return "default"
      case "cancelled":
        return "destructive"
      case "no_show":
        return "outline"
      default:
        return "secondary"
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground">Schedule and manage patient appointments</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {userDisplayName ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{userDisplayName}</span>
                {userRoleLabel ? (
                  <span className="capitalize text-muted-foreground">· {userRoleLabel}</span>
                ) : null}
              </span>
            ) : null}
            {currentBranch ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {accessibleBranches.length > 1 ? (
                  <select
                    className="bg-transparent text-sm font-medium outline-none"
                    value={String(currentBranch.branchId)}
                    onChange={(event) => {
                      setCurrentBranch(event.target.value)
                      setSelectedClinicId(Number(event.target.value))
                    }}
                    aria-label="Current clinic"
                  >
                    {accessibleBranches.map((branch) => (
                      <option key={branch.branchId} value={branch.branchId}>
                        {branch.branchName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium">{currentBranch.branchName}</span>
                )}
              </span>
            ) : null}
          </div>
        </div>
        <Button onClick={() => setAddAppointmentOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Appointment
        </Button>
      </div>

      <PublicBookingsInbox onAccepted={loadAppointments} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,20rem)_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calendar</CardTitle>
            <CardDescription>
              Numbers are booked patient appointments. Click a day to see the list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpandableBookingCalendar
              month={month}
              onMonthChange={setMonth}
              selected={selectedDateObj}
              onSelect={(date) => {
                setSelectedDate(format(date, "yyyy-MM-dd"))
                if (isMultiClinic) setSelectedClinicId(null)
              }}
              countsByDate={countsByDate}
              expandOpen={calendarExpandOpen}
              onExpandOpenChange={setCalendarExpandOpen}
              title="Patient appointments"
              description="Booked visits this month. Click a day to open its patient list."
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{format(selectedDateObj, "EEEE, d MMMM yyyy")}</p>
                <p className="text-xs text-muted-foreground">
                  {showClinicPicker
                    ? `${facilitiesForDay.reduce((s, f) => s + f.appointmentCount, 0)} bookings across ${facilitiesForDay.length} clinic${facilitiesForDay.length === 1 ? "" : "s"} — open a clinic to see patients`
                    : `${filteredAppointments.length} patient${filteredAppointments.length === 1 ? "" : "s"} at ${activeClinicName}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isMultiClinic && selectedClinicId != null ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedClinicId(null)}>
                    All clinics this day
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingAppointment(null)
                    setAddAppointmentOpen(true)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Book for this day
                </Button>
              </div>
            </div>
          </div>

          {showClinicPicker ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Clinics with bookings</CardTitle>
                <CardDescription>Select a clinic to see the patient list and book for that facility.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {facilitiesForDay.map((facility) => (
                    <li key={facility.branchId}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                        onClick={() => setSelectedClinicId(facility.branchId)}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {facility.branchName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {facility.appointmentCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {showClinicPicker ? (
            <p className="text-sm text-muted-foreground">
              Choose a clinic above to see patients, or use Book for this day after selecting a clinic.
            </p>
          ) : (
      <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => handleDateChange(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{format(selectedDateObj, "EEE d MMM yyyy")}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => handleDateChange(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}>
            Today
          </Button>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search appointments..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointments for {format(selectedDateObj, "EEE d MMM yyyy")}</CardTitle>
          <CardDescription>View and manage scheduled appointments</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" onValueChange={(value) => {
            if (value === "all") {
              setStatusFilter(null)
            } else {
              setStatusFilter(value)
            }
          }}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-2">Loading appointments...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredAppointments.length > 0 ? (
                    filteredAppointments.map((appointment) => (
                      <TableRow key={appointment.appointmentId}>
                        <TableCell>{formatTime(appointment.appointmentTime)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {appointment.patientFirstName && appointment.patientLastName
                                ? `${appointment.patientFirstName} ${appointment.patientLastName}`
                                : "Unknown Patient"}
                            </p>
                            {appointment.patientNumber && (
                              <p className="text-xs text-muted-foreground">{appointment.patientNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {appointment.doctorFirstName && appointment.doctorLastName
                            ? `${appointment.doctorFirstName} ${appointment.doctorLastName}`
                            : "Not assigned"}
                        </TableCell>
                        <TableCell>{appointment.department || "-"}</TableCell>
                        <TableCell>{appointment.reason || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(appointment.status)}>
                            {appointment.status || "scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(appointment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setChangingStatus(appointment)
                                setNewStatus(appointment.status || "scheduled")
                              }}>
                                <Edit className="mr-2 h-4 w-4" />
                                Change Status
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewRecords(appointment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Records
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAddToQueueAppointment(appointment)}>
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add to Queue
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingAppointment(appointment)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No appointments found for this date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="scheduled" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-2">Loading appointments...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredAppointments.length > 0 ? (
                    filteredAppointments.map((appointment) => (
                      <TableRow key={appointment.appointmentId}>
                        <TableCell>{formatTime(appointment.appointmentTime)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {appointment.patientFirstName && appointment.patientLastName
                                ? `${appointment.patientFirstName} ${appointment.patientLastName}`
                                : "Unknown Patient"}
                            </p>
                            {appointment.patientNumber && (
                              <p className="text-xs text-muted-foreground">{appointment.patientNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {appointment.doctorFirstName && appointment.doctorLastName
                            ? `${appointment.doctorFirstName} ${appointment.doctorLastName}`
                            : "Not assigned"}
                        </TableCell>
                        <TableCell>{appointment.department || "-"}</TableCell>
                        <TableCell>{appointment.reason || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(appointment.status)}>
                            {appointment.status || "scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(appointment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setChangingStatus(appointment)
                                setNewStatus(appointment.status || "scheduled")
                              }}>
                                <Edit className="mr-2 h-4 w-4" />
                                Change Status
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewRecords(appointment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Records
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAddToQueueAppointment(appointment)}>
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add to Queue
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingAppointment(appointment)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No scheduled appointments found for this date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="confirmed" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-2">Loading appointments...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredAppointments.length > 0 ? (
                    filteredAppointments.map((appointment) => (
                      <TableRow key={appointment.appointmentId}>
                        <TableCell>{formatTime(appointment.appointmentTime)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {appointment.patientFirstName && appointment.patientLastName
                                ? `${appointment.patientFirstName} ${appointment.patientLastName}`
                                : "Unknown Patient"}
                            </p>
                            {appointment.patientNumber && (
                              <p className="text-xs text-muted-foreground">{appointment.patientNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {appointment.doctorFirstName && appointment.doctorLastName
                            ? `${appointment.doctorFirstName} ${appointment.doctorLastName}`
                            : "Not assigned"}
                        </TableCell>
                        <TableCell>{appointment.department || "-"}</TableCell>
                        <TableCell>{appointment.reason || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(appointment.status)}>
                            {appointment.status || "scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(appointment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setChangingStatus(appointment)
                                setNewStatus(appointment.status || "scheduled")
                              }}>
                                <Edit className="mr-2 h-4 w-4" />
                                Change Status
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewRecords(appointment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Records
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAddToQueueAppointment(appointment)}>
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add to Queue
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingAppointment(appointment)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No confirmed appointments found for this date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="completed" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-2">Loading appointments...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredAppointments.length > 0 ? (
                    filteredAppointments.map((appointment) => (
                      <TableRow key={appointment.appointmentId}>
                        <TableCell>{formatTime(appointment.appointmentTime)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {appointment.patientFirstName && appointment.patientLastName
                                ? `${appointment.patientFirstName} ${appointment.patientLastName}`
                                : "Unknown Patient"}
                            </p>
                            {appointment.patientNumber && (
                              <p className="text-xs text-muted-foreground">{appointment.patientNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {appointment.doctorFirstName && appointment.doctorLastName
                            ? `${appointment.doctorFirstName} ${appointment.doctorLastName}`
                            : "Not assigned"}
                        </TableCell>
                        <TableCell>{appointment.department || "-"}</TableCell>
                        <TableCell>{appointment.reason || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(appointment.status)}>
                            {appointment.status || "scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(appointment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setChangingStatus(appointment)
                                setNewStatus(appointment.status || "scheduled")
                              }}>
                                <Edit className="mr-2 h-4 w-4" />
                                Change Status
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewRecords(appointment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Records
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAddToQueueAppointment(appointment)}>
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add to Queue
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingAppointment(appointment)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No completed appointments found for this date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="cancelled" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mt-2">Loading appointments...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredAppointments.length > 0 ? (
                    filteredAppointments.map((appointment) => (
                      <TableRow key={appointment.appointmentId}>
                        <TableCell>{formatTime(appointment.appointmentTime)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {appointment.patientFirstName && appointment.patientLastName
                                ? `${appointment.patientFirstName} ${appointment.patientLastName}`
                                : "Unknown Patient"}
                            </p>
                            {appointment.patientNumber && (
                              <p className="text-xs text-muted-foreground">{appointment.patientNumber}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {appointment.doctorFirstName && appointment.doctorLastName
                            ? `${appointment.doctorFirstName} ${appointment.doctorLastName}`
                            : "Not assigned"}
                        </TableCell>
                        <TableCell>{appointment.department || "-"}</TableCell>
                        <TableCell>{appointment.reason || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(appointment.status)}>
                            {appointment.status || "scheduled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(appointment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setChangingStatus(appointment)
                                setNewStatus(appointment.status || "scheduled")
                              }}>
                                <Edit className="mr-2 h-4 w-4" />
                                Change Status
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewRecords(appointment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Records
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAddToQueueAppointment(appointment)}>
                                <ListPlus className="mr-2 h-4 w-4" />
                                Add to Queue
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingAppointment(appointment)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No cancelled appointments found for this date.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>
          )}
        </div>
      </div>

      <AddAppointmentForm
        open={addAppointmentOpen}
        onOpenChange={handleCloseForm}
        onSuccess={loadAppointments}
        appointment={editingAppointment}
        defaultDate={selectedDate}
        defaultBranchId={listBranchId}
      />

      <AlertDialog open={!!deletingAppointment} onOpenChange={(open) => {
        if (!open) setDeletingAppointment(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this appointment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddToQueueDialog
        open={!!addToQueueAppointment}
        onOpenChange={(open) => {
          if (!open && !addToQueueLoading) setAddToQueueAppointment(null)
        }}
        patientName={addToQueueAppointment ? patientNameFromAppointment(addToQueueAppointment) : ""}
        patientNumber={addToQueueAppointment?.patientNumber}
        onConfirm={handleConfirmAddToQueue}
        loading={addToQueueLoading}
      />

      <Dialog open={!!changingStatus} onOpenChange={(open) => {
        if (!open) {
          setChangingStatus(null)
          setNewStatus("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Appointment Status</DialogTitle>
            <DialogDescription>
              Update the status for this appointment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChangingStatus(null)
                setNewStatus("")
              }}
              disabled={statusLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={statusLoading || !newStatus}
            >
              {statusLoading ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
