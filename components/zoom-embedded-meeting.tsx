"use client"

import { useEffect, useRef, useState } from "react"
import * as ReactNS from "react"
import * as ReactDOMNS from "react-dom"
import { telemedicineApi } from "@/lib/api"
import { publicAssetUrl } from "@/lib/utils/url"
import { useAuth } from "@/lib/auth/auth-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TelemedicineHelpLink } from "@/components/telemedicine-help-link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Maximize2, Minimize2 } from "lucide-react"

export type ZoomEmbeddedMeetingProps = {
  sessionId: string
  /** Compact layout for floating panel */
  compact?: boolean
  className?: string
}

/** Zoom reports whether this browser can use audio/video/screen (call before `init`). */
export type ZoomMediaCompatibility = {
  audio?: boolean
  video?: boolean
  screen?: boolean
}

type ZoomEmbeddedClient = {
  init: (args: Record<string, unknown>) => Promise<unknown>
  join: (args: Record<string, unknown>) => Promise<unknown>
  leaveMeeting?: () => unknown
  /** SDK — resize video area after join when the container grows/shrinks. */
  updateVideoOptions?: (videoOptions: Record<string, unknown>) => void
  /** SDK 2.1.1+ — browser capability check; use before `init`. */
  checkSystemRequirements?: () => ZoomMediaCompatibility
}

type ZoomEmbeddedGlobal = {
  createClient: () => ZoomEmbeddedClient
  destroyClient?: () => void
}

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedGlobal
    ReactWidgets?: unknown
    zoomMtg?: unknown
    React?: unknown
    ReactDOM?: unknown
  }
}

function looksLikeZoomEmbedded(v: unknown): v is ZoomEmbeddedGlobal {
  if (!v) return false
  const t = typeof v
  if (t !== "object" && t !== "function") return false
  return typeof (v as { createClient?: unknown }).createClient === "function"
}

function resolveZoomEmbeddedFromAny(v: unknown, depth = 0): ZoomEmbeddedGlobal | null {
  if (looksLikeZoomEmbedded(v)) return v
  if (!v || (typeof v !== "object" && typeof v !== "function") || depth > 3) return null
  const rec = v as Record<string, unknown>
  if (looksLikeZoomEmbedded(rec.default)) return rec.default
  if (looksLikeZoomEmbedded(rec.ZoomMtgEmbedded)) return rec.ZoomMtgEmbedded
  if (rec.default && typeof rec.default === "object") {
    const nested = rec.default as Record<string, unknown>
    if (looksLikeZoomEmbedded(nested.ZoomMtgEmbedded)) return nested.ZoomMtgEmbedded
  }
  for (const key of Object.keys(rec)) {
    const found = resolveZoomEmbeddedFromAny(rec[key], depth + 1)
    if (found) return found
  }
  return null
}

function resolveZoomEmbeddedGlobal(): ZoomEmbeddedGlobal | null {
  const direct = resolveZoomEmbeddedFromAny(window.ZoomMtgEmbedded)
  if (direct) return direct
  const rw = resolveZoomEmbeddedFromAny(window.ReactWidgets)
  if (rw) return rw
  const zm = resolveZoomEmbeddedFromAny(window.zoomMtg)
  if (zm) return zm
  return null
}

function debugDetectedZoomGlobals(): string {
  const w = window as unknown as Record<string, unknown>
  const keys = Object.keys(w).filter((k) => /zoom|reactwidgets|mtg/i.test(k)).slice(0, 20)
  const details = keys.map((k) => {
    const v = w[k]
    const type = v == null ? "null" : typeof v
    const hasCreate =
      !!v &&
      (typeof v === "object" || typeof v === "function") &&
      typeof (v as { createClient?: unknown }).createClient === "function"
    return `${k}:${type}${hasCreate ? ":createClient" : ""}`
  })
  return details.join(", ") || "none"
}

