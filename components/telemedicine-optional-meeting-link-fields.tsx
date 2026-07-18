"use client"

import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { telemedicineApi } from "@/lib/api"
import { getTelemedicineProviderOption, type TelemedicineVideoProviderId } from "@/lib/telemedicine-providers"
import { cn } from "@/lib/utils"

type Props = {
  videoProvider: TelemedicineVideoProviderId
  joinUrl: string
  onJoinUrlChange: (v: string) => void
  passcode: string
  onPasscodeChange: (v: string) => void
  className?: string
  /** Tighter spacing for queue toolbars */
  compact?: boolean
}

/**
 * Optional join URL + passcode before starting a telemedicine session.
 * API stores them on the session (same fields as Zoom). If left empty, user pastes in the session panel.
 * When platform is Zoom, prefills from Telemedicine → My Zoom defaults (if saved) so optional fields match API behavior.
 */
export function TelemedicineOptionalMeetingLinkFields({
  videoProvider,
  joinUrl,
  onJoinUrlChange,
  passcode,
  onPasscodeChange,
  className,
  compact,
}: Props) {
  const opt = getTelemedicineProviderOption(videoProvider)
  const joinUrlRef = useRef(joinUrl)
  const passcodeRef = useRef(passcode)
  joinUrlRef.current = joinUrl
  passcodeRef.current = passcode

  useEffect(() => {
    if (videoProvider !== "zoom_manual") return
    let cancelled = false
    ;(async () => {
      try {
        const d = await telemedicineApi.getMyDefaults()
        if (cancelled) return
        const u = d?.defaultZoomJoinUrl?.trim()
        const p = d?.defaultZoomPassword?.trim()
        // After async, only fill fields still empty (refs = latest; avoids clobbering user typing during fetch)
        if (u && !joinUrlRef.current.trim()) {
          onJoinUrlChange(u)
        }
        if (p && !passcodeRef.current.trim()) {
          onPasscodeChange(p)
        }
      } catch {
        // Unauthenticated or network — optional fields stay blank
      }
    })()
    return () => {
      cancelled = true
    }
    // Only re-fetch when platform changes (e.g. switching to Zoom). Parent setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit onJoinUrlChange/onPasscodeChange
  }, [videoProvider])

  return (
    <div className={cn("space-y-3 rounded-md border bg-muted/30 p-3", compact && "space-y-2 p-2", className)}>
      <p className={cn("text-muted-foreground", compact ? "text-[11px] leading-snug" : "text-xs")}>
        <strong>Optional:</strong>{" "}
        {videoProvider === "zoom_manual" ? (
          <>
            Your <strong>My Zoom defaults</strong> fill these when empty. Edit before starting if needed, or paste later in the session panel.
          </>
        ) : videoProvider === "daily" ? (
          <>
            Leave blank to <strong>auto-create a Daily.co room</strong> when the session starts, or paste an existing Daily room URL.
          </>
        ) : (
          <>
            paste the meeting link here before starting, or paste it in the <strong>telemedicine session panel</strong> after the visit opens.
          </>
        )}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="tm-opt-join-url" className={compact ? "text-xs" : undefined}>
          Meeting link (optional)
        </Label>
        <Input
          id="tm-opt-join-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder={opt?.placeholder ?? "https://…"}
          value={joinUrl}
          onChange={(e) => onJoinUrlChange(e.target.value)}
          className={compact ? "h-9 text-sm" : undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tm-opt-pass" className={compact ? "text-xs" : undefined}>
          Passcode (optional)
        </Label>
        <Input
          id="tm-opt-pass"
          type="text"
          autoComplete="off"
          placeholder="If the meeting uses a passcode"
          value={passcode}
          onChange={(e) => onPasscodeChange(e.target.value)}
          className={compact ? "h-9 text-sm" : undefined}
        />
      </div>
    </div>
  )
}

/** Payload fragment for telemedicineApi.createSession */
export function telemedicineOptionalLinkBody(joinUrl: string, passcode: string) {
  const u = joinUrl?.trim()
  const p = passcode?.trim()
  return {
    ...(u ? { zoomJoinUrl: u } : {}),
    ...(p ? { zoomPassword: p } : {}),
  }
}
