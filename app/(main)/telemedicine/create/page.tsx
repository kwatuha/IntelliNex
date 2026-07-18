"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { queueApi, telemedicineApi } from "@/lib/api"
import { useAuth } from "@/lib/auth/auth-context"
import { useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { Loader2, ListOrdered, RefreshCw, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TelemedicineProviderSelect } from "@/components/telemedicine-provider-select"
import {
  TelemedicineOptionalMeetingLinkFields,
  telemedicineOptionalLinkBody,
} from "@/components/telemedicine-optional-meeting-link-fields"
import { getTelemedicineProviderLabel, isDailyProvider, isZoomProvider, providerRequiresPastedMeetingLink, meetingHrefFromUrl, type TelemedicineVideoProviderId } from "@/lib/telemedicine-providers"
import { telemedicineCreateToast } from "@/lib/telemedicine-create-result"
import { TelemedicineFacilityActiveVisits } from "@/components/telemedicine-facility-active-visits"
import { TelemedicineMeetingLinkActions } from "@/components/telemedicine-meeting-link-actions"
import { TelemedicineHelpLink } from "@/components/telemedicine-help-link"
import { TelemedicineZoomDefaultsRequiredBanner } from "@/components/telemedicine-zoom-defaults-banner"
import { useTelemedicineZoomDefaults } from "@/lib/hooks/use-telemedicine-zoom-defaults"

const SESSION_PAGE_SIZE = 40

function humanizeSessionStatus(status: string | undefined) {
  if (!status) return "—"
  const m: Record<string, string> = {
    created: "Created",
    waiting_for_consent: "Waiting for consent",
    in_progress: "In progress",
    ended: "Ended",
    recording_started: "Recording",
    recording_ready: "Recording ready",
    recording_failed: "Recording failed",
  }
  return m[status] || status.replace(/_/g, " ")
}

function sessionStatusBadgeVariant(
  status: string | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline"
  if (status === "ended") return "secondary"
  if (status === "in_progress" || status === "recording_started") return "default"
  if (status === "waiting_for_consent" || status === "created") return "outline"
  return "secondary"
}

export default function TelemedicineCreatePage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { openSession: openTelemedicineFloating } = useTelemedicineFloating()
  const { loading: zoomDefaultsLoading, hasDefaults: hasZoomDefaults } = useTelemedicineZoomDefaults()

  const [mainTab, setMainTab] = useState<"queue" | "sessions">("queue")
  const [sessionScope, setSessionScope] = useState<"active" | "ended" | "all">("active")

  const [queueEntries, setQueueEntries] = useState<any[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [startingQueueId, setStartingQueueId] = useState<string | number | null>(null)
  const [pendingQueueEntry, setPendingQueueEntry] = useState<any>(null)

  const [sessions, setSessions] = useState<any[]>([])
  const [sessionsTotal, setSessionsTotal] = useState(0)
  const [sessionsPage, setSessionsPage] = useState(1)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const [videoProvider, setVideoProvider] = useState<TelemedicineVideoProviderId>("daily")
  const [optionalMeetingUrl, setOptionalMeetingUrl] = useState("")
  const [optionalMeetingPasscode, setOptionalMeetingPasscode] = useState("")
  const selectedProviderNeedsZoomDefaults = isZoomProvider(videoProvider) && !optionalMeetingUrl.trim()
  const selectedProviderNeedsMeetingLink = providerRequiresPastedMeetingLink(videoProvider, optionalMeetingUrl)
  const canStartNewTelemedicineVisit =
    !selectedProviderNeedsMeetingLink &&
    (!selectedProviderNeedsZoomDefaults || (!zoomDefaultsLoading && hasZoomDefaults))

  const loadQueue = useCallback(async () => {
    try {
      setQueueLoading(true)
      const rows = await queueApi.getAll("telemedicine", undefined, 1, 200, false)
      setQueueEntries(Array.isArray(rows) ? rows : [])
    } catch (e: any) {
      console.error(e)
      toast({
        title: "Could not load queue",
        description: e?.message || "Failed to fetch telemedicine queue",
        variant: "destructive",
      })
      setQueueEntries([])
    } finally {
      setQueueLoading(false)
    }
  }, [toast])

  const loadSessions = useCallback(async () => {
    try {
      setSessionsLoading(true)
      const statusGroup = sessionScope === "all" ? undefined : sessionScope
      const res = await telemedicineApi.listSessions({
        page: sessionsPage,
        limit: SESSION_PAGE_SIZE,
        scope: "facility",
        statusGroup,
      })
      setSessions(res.sessions || [])
      setSessionsTotal(res.total ?? 0)
    } catch (e: any) {
      console.error(e)
      toast({
        title: "Could not load sessions",
        description: e?.message || "Failed to list telemedicine sessions",
        variant: "destructive",
      })
      setSessions([])
      setSessionsTotal(0)
    } finally {
      setSessionsLoading(false)
    }
  }, [toast, sessionsPage, sessionScope])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  useEffect(() => {
    if (mainTab !== "sessions") return
    void loadSessions()
  }, [mainTab, sessionsPage, sessionScope, loadSessions])

  const actorDoctorId = (user as { userId?: string; id?: string })?.userId ?? (user as { id?: string })?.id

  const handleStartFromQueueRow = async (entry: any, externalMeetingWindow?: Window | null) => {
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
    const pid = entry.patientId
    if (!pid) {
      toast({ title: "Missing patient", description: "This queue row has no patient.", variant: "destructive" })
      return
    }
    const doc = actorDoctorId != null && actorDoctorId !== "" ? Number(actorDoctorId) : NaN
    if (!Number.isFinite(doc)) {
      toast({
        title: "Missing clinician",
        description: "Sign in as the clinician who will run the telemedicine visit.",
        variant: "destructive",
      })
      return
    }
    const rowKey = entry.queueId ?? entry.id
    if (startingQueueId != null) return
    setStartingQueueId(rowKey)
    try {
      const qid = Number(entry.queueId ?? entry.id)
      const useQueueOrigin = Number.isFinite(qid) && qid > 0
      const linkExtra = telemedicineOptionalLinkBody(optionalMeetingUrl, optionalMeetingPasscode)
      const created = await telemedicineApi.createSession(
        useQueueOrigin
          ? {
              originType: "queue",
              queueEntryId: qid,
              doctorId: doc,
              videoProvider,
              notes: `Telemedicine from queue (ticket ${entry.ticketNumber || rowKey || "—"})`,
              ...linkExtra,
            }
          : {
              originType: "standalone",
              patientId: Number(pid),
              doctorId: doc,
              videoProvider,
              notes: `Telemedicine from queue (ticket ${entry.ticketNumber || rowKey || "—"})`,
              ...linkExtra,
            },
      )
      if (created?.sessionId) {
        const externalMeetingHref =
          !isZoomProvider(videoProvider) && !isDailyProvider(videoProvider)
            ? meetingHrefFromUrl(created.zoomJoinUrl || optionalMeetingUrl)
            : ""
        const patientDisplayName =
          entry.patientFirstName && entry.patientLastName
            ? `${entry.patientFirstName} ${entry.patientLastName}`.trim()
            : undefined
        openTelemedicineFloating(created.sessionId, { patientId: pid, patientDisplayName })
        if (externalMeetingHref) {
          if (externalMeetingWindow) {
            externalMeetingWindow.location.href = externalMeetingHref
          } else {
            window.open(externalMeetingHref, "_blank", "noopener,noreferrer")
          }
        }
        toast(
          telemedicineCreateToast(created, {
            title: "Telemedicine session started",
            description: isDailyProvider(videoProvider)
              ? "Daily.co room is ready in the floating panel — join in-page video there."
              : externalMeetingHref
                ? "Meeting opened in a new browser tab. The HMIS session panel is also available for consent and documentation."
                : "Use the floating panel — share the meeting link from the Sessions tab so others can join.",
          }),
        )
        setPendingQueueEntry(null)
        void loadQueue()
        void loadSessions()
      }
    } catch (error: any) {
      console.error(error)
      externalMeetingWindow?.close()
      toast({
        title: "Could not start session",
        description: error?.message || "Telemedicine create failed",
        variant: "destructive",
      })
    } finally {
      setStartingQueueId(null)
    }
  }

  const totalSessionPages = Math.max(1, Math.ceil(sessionsTotal / SESSION_PAGE_SIZE))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Video className="h-7 w-7" />
            Telemedicine sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Queue, active visits, and session board.</span>
            <TelemedicineHelpLink />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" type="button" asChild>
            <Link href="/queue">Open full queue</Link>
          </Button>
          <Button variant="outline" size="sm" type="button" asChild>
            <Link href="/telemedicine/settings">My Zoom defaults</Link>
          </Button>
        </div>
      </div>

      <TelemedicineFacilityActiveVisits />

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "queue" | "sessions")} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="queue" className="gap-2">
            <ListOrdered className="h-4 w-4" />
            Telemedicine queue
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Video className="h-4 w-4" />
            Current sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">Patients waiting (telemedicine)</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Same queue as Queue Management → Telemedicine.</span>
                  <TelemedicineHelpLink />
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={queueLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${queueLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {queueLoading ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : queueEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No one in the telemedicine queue. Add patients from registration or the service desk queue screen.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="text-right w-[160px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueEntries.map((entry: any) => {
                        const key = entry.queueId ?? entry.id
                        const busy = startingQueueId === key
                        return (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-sm">{entry.ticketNumber || key}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {entry.patientFirstName || entry.patientLastName
                                  ? `${entry.patientFirstName || ""} ${entry.patientLastName || ""}`.trim()
                                  : "—"}
                              </div>
                              {entry.patientNumber && (
                                <div className="text-xs text-muted-foreground">{entry.patientNumber}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{entry.status || "—"}</Badge>
                            </TableCell>
                            <TableCell>{entry.priority || "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setPendingQueueEntry(entry)}
                                disabled={busy || entry.status === "completed" || entry.status === "cancelled"}
                              >
                                {busy ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Starting…
                                  </>
                                ) : (
                                  <>
                                    <Video className="h-4 w-4 mr-2" />
                                    Start Telemedicine
                                  </>
                                )}
                              </Button>
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
        </TabsContent>

        <TabsContent value="sessions" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Session board</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Filter active / ended / all. Join actions use the same HMIS session.</span>
                <TelemedicineHelpLink />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={sessionScope === "active" ? "default" : "outline"}
                  onClick={() => {
                    setSessionScope("active")
                    setSessionsPage(1)
                  }}
                >
                  Active / in progress
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sessionScope === "ended" ? "default" : "outline"}
                  onClick={() => {
                    setSessionScope("ended")
                    setSessionsPage(1)
                  }}
                >
                  Ended
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sessionScope === "all" ? "default" : "outline"}
                  onClick={() => {
                    setSessionScope("all")
                    setSessionsPage(1)
                  }}
                >
                  All
                </Button>
              </div>

              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => void loadSessions()} disabled={sessionsLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${sessionsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {sessionsLoading ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No sessions in this filter.</p>
              ) : (
                <>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Session</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead>Clinician</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="min-w-[220px]">Join &amp; copy</TableHead>
                          <TableHead className="text-right w-[120px]">Page</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.sessionId}>
                            <TableCell className="font-mono text-sm">#{s.sessionId}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {s.patientFirstName || s.patientLastName
                                  ? `${s.patientFirstName || ""} ${s.patientLastName || ""}`.trim()
                                  : "—"}
                              </div>
                              {s.patientNumber && <div className="text-xs text-muted-foreground">{s.patientNumber}</div>}
                            </TableCell>
                            <TableCell className="text-sm">
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
                              <Badge variant={sessionStatusBadgeVariant(s.status)}>{humanizeSessionStatus(s.status)}</Badge>
                            </TableCell>
                            <TableCell className="align-top max-w-[280px]">
                              <TelemedicineMeetingLinkActions
                                compact
                                sessionId={s.sessionId}
                                zoomJoinUrl={s.zoomJoinUrl}
                                hideMeetingLinkField
                              />
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <Button type="button" variant="outline" size="sm" asChild>
                                <Link href={`/telemedicine/${s.sessionId}`}>Full page</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {totalSessionPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <p className="text-sm text-muted-foreground">
                        Page {sessionsPage} of {totalSessionPages} · {sessionsTotal} total
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={sessionsPage <= 1}
                          onClick={() => setSessionsPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={sessionsPage >= totalSessionPages}
                          onClick={() => setSessionsPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!pendingQueueEntry} onOpenChange={(open) => !open && setPendingQueueEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Telemedicine Session</DialogTitle>
            <DialogDescription>
              Choose the video platform for{" "}
              {pendingQueueEntry?.patientFirstName || pendingQueueEntry?.patientLastName
                ? `${pendingQueueEntry?.patientFirstName || ""} ${pendingQueueEntry?.patientLastName || ""}`.trim()
                : pendingQueueEntry?.patientName || "this patient"}
              , then start the session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isZoomProvider(videoProvider) && (
              <TelemedicineZoomDefaultsRequiredBanner loading={zoomDefaultsLoading} hasDefaults={hasZoomDefaults} />
            )}
            <TelemedicineProviderSelect
              label="Video platform"
              value={videoProvider}
              onChange={setVideoProvider}
              disabled={startingQueueId != null}
            />
            <TelemedicineOptionalMeetingLinkFields
              videoProvider={videoProvider}
              joinUrl={optionalMeetingUrl}
              onJoinUrlChange={setOptionalMeetingUrl}
              passcode={optionalMeetingPasscode}
              onPasscodeChange={setOptionalMeetingPasscode}
            />
            {selectedProviderNeedsMeetingLink && (
              <p className="text-sm text-destructive">
                Paste a {getTelemedicineProviderLabel(videoProvider)} link before starting.
              </p>
            )}
            {isDailyProvider(videoProvider) && !optionalMeetingUrl.trim() && (
              <p className="text-sm text-muted-foreground">
                A Daily.co room will be created automatically when the session starts (requires{" "}
                <code className="text-xs">DAILY_API_KEY</code> on the API).
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingQueueEntry(null)} disabled={startingQueueId != null}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingQueueEntry) return
                const meetWindow =
                  !isZoomProvider(videoProvider) &&
                  !isDailyProvider(videoProvider) &&
                  optionalMeetingUrl.trim()
                    ? window.open("about:blank", "_blank")
                    : null
                if (meetWindow) {
                  meetWindow.document.title = "Opening meeting..."
                  meetWindow.document.body.innerHTML = "Opening meeting..."
                }
                void handleStartFromQueueRow(pendingQueueEntry, meetWindow)
              }}
              disabled={
                startingQueueId != null ||
                selectedProviderNeedsMeetingLink ||
                (selectedProviderNeedsZoomDefaults && zoomDefaultsLoading) ||
                !canStartNewTelemedicineVisit
              }
            >
              {startingQueueId != null ? "Starting..." : "Start Telemedicine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