/** Avoid `in` on non-objects (throws "right-hand side of 'in' should be an object"). */
function hasReasonProperty(value: unknown): value is { reason: unknown } {
  return value != null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "reason")
}

function stringifySdkError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message
    if (m.includes("RECONNECTING_MEETING")) {
      return `${m} — Often caused by the embed tearing down while Zoom is still connecting (e.g. React dev Strict Mode remounts, or effect re-running). Try a production build or see docs.`
    }
    return m
  }
  if (typeof err === "string") {
    if (err.includes("RECONNECTING_MEETING")) {
      return `${err} — Often caused by the embed tearing down while Zoom is still connecting (e.g. React dev Strict Mode remounts).`
    }
    return err
  }
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>
    const direct =
      (typeof rec.reason === "string" && rec.reason) ||
      (typeof rec.message === "string" && rec.message) ||
      (typeof rec.errorMessage === "string" && rec.errorMessage) ||
      (typeof rec.type === "string" && rec.type)
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

/** First load can pull wasm/media from Zoom CDN; join promise may stay pending until then. */
const ZOOM_INIT_TIMEOUT_MS = 45000
const ZOOM_JOIN_TIMEOUT_MS = 120000

/**
 * `client.join()` returns a Promise, but some SDK builds also fire `success`/`error` callbacks and
 * the promise may not settle until long after the UI is in the meeting — causing false timeouts.
 * We resolve when either path completes.
 */
function joinEmbeddedMeeting(client: ZoomEmbeddedClient, joinArgs: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false
    const once = (action: "resolve" | "reject", value: unknown) => {
      if (settled) return
      settled = true
      if (action === "resolve") resolve(value)
      else reject(value)
    }

    const augmented: Record<string, unknown> = {
      ...joinArgs,
      success: () => {
        once("resolve", "")
      },
      error: (err: unknown) => {
        once("reject", err ?? new Error("Zoom join error callback"))
      },
    }

    try {
      const out = client.join(augmented)
      if (out != null && typeof (out as Promise<unknown>).then === "function") {
        ;(out as Promise<unknown>)
          .then((r) => once("resolve", r))
          .catch((e) => once("reject", e))
      }
    } catch (e) {
      once("reject", e)
    }
  })
}

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

/** Reserve vertical space so Zoom’s bottom toolbar (join audio / mic / leave) is not clipped inside the root. */
const ZOOM_EMBED_TOOLBAR_RESERVE_PX = 88

function viewSizesForSdk(el: HTMLElement, compact: boolean): { width: number; height: number } {
  const m = measureZoomContainer(el, compact)
  return {
    width: m.width,
    height: Math.max(220, m.height - ZOOM_EMBED_TOOLBAR_RESERVE_PX),
  }
}

/**
 * Zoom 5.x minified code uses `key in obj` on nested `customize.*`; some builds choke on over-filled or
 * under-filled objects. We try init in order until one succeeds (see `initEmbeddedClientWithFallback`).
 */
function zoomEmbeddedCustomizeVideoOnly(viewW: number, viewH: number) {
  return {
    video: {
      isResizable: true,
      defaultViewType: "speaker" as const,
      popper: {} as Record<string, unknown>,
      viewSizes: {
        default: { width: viewW, height: viewH },
        ribbon: { width: viewW, height: viewH },
      },
    },
  }
}

/** Rich customize — all panel branches with `popper` / `meetingInfo` / `sharing.options` filled. */
function zoomEmbeddedCustomizeFull(viewW: number, viewH: number) {
  return {
    toolbar: { buttons: [] as unknown[] },
    meetingInfo: [] as unknown[],
    participants: { popper: {} },
    setting: { popper: {} },
    invite: { popper: {} },
    callMe: { popper: {} },
    chat: { notificationCls: {}, popper: {} },
    meeting: { popper: {} },
    activeApps: { popper: {} },
    sharing: { options: {} },
    ...zoomEmbeddedCustomizeVideoOnly(viewW, viewH),
  }
}

