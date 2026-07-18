"use client"

import { useMemo, useRef } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { meetingHrefFromUrl } from "@/lib/telemedicine-providers"
import { Maximize2 } from "lucide-react"

type Props = {
  roomUrl: string
  /** Compact height for floating dock */
  compact?: boolean
  className?: string
  userName?: string
}

/**
 * Daily Prebuilt via iframe (no Meeting SDK / domain allowlist).
 * Requires HTTPS (or localhost) for camera/mic.
 */
export function DailyEmbeddedMeeting({ roomUrl, compact, className, userName }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const src = useMemo(() => {
    // Public Prebuilt rooms: plain room URL is enough (no Meeting token required).
    return meetingHrefFromUrl(roomUrl)
  }, [roomUrl])

  if (!src) {
    return (
      <Alert>
        <AlertTitle>No Daily room URL</AlertTitle>
        <AlertDescription>Create or paste a Daily.co room link to start in-page video.</AlertDescription>
      </Alert>
    )
  }

  const insecure =
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"

  return (
    <div className={`relative ${className || ""}`}>
      {insecure && (
        <Alert className="mb-2 border-amber-300 bg-amber-50 dark:bg-amber-950/40">
          <AlertTitle className="text-sm">HTTPS required</AlertTitle>
          <AlertDescription className="text-xs">
            Camera and microphone need a secure context. Open HMIS over HTTPS (or localhost) for Daily video.
          </AlertDescription>
        </Alert>
      )}
      <iframe
        ref={iframeRef}
        title="Daily.co telemedicine"
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        allowFullScreen
        className={
          compact
            ? "h-full min-h-[240px] w-full rounded-md border bg-black sm:min-h-[360px]"
            : "h-[min(70vh,760px)] min-h-[360px] w-full rounded-md border bg-black"
        }
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="absolute right-2 top-2 z-20 h-8 gap-1.5 bg-background/90 px-2 shadow-md backdrop-blur hover:bg-background"
        title="Open video full screen"
        onClick={() => {
          const frame = iframeRef.current
          if (!frame) return
          void frame.requestFullscreen?.()
        }}
      >
        <Maximize2 className="h-3.5 w-3.5" />
        <span className={compact ? "sr-only" : ""}>Full screen</span>
      </Button>
    </div>
  )
}
