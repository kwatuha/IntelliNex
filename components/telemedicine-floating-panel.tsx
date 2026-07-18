"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { TelemedicineSessionPanel } from "@/components/telemedicine-session-panel"
import { TelemedicineEncounterPanel } from "@/components/telemedicine-encounter-panel"
import { ExternalLink, Maximize2, Minimize2, Minus, Video, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Fixed floating dock (desktop): Telemedicine / Zoom on the **left**, encounter on the **right**.
 * Zoom Meeting SDK opens security/permission flyouts from the top-left toward the **left**; when video was on the right
 * (`flex-row-reverse`), those panels opened into the seam beside the encounter column and were clipped or hidden.
 * On small screens the encounter panel stacks below the video.
 *
 * Full-bleed horizontally and to the bottom (`inset-x-0 bottom-0`); small top inset only so the dock covers layout chrome except a thin top margin.
 * z-[100] sits below portaled modals (Dialog z~140+, Sheet z~130+). Do not raise above ~120 without bumping those layers.
 * Video column uses a higher stacking order than the encounter column so Zoom iframe UI is not covered by the encounter card.
 */
export function TelemedicineFloatingPanel() {
  const router = useRouter()
  const { sessionId, minimized, closePanel, setMinimized, patientId, patientDisplayName } = useTelemedicineFloating()
  const [videoFocused, setVideoFocused] = useState(false)

  if (!sessionId) return null

  if (minimized) {
    const label = patientDisplayName?.trim() || `Session #${sessionId}`
    return (
      <div className="fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-1.5rem)] animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm shadow-lg ring-1 ring-border hover:bg-accent"
        >
          <Video className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{label}</span>
          <span className="text-muted-foreground text-xs">· expand</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-1 z-[100] flex min-h-0 flex-col gap-0 overflow-hidden bg-background sm:top-2 lg:flex-row lg:items-stretch"
      role="dialog"
      aria-label="Telemedicine session and encounter"
    >
      <div
        className={cn(
          "relative z-[5] flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden border-b border-border bg-background shadow-2xl animate-in slide-in-from-bottom-4 fade-in-0 duration-200 lg:border-b-0 lg:border-r",
          videoFocused
            ? "lg:min-w-full lg:flex-[1]"
            : "lg:min-w-[min(50%,360px)] lg:max-w-none lg:flex-[1.25]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Video className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 truncate text-sm font-semibold leading-tight">
              <span>Telemedicine</span>
              <span className="font-normal text-muted-foreground"> #{sessionId}</span>
              {patientDisplayName ? (
                <span className="font-normal text-muted-foreground"> · {patientDisplayName}</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant={videoFocused ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              title={videoFocused ? "Show video and encounter side by side" : "Focus video — use the full workspace"}
              onClick={() => setVideoFocused((focused) => !focused)}
            >
              {videoFocused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Open full page"
              onClick={() => {
                closePanel()
                router.push(`/telemedicine/${sessionId}`)
              }}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Minimize — restores the sidebar for navigation"
              onClick={() => setMinimized(true)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Close panel" onClick={closePanel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden px-2 py-1.5">
          <TelemedicineSessionPanel sessionId={sessionId} variant="floating" onFloatingDismiss={closePanel} />
        </div>
      </div>

      <div
        className={cn(
          "relative z-[1] min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden lg:min-w-[min(32%,260px)] lg:max-w-[min(42%,360px)]",
          videoFocused ? "hidden" : "flex",
        )}
      >
        <TelemedicineEncounterPanel
          patientId={patientId}
          patientDisplayName={patientDisplayName}
          sessionId={sessionId}
        />
      </div>
    </div>
  )
}
