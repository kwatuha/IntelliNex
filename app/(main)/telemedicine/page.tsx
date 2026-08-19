"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { telemedicineApi } from "@/lib/api"
import { getTelemedicineProviderLabel } from "@/lib/telemedicine-providers"
import { useToast } from "@/hooks/use-toast"
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, LayoutList, Loader2, RefreshCw, Settings, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth/auth-context"
import {
  TelemedicineFacilityActiveVisits,
  type TelemedicineFacilityActiveVisitsHandle,
} from "@/components/telemedicine-facility-active-visits"
import { TelemedicineMeetingLinkActions } from "@/components/telemedicine-meeting-link-actions"
import { TelemedicineMetrics } from "@/components/telemedicine-metrics"
import { TelemedicineProviderCalendar } from "@/components/telemedicine-provider-calendar"
import { DoctorAppointments } from "@/components/doctor-appointments"

const PAGE_SIZE = 25
/** Waiting = telemedicine queue + sessions not yet started. */
type SessionCategory = "waiting" | "in_progress" | "ended" | "all"

function humanizeStatus(status: string | undefined) {
  if (!status) return "—"
  const labels: Record<string, string> = {
    waiting: "Waiting",
    called: "Called",
    serving: "In progress",
    created: "Waiting (session)",
    waiting_for_consent: "Waiting for consent",
    in_progress: "In progress",
    recording_started: "In progress",
    ended: "Ended",
  }
  return labels[status] || status.replace(/_/g, " ")
}

