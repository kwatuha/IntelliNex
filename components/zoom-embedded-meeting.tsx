"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { telemedicineApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { publicAssetUrl } from "@/lib/utils/url"
import { useAuth } from "@/lib/auth/auth-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TelemedicineHelpLink } from "@/components/telemedicine-help-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ZoomMeetingInfoPopover } from "@/components/zoom-meeting-info-popover"
import { zoomMeetingUrlsMatch } from "@/lib/zoom-url-utils"
import { Loader2 } from "lucide-react"

export type ZoomEmbeddedMeetingProps = {
  sessionId: string
  /** Compact layout for floating panel */
  compact?: boolean
  /**
   * Floating dock: toolbar above the iframe (role badge, help). No tall footer; maximizes iframe height
   * so Zoom’s own mic/camera/leave bar (inside the meeting, usually at the bottom) stays visible.
   */
  minimalChrome?: boolean
  className?: string
  /** Session join URL — with `defaultZoomJoinUrl`, used to pick Meeting SDK role Host (1) vs Participant (0). */
  sessionZoomJoinUrl?: string | null
  /** Signed-in user’s “My Zoom defaults” URL — same meeting id as session → Host. */
  defaultZoomJoinUrl?: string | null
  /**
   * When `minimalChrome` is true, skip the inner Host / tips toolbar so the parent can render one combined row
   * (e.g. floating session panel).
   */
  hideMinimalTopBar?: boolean
}

/** Zoom reports whether this browser can use audio/video/screen (iframe path: not measured here). */
export type ZoomMediaCompatibility = {
  audio?: boolean
  video?: boolean
  screen?: boolean
}

function stringifySdkError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>
    const direct =
      (typeof rec.reason === "string" && rec.reason) ||
      (typeof rec.message === "string" && rec.message) ||
      (typeof rec.errorMessage === "string" && rec.errorMessage)
    if (direct) return direct
    try {
      return JSON.stringify(rec)
    } catch {
      return String(err)
    }
  }
  return String(err)
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const ZOOM_JOIN_TIMEOUT_MS = 120000

/** Read container size for Zoom `viewSizes` (SDK draws to this box). */
function measureZoomContainer(el: HTMLElement, compact: boolean): { width: number; height: number } {
  const r = el.getBoundingClientRect()
  let w = Math.floor(r.width) || el.clientWidth
  let h = Math.floor(r.height) || el.clientHeight
  if (w < 100) w = typeof window !== "undefined" ? Math.min(1280, Math.floor(window.innerWidth - 48)) : 480
  if (h < 120) {
    h = compact
      ? Math.min(640, Math.floor((typeof window !== "undefined" ? window.innerHeight : 800) * 0.5))
      : Math.min(720, Math.floor((typeof window !== "undefined" ? window.innerHeight : 800) * 0.65))
  }
  w = Math.max(320, Math.min(w, 1920))
  h = Math.max(240, Math.min(h, 1080))
  return { width: w, height: h }
}

/**
 * Full iframe `#zroot` dimensions passed to `zoom-embed-host.html`.
 * (`ZOOM_INTERNAL_TOOLBAR_RESERVE_PX` in the host is 0 so canvas height matches the iframe.)
 */
function viewSizesForSdk(el: HTMLElement, compact: boolean): { width: number; height: number } {
  const m = measureZoomContainer(el, compact)
  return {
    width: m.width,
    height: Math.max(220, m.height),
  }
}

