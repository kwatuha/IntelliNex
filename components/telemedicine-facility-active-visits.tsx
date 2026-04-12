"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { telemedicineApi } from "@/lib/api"
import { getTelemedicineProviderLabel } from "@/lib/telemedicine-providers"
import { useToast } from "@/hooks/use-toast"
import { TelemedicineMeetingLinkActions } from "@/components/telemedicine-meeting-link-actions"
import { TelemedicineHelpLink } from "@/components/telemedicine-help-link"
import { Loader2, OctagonAlert, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

function humanizeStatus(status: string | undefined) {
  if (!status) return "—"
  return status.replace(/_/g, " ")
}

export type TelemedicineFacilityActiveVisitsHandle = {
  refresh: () => Promise<void>
}

type Props = {
  className?: string
  /** Called after a visit is ended so the parent can refresh “All sessions”. */
  onVisitEnded?: () => void
  /** When true, omit the top “Refresh” row (parent renders refresh beside tabs). */
  hideToolbarRefresh?: boolean
}

/**
 * Facility-wide **active** telemedicine visits (cards with join + end). Used inside the hub “Current visits” tab.
 */
export const TelemedicineFacilityActiveVisits = forwardRef<TelemedicineFacilityActiveVisitsHandle, Props>(function TelemedicineFacilityActiveVisits(
  { className, onVisitEnded, hideToolbarRefresh = false },
  ref,
) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<any[]>([])
  const [endConfirmId, setEndConfirmId] = useState<string | null>(null)
  const [ending, setEnding] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await telemedicineApi.listSessions({
        page: 1,
        limit: 50,
        scope: "facility",
        statusGroup: "active",
      })
      setSessions(res.sessions || [])
    } catch (e: any) {
      console.error(e)
      toast({
        title: "Could not load active visits",
        description: e?.message || "Failed to list telemedicine sessions",
        variant: "destructive",
      })
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => load(),
    }),
    [load],
  )

  const handleEndSession = async () => {
    if (!endConfirmId) return
    try {
      setEnding(true)
      await telemedicineApi.endSession(endConfirmId)
      toast({
        title: "Visit ended",
        description: "Session is closed. It will appear in All sessions (newest first).",
      })
      setEndConfirmId(null)
      await load()
      onVisitEnded?.()
    } catch (e: any) {
      toast({
        title: "Could not end session",
        description: e?.message || "Request failed",
        variant: "destructive",
      })
    } finally {
      setEnding(false)
    }
  }

  return (
    <>
      <div className={cn("space-y-4", className)}>
        {!hideToolbarRefresh ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="shrink-0">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-md border bg-background/50 py-4 text-center text-sm text-muted-foreground">
            No active visits. <TelemedicineHelpLink className="inline-flex" />
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.sessionId} className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">
                      {s.patientFirstName || s.patientLastName
                        ? `${s.patientFirstName || ""} ${s.patientLastName || ""}`.trim()
                        : "Patient"}
                      {s.patientNumber ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">· {s.patientNumber}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Session <span className="font-mono">#{s.sessionId}</span>
                      <span className="mx-2">·</span>
                      Lead:{" "}
                      {s.doctorFirstName || s.doctorLastName
                        ? `${s.doctorFirstName || ""} ${s.doctorLastName || ""}`.trim()
                        : "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{getTelemedicineProviderLabel(s.provider)}</Badge>
                    <Badge variant="outline">{humanizeStatus(s.status)}</Badge>
                    <Badge variant="outline" className="font-normal">
                      {s.originType || "—"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Join &amp; share</p>
                    <TelemedicineMeetingLinkActions
                      sessionId={s.sessionId}
                      zoomJoinUrl={s.zoomJoinUrl}
                      hideMeetingLinkField
                    />
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setEndConfirmId(String(s.sessionId))}
                    >
                      <OctagonAlert className="h-4 w-4" />
                      End visit
                    </Button>
                    <span className="text-center text-[10px] text-muted-foreground sm:text-right">Closes session for everyone</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={endConfirmId != null} onOpenChange={(open) => !open && !ending && setEndConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this video visit?</AlertDialogTitle>
            <AlertDialogDescription>
              Session <span className="font-mono">#{endConfirmId}</span> will be marked ended and removed from active boards. Use this for duplicate or
              mistaken sessions. The lead clinician and facility staff can do this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={ending}
              onClick={(e) => {
                e.preventDefault()
                void handleEndSession()
              }}
            >
              {ending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              End visit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

TelemedicineFacilityActiveVisits.displayName = "TelemedicineFacilityActiveVisits"
