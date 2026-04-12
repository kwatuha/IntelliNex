"use client"

import { useEffect, useLayoutEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { telemedicineApi } from "@/lib/api"
import { getTelemedicineProviderLabel } from "@/lib/telemedicine-providers"
import { useToast } from "@/hooks/use-toast"
import { ChevronLeft, ChevronRight, LayoutList, Loader2, Settings, Video } from "lucide-react"
import { TelemedicineFacilityActiveVisits } from "@/components/telemedicine-facility-active-visits"
import { TelemedicineMeetingLinkActions } from "@/components/telemedicine-meeting-link-actions"
import { TelemedicineHelpLink } from "@/components/telemedicine-help-link"

const PAGE_SIZE = 25

export default function TelemedicineHubPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<"current" | "all">("current")
  const [page, setPage] = useState(1)
  const [allSessionsLoading, setAllSessionsLoading] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  /** Bumped when an active visit ends so “All sessions” refetches. */
  const [allSessionsVersion, setAllSessionsVersion] = useState(0)

  useLayoutEffect(() => {
    if (tab === "all") setAllSessionsLoading(true)
  }, [tab])

  useEffect(() => {
    if (tab !== "all") return
    let cancelled = false
    ;(async () => {
      try {
        setAllSessionsLoading(true)
        const res = await telemedicineApi.listSessions({
          page,
          limit: PAGE_SIZE,
          scope: "facility",
        })
        if (cancelled) return
        setSessions(res.sessions || [])
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
  }, [tab, page, toast, allSessionsVersion])

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
          <p className="text-muted-foreground text-sm mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <strong className="font-medium text-foreground">Current visits</strong> for the live board;{" "}
              <strong className="font-medium text-foreground">All sessions</strong> lists active and ended visits, newest first.
            </span>
            <TelemedicineHelpLink />
          </p>
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
            const next = v as "current" | "all"
            setTab(next)
            if (next === "all") setPage(1)
          }}
          className="w-full"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Facility telemedicine</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>One place for the live visit board and the full facility list.</span>
              <TelemedicineHelpLink />
            </CardDescription>
            <TabsList className="mt-3 grid h-auto w-full max-w-2xl grid-cols-2 gap-1 p-1">
              <TabsTrigger value="current" className="gap-2 py-2.5">
                <Video className="h-4 w-4 shrink-0" />
                Current visits
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-2 py-2.5">
                <LayoutList className="h-4 w-4 shrink-0" />
                All sessions
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-0">
            <TabsContent value="current" className="mt-0 outline-none focus-visible:ring-0">
              <TelemedicineFacilityActiveVisits onVisitEnded={() => setAllSessionsVersion((n) => n + 1)} />
            </TabsContent>

            <TabsContent value="all" className="mt-0 outline-none focus-visible:ring-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                Active and ended sessions for your facility, ordered by <strong className="font-medium text-foreground">created date</strong> (newest
                first).
              </p>
              {allSessionsLoading ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No sessions yet. Start one from{" "}
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
                          <TableHead>Doctor</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
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
                                {s.patientNumber && <p className="text-xs text-muted-foreground">{s.patientNumber}</p>}
                              </div>
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
                              <Badge variant="secondary">{s.status || "—"}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatWhen(s.createdAt)}
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
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