async function waitForNonZeroSize(el: HTMLElement, maxAttempts = 12): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const r = el.getBoundingClientRect()
    if (r.width >= 100 && r.height >= 120) return
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/** Two rAFs: one layout pass after the container has a non-zero size (helps flex `flex-1` without blocking join). */
async function waitTwoAnimationFrames(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function postZoomEmbedResize(
  el: HTMLElement | null,
  iframe: HTMLIFrameElement | null,
  compact: boolean,
): void {
  if (!el || !iframe?.contentWindow) return
  const { width, height } = viewSizesForSdk(el, compact)
  try {
    iframe.contentWindow.postMessage(
      { type: "zoom-embed-resize", payload: { viewW: width, viewH: height } },
      typeof window !== "undefined" ? window.location.origin : "*",
    )
  } catch {
    /* ignore */
  }
}

function zoomDeploymentContextLine(): string {
  if (typeof window === "undefined") return "deploy-context: ssr"
  const bp = process.env.NEXT_PUBLIC_BASE_PATH || ""
  const api = process.env.NEXT_PUBLIC_API_URL || ""
  return [
    `deploy-context origin:${window.location.origin}`,
    `path:${window.location.pathname}`,
    `secureContext:${window.isSecureContext}`,
    `crossOriginIsolated:${window.crossOriginIsolated}`,
    `NEXT_PUBLIC_BASE_PATH:${bp || "(empty)"}`,
    `NEXT_PUBLIC_API_URL:${api || "(empty=fetch /api on page origin)"}`,
  ].join(" | ")
}

/** Best-effort diagnostics only — called on join **failure** (not on the success path). */
async function zoomProbeVendorReachability(diagnostics: string[]): Promise<void> {
  if (typeof window === "undefined") return
  const paths = [
    "/vendor/zoom-meeting-embedded-ES5.min.js",
    "/vendor/zoom-react18.min.js",
    "/vendor/zoom-react-dom18.min.js",
    "/vendor/zoom-meetingsdk.css",
    "/zoom-embed-host.html",
  ] as const
  await Promise.all(
    paths.map(async (p) => {
      const rel = publicAssetUrl(p)
      const abs = new URL(rel, window.location.origin).href
      try {
        const r = await fetch(abs, { method: "HEAD", cache: "no-store" })
        diagnostics.push(`vendor-probe HEAD ${p} -> ${r.status} abs:${abs}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        diagnostics.push(`vendor-probe HEAD ${p} error:${msg} abs:${abs}`)
      }
    }),
  )
}

/**
 * Zoom Meeting SDK — Component View inside a same-origin iframe.
 * The iframe document loads only React 18 + Zoom (see `public/zoom-embed-host.html`), avoiding React 19 in the Next.js app
 * (which otherwise can break Zoom’s embedded join path with `in` on undefined).
 */
export function ZoomEmbeddedMeeting({
  sessionId,
  compact,
  minimalChrome = false,
  className,
  sessionZoomJoinUrl,
  defaultZoomJoinUrl,
  hideMinimalTopBar = false,
}: ZoomEmbeddedMeetingProps) {
  const { user } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  /** Meeting SDK JWT role: 1 = host, 0 = participant. Inferred from session vs “My Zoom defaults” when both URLs are set. */
  const sdkRole = useMemo<"0" | "1">(() => {
    const s = (sessionZoomJoinUrl || "").trim()
    const d = (defaultZoomJoinUrl || "").trim()
    if (!s || !d) return "1"
    return zoomMeetingUrlsMatch(s, d) ? "1" : "0"
  }, [sessionZoomJoinUrl, defaultZoomJoinUrl])

  const linkMatchesDefault = useMemo(
    () => zoomMeetingUrlsMatch(sessionZoomJoinUrl, defaultZoomJoinUrl),
    [sessionZoomJoinUrl, defaultZoomJoinUrl],
  )
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [iframeHostReady, setIframeHostReady] = useState(false)

  const userName = user?.name?.trim() || "Clinician"
  const userEmail = user?.email?.trim() || ""
  const userNameRef = useRef(userName)
  const userEmailRef = useRef(userEmail)
  userNameRef.current = userName
  userEmailRef.current = userEmail

  const compactRef = useRef(!!compact)
  compactRef.current = !!compact

  const embedGenerationRef = useRef(0)

  /** `http://` to a LAN/public IP is not a secure context — camera/mic APIs are unavailable; Zoom shows a misleading “upgrade browser” error. */
  const [mediaEnv, setMediaEnv] = useState<{ insecureOrigin: boolean; hostname: string }>({
    insecureOrigin: false,
    hostname: "",
  })

  const iframeSrc = publicAssetUrl("/zoom-embed-host.html")

  useEffect(() => {
    if (typeof window === "undefined") return
    const h = window.location.hostname
    const loopback = h === "localhost" || h === "127.0.0.1" || h === "[::1]"
    setMediaEnv({
      insecureOrigin: !window.isSecureContext && !loopback,
      hostname: h,
    })
  }, [])

  useEffect(() => {
    setIframeHostReady(false)
  }, [sessionId, sdkRole])

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      const d = ev.data as { type?: string } | null
      if (!d || typeof d !== "object") return
      if (d.type === "zoom-embed-host-ready") {
        setIframeHostReady(true)
      }
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !iframeHostReady) return

    const myGeneration = ++embedGenerationRef.current
    let cancelled = false
    const stale = () => cancelled || embedGenerationRef.current !== myGeneration
    const diagnostics: string[] = []

    const run = async () => {
      setPhase("loading")
      setErrorMessage(null)
      try {
        diagnostics.push(`embed-mode:iframe-react18-isolated src:${iframeSrc}`)
        diagnostics.push(zoomDeploymentContextLine())
        diagnostics.push(`requested-role:${sdkRole}`)

        const data = await telemedicineApi.getZoomSdkSignature(sessionId, {
          role: Number(sdkRole) as 0 | 1,
        })
        if (stale()) return
        diagnostics.push(`signature-response hasSignature:${Boolean(data?.signature)} meetingNumber:${String(data?.meetingNumber ?? "")}`)

        if (!data?.signature || data.meetingNumber == null || String(data.meetingNumber).trim() === "") {
          throw new Error("Invalid Zoom SDK signature response from server (missing signature or meeting number).")
        }
        const sdkKeyFromApi = data.sdkKey != null && String(data.sdkKey).trim() !== "" ? String(data.sdkKey).trim() : ""
        if (!sdkKeyFromApi) {
          throw new Error(
            "Meeting SDK join is missing sdkKey from the API. Ensure POST /zoom-sdk-signature returns sdkKey (Meeting SDK credentials on the API server).",
          )
        }

        await waitForNonZeroSize(el)
        await waitTwoAnimationFrames()
        if (stale()) return

        const { width: viewW, height: viewH } = viewSizesForSdk(el, compactRef.current)
        diagnostics.push(`container-size raw:${Math.floor(el.getBoundingClientRect().width)}x${Math.floor(el.getBoundingClientRect().height)} sdk:${viewW}x${viewH}`)

        const iframe = iframeRef.current
        if (!iframe?.contentWindow) {
          throw new Error("Zoom iframe is not ready (missing contentWindow).")
        }

        const payload: Record<string, unknown> = {
          embedGen: myGeneration,
          signature: String(data.signature).trim(),
          meetingNumber: String(data.meetingNumber).replace(/\s+/g, ""),
          userName: userNameRef.current.trim() || "Guest",
          viewW,
          viewH,
        }
        const pwd = data.password != null ? String(data.password).trim() : ""
        if (pwd) payload.password = pwd
        const email = userEmailRef.current?.trim()
        if (email) payload.userEmail = email
        let outcomeListener: ((ev: MessageEvent) => void) | null = null
        const outcome = new Promise<void>((resolve, reject) => {
          outcomeListener = (ev: MessageEvent) => {
            if (ev.origin !== window.location.origin) return
            const msg = ev.data as { type?: string; message?: string; embedGen?: number; diagnostics?: string }
            if (msg?.embedGen !== myGeneration) return
            if (msg.type === "zoom-embed-joined") {
              window.removeEventListener("message", outcomeListener!)
              outcomeListener = null
              resolve()
            }
            if (msg.type === "zoom-embed-error") {
              window.removeEventListener("message", outcomeListener!)
              outcomeListener = null
              const extra = msg.diagnostics ? ` (${msg.diagnostics})` : ""
              reject(new Error(String(msg.message || "Zoom embed failed") + extra))
            }
          }
          window.addEventListener("message", outcomeListener)
        })

        iframe.contentWindow.postMessage(
          { type: "zoom-embed-run", payload },
          typeof window !== "undefined" ? window.location.origin : "*",
        )

        try {
          await withTimeout(outcome, ZOOM_JOIN_TIMEOUT_MS, "Zoom iframe join")
        } finally {
          if (outcomeListener) {
            window.removeEventListener("message", outcomeListener)
          }
        }
        if (stale()) return
        diagnostics.push("iframe-join:ok")
        if (!stale()) {
          setPhase("ready")
        }
      } catch (e: unknown) {
        if (stale()) return
        /** Vendor HEAD probes are diagnostic-only — run on failure so successful joins avoid 5 extra requests. */
        try {
          await zoomProbeVendorReachability(diagnostics)
        } catch {
          /* ignore */
        }
        const msg = stringifySdkError(e)
        const extra = diagnostics.length ? ` Diagnostics: ${diagnostics.join(" | ")}` : ""
        console.error("Zoom embed failure (iframe)", { message: msg, diagnostics, sessionId, sdkRole })
        setErrorMessage(`${msg}${extra}`)
        setPhase("error")
      }
    }

    void run()

    return () => {
      cancelled = true
      embedGenerationRef.current += 1
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "zoom-embed-abort" },
          typeof window !== "undefined" ? window.location.origin : "*",
        )
      } catch {
        /* ignore */
      }
    }
  }, [sessionId, sdkRole, iframeHostReady, iframeSrc])

  useEffect(() => {
    if (phase !== "ready") return
    const el = containerRef.current
    const iframe = iframeRef.current
    if (!el || !iframe?.contentWindow) return

    const send = () => postZoomEmbedResize(el, iframe, compactRef.current)

    send()
    /** One late sync after floating-panel flex height settles (no burst — avoids breaking SDK init). */
    const delayed = window.setTimeout(send, 400)
    const ro = new ResizeObserver(() => send())
    ro.observe(el)
    return () => {
      window.clearTimeout(delayed)
      ro.disconnect()
    }
  }, [phase, compact])

  /**
   * Floating `minimalChrome`: fill flex height between toolbar and “Meeting link” (no `max-h` on parent).
   * Non-floating compact uses a bounded 16:9-style box.
   */
  const zoomRootFrameClass = compact
    ? minimalChrome
      ? "min-h-0 w-full min-w-0 flex-1"
      : "aspect-video w-full min-h-[260px] max-h-[min(52vh,540px)]"
    : "aspect-video w-full min-h-[360px] max-h-[min(70vh,820px)]"

  const compactTopBar = (
    <div className="mb-0.5 flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 pb-0.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <Badge
          variant={sdkRole === "1" ? "default" : "secondary"}
          className="h-5 shrink-0 px-1.5 text-[10px] font-normal"
          title={
            linkMatchesDefault
              ? "Meeting SDK role: same meeting id as My Zoom defaults → host"
              : "Meeting SDK role: session link differs from your saved default → participant"
          }
        >
          {sdkRole === "1" ? "Host" : "Participant"}
        </Badge>
      </div>
      <ZoomMeetingInfoPopover />
    </div>
  )

  const controlsRow = (
    <div className="mb-2 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Join as</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={sdkRole === "1" ? "default" : "secondary"}
            className="text-xs font-normal"
            title={
              linkMatchesDefault
                ? "Meeting SDK role: same meeting id as My Zoom defaults → host"
                : "Meeting SDK role: session link differs from your saved default → participant"
            }
          >
            {sdkRole === "1" ? "Host" : "Participant"}
          </Badge>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        <TelemedicineHelpLink />
      </p>
    </div>
  )

  const errorAlert =
    phase === "error" && errorMessage ? (
      <Alert variant="destructive" className="mb-2 shrink-0">
        <AlertTitle>Could not embed meeting</AlertTitle>
        <AlertDescription className="text-xs whitespace-pre-wrap space-y-2">
          <span>{errorMessage}</span>
          {(errorMessage.includes("Meeting has not started") ||
            errorMessage.includes("JOIN_MEETING_FAILED") ||
            errorMessage.toLowerCase().includes("not started")) && (
            <span className="block border-t border-destructive/30 pt-2 font-medium">
              If you are the meeting owner, set <strong className="font-medium">Join as</strong> to{" "}
              <strong className="font-medium">Host</strong> — Participant only works after a host has started the room.
            </span>
          )}
          {mediaEnv.insecureOrigin &&
            (errorMessage.includes("INVALID_OPERATION") || errorMessage.toLowerCase().includes("audio/video")) && (
              <span className="block border-t border-destructive/30 pt-2 font-medium">
                Likely cause: insecure HTTP (see the notice above). Updating Chrome will not fix this until the site is served over HTTPS or you use localhost.
              </span>
            )}
        </AlertDescription>
      </Alert>
    ) : null

  const videoShell = (
    <div
      ref={containerRef}
      className={cn(
        "zoom-meeting-sdk-root relative overflow-hidden rounded-md border",
        minimalChrome ? "bg-black" : "bg-black/5",
        zoomRootFrameClass,
        minimalChrome && "min-h-0 w-full min-w-0 flex flex-col",
      )}
    >
      {phase === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-background/85 px-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Loading Session...
        </div>
      )}
      <iframe
        ref={iframeRef}
        key={`${sessionId}-${sdkRole}`}
        title="Zoom meeting"
        src={iframeSrc}
        className="absolute inset-0 h-full w-full border-0"
        allow="camera; microphone; fullscreen; display-capture; clipboard-read; clipboard-write"
      />
    </div>
  )

  const readyFooter =
    phase === "ready" && !minimalChrome ? (
      <div className="mt-2 space-y-2">
        <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Use Zoom&apos;s toolbar at the <strong className="font-medium">bottom of the meeting</strong> for audio, video, and leave (visible after the room loads; turn camera on if it was off).
          </span>
          <TelemedicineHelpLink />
        </p>
      </div>
    ) : null

  return (
    <div className={cn(className, minimalChrome && "flex min-h-0 min-w-0 flex-1 flex-col")}>
      {mediaEnv.insecureOrigin && (
        <Alert className="mb-2 shrink-0 border-amber-500/50 bg-amber-500/10 text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-50">
          <AlertTitle className="text-sm">HTTPS (or localhost) required for embedded Zoom</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            This page is <strong className="font-medium">not a secure context</strong> ({mediaEnv.hostname ? `http://${mediaEnv.hostname}…` : "HTTP"}). Browsers do not expose camera/microphone there, so the Meeting SDK cannot run video/audio and Zoom may say to “upgrade your browser”—that message is misleading. Serve HMIS over{" "}
            <strong className="font-medium">HTTPS</strong> (e.g. nginx or Caddy with a certificate) or test embedded video at{" "}
            <strong className="font-medium">http://localhost</strong>. If you must stay on HTTP, use <strong className="font-medium">Join Session</strong>{" "}
            on the telemedicine board and <strong className="font-medium">Copy link</strong> (or your vendor app) instead of embedded video here.
          </AlertDescription>
        </Alert>
      )}

      {minimalChrome ? (
        <>
          {errorAlert}
          {!hideMinimalTopBar && compactTopBar}
          <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
            {videoShell}
          </div>
        </>
      ) : (
        <>
          {controlsRow}
          {errorAlert}
          {videoShell}
          {readyFooter}
        </>
      )}
    </div>
  )
}
