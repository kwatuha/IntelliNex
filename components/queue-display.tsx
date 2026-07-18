"use client"

import { useState, useMemo, Suspense, useEffect, useCallback, useRef, startTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { MoreHorizontal, FileText, PlayCircle, Stethoscope, Pill, Scan, ClipboardList, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getQueueByServicePoint,
  getServicePointName,
  getPriorityColor,
  calculateWaitTime,
  type ServicePoint,
} from "@/lib/data/queue-data"
import { QueueTabsIndicator } from "@/components/queue-tabs-indicator"
import { useScreenSize } from "@/hooks/use-screen-size"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { queueApi, medicalRecordsApi, telemedicineApi } from "@/lib/api"
import { TelemedicineProviderSelect } from "@/components/telemedicine-provider-select"
import {
  TelemedicineOptionalMeetingLinkFields,
  telemedicineOptionalLinkBody,
} from "@/components/telemedicine-optional-meeting-link-fields"
import { isZoomProvider, isDailyProvider, providerRequiresPastedMeetingLink, meetingHrefFromUrl, type TelemedicineVideoProviderId } from "@/lib/telemedicine-providers"
import { telemedicineCreateToast } from "@/lib/telemedicine-create-result"
import { TelemedicineZoomDefaultsRequiredBanner } from "@/components/telemedicine-zoom-defaults-banner"
import { useTelemedicineZoomDefaults } from "@/lib/hooks/use-telemedicine-zoom-defaults"
import dynamic from "next/dynamic"
import { AddToQueueForm } from "@/components/add-to-queue-form"
import { useAuth } from "@/lib/auth/auth-context"
import { useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { format } from "date-fns"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { filterQueueServicePoints } from "@/lib/role-menu-filter"
import { toast } from "@/components/ui/use-toast"
import { Receipt, Edit, Trash2, ArrowRight } from "lucide-react"
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
import {
  RadiologyQueueReportDialog,
  type QueueEntryLite,
} from "@/components/queue-radiology-report-dialog"
import { ProcedureQueueCompleteDialog } from "@/components/queue-procedure-complete-dialog"

const PatientEncounterForm = dynamic(
  () => import("@/components/patient-encounter-form").then((m) => m.PatientEncounterForm),
  { ssr: false, loading: () => null }
)
const DispenseMedicationDialog = dynamic(
  () => import("@/components/dispense-medication-dialog").then((m) => m.DispenseMedicationDialog),
  { ssr: false, loading: () => null }
)
const AddTriageForm = dynamic(
  () => import("@/components/add-triage-form").then((m) => m.AddTriageForm),
  { ssr: false, loading: () => null }
)
const ViewBillDialog = dynamic(
  () => import("@/components/view-bill-dialog").then((m) => m.ViewBillDialog),
  { ssr: false, loading: () => null }
)

interface QueueDisplayProps {
  initialServicePoint?: ServicePoint
  restrictToSingleServicePoint?: boolean // If true, hide tabs and show only the initial service point
}

export function QueueDisplay({ initialServicePoint = "triage", restrictToSingleServicePoint = false }: QueueDisplayProps) {
  // Define all service points
  const allServicePoints: ServicePoint[] = [
    "triage",
    "registration",
    "consultation",
    "laboratory",
    "radiology",
    "pharmacy",
    "billing",
    "cashier",
    "telemedicine",
    "procedure",
  ]

  const { user } = useAuth()
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(user?.id)
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({})
  const [queueCountsLoading, setQueueCountsLoading] = useState(false)

  // Filter service points based on role access
  const allowedServicePoints = menuLoading || !menuAccess
    ? allServicePoints // Show all while loading or if no access data
    : filterQueueServicePoints(allServicePoints, menuAccess)

  // If restricted to single service point, only show that one (if allowed)
  const effectiveAllowedServicePoints = restrictToSingleServicePoint && allowedServicePoints.includes(initialServicePoint as ServicePoint)
    ? [initialServicePoint as ServicePoint]
    : allowedServicePoints

  // Ensure initial service point is allowed, otherwise use first allowed
  const validInitialServicePoint = useMemo(() => {
    if (effectiveAllowedServicePoints.includes(initialServicePoint as ServicePoint)) {
      return initialServicePoint
    }
    return effectiveAllowedServicePoints[0] || "triage"
  }, [initialServicePoint, effectiveAllowedServicePoints])

  const [selectedTab, setSelectedTab] = useState<ServicePoint>(validInitialServicePoint as ServicePoint)
  const screenSize = useScreenSize()

  // Update selected tab if it becomes invalid
  useEffect(() => {
    if (!effectiveAllowedServicePoints.includes(selectedTab)) {
      setSelectedTab((effectiveAllowedServicePoints[0] || "triage") as ServicePoint)
    }
  }, [selectedTab, effectiveAllowedServicePoints])

  // Determine how many tabs to show based on screen size
  const visibleTabCount = useMemo(() => {
    switch (screenSize) {
      case "xs":
        return 2
      case "sm":
        return 3
      case "md":
        return 4
      case "lg":
        return 6
      case "xl":
      case "2xl":
        return 8
      default:
        return 4
    }
  }, [screenSize])

  // Determine which tabs to show
  // Priority: 1. Selected tab, 2. Common tabs (if allowed), 3. Others in order
  const visibleTabs = useMemo(() => {
    // If restricted to single service point, only show that one
    if (restrictToSingleServicePoint && effectiveAllowedServicePoints.length === 1) {
      return effectiveAllowedServicePoints
    }

    // Priority tabs (only if they're in effectiveAllowedServicePoints)
    const priorityTabs: ServicePoint[] = ["triage", "consultation", "pharmacy", "telemedicine"]
    const allowedPriorityTabs = priorityTabs.filter(tab => effectiveAllowedServicePoints.includes(tab))

    // Start with the selected tab if it's allowed
    const result: ServicePoint[] = []
    if (effectiveAllowedServicePoints.includes(selectedTab)) {
      result.push(selectedTab)
    }

    // Add allowed priority tabs (excluding the selected tab if it's already added)
    for (const tab of allowedPriorityTabs) {
      if (result.length < visibleTabCount) {
        if (!result.includes(tab)) {
          result.push(tab)
        }
      }
    }

    // Fill remaining slots with other allowed tabs (excluding priority tabs already added)
    for (const tab of effectiveAllowedServicePoints) {
      if (result.length < visibleTabCount) {
        if (!result.includes(tab) && !allowedPriorityTabs.includes(tab)) {
          result.push(tab)
        }
      }
    }

    return result
  }, [selectedTab, visibleTabCount, effectiveAllowedServicePoints, restrictToSingleServicePoint])

  // Determine which tabs to show in the "More" dropdown
  const dropdownTabs = useMemo(() => {
    return effectiveAllowedServicePoints.filter((tab) => !visibleTabs.includes(tab))
  }, [effectiveAllowedServicePoints, visibleTabs])

  // Check if we need to show the "More" dropdown
  const showMoreDropdown = dropdownTabs.length > 0

  // Load queue counts for all allowed service points (skip when single-point dashboard — QueueContent already loads)
  useEffect(() => {
    if (restrictToSingleServicePoint) return
    if (menuLoading || effectiveAllowedServicePoints.length === 0) return

    const loadQueueCounts = async () => {
      // Prevent flickering by only updating if counts actually changed
      setQueueCountsLoading(true)
      try {
        const counts: Record<string, number> = {}
        await Promise.all(
          effectiveAllowedServicePoints.map(async (servicePoint) => {
            try {
              // Fetch queue data without including completed entries (same as detail view)
              const data = await queueApi.getAll(servicePoint, undefined, 1, 50, false)
              // Count all entries returned (API already filters out completed/cancelled by default)
              counts[servicePoint] = data.length
            } catch (error) {
              console.error(`Error loading queue count for ${servicePoint}:`, error)
              // Preserve previous count on error instead of setting to 0
              counts[servicePoint] = queueCounts[servicePoint] || 0
            }
          })
        )
        // Only update if counts actually changed to prevent unnecessary re-renders
        setQueueCounts(prevCounts => {
          const hasChanged = Object.keys(counts).some(
            key => prevCounts[key] !== counts[key]
          ) || Object.keys(prevCounts).some(
              key => !counts.hasOwnProperty(key)
            )
          return hasChanged ? counts : prevCounts
        })
      } finally {
        setQueueCountsLoading(false)
      }
    }

    loadQueueCounts()
    // Refresh counts periodically (every 10 minutes) - only to get queue changes, not for time updates
    // Waiting time is calculated client-side using arrivalTime, so frequent polling is unnecessary
    const interval = setInterval(loadQueueCounts, 600000)
    return () => clearInterval(interval)
  }, [effectiveAllowedServicePoints, menuLoading, menuAccess, restrictToSingleServicePoint])

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle>Patient Queue</CardTitle>
        <CardDescription>Current queue status for each service point</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue={validInitialServicePoint}
          value={selectedTab}
          onValueChange={(value) => setSelectedTab(value as ServicePoint)}
          className="w-full"
        >
          <div className="relative mb-4">
            <ScrollArea className="w-full whitespace-nowrap">
              {!restrictToSingleServicePoint && visibleTabCount < effectiveAllowedServicePoints.length && <QueueTabsIndicator />}
              {!restrictToSingleServicePoint && effectiveAllowedServicePoints.length > 1 && (
              <TabsList className="inline-flex h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
                {visibleTabs.filter(tab => effectiveAllowedServicePoints.includes(tab)).map((point) => {
                  const count = queueCounts[point] || 0
                  return (
                    <TabsTrigger
                      key={point}
                      value={point}
                      className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-3 pt-2 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                    >
                      {getServicePointName(point)}
                      {count > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {count}
                        </Badge>
                      )}
                    </TabsTrigger>
                  )
                })}

                {showMoreDropdown && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-3 pb-3 pt-2 font-medium text-muted-foreground shadow-none transition-none hover:text-foreground focus:outline-none">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">More tabs</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {dropdownTabs.map((point) => {
                        const count = queueCounts[point] || 0
                        return (
                          <DropdownMenuItem
                            key={point}
                            onClick={() => setSelectedTab(point)}
                            className="flex items-center justify-between"
                          >
                            {getServicePointName(point)}
                            {count > 0 && (
                              <Badge variant="secondary" className="ml-2">
                                {count}
                              </Badge>
                            )}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TabsList>
              )}
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {effectiveAllowedServicePoints.map((point) => (
            <TabsContent key={point} value={point} className="mt-6">
              <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-md" />}>
                <QueueContent
                  servicePoint={point}
                  onLoadedCount={(count) => {
                    setQueueCounts((prev) => {
                      if (prev[point] === count) return prev
                      return { ...prev, [point]: count }
                    })
                  }}
                />
              </Suspense>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

// Separate the content to allow for better code splitting
function QueueContent({
  servicePoint,
  onLoadedCount,
}: {
  servicePoint: ServicePoint
  /** Sync tab badge with the rows actually shown (same rules as GET /api/queue?servicePoint=) */
  onLoadedCount?: (count: number) => void
}) {
  const onLoadedCountRef = useRef(onLoadedCount)
  onLoadedCountRef.current = onLoadedCount

  const [queueData, setQueueData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [encounterFormOpen, setEncounterFormOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<{ patientId: string; patientName: string } | null>(null)
  const [encountersToday, setEncountersToday] = useState<Record<string, boolean>>({})
  const [currentDoctorId, setCurrentDoctorId] = useState<string | undefined>()
  const [dispenseDialogOpen, setDispenseDialogOpen] = useState(false)
  const [selectedPatientForDispense, setSelectedPatientForDispense] = useState<{ patientId: number; patientName: string } | null>(null)
  const [triageFormOpen, setTriageFormOpen] = useState(false)
  const [selectedPatientForTriage, setSelectedPatientForTriage] = useState<{ patientId: string; patientName: string; queueId: number } | null>(null)
  const [viewingBill, setViewingBill] = useState<any>(null)
  const [editingQueue, setEditingQueue] = useState<any>(null)
  const [addQueueOpen, setAddQueueOpen] = useState(false)
  const [deletingQueue, setDeletingQueue] = useState<any>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [changingStatus, setChangingStatus] = useState<any>(null)
  const [newStatus, setNewStatus] = useState<string>("")
  const [statusLoading, setStatusLoading] = useState(false)
  const [radiologyQueueForReport, setRadiologyQueueForReport] = useState<QueueEntryLite | null>(null)
  const [procedureQueueForComplete, setProcedureQueueForComplete] = useState<QueueEntryLite | null>(null)
  const [telemedicineStartingQueueId, setTelemedicineStartingQueueId] = useState<number | string | null>(null)
  const [pendingTelemedicineEntry, setPendingTelemedicineEntry] = useState<any>(null)
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
  const isConsultation = servicePoint === "consultation"
  const isPharmacy = servicePoint === "pharmacy"
  const isTriage = servicePoint === "triage"
  const isCashier = servicePoint === "cashier"
  const isRadiology = servicePoint === "radiology"
  const isProcedure = servicePoint === "procedure"
  const isTelemedicine = servicePoint === "telemedicine"

  // Get current doctor ID
  useEffect(() => {
    if (user?.id) {
      setCurrentDoctorId(user.id)
    } else {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt_token')
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]))
          if (payload?.user?.id) {
            setCurrentDoctorId(payload.user.id.toString())
          }
        }
      } catch (e) {
        console.error('Error getting doctor ID:', e)
      }
    }
  }, [user])

  // Fetch queue data from API - memoized to prevent unnecessary calls
  const loadQueueData = useCallback(async () => {
      try {
        setLoading(true)
        // Fetch queue data without including completed entries (same as summary count)
        const data = await queueApi.getAll(servicePoint, undefined, 1, 50, false)

        // Map API response to display format
        const mappedData = data.map((entry: any) => ({
          id: entry.queueId != null ? String(entry.queueId) : `p-${entry.patientId}-${entry.ticketNumber || ""}`,
          queueId: entry.queueId || entry.id || 0,
          patientId: entry.patientId?.toString() || "",
          patientName: entry.patientFirstName && entry.patientLastName
            ? `${entry.patientFirstName} ${entry.patientLastName}`
            : entry.patientName || "Unknown Patient",
          servicePoint: entry.servicePoint || servicePoint,
          ticketNumber: entry.ticketNumber || "",
          status: entry.status || "waiting",
          priority: entry.priority || "normal",
          estimatedWaitTime: entry.estimatedWaitTime,
          arrivalTime: entry.arrivalTime || new Date().toISOString(),
          notes: entry.notes ?? "",
        }))

        // Dedupe by queueId so React rows match API count (defensive)
        const seen = new Set<number | string>()
        const deduped = mappedData.filter((row) => {
          const k = row.queueId || row.id
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })

        setQueueData(deduped)
        onLoadedCountRef.current?.(deduped.length)

        // Check for encounters today for each patient - LAZY LOAD (non-blocking)
        if (servicePoint === "consultation" && deduped.length > 0) {
                  const today = format(new Date(), 'yyyy-MM-dd')
                  const encounterChecks: Record<string, boolean> = {}

                  // Moved to background to prevent UI freezing
                  startTransition(() => {
                    const checkEncountersAsync = async () => {
                      const batchSize = 3
                      for (let i = 0; i < deduped.length; i += batchSize) {
                        const batch = deduped.slice(i, i + batchSize)

                        await Promise.all(
                          batch.map(async (entry: any) => {
                            try {
                              const records = await medicalRecordsApi.getAll(
                                undefined,
                                entry.patientId,
                                undefined,
                                undefined,
                                undefined,
                                undefined,
                                1,
                                10
                              )
                              const hasEncounterToday = records.some((record: any) => {
                                const recordDate = record.visitDate ? format(new Date(record.visitDate), 'yyyy-MM-dd') : null
                                return recordDate === today
                              })
                              encounterChecks[entry.patientId] = hasEncounterToday
                            } catch (error) {
                              encounterChecks[entry.patientId] = false
                            }
                          })
                        )

                        // Update incrementally
                        if (Object.keys(encounterChecks).length > 0) {
                          setEncountersToday(prev => ({ ...prev, ...encounterChecks }))
                        }

                        // Yield to browser
                        await new Promise(resolve => setTimeout(resolve, 10))
                      }
                    }
                    checkEncountersAsync()
                  })
                }
      } catch (error) {
        console.error('Error loading queue data:', error)
        // Fallback to mock data
        const mockData = getQueueByServicePoint(servicePoint)
        setQueueData(mockData)
        onLoadedCountRef.current?.(mockData.length)
      } finally {
        setLoading(false)
      }
  }, [servicePoint])

  useEffect(() => {
    loadQueueData()
  }, [loadQueueData])

  const handleStartConsultation = (patientId: string, patientName: string) => {
    console.log('handleStartConsultation called:', { patientId, patientName, currentDoctorId })
    setSelectedPatient({ patientId, patientName })
    setEncounterFormOpen(true)
    console.log('Encounter form state set to open')
  }

  const handleStartTriage = (patientId: string, patientName: string, queueId: number) => {
    setSelectedPatientForTriage({ patientId, patientName, queueId })
    setTriageFormOpen(true)
  }

  const handleStartTelemedicine = async (entry: any, externalMeetingWindow?: Window | null) => {
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
    const patientId = entry.patientId
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
    const rowKey = entry.queueId ?? entry.id
    setTelemedicineStartingQueueId(rowKey)
    try {
      const qid = Number(entry.queueId ?? entry.id)
      const useQueueOrigin = Number.isFinite(qid) && qid > 0
      const linkExtra = telemedicineOptionalLinkBody(telemedicineMeetingUrl, telemedicineMeetingPasscode)
      const created = await telemedicineApi.createSession(
        useQueueOrigin
          ? {
              originType: "queue",
              queueEntryId: qid,
              doctorId,
              videoProvider: telemedicineVideoProvider,
              notes: `Telemedicine from queue (ticket ${entry.ticketNumber || rowKey || "—"})`,
              ...linkExtra,
            }
          : {
              originType: "standalone",
              patientId: Number(patientId),
              doctorId,
              videoProvider: telemedicineVideoProvider,
              notes: `Telemedicine from queue (ticket ${entry.ticketNumber || rowKey || "—"})`,
              ...linkExtra,
            },
      )
      if (created?.sessionId) {
        const externalMeetingHref =
          !isZoomProvider(telemedicineVideoProvider) && !isDailyProvider(telemedicineVideoProvider)
            ? meetingHrefFromUrl(created.zoomJoinUrl || telemedicineMeetingUrl)
            : ""
        const patientDisplayName =
          entry.patientFirstName && entry.patientLastName
            ? `${entry.patientFirstName} ${entry.patientLastName}`.trim()
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
        setPendingTelemedicineEntry(null)
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
      loadQueueData()
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
      loadQueueData()
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

  const statuses = [
    { value: "waiting", label: "Waiting" },
    { value: "called", label: "Called" },
    { value: "serving", label: "Serving" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ]

  const entryToLite = (entry: any): QueueEntryLite => ({
    queueId: entry.queueId,
    patientId: entry.patientId,
    patientName: entry.patientName,
    notes: entry.notes ?? "",
  })

  return (
    <>
      <div className="rounded-md border">
        {isTriage ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          handleStartTriage(entry.patientId, entry.patientName, entry.queueId || parseInt(entry.id) || 0)
                        }}
                        className="w-full"
                      >
                        <Stethoscope className="h-3 w-3 mr-1" />
                        Triage Assessment
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : isConsultation ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => {
                  const hasEncounterToday = encountersToday[entry.patientId] || false
                  return (
                    <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                      <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                      <div className="col-span-3 font-medium">{entry.patientName}</div>
                      <div className="col-span-2">
                        <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                          {entry.priority}
                        </Badge>
                      </div>
                      <div className="col-span-2">
                        <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                          {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-muted-foreground">
                        {calculateWaitTime(entry)} min
                        {entry.estimatedWaitTime && entry.status === "waiting" && (
                          <span> (Est. {entry.estimatedWaitTime} min)</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Button
                          variant={hasEncounterToday ? "outline" : "default"}
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            console.log('Button clicked for patient:', entry.patientId, entry.patientName)
                            handleStartConsultation(entry.patientId, entry.patientName)
                          }}
                          className="w-full"
                        >
                          {hasEncounterToday ? (
                            <>
                              <FileText className="h-3 w-3 mr-1" />
                              Continue Consultation
                            </>
                          ) : (
                            <>
                              <PlayCircle className="h-3 w-3 mr-1" />
                              Start Consultation
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : isPharmacy ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedPatientForDispense({ patientId: parseInt(entry.patientId), patientName: entry.patientName })
                          setDispenseDialogOpen(true)
                        }}
                        className="w-full"
                      >
                        <Pill className="h-3 w-3 mr-1" />
                        Dispense Medication
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : isCashier ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setViewingBill({
                            patientId: parseInt(entry.patientId),
                            queueId: entry.queueId || parseInt(entry.id) || 0,
                            notes: entry.notes || ""
                          })
                        }}
                        className="w-full"
                      >
                        <Receipt className="h-3 w-3 mr-1" />
                        View Bill
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : isRadiology ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setRadiologyQueueForReport(entryToLite(entry))}
                        className="w-full"
                      >
                        <Scan className="h-3 w-3 mr-1" />
                        Record report
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : isProcedure ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setProcedureQueueForComplete(entryToLite(entry))}
                        className="w-full"
                      >
                        <ClipboardList className="h-3 w-3 mr-1" />
                        Complete & outcome
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : isTelemedicine ? (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Action</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setPendingTelemedicineEntry(entry)}
                        disabled={telemedicineStartingQueueId === (entry.queueId ?? entry.id)}
                        className="w-full"
                      >
                        <Video className="h-3 w-3 mr-1" />
                        {telemedicineStartingQueueId === (entry.queueId ?? entry.id)
                          ? "Starting…"
                          : "Start Telemedicine"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Patient</div>
              <div className="col-span-2">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Wait Time</div>
              <div className="col-span-2">Actions</div>
            </div>
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading queue data...</div>
            ) : queueData.length > 0 ? (
              <div className="divide-y">
                {queueData.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-12 p-3 text-sm items-center">
                    <div className="col-span-1">{entry.ticketNumber || entry.queueNumber}</div>
                    <div className="col-span-3 font-medium">{entry.patientName}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className={`${getPriorityColor(entry.priority)}`}>
                        {entry.priority}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={entry.status === "waiting" || entry.status === "called" ? "secondary" : "default"}>
                        {entry.status === "waiting" ? "Waiting" : entry.status === "called" ? "Called" : "In Service"}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      {calculateWaitTime(entry)} min
                      {entry.estimatedWaitTime && entry.status === "waiting" && (
                        <span> (Est. {entry.estimatedWaitTime} min)</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(entry)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setChangingStatus(entry)
                              setNewStatus(entry.status || "waiting")
                            }}
                          >
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Change Status
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingQueue(entry)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                No patients in queue for {getServicePointName(servicePoint)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Patient Encounter Form for consultation */}
      {isConsultation && selectedPatient && (
        <>
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-muted-foreground p-2 bg-muted rounded mb-2">
              Debug: Form should render. Patient: {selectedPatient.patientId}, Open: {encounterFormOpen ? 'Yes' : 'No'}, Doctor: {currentDoctorId || 'None'}
            </div>
          )}
          <PatientEncounterForm
            open={encounterFormOpen}
            onOpenChange={(open) => {
              console.log('Encounter form onOpenChange:', open, 'Patient:', selectedPatient?.patientId)
              setEncounterFormOpen(open)
              if (!open) {
                setSelectedPatient(null)
              }
            }}
            initialPatientId={selectedPatient.patientId}
            initialDoctorId={currentDoctorId}
            onSuccess={() => {
              console.log('Encounter saved successfully')
              // Refresh queue data to update encounter status
              setEncountersToday(prev => ({
                ...prev,
                [selectedPatient.patientId]: true
              }))
            }}
          />
        </>
      )}

      {/* Dispense Medication Dialog for pharmacy */}
      {isPharmacy && selectedPatientForDispense && (
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
            loadQueueData()
          }}
        />
      )}

      <RadiologyQueueReportDialog
        queueEntry={radiologyQueueForReport}
        onClose={() => setRadiologyQueueForReport(null)}
        onSuccess={loadQueueData}
      />
      <ProcedureQueueCompleteDialog
        queueEntry={procedureQueueForComplete}
        onClose={() => setProcedureQueueForComplete(null)}
        onSuccess={loadQueueData}
      />

      <Dialog open={!!pendingTelemedicineEntry} onOpenChange={(open) => !open && setPendingTelemedicineEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Telemedicine Session</DialogTitle>
            <DialogDescription>
              Choose the video platform for {pendingTelemedicineEntry?.patientName || "this patient"}, then start the session.
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
            <Button type="button" variant="outline" onClick={() => setPendingTelemedicineEntry(null)} disabled={telemedicineStartingQueueId != null}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingTelemedicineEntry) return
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
                void handleStartTelemedicine(pendingTelemedicineEntry, meetWindow)
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

      {/* Triage Assessment Form for triage */}
      {isTriage && selectedPatientForTriage && (
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
              loadQueueData()
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

      {/* View Bill Dialog for cashier */}
      {isCashier && viewingBill && (
        <ViewBillDialog
          open={!!viewingBill}
          onOpenChange={(open) => !open && setViewingBill(null)}
          patientId={viewingBill.patientId}
          queueId={viewingBill.queueId}
          queueNotes={viewingBill.notes}
          onQueueCompleted={() => {
            loadQueueData()
            setViewingBill(null)
          }}
        />
      )}

      {/* Add/Edit Queue Form */}
      <AddToQueueForm
        open={addQueueOpen}
        onOpenChange={(open) => {
          setAddQueueOpen(open)
          if (!open) {
            setEditingQueue(null)
          }
        }}
        onSuccess={() => {
          loadQueueData()
          setEditingQueue(null)
        }}
        queueEntry={editingQueue}
      />

      {/* Delete Queue Confirmation */}
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
                  <strong>Ticket:</strong> {deletingQueue.ticketNumber || deletingQueue.queueNumber}
                  <br />
                  <strong>Patient:</strong> {deletingQueue.patientName || "Unknown"}
                  <br />
                  <strong>Service Point:</strong> {getServicePointName(servicePoint)}
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

      {/* Change Status Dialog */}
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
              Update the status for ticket {changingStatus?.ticketNumber || changingStatus?.queueNumber}
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
    </>
  )
}