export default function TelemedicineHubPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const role = String(user?.role || "").toLowerCase()
  const isNurseLike = role === "nurse" || role.includes("triage")
  const isDoctorLike =
    Boolean(user?.id) &&
    !isNurseLike &&
    (role === "doctor" ||
      role.includes("telemedicine") ||
      role.includes("clinical_officer") ||
      role.includes("medical_officer") ||
      role.includes("clinician"))
  const [tab, setTab] = useState<"current" | "all" | "analytics" | "calendar" | "bookings">(
    isNurseLike ? "calendar" : "current"
  )

  useEffect(() => {
    if (isNurseLike && (tab === "bookings" || tab === "analytics" || tab === "current" || tab === "all")) {
      setTab("calendar")
    }
  }, [isNurseLike, tab])
  const [page, setPage] = useState(1)
  const [allSessionsLoading, setAllSessionsLoading] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [queueEntries, setQueueEntries] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [sessionCategory, setSessionCategory] = useState<SessionCategory>("waiting")
  /** Bumped when an active visit ends so “All sessions” refetches. */
  const [allSessionsVersion, setAllSessionsVersion] = useState(0)
  const activeVisitsRef = useRef<TelemedicineFacilityActiveVisitsHandle | null>(null)
  const [activeVisitsRefreshBusy, setActiveVisitsRefreshBusy] = useState(false)

  useLayoutEffect(() => {
    if (tab === "all") setAllSessionsLoading(true)
  }, [tab])

  useEffect(() => {
    if (tab !== "all") return
    let cancelled = false
    ;(async () => {
      try {
        setAllSessionsLoading(true)
        if (sessionCategory === "waiting") {
          const [queueRows, pendingRes] = await Promise.all([
            telemedicineApi.listQueue(),
            telemedicineApi.listSessions({
              page: 1,
              limit: PAGE_SIZE,
              scope: "facility",
              statusGroup: "pending",
            }),
          ])
          if (cancelled) return
          setQueueEntries(queueRows || [])
          setSessions(pendingRes.sessions || [])
          setTotal((queueRows?.length || 0) + (pendingRes.total ?? 0))
          return
        }
        const res = await telemedicineApi.listSessions({
          page,
          limit: PAGE_SIZE,
          scope: "facility",
          statusGroup: sessionCategory === "all" ? undefined : sessionCategory,
        })
        if (cancelled) return
        setSessions(res.sessions || [])
        setQueueEntries([])
        setTotal(res.total ?? 0)
      } catch (err: any) {
        if (!cancelled) {
          console.error(err)
          toast({
            title: "Could not load sessions",
            description: err?.message || "Failed to list telemedicine sessions",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setAllSessionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, page, toast, allSessionsVersion, sessionCategory])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const formatWhen = (v: string | null | undefined) => {
    if (!v) return "—"
    try {
      return new Date(v).toLocaleString()
    } catch {
      return String(v)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Video className="h-7 w-7" />
            Telemedicine
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/telemedicine/settings">
              <Settings className="h-4 w-4 mr-2" />
              My Zoom defaults
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = v as "current" | "all" | "analytics" | "calendar" | "bookings"
            setTab(next)
            if (next === "all") setPage(1)
          }}
          className="w-full"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {isNurseLike ? "Schedule teleconsults" : "Facility telemedicine"}
            </CardTitle>
            {isNurseLike ? (
              <p className="text-sm text-muted-foreground">
                Book patients from your facility for teleconsult. Triage first, then schedule on the calendar.
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between sm:gap-3">
              <TabsList
                className={cn(
                  "grid h-auto w-full flex-1 gap-1 p-1 sm:min-w-0",
                  isNurseLike
                    ? "max-w-md grid-cols-1"
                    : isDoctorLike
                      ? "max-w-4xl grid-cols-2 sm:grid-cols-5"
                      : "max-w-3xl grid-cols-2 sm:grid-cols-4"
                )}
              >
                {!isNurseLike ? (
                  <TabsTrigger value="current" className="gap-2 py-2.5">
                    <Video className="h-4 w-4 shrink-0" />
                    Current visits
                  </TabsTrigger>
                ) : null}
                {isDoctorLike ? (
                  <TabsTrigger value="bookings" className="gap-2 py-2.5">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    My bookings
                  </TabsTrigger>
                ) : null}
                {!isNurseLike ? (
                  <TabsTrigger value="all" className="gap-2 py-2.5">
                    <LayoutList className="h-4 w-4 shrink-0" />
                    Session board
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="calendar" className="gap-2 py-2.5">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {isNurseLike ? "Schedule teleconsult" : "Calendar"}
                </TabsTrigger>
                {!isNurseLike ? (
                  <TabsTrigger value="analytics" className="gap-2 py-2.5">
                    <BarChart3 className="h-4 w-4 shrink-0" />
                    Metrics
                  </TabsTrigger>
                ) : null}
              </TabsList>
              {tab === "current" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto shrink-0 self-stretch px-3 sm:self-auto sm:py-2"
                  disabled={activeVisitsRefreshBusy}
                  onClick={() => {
                    setActiveVisitsRefreshBusy(true)
                    void Promise.resolve(activeVisitsRef.current?.refresh()).finally(() => setActiveVisitsRefreshBusy(false))
                  }}
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", activeVisitsRefreshBusy && "animate-spin")} />
                  Refresh
                </Button>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <TabsContent value="current" className="mt-0 outline-none focus-visible:ring-0">
              <TelemedicineFacilityActiveVisits
                ref={activeVisitsRef}
                hideToolbarRefresh
                onVisitEnded={() => setAllSessionsVersion((n) => n + 1)}
              />
            </TabsContent>

            <TabsContent value="all" className="mt-0 outline-none focus-visible:ring-0 space-y-3">
              <div className="flex flex-wrap gap-2 border-b pb-3">
                {([
                  ["waiting", "Waiting"],
                  ["in_progress", "In progress"],
                  ["ended", "Ended"],
                  ["all", "All"],
                ] as Array<[SessionCategory, string]>).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={sessionCategory === value ? "default" : "outline"}
                    onClick={() => {
                      setSessionCategory(value)
                      setPage(1)
                    }}
                  >
                    {label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={allSessionsLoading}
                  onClick={() => setAllSessionsVersion((n) => n + 1)}
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", allSessionsLoading && "animate-spin")} />
                  Refresh
                </Button>
              </div>
              {allSessionsLoading ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : sessionCategory === "waiting" ? (
                queueEntries.length === 0 && sessions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No patients waiting for telemedicine. Add someone to the telemedicine queue or start a session from{" "}
                    <Link href="/telemedicine/create" className="underline">
                      Telemedicine sessions
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="space-y-4">
                    {queueEntries.length > 0 ? (
                      <div className="rounded-md border overflow-x-auto bg-background/50">
                        <div className="border-b px-3 py-2 text-sm font-medium">In telemedicine queue</div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Ticket</TableHead>
                              <TableHead>Patient</TableHead>
                              <TableHead>Facility</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Queued at</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {queueEntries.map((entry) => (
                              <TableRow key={`q-${entry.queueId}`}>
                                <TableCell className="font-mono text-sm">
                                  {entry.ticketNumber || `#${entry.queueId}`}
                                </TableCell>
                                <TableCell>
                                  <p className="font-medium">
                                    {`${entry.patientFirstName || ""} ${entry.patientLastName || ""}`.trim() || "—"}
                                  </p>
                                  {entry.patientNumber ? (
                                    <p className="text-xs text-muted-foreground">{entry.patientNumber}</p>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{entry.branchName || "Unassigned"}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={entry.status === "serving" ? "default" : "outline"}>
                                    {humanizeStatus(entry.status)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                  {formatWhen(entry.arrivalTime || entry.createdAt)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" asChild>
                                    <Link href="/telemedicine/create">Start visit</Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}

                    {sessions.length > 0 ? (
                      <div className="rounded-md border overflow-x-auto bg-background/50">
                        <div className="border-b px-3 py-2 text-sm font-medium">
                          Sessions created, not started yet
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>ID</TableHead>
                              <TableHead>Patient</TableHead>
                              <TableHead>Facility</TableHead>
                              <TableHead>Doctor</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead className="min-w-[160px]">Open</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sessions.map((s) => (
                              <TableRow key={`s-${s.sessionId}`}>
                                <TableCell className="font-mono text-sm">
                                  <Link href={`/telemedicine/${s.sessionId}`} className="text-primary hover:underline">
                                    #{s.sessionId}
                                  </Link>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">
                                      {s.patientFirstName || s.patientLastName
                                        ? `${s.patientFirstName || ""} ${s.patientLastName || ""}`.trim()
                                        : "—"}
                                    </p>
                                    {s.patientNumber ? (
                                      <p className="text-xs text-muted-foreground">{s.patientNumber}</p>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{s.branchName || "Unassigned"}</Badge>
                                </TableCell>
                                <TableCell>
                                  {s.doctorFirstName || s.doctorLastName
                                    ? `${s.doctorFirstName || ""} ${s.doctorLastName || ""}`.trim()
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{humanizeStatus(s.status)}</Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                  {formatWhen(s.activityAt || s.createdAt)}
                                </TableCell>
                                <TableCell>
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={`/telemedicine/${s.sessionId}`}>Open session</Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}
                  </div>
                )
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No {sessionCategory === "all" ? "" : humanizeStatus(sessionCategory).toLowerCase() + " "}sessions found.
                  Start one from{" "}
                  <Link href="/telemedicine/create" className="underline">
                    Telemedicine sessions
                  </Link>
                  , from an appointment, or from inpatient care.
                </p>
              ) : (
                <>
                  <div className="rounded-md border overflow-x-auto bg-background/50">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Facility</TableHead>
                          <TableHead>Doctor</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="min-w-[200px]">Join &amp; copy</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.sessionId}>
                            <TableCell className="font-mono text-sm">
                              <Link href={`/telemedicine/${s.sessionId}`} className="text-primary hover:underline">
                                #{s.sessionId}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {s.patientFirstName || s.patientLastName
                                    ? `${s.patientFirstName || ""} ${s.patientLastName || ""}`.trim()
                                    : "—"}
                                </p>
                                {s.patientNumber && (
                                  <p className="text-xs text-muted-foreground">{s.patientNumber}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{s.branchName || "Unassigned"}</Badge>
                            </TableCell>
                            <TableCell>
                              {s.doctorFirstName || s.doctorLastName
                                ? `${s.doctorFirstName || ""} ${s.doctorLastName || ""}`.trim()
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-normal">
                                {getTelemedicineProviderLabel(s.provider)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{s.originType || "—"}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={s.status === "in_progress" ? "default" : "secondary"}>
                                {humanizeStatus(s.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatWhen(s.activityAt || s.endedAt || s.startedAt || s.createdAt)}
                            </TableCell>
                            <TableCell className="align-top">
                              <TelemedicineMeetingLinkActions
                                compact
                                sessionId={s.sessionId}
                                zoomJoinUrl={s.zoomJoinUrl}
                                hideMeetingLinkField
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages} · {total} total
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="bookings" className="mt-0 outline-none focus-visible:ring-0">
              {user?.id ? (
                <DoctorAppointments doctorId={String(user.id)} embedded />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Sign in as a doctor to view bookings.</p>
              )}
            </TabsContent>

            <TabsContent value="calendar" className="mt-0 outline-none focus-visible:ring-0">
              <TelemedicineProviderCalendar />
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 outline-none focus-visible:ring-0">
              <TelemedicineMetrics />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