function isZoomInOperatorError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return m.includes("right-hand side of 'in'") || (m.includes("'in'") && m.includes("undefined"))
}

async function initEmbeddedClientWithFallback(
  client: ZoomEmbeddedClient,
  el: HTMLElement,
  viewW: number,
  viewH: number,
): Promise<void> {
  const base = {
    zoomAppRoot: el,
    language: "en-US" as const,
    patchJsMedia: true,
    assetPath: "https://source.zoom.us/5.1.4/lib/av",
  }

  const attempts: Array<{ label: string; customize?: Record<string, unknown> }> = [
    { label: "customize:video-only", customize: zoomEmbeddedCustomizeVideoOnly(viewW, viewH) },
    { label: "customize:none" },
    { label: "customize:full", customize: zoomEmbeddedCustomizeFull(viewW, viewH) },
  ]

  let lastErr: unknown
  for (const { label, customize } of attempts) {
    try {
      const opts =
        customize !== undefined ? { ...base, customize } : { ...base }
      await withTimeout(client.init(opts as Record<string, unknown>), ZOOM_INIT_TIMEOUT_MS, `Zoom SDK init (${label})`)
      return
    } catch (e) {
      lastErr = e
      if (!isZoomInOperatorError(e)) throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function waitForNonZeroSize(el: HTMLElement, maxAttempts = 12): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const r = el.getBoundingClientRect()
    if (r.width >= 100 && r.height >= 120) return
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

/** SDK resolves with "" on success, or an ExecutedFailure object (type + reason). */
function assertJoinSucceeded(joinResult: unknown): void {
  if (joinResult === "" || joinResult === undefined || joinResult === null) return
  if (typeof joinResult === "string") return
  if (joinResult != null && typeof joinResult === "object") {
    const o = joinResult as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(o, "type") && Object.prototype.hasOwnProperty.call(o, "reason")) {
      throw new Error(String(o.reason ?? "Join failed"))
    }
    if (hasReasonProperty(joinResult)) {
      throw new Error(String(joinResult.reason ?? "Join failed"))
    }
  }
}

/**
 * Zoom Meeting SDK — Component View (embedded in a div via zoomAppRoot).
 * Requires API env ZOOM_MEETING_SDK_KEY + ZOOM_MEETING_SDK_SECRET and a standard /j/######## join URL.
 */
export function ZoomEmbeddedMeeting({ sessionId, compact, className }: ZoomEmbeddedMeetingProps) {
  const { user } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const clientRef = useRef<ZoomEmbeddedClient | null>(null)
  const [sdkRuntimeReady, setSdkRuntimeReady] = useState(false)

  const [sdkRole, setSdkRole] = useState<"0" | "1">("1")
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Filled after createClient + checkSystemRequirements (if available). */
  const [mediaCompat, setMediaCompat] = useState<ZoomMediaCompatibility | null>(null)

  const userName = user?.name?.trim() || "Clinician"
  const userEmail = user?.email?.trim() || ""

  /** Join uses latest name/email without re-running the embed when auth hydrates (avoids reconnect loops). */
  const userNameRef = useRef(userName)
  const userEmailRef = useRef(userEmail)
  userNameRef.current = userName
  userEmailRef.current = userEmail

  const compactRef = useRef(!!compact)
  compactRef.current = !!compact

  /** Taller embed area + `updateVideoOptions` — does not re-run SDK init (see toggle below). */
  const [expandedVideo, setExpandedVideo] = useState(false)

  /**
   * Invalidates in-flight init/join when the effect cleans up (React Strict Mode dev double-mount,
   * session/role change, etc.) so we don't leave Zoom reconnecting after destroyClient().
   */
  const embedGenerationRef = useRef(0)

  /** Served from public/vendor (copied by scripts/copy-zoom-sdk-css.mjs — avoids bundler resolving node_modules CSS). */
  useEffect(() => {
    const id = "hmis-zoom-meetingsdk-css"
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id = id
    link.rel = "stylesheet"
    link.href = publicAssetUrl("/vendor/zoom-meetingsdk.css")
    document.head.appendChild(link)
    return () => {
      try {
        link.remove()
      } catch {
        /* ignore */
      }
    }
  }, [])

  /** Load Zoom embedded runtime via script URL(s), so build does not depend on bundling @zoom/meetingsdk. */
  useEffect(() => {
    if (resolveZoomEmbeddedGlobal()) {
      setSdkRuntimeReady(true)
      return
    }
    let cancelled = false
    const scriptId = "hmis-zoom-embedded-runtime-js"
    const urls = [
      // Prefer local copied assets (works offline / pinned to installed package).
      publicAssetUrl("/vendor/zoom-meeting-embedded-ES5.min.js"),
      publicAssetUrl("/vendor/zoomus-websdk-embedded.umd.min.js"),
      // Fallback to Zoom CDN if local vendor asset is unavailable in this environment.
      "https://source.zoom.us/5.1.4/zoom-meeting-embedded-ES5.min.js",
    ]
    const reactVendorUrls = [
      publicAssetUrl("/vendor/zoom-react18.min.js"),
      publicAssetUrl("/vendor/zoom-react-dom18.min.js"),
    ]
    const diagnostics: string[] = []

    const injectScript = (id: string, src: string, onLoad: () => void, onError: () => void) => {
      const existing = document.getElementById(id) as HTMLScriptElement | null
      if (existing) existing.remove()
      const script = document.createElement("script")
      script.id = id
      script.src = `${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`
      script.async = true
      script.onload = onLoad
      script.onerror = onError
      document.body.appendChild(script)
    }

    const loadReactVendors = (idx: number, done: () => void) => {
      if (cancelled) return
      if (idx >= reactVendorUrls.length) {
        done()
        return
      }
      const src = reactVendorUrls[idx]
      void fetch(src, { method: "GET", cache: "no-store" })
        .then((res) => diagnostics.push(`${src} fetch:${res.status}`))
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          diagnostics.push(`${src} fetch-error:${msg}`)
        })
      injectScript(
        `hmis-zoom-react-vendor-${idx}`,
        src,
        () => {
          diagnostics.push(`${src} script:onload`)
          loadReactVendors(idx + 1, done)
        },
        () => {
          diagnostics.push(`${src} script:onerror`)
          // Continue; maybe already available from cache/other script.
          loadReactVendors(idx + 1, done)
        }
      )
    }

    const tryLoad = (idx: number) => {
      if (cancelled) return
      const found = resolveZoomEmbeddedGlobal()
      if (found) {
        window.ZoomMtgEmbedded = found
        setSdkRuntimeReady(true)
        return
      }
      if (idx >= urls.length) {
        setErrorMessage(
          `Zoom runtime could not be loaded from local vendor or CDN URL. Diagnostics: ${diagnostics.join(" | ") || "none"}. Detected globals: ${debugDetectedZoomGlobals()}`
        )
        setPhase("error")
        return
      }

      const src = urls[idx]
      // Probe reachability first so the final error explains if URL was 404/blocked.
      void fetch(src, { method: "GET", cache: "no-store" })
        .then((res) => {
          diagnostics.push(`${src} fetch:${res.status}`)
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          diagnostics.push(`${src} fetch-error:${msg}`)
        })

      injectScript(
        scriptId,
        src,
        () => {
        if (cancelled) return
        diagnostics.push(`${src} script:onload`)
        const resolved = resolveZoomEmbeddedGlobal()
        if (resolved) {
          window.ZoomMtgEmbedded = resolved
          setSdkRuntimeReady(true)
          return
        }
        diagnostics.push(`${src} no-createClient-export`)
        // Loaded but export shape still not usable: try next URL.
        tryLoad(idx + 1)
      },
        () => {
        if (cancelled) return
        diagnostics.push(`${src} script:onerror`)
        tryLoad(idx + 1)
      })
    }

    loadReactVendors(0, () => {
      // Ensure globals point to React 18 vendor builds before loading SDK runtime.
      if (!window.React || !window.ReactDOM) {
        diagnostics.push("react18-globals-missing-before-sdk-load")
      }
      tryLoad(0)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!sdkRuntimeReady) return
    // Keep a defensive guard in case runtime gets cleared unexpectedly.
    if (!resolveZoomEmbeddedGlobal()) {
      const err = "Zoom runtime became unavailable after initialization."
      setErrorMessage(err)
      setPhase("error")
    }
  }, [sdkRuntimeReady])

  useEffect(() => {
    const el = rootRef.current
    if (!el || !sdkRuntimeReady) return

    /** Monotonic id for this effect run; cleanup bumps ref so async work can detect teardown. */
    const myGeneration = ++embedGenerationRef.current
    let cancelled = false
    const stale = () => cancelled || embedGenerationRef.current !== myGeneration

    const run = async () => {
      setPhase("loading")
      setErrorMessage(null)
      setMediaCompat(null)
      try {
        const zoomEmbedded = resolveZoomEmbeddedGlobal()
        if (!zoomEmbedded) {
          throw new Error(`Zoom embedded runtime is not available on window (expected createClient provider). Detected: ${debugDetectedZoomGlobals()}`)
        }
        // Retry-safe: force cleanup of any prior embedded instance before starting a fresh join.
        try {
          clientRef.current?.leaveMeeting?.()
        } catch {
          /* ignore */
        }
        clientRef.current = null
        try {
          zoomEmbedded.destroyClient?.()
        } catch {
          /* ignore */
        }

        if (stale()) return

        const data = await telemedicineApi.getZoomSdkSignature(sessionId, {
          role: Number(sdkRole) as 0 | 1,
        })
        if (stale()) return

        if (!data?.signature || data.meetingNumber == null || String(data.meetingNumber).trim() === "") {
          throw new Error("Invalid Zoom SDK signature response from server (missing signature or meeting number).")
        }
        const sdkKeyFromApi = data.sdkKey != null && String(data.sdkKey).trim() !== "" ? String(data.sdkKey).trim() : ""
        if (!sdkKeyFromApi) {
          throw new Error(
            "Meeting SDK join is missing sdkKey from the API. Ensure POST /zoom-sdk-signature returns sdkKey (Meeting SDK credentials on the API server).",
          )
        }

        const client = zoomEmbedded.createClient()
        clientRef.current = client

        if (typeof client.checkSystemRequirements === "function") {
          try {
            const compat = client.checkSystemRequirements()
            if (!stale()) setMediaCompat(compat ?? null)
          } catch {
            if (!stale()) setMediaCompat(null)
          }
        }

        if (stale()) return

        await waitForNonZeroSize(el)
        if (stale()) return

        const { width: viewW, height: viewH } = viewSizesForSdk(el, compactRef.current)

        // Zoom 5.x minified code uses `in` on nested customize.* objects; missing keys must be objects, not undefined.
        if (typeof window !== "undefined" && (!window.React || !window.ReactDOM)) {
          throw new Error(
            `Zoom Meeting SDK needs React 18 globals from ${publicAssetUrl("/vendor/zoom-react18.min.js")} — scripts missing or blocked (check the app basePath serves public/vendor, CSP, and HTTPS).`,
          )
        }

        await initEmbeddedClientWithFallback(client, el, viewW, viewH)
        if (stale()) return

        const joinPayload: Record<string, unknown> = {
          sdkKey: sdkKeyFromApi,
          signature: String(data.signature),
          meetingNumber: String(data.meetingNumber),
          password: data.password != null ? String(data.password) : "",
          userName: userNameRef.current,
        }
        const email = userEmailRef.current?.trim()
        if (email) joinPayload.userEmail = email

        const joinResult = await withTimeout(
          joinEmbeddedMeeting(client, joinPayload),
          ZOOM_JOIN_TIMEOUT_MS,
          "Zoom SDK join"
        )
        if (stale()) return
        assertJoinSucceeded(joinResult)
        if (!stale()) setPhase("ready")
      } catch (e: unknown) {
        if (stale()) return
        const msg = stringifySdkError(e)
        setErrorMessage(msg)
        setPhase("error")
      }
    }

    void run()

    return () => {
      cancelled = true
      /** Invalidate this generation so any in-flight await aborts before touching Zoom again. */
      embedGenerationRef.current += 1
      try {
        clientRef.current?.leaveMeeting?.()
      } catch {
        /* ignore */
      }
      clientRef.current = null
      try {
        resolveZoomEmbeddedGlobal()?.destroyClient?.()
      } catch {
        /* ignore */
      }
    }
  }, [sessionId, sdkRole, sdkRuntimeReady])

  /** After join, keep SDK video size aligned with our container (toggle “Larger video”, panel resize, etc.). */
  useEffect(() => {
    if (phase !== "ready") return
    const el = rootRef.current
    const client = clientRef.current
    if (!el || typeof client?.updateVideoOptions !== "function") return

    const apply = () => {
      const { width, height } = viewSizesForSdk(el, compactRef.current)
      try {
        client.updateVideoOptions({
          isResizable: true,
          defaultViewType: "speaker",
          popper: {},
          viewSizes: {
            default: { width, height },
            ribbon: { width, height },
          },
        })
      } catch {
        /* ignore */
      }
    }

    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase, expandedVideo, compact])

  const zoomRootFrameClass = compact
    ? expandedVideo
      ? "min-h-[300px] h-[min(78vh,780px)] w-full"
      : "min-h-[280px] h-[min(58vh,600px)] w-full"
    : expandedVideo
      ? "min-h-[480px] h-[min(85vh,900px)] w-full"
      : "min-h-[420px] h-[min(70vh,820px)] w-full"

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">SDK join role</Label>
          <Select value={sdkRole} onValueChange={(v) => setSdkRole(v as "0" | "1")}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Host (1) — typical for meeting owner</SelectItem>
              <SelectItem value="0">Participant (0) — if you join someone else&apos;s room</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            title="Taller video area (same meeting; uses ResizeObserver to resize the SDK view)"
            onClick={() => setExpandedVideo((v) => !v)}
          >
            {expandedVideo ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                Smaller video area
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                Larger video area
              </>
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Role change reloads the embed.</span>
          <TelemedicineHelpLink />
        </p>
      </div>

      {phase === "loading" && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Zoom Meeting SDK…
        </div>
      )}

      {phase === "error" && errorMessage && (
        <Alert variant="destructive" className="mb-2">
          <AlertTitle>Could not embed meeting</AlertTitle>
          <AlertDescription className="text-xs whitespace-pre-wrap">{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div
        ref={rootRef}
        className={`zoom-meeting-sdk-root overflow-x-hidden overflow-y-visible rounded-md border bg-black/5 ${zoomRootFrameClass}`}
      />

      {phase === "ready" && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Use Zoom&apos;s toolbar for audio, video, and leave.</span>
            <TelemedicineHelpLink />
          </p>
          {mediaCompat && (mediaCompat.audio === false || mediaCompat.video === false) && (
            <Alert variant="destructive">
              <AlertTitle className="text-sm">Browser reports limited media support</AlertTitle>
              <AlertDescription className="text-xs">
                Zoom SDK check: audio={String(mediaCompat.audio ?? "unknown")}, video={String(mediaCompat.video ?? "unknown")}.
                Try Chrome/Edge, update the browser, or enable Cross-Origin isolation for advanced features (see docs).
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}
