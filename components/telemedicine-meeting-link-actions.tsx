"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { Copy, PanelRightOpen } from "lucide-react"

type Props = {
  sessionId: string | number
  zoomJoinUrl: string | null | undefined
  /** Tighter layout for table cells */
  compact?: boolean
  /** Hide "Join in HMIS" (e.g. on static marketing page) */
  hideOpenInPanel?: boolean
  /** Hide the read-only URL field — Copy link / Join in HMIS still use the URL. */
  hideMeetingLinkField?: boolean
}

/**
 * Shows the stored meeting URL in a copy-friendly field plus Join in HMIS (floating panel) and Copy link.
 */
export function TelemedicineMeetingLinkActions({
  sessionId,
  zoomJoinUrl,
  compact,
  hideOpenInPanel,
  hideMeetingLinkField,
}: Props) {
  const { toast } = useToast()
  const { openSession } = useTelemedicineFloating()

  const url = zoomJoinUrl?.trim() || ""
  const hasUrl = !!url

  const copy = async () => {
    if (!hasUrl) {
      toast({ title: "No link yet", description: "The lead clinician has not saved a meeting link.", variant: "destructive" })
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast({ title: "Copied", description: "Meeting link copied to clipboard." })
    } catch {
      toast({ title: "Copy failed", description: "Select the link in the box and copy manually.", variant: "destructive" })
    }
  }

  const joinInApp = () => {
    openSession(sessionId)
  }

  if (!hasUrl) {
    return (
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        <p className="text-xs text-muted-foreground leading-snug">
          <strong>No link in HMIS yet.</strong> The join URL is only stored automatically for <strong>Zoom</strong> when &quot;My Zoom defaults&quot; is set
          (or you used the optional link field before starting). For Meet/Teams, or Zoom without defaults, the lead clinician pastes the link in the
          session panel — then it appears here for everyone.
        </p>
        {!hideOpenInPanel && (
          <Button type="button" variant="secondary" size={compact ? "sm" : "default"} className={compact ? "h-8 text-xs" : ""} onClick={joinInApp}>
            <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" />
            Join in HMIS
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {!hideMeetingLinkField && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Meeting link</label>
          <Input
            readOnly
            value={url}
            className={`font-mono text-xs ${compact ? "h-8 py-1" : ""} bg-muted/50`}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
        </div>
      )}
      <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "gap-2"}`}>
        {!hideOpenInPanel && (
          <Button
            type="button"
            variant="secondary"
            size={compact ? "sm" : "default"}
            className={compact ? "h-8 text-xs" : ""}
            onClick={joinInApp}
            title="Open consent & link panel inside HMIS (same session)"
          >
            <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" />
            Join in HMIS
          </Button>
        )}
        <Button type="button" variant="outline" size={compact ? "sm" : "default"} className={compact ? "h-8 text-xs" : ""} onClick={() => void copy()}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy link
        </Button>
      </div>
    </div>
  )
}
