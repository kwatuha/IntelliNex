"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { AddToQueueForm } from "@/components/add-to-queue-form"
import { AddTriageForm } from "@/components/add-triage-form"
import { queueApi, medicalRecordsApi, telemedicineApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { Search, Plus, Edit, Trash2, MoreHorizontal, Loader2, ArrowRight, Monitor, Users, Receipt, FileText, PlayCircle, Stethoscope, FlaskConical, Scan, ClipboardList, Video } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ViewBillDialog } from "@/components/view-bill-dialog"
import { DispenseMedicationDialog } from "@/components/dispense-medication-dialog"
import { PatientEncounterForm } from "@/components/patient-encounter-form"
import { useAuth } from "@/lib/auth/auth-context"
import { useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { format } from "date-fns"
import { Pill } from "lucide-react"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { TelemedicineProviderSelect } from "@/components/telemedicine-provider-select"
import {
  TelemedicineOptionalMeetingLinkFields,
  telemedicineOptionalLinkBody,
} from "@/components/telemedicine-optional-meeting-link-fields"
import { isZoomProvider, isDailyProvider, providerRequiresPastedMeetingLink, meetingHrefFromUrl, type TelemedicineVideoProviderId } from "@/lib/telemedicine-providers"
import { telemedicineCreateToast } from "@/lib/telemedicine-create-result"
import { TelemedicineZoomDefaultsRequiredBanner } from "@/components/telemedicine-zoom-defaults-banner"
import { useTelemedicineZoomDefaults } from "@/lib/hooks/use-telemedicine-zoom-defaults"
import { filterQueueServicePoints } from "@/lib/role-menu-filter"
import {
  RadiologyQueueReportDialog,
  type QueueEntryLite,
} from "@/components/queue-radiology-report-dialog"
import { ProcedureQueueCompleteDialog } from "@/components/queue-procedure-complete-dialog"

const ALL_SERVICE_POINTS = [
  { value: "triage", label: "Triage" },
  { value: "registration", label: "Registration" },
  { value: "consultation", label: "Consultation" },
  { value: "laboratory", label: "Laboratory" },
  { value: "radiology", label: "Radiology" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "billing", label: "Billing" },
  { value: "cashier", label: "Cashier" },
  { value: "telemedicine", label: "Telemedicine" },
  { value: "procedure", label: "Procedure" },
]

const statuses = [
  { value: "waiting", label: "Waiting" },
  { value: "called", label: "Called" },
  { value: "serving", label: "Serving" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

const priorities = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" },
]

export default function QueueManagement() {
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)
  const [allQueues, setAllQueues] = useState<any[]>([]) // Unfiltered queues for summary stats
  const [queues, setQueues] = useState<any[]>([]) // Filtered queues for display
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [servicePointFilter, setServicePointFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [addQueueOpen, setAddQueueOpen] = useState(false)
  const [editingQueue, setEditingQueue] = useState<any>(null)
  const [deletingQueue, setDeletingQueue] = useState<any>(null)
  const [changingStatus, setChangingStatus] = useState<any>(null)
  const [newStatus, setNewStatus] = useState<string>("")
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [viewingBill, setViewingBill] = useState<any>(null)
  const [encounterFormOpen, setEncounterFormOpen] = useState(false)
  const [selectedPatientForEncounter, setSelectedPatientForEncounter] = useState<{ patientId: string; patientName: string } | null>(null)
  const [encountersToday, setEncountersToday] = useState<Record<string, boolean>>({})
  const [currentDoctorId, setCurrentDoctorId] = useState<string | undefined>()
  const [dispenseDialogOpen, setDispenseDialogOpen] = useState(false)
  const [selectedPatientForDispense, setSelectedPatientForDispense] = useState<{ patientId: number; patientName: string } | null>(null)
  const [triageFormOpen, setTriageFormOpen] = useState(false)
  const [selectedPatientForTriage, setSelectedPatientForTriage] = useState<{ patientId: string; patientName: string; queueId: number } | null>(null)
  const [radiologyQueueForReport, setRadiologyQueueForReport] = useState<QueueEntryLite | null>(null)
  const [procedureQueueForComplete, setProcedureQueueForComplete] = useState<QueueEntryLite | null>(null)
  const [telemedicineStartingQueueId, setTelemedicineStartingQueueId] = useState<number | null>(null)
  const [pendingTelemedicineQueue, setPendingTelemedicineQueue] = useState<any>(null)
  const [telemedicineVideoProvider, setTelemedicineVideoProvider] = useState<TelemedicineVideoProviderId>("daily")
  const [telemedicineMeetingUrl, setTelemedicineMeetingUrl] = useState("")
  const [telemedicineMeetingPasscode, setTelemedicineMeetingPasscode] = useState("")
  const { user } = useAuth()
  const { openSession: openTelemedicineFloating } = useTelemedicineFloating()
  const { loading: zoomDefaultsLoading, hasDefaults: hasZoomDefaults } = useTelemedicineZoomDefaults()
  const selectedProviderNeedsZoomDefaults =
    isZoomProvider(telemedicineVideoProvider) && !telemedicineMeetingUrl.trim()
  const selectedProviderNeedsMeetingLink = providerRequiresPastedMeetingLink(
    telemedicineVideoProvider,
    telemedicineMeetingUrl
  )
  const canStartNewTelemedicineVisit =
    !selectedProviderNeedsMeetingLink &&
    (!selectedProviderNeedsZoomDefaults || (!zoomDefaultsLoading && hasZoomDefaults))
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(user?.id)

  // Filter service points based on role access
  const allowedServicePoints = menuLoading || !menuAccess
    ? ALL_SERVICE_POINTS // Show all while loading or if no access data
    : ALL_SERVICE_POINTS.filter(sp =>
        menuAccess.queues.length === 0 || menuAccess.queues.includes(sp.value)
      )

  const servicePoints = allowedServicePoints

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Get current doctor ID - only run on client
  useEffect(() => {
    if (!isMounted) return

    if (user?.id) {
      setCurrentDoctorId(user.id)
    } else {
      try {
        if (typeof window !== 'undefined') {
          const token = localStorage.getItem('token') || localStorage.getItem('jwt_token')
          if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]))
            if (payload?.user?.id) {
              setCurrentDoctorId(payload.user.id.toString())
            }
          }
        }
      } catch (e) {
        console.error('Error getting doctor ID:', e)
      }
    }
  }, [user, isMounted])

  // Check for encounters today when consultation queue is filtered
  useEffect(() => {
    if (!isMounted || servicePointFilter !== "consultation" || queues.length === 0) {
      return
    }

    const checkEncounters = async () => {
      // Only check for consultation queues
      const consultationQueues = queues.filter((q: any) => q.servicePoint === "consultation" && q.patientId)
      if (consultationQueues.length === 0) {
        return
      }

      const today = format(new Date(), 'yyyy-MM-dd')
      const encounterChecks: Record<string, boolean> = {}

      await Promise.all(
        consultationQueues.map(async (queue: any) => {
          if (!queue.patientId) return
          try {
            const records = await medicalRecordsApi.getAll(
              undefined,
              queue.patientId.toString(),
              undefined,
              undefined,
              undefined,
              1,
              10
            )
            const hasEncounterToday = records.some((record: any) => {
              if (!record.visitDate) return false
              const recordDate = format(new Date(record.visitDate), 'yyyy-MM-dd')
              return recordDate === today
            })
            encounterChecks[queue.patientId.toString()] = hasEncounterToday
          } catch (error) {
            console.error(`Error checking encounters for patient ${queue.patientId}:`, error)
            encounterChecks[queue.patientId.toString()] = false
          }
        })
      )

      setEncountersToday(encounterChecks)
    }

    checkEncounters()
  }, [isMounted, servicePointFilter, queues])

  // Load all queues for summary stats
  useEffect(() => {
    if (isMounted) {
      loadAllQueues()
    }
  }, [isMounted])

  // Load filtered queues for display
  useEffect(() => {
    if (isMounted) {
      loadQueues()
    }
  }, [isMounted, servicePointFilter, statusFilter])

  const loadAllQueues = async () => {
    try {
      // Load all queues without service point filter first (base list)
      const allData = await queueApi.getAll(undefined, undefined)

      // Pharmacy: API applies extra rules (paid Rx + stock). Merge like a filtered view.
      let pharmacyData: any[] = []
      try {
        pharmacyData = await queueApi.getAll('pharmacy', undefined) || []
      } catch (error) {
        console.error("Error loading pharmacy queue:", error)
      }

      // Cashier: API applies pending-bill rules (hide queue rows when nothing left to pay).
      // Without servicePoint=cashier, GET /api/queue returns ALL cashier rows → summary counts too high.
      let cashierData: any[] = []
      try {
        cashierData = await queueApi.getAll('cashier', undefined) || []
      } catch (error) {
        console.error("Error loading cashier queue:", error)
      }

      const filteredData = allData.filter(
        (q: any) => q.servicePoint !== 'pharmacy' && q.servicePoint !== 'cashier'
      )
      filteredData.push(...pharmacyData)
      filteredData.push(...cashierData)

      setAllQueues(filteredData)
    } catch (error: any) {
      console.error("Error loading all queues:", error)
    }
  }

  const loadQueues = async () => {
    try {
      setLoading(true)
      const data = await queueApi.getAll(servicePointFilter || undefined, statusFilter || undefined)
      setQueues(data || [])
    } catch (error: any) {
      console.error("Error loading queues:", error)
      toast({
        title: "Error loading queues",
        description: error.message || "Failed to load queue entries",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingQueue) return

    try {
      setDeleteLoading(true)
      await queueApi.delete(deletingQueue.queueId.toString())
      toast({
        title: "Queue entry deleted",
        description: "Queue entry has been deleted successfully.",
      })
      setDeletingQueue(null)
      await loadAllQueues() // Update summary stats
      loadQueues() // Update filtered view
    } catch (error: any) {
      console.error("Error deleting queue entry:", error)
      toast({
        title: "Error deleting queue entry",
        description: error.message || "Failed to delete queue entry",
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
      await queueApi.updateStatus(changingStatus.queueId.toString(), newStatus)
      toast({
        title: "Status updated",
        description: `Queue status has been updated to ${newStatus}.`,
      })
      setChangingStatus(null)
      setNewStatus("")
      await loadAllQueues() // Update summary stats
      loadQueues() // Update filtered view
    } catch (error: any) {
      console.error("Error updating status:", error)
      toast({
        title: "Error updating status",
        description: error.message || "Failed to update queue status",
        variant: "destructive",
      })
    } finally {
      setStatusLoading(false)
    }
  }

  const handleEdit = (queue: any) => {
    setEditingQueue(queue)
    setAddQueueOpen(true)
  }

  const handleStartConsultation = (queue: any) => {
    const patientId = queue.patientId?.toString() || ""
    const patientName = queue.patientFirstName && queue.patientLastName
      ? `${queue.patientFirstName} ${queue.patientLastName}`
      : "Unknown Patient"

    console.log('Starting consultation for:', { patientId, patientName })
    setSelectedPatientForEncounter({ patientId, patientName })
    setEncounterFormOpen(true)
  }

  const queueRowToLite = (queue: any): QueueEntryLite => ({
    queueId: queue.queueId,
    patientId: queue.patientId,
    patientName:
      queue.patientFirstName && queue.patientLastName
        ? `${queue.patientFirstName} ${queue.patientLastName}`
        : queue.patientName || "Unknown Patient",
    notes: queue.notes ?? "",
  })

  const handleStartTriage = (queue: any) => {
    const patientId = queue.patientId?.toString() || ""
    const patientName = queue.patientFirstName && queue.patientLastName
      ? `${queue.patientFirstName} ${queue.patientLastName}`
      : "Unknown Patient"

    setSelectedPatientForTriage({ patientId, patientName, queueId: queue.queueId })
    setTriageFormOpen(true)
  }

  const handleStartTelemedicine = async (queue: any, externalMeetingWindow?: Window | null) => {
    if (!canStartNewTelemedicineVisit) {
      toast({
        title: "Meeting link required",
        description: selectedProviderNeedsMeetingLink
          ? "Paste a Google Meet / Teams / other meeting link, or choose Daily.co (default) which creates a room automatically."
          : "Save Telemedicine → My Zoom defaults, paste a Zoom link, or switch to Daily.co.",
        variant: "destructive",
      })
      return
    }
    const patientId = queue.patientId
    if (!patientId) {
      toast({
        title: "Missing patient",
        description: "This queue entry has no patient linked.",
        variant: "destructive",
      })
      return
    }
    const actorId = (user as { id?: string; userId?: string })?.userId ?? (user as { id?: string })?.id
    const doctorId = actorId != null && actorId !== "" ? Number(actorId) : NaN
    if (!Number.isFinite(doctorId)) {
      toast({
        title: "Missing clinician",
        description: "Sign in as the clinician who will run the telemedicine visit.",
        variant: "destructive",
      })
      return
    }
    if (telemedicineStartingQueueId != null) return
    const qid = Number(queue.queueId ?? 0)
    setTelemedicineStartingQueueId(qid)
    try {
      const useQueueOrigin = Number.isFinite(qid) && qid > 0
      const linkExtra = telemedicineOptionalLinkBody(telemedicineMeetingUrl, telemedicineMeetingPasscode)
      const created = await telemedicineApi.createSession(
        useQueueOrigin
          ? {
              originType: "queue",
              queueEntryId: qid,
              doctorId,
              videoProvider: telemedicineVideoProvider,
              notes: `Telemedicine from queue (ticket ${queue.ticketNumber || qid || "—"})`,
              ...linkExtra,
            }
          : {
              originType: "standalone",
              patientId: Number(patientId),
              doctorId,
              videoProvider: telemedicineVideoProvider,
              notes: `Telemedicine from queue (ticket ${queue.ticketNumber || qid || "—"})`,
              ...linkExtra,
            },
      )
      if (created?.sessionId) {
        const externalMeetingHref =
          !isZoomProvider(telemedicineVideoProvider) && !isDailyProvider(telemedicineVideoProvider)
            ? meetingHrefFromUrl(created.zoomJoinUrl || telemedicineMeetingUrl)
            : ""
        const patientDisplayName =
          queue.patientFirstName && queue.patientLastName
            ? `${queue.patientFirstName} ${queue.patientLastName}`.trim()
            : undefined
        openTelemedicineFloating(created.sessionId, { patientId, patientDisplayName })
        if (externalMeetingHref) {
          if (externalMeetingWindow) {
            externalMeetingWindow.location.href = externalMeetingHref
          } else {
            window.open(externalMeetingHref, "_blank", "noopener,noreferrer")
          }
        }
        toast(
          telemedicineCreateToast(created, {
            title: "Telemedicine session ready",
            description: isDailyProvider(telemedicineVideoProvider)
              ? "Daily.co room is ready in the floating panel — join in-page video there."
              : externalMeetingHref
                ? "Meeting opened in a new browser tab. The HMIS session panel is also available for consent and documentation."
                : "Use the floating panel — minimize it to browse charts or notes.",
          }),
        )
        setPendingTelemedicineQueue(null)
      }
    } catch (error: any) {
      console.error("Telemedicine create failed:", error)
      externalMeetingWindow?.close()
      toast({
        title: "Telemedicine failed",
        description: error?.message || "Could not create telemedicine session",
        variant: "destructive",
      })
    } finally {
      setTelemedicineStartingQueueId(null)
    }
  }

  const handleCloseForm = (open: boolean) => {
    setAddQueueOpen(open)
    if (!open) {
      setEditingQueue(null)
    }
  }


  // Filter queues - memoized to avoid hydration issues
  const memoizedFilteredQueues = useMemo(() => {
    if (!isMounted) return []
    return queues.filter((queue) => {
      // Global search across all queue-related fields
      const matchesSearch = !searchQuery || (() => {
        const query = searchQuery.toLowerCase().trim()
        if (!query) return true

        // Search in patient name fields
        const fullName = `${queue.patientFirstName || ''} ${queue.patientLastName || ''}`.toLowerCase().trim()
        if (fullName.includes(query)) return true
        if (queue.patientFirstName?.toLowerCase().includes(query)) return true
        if (queue.patientLastName?.toLowerCase().includes(query)) return true

        // Search in patient number
        if (queue.patientNumber?.toLowerCase().includes(query)) return true

        // Search in patient phone
        if (queue.patientPhone?.toLowerCase().includes(query)) return true

        // Search in ticket number
        if (queue.ticketNumber?.toLowerCase().includes(query)) return true

        // Search in service point (both value and label)
        const servicePointLabel = servicePoints.find((sp) => sp.value === queue.servicePoint)?.label.toLowerCase() || ''
        if (queue.servicePoint?.toLowerCase().includes(query)) return true
        if (servicePointLabel.includes(query)) return true

        // Search in status (both value and formatted label)
        const statusLabel = queue.status ? queue.status.charAt(0).toUpperCase() + queue.status.slice(1).toLowerCase() : ''
        if (queue.status?.toLowerCase().includes(query)) return true
        if (statusLabel.includes(query)) return true

        // Search in priority (both value and formatted label)
        const priorityLabel = queue.priority ? queue.priority.charAt(0).toUpperCase() + queue.priority.slice(1).toLowerCase() : ''
        if (queue.priority?.toLowerCase().includes(query)) return true
        if (priorityLabel.includes(query)) return true

        // Search in notes
        if (queue.notes?.toLowerCase().includes(query)) return true

        // Search in queue ID
        if (queue.queueId?.toString().includes(query)) return true

        return false
      })()

      const matchesServicePoint = !servicePointFilter || queue.servicePoint === servicePointFilter
      const matchesStatus = !statusFilter || queue.status === statusFilter

      return matchesSearch && matchesServicePoint && matchesStatus
    })
  }, [isMounted, queues, searchQuery, servicePointFilter, statusFilter])

  // Calculate wait time in minutes - only calculate on client
  const calculateWaitTime = (queue: any) => {
    if (!isMounted || !queue.arrivalTime) return 0
    try {
      const arrival = new Date(queue.arrivalTime)
      const now = new Date()
      const diffMs = now.getTime() - arrival.getTime()
      return Math.max(0, Math.floor(diffMs / 60000)) // Convert to minutes, ensure non-negative
    } catch {
      return 0
    }
  }

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "waiting":
        return "secondary"
      case "called":
        return "default"
      case "serving":
        return "default"
      case "completed":
        return "outline"
      case "cancelled":
        return "destructive"
      default:
        return "secondary"
    }
  }

  // Get priority badge variant
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "normal":
        return "outline"
      case "urgent":
        return "secondary"
      case "emergency":
        return "destructive"
      default:
        return "outline"
    }
  }

  // Calculate summary statistics from all queues (unfiltered)
  const summaryStats = useMemo(() => {
    const stats: Record<string, { total: number; waiting: number; serving: number }> = {}
    servicePoints.forEach((sp) => {
      const serviceQueues = allQueues.filter((q) => q.servicePoint === sp.value)
      stats[sp.value] = {
        total: serviceQueues.length,
        waiting: serviceQueues.filter((q) => q.status === "waiting").length,
        serving: serviceQueues.filter((q) => q.status === "serving" || q.status === "called").length,
      }
    })
    return stats
  }, [allQueues])

  const totalInQueue = allQueues.filter((q) => q.status === "waiting" || q.status === "called").length
  const emergencyCount = allQueues.filter((q) => q.priority === "emergency" && (q.status === "waiting" || q.status === "called")).length
  const urgentCount = allQueues.filter((q) => q.priority === "urgent" && (q.status === "waiting" || q.status === "called")).length

  if (!isMounted) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Queue Management</h1>
          <p className="text-muted-foreground">Manage patient queues across different service points</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Queue Management</h1>
          <p className="text-muted-foreground">Manage patient queues across different service points</p>
        </div>
        <Button onClick={() => setAddQueueOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add to Queue
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Queue Entries</CardTitle>
              <CardDescription>View and manage all queue entries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-4">
                <div className="flex gap-2 flex-1">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search anything (name, ticket, service point, status, priority, notes...)"
                      className="w-full pl-8"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={servicePointFilter || "all"} onValueChange={(value) => setServicePointFilter(value === "all" ? null : value)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Service Point" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Service Points</SelectItem>
                      {servicePoints.map((sp) => (
                        <SelectItem key={sp.value} value={sp.value}>
                          {sp.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? null : value)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statuses.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {servicePointFilter === "telemedicine" && (
                <div className="mb-4 max-w-xl space-y-3">
                  <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    Click <strong className="text-foreground">Start Telemedicine</strong> to choose Zoom or Google Meet for that patient.
                  </p>
                </div>
              )}

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Service Point</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wait Time</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground mt-2">Loading queue entries...</p>
                        </TableCell>
                      </TableRow>
                    ) : memoizedFilteredQueues.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No queue entries found
                        </TableCell>
                      </TableRow>
                    ) : (
                      memoizedFilteredQueues.map((queue) => (
                        <TableRow key={queue.queueId}>
                          <TableCell className="font-medium">{queue.ticketNumber}</TableCell>
                          <TableCell>
                            {queue.patientFirstName && queue.patientLastName
                              ? `${queue.patientFirstName} ${queue.patientLastName}`
                              : "Unknown Patient"}
                            {queue.patientNumber && (
                              <div className="text-xs text-muted-foreground">{queue.patientNumber}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {servicePoints.find((sp) => sp.value === queue.servicePoint)?.label || queue.servicePoint}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getPriorityBadge(queue.priority)}>
                              {queue.priority ? queue.priority.charAt(0).toUpperCase() + queue.priority.slice(1) : "Normal"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadge(queue.status)}>
                              {queue.status ? queue.status.charAt(0).toUpperCase() + queue.status.slice(1) : "Waiting"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {queue.status === "waiting" || queue.status === "called" ? (
                              <span className="text-sm">{calculateWaitTime(queue)} min</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {queue.servicePoint === "triage" && (
                                  <DropdownMenuItem onClick={() => handleStartTriage(queue)}>
                                    <Stethoscope className="mr-2 h-4 w-4" />
                                    Triage Assessment
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "telemedicine" && queue.patientId && (
                                  <DropdownMenuItem
                                    onClick={() => setPendingTelemedicineQueue(queue)}
                                    disabled={telemedicineStartingQueueId === queue.queueId}
                                  >
                                    <Video className="mr-2 h-4 w-4" />
                                    {telemedicineStartingQueueId === queue.queueId
                                      ? "Starting…"
                                      : "Start Telemedicine"}
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "consultation" && (
                                  <DropdownMenuItem onClick={() => handleStartConsultation(queue)}>
                                    {encountersToday[queue.patientId?.toString() || ""] ? (
                                      <>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Continue Consultation
                                      </>
                                    ) : (
                                      <>
                                        <PlayCircle className="mr-2 h-4 w-4" />
                                        Start Consultation
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "cashier" && (
                                  <DropdownMenuItem onClick={() => setViewingBill(queue)}>
                                    <Receipt className="mr-2 h-4 w-4" />
                                    View Bill
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "pharmacy" && queue.patientId && (
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedPatientForDispense({
                                      patientId: parseInt(queue.patientId.toString()),
                                      patientName: queue.patientName || "Unknown Patient"
                                    })
                                    setDispenseDialogOpen(true)
                                  }}>
                                    <Pill className="mr-2 h-4 w-4" />
                                    Dispense Medication
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "laboratory" && (
                                  <DropdownMenuItem onClick={() => {
                                    router.push('/laboratory')
                                  }}>
                                    <FlaskConical className="mr-2 h-4 w-4" />
                                    View in Laboratory
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "radiology" && (
                                  <DropdownMenuItem
                                    onClick={() => setRadiologyQueueForReport(queueRowToLite(queue))}
                                  >
                                    <Scan className="mr-2 h-4 w-4" />
                                    Record report
                                  </DropdownMenuItem>
                                )}
                                {queue.servicePoint === "procedure" && (
                                  <DropdownMenuItem
                                    onClick={() => setProcedureQueueForComplete(queueRowToLite(queue))}
                                  >
                                    <ClipboardList className="mr-2 h-4 w-4" />
                                    Complete &amp; outcome
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEdit(queue)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setChangingStatus(queue)
                                    setNewStatus(queue.status || "waiting")
                                  }}
                                >
                                  <ArrowRight className="mr-2 h-4 w-4" />
                                  Change Status
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setDeletingQueue(queue)}
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
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Queue Summary</CardTitle>
              <CardDescription>Overview of all service points</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {servicePoints.map((sp) => {
                    const stats = summaryStats[sp.value] || { total: 0, waiting: 0, serving: 0 }
                    const isSelected = servicePointFilter === sp.value
                    return (
                      <button
                        key={sp.value}
                        onClick={() => setServicePointFilter(isSelected ? null : sp.value)}
                        className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent hover:border-primary cursor-pointer ${
                          isSelected ? "border-primary bg-accent" : ""
                        }`}
                      >
                        <div className="text-xs font-medium text-muted-foreground">{sp.label}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <div className="text-2xl font-bold">{stats.total}</div>
                          <div className="text-xs text-muted-foreground">
                            {stats.waiting} waiting, {stats.serving} serving
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs font-medium">Total Patients in Queue</div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-2xl font-bold">{totalInQueue}</div>
                    <div className="flex items-center gap-1 text-xs">
                      {emergencyCount > 0 && (
                        <>
                          <span className="rounded-full bg-red-500 h-2 w-2"></span>
                          <span className="text-muted-foreground">{emergencyCount} Emergency</span>
                        </>
                      )}
                      {urgentCount > 0 && (
                        <>
                          <span className="rounded-full bg-amber-500 h-2 w-2 ml-2"></span>
                          <span className="text-muted-foreground">{urgentCount} Urgent</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant="outline">
                <Link href="/queue/service">
                  <Users className="mr-2 h-4 w-4" />
                  Service Point Dashboard
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue Displays</CardTitle>
              <CardDescription>Access queue displays for different areas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild className="w-full justify-start" variant="outline">
                <Link href="/display">
                  <Monitor className="mr-2 h-4 w-4" />
                  Waiting Area Display
                </Link>
              </Button>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link href="/display/call">
                  <Users className="mr-2 h-4 w-4" />
                  Service Point Display
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <RadiologyQueueReportDialog
        queueEntry={radiologyQueueForReport}
        onClose={() => setRadiologyQueueForReport(null)}
        onSuccess={() => {
          loadQueues()
          loadAllQueues()
        }}
      />
      <ProcedureQueueCompleteDialog
        queueEntry={procedureQueueForComplete}
        onClose={() => setProcedureQueueForComplete(null)}
        onSuccess={() => {
          loadQueues()
          loadAllQueues()
        }}
      />

      <Dialog open={!!pendingTelemedicineQueue} onOpenChange={(open) => !open && setPendingTelemedicineQueue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Telemedicine Session</DialogTitle>
            <DialogDescription>
              Choose the video platform for{" "}
              {pendingTelemedicineQueue?.patientFirstName || pendingTelemedicineQueue?.patientLastName
                ? `${pendingTelemedicineQueue?.patientFirstName || ""} ${pendingTelemedicineQueue?.patientLastName || ""}`.trim()
                : pendingTelemedicineQueue?.patientName || "this patient"}
              , then start the session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isZoomProvider(telemedicineVideoProvider) && (
              <TelemedicineZoomDefaultsRequiredBanner loading={zoomDefaultsLoading} hasDefaults={hasZoomDefaults} />
            )}
            <TelemedicineProviderSelect
              label="Video platform"
              value={telemedicineVideoProvider}
              onChange={setTelemedicineVideoProvider}
              disabled={telemedicineStartingQueueId != null}
            />
            <TelemedicineOptionalMeetingLinkFields
              videoProvider={telemedicineVideoProvider}
              joinUrl={telemedicineMeetingUrl}
              onJoinUrlChange={setTelemedicineMeetingUrl}
              passcode={telemedicineMeetingPasscode}
              onPasscodeChange={setTelemedicineMeetingPasscode}
            />
            {selectedProviderNeedsMeetingLink && (
              <p className="text-sm text-destructive">
                Paste a meeting link for Meet / Teams / Other, or keep Daily.co selected (no link needed).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingTelemedicineQueue(null)} disabled={telemedicineStartingQueueId != null}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingTelemedicineQueue) return
                const meetWindow =
                  !isZoomProvider(telemedicineVideoProvider) &&
                  !isDailyProvider(telemedicineVideoProvider) &&
                  telemedicineMeetingUrl.trim()
                    ? window.open("about:blank", "_blank")
                    : null
                if (meetWindow) {
                  meetWindow.document.title = "Opening meeting..."
                  meetWindow.document.body.innerHTML = "Opening meeting..."
                }
                void handleStartTelemedicine(pendingTelemedicineQueue, meetWindow)
              }}
              disabled={
                telemedicineStartingQueueId != null ||
                selectedProviderNeedsMeetingLink ||
                (selectedProviderNeedsZoomDefaults && zoomDefaultsLoading) ||
                !canStartNewTelemedicineVisit
              }
            >
              {telemedicineStartingQueueId != null ? "Starting..." : "Start Telemedicine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddToQueueForm
        open={addQueueOpen}
        onOpenChange={handleCloseForm}
        onSuccess={async () => {
          await loadAllQueues() // Update summary stats
          loadQueues() // Update filtered view
          setEditingQueue(null)
        }}
        queueEntry={editingQueue}
      />

      {viewingBill && (
        <ViewBillDialog
          open={!!viewingBill}
          onOpenChange={(open) => !open && setViewingBill(null)}
          patientId={viewingBill.patientId}
          queueId={viewingBill.queueId}
          queueNotes={viewingBill.notes}
          onQueueCompleted={() => {
            // Refresh queue data when queue entry is completed
            loadAllQueues()
            loadQueues()
            setViewingBill(null)
          }}
        />
      )}

      <AlertDialog open={!!deletingQueue} onOpenChange={(open) => !open && setDeletingQueue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Queue Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this queue entry?
              {deletingQueue && (
                <>
                  <br />
                  <br />
                  <strong>Ticket:</strong> {deletingQueue.ticketNumber}
                  <br />
                  <strong>Patient:</strong>{" "}
                  {deletingQueue.patientFirstName && deletingQueue.patientLastName
                    ? `${deletingQueue.patientFirstName} ${deletingQueue.patientLastName}`
                    : "Unknown"}
                  <br />
                  <strong>Service Point:</strong>{" "}
                  {servicePoints.find((sp) => sp.value === deletingQueue.servicePoint)?.label ||
                    deletingQueue.servicePoint}
                  <br />
                  <br />
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Patient Encounter Form */}
      {selectedPatientForEncounter && (
        <PatientEncounterForm
          open={encounterFormOpen}
          onOpenChange={(open) => {
            setEncounterFormOpen(open)
            if (!open) {
              setSelectedPatientForEncounter(null)
            }
          }}
          initialPatientId={selectedPatientForEncounter.patientId}
          initialDoctorId={currentDoctorId}
          onSuccess={() => {
            toast({
              title: "Encounter Saved",
              description: `Encounter for ${selectedPatientForEncounter.patientName} has been saved successfully.`,
            })
            // Update encounter status
            setEncountersToday(prev => ({
              ...prev,
              [selectedPatientForEncounter.patientId]: true
            }))
            // Refresh queue data
            loadQueues()
            loadAllQueues()
          }}
        />
      )}

      <Dialog
        open={!!changingStatus}
        onOpenChange={(open) => {
          if (!open) {
            setChangingStatus(null)
            setNewStatus("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Queue Status</DialogTitle>
            <DialogDescription>
              Update the status for ticket {changingStatus?.ticketNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Status</Label>
              <div className="text-sm text-muted-foreground">
                <Badge variant={getStatusBadge(changingStatus?.status)}>
                  {changingStatus?.status
                    ? changingStatus.status.charAt(0).toUpperCase() + changingStatus.status.slice(1)
                    : "Unknown"}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-status">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="new-status">
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
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
            <Button onClick={handleStatusChange} disabled={statusLoading || !newStatus || newStatus === changingStatus?.status}>
              {statusLoading ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispense Medication Dialog for pharmacy */}
      {selectedPatientForDispense && (
        <DispenseMedicationDialog
          open={dispenseDialogOpen}
          onOpenChange={(open) => {
            setDispenseDialogOpen(open)
            if (!open) {
              setSelectedPatientForDispense(null)
            }
          }}
          patientId={selectedPatientForDispense.patientId}
          onDispensed={() => {
            loadQueues()
          }}
        />
      )}

      {/* Triage Assessment Form */}
      {selectedPatientForTriage && (
        <AddTriageForm
          open={triageFormOpen}
          onOpenChange={(open) => {
            setTriageFormOpen(open)
            if (!open) {
              setSelectedPatientForTriage(null)
            }
          }}
          initialPatientId={selectedPatientForTriage.patientId}
          onSuccess={async () => {
            // Mark the triage queue entry as completed
            try {
              await queueApi.updateStatus(selectedPatientForTriage.queueId.toString(), "completed")
              toast({
                title: "Triage Completed",
                description: `Triage assessment for ${selectedPatientForTriage.patientName} has been completed and patient removed from triage queue.`,
              })
              // Refresh queue data
              await loadAllQueues()
              loadQueues()
            } catch (error: any) {
              console.error("Error updating triage queue status:", error)
              toast({
                title: "Warning",
                description: "Triage assessment saved, but failed to update queue status. Please update manually.",
                variant: "destructive",
              })
            }
            setSelectedPatientForTriage(null)
          }}
        />
      )}
    </div>
  )
}
