/**
 * Video platform for telemedicine sessions (stored in telemedicine_sessions.provider).
 */
export const DEFAULT_TELEMEDICINE_VIDEO_PROVIDER = "daily" as const

export const TELEMEDICINE_VIDEO_PROVIDER_IDS = [
  "daily",
  "zoom_manual",
  "google_meet",
  "microsoft_teams",
  "other_link",
] as const

export type TelemedicineVideoProviderId = (typeof TELEMEDICINE_VIDEO_PROVIDER_IDS)[number]

export type TelemedicineProviderOption = {
  id: TelemedicineVideoProviderId
  label: string
  shortLabel: string
  description: string
  /** Uses saved "My Zoom defaults" when starting a session */
  usesZoomDefaults: boolean
  /** Join link UI is implemented (paste URL + optional passcode) */
  linkUiImplemented: boolean
  /** In-page embed supported in HMIS (Daily iframe / Zoom Meeting SDK) */
  embedsInPage: boolean
  placeholder: string
}

export const TELEMEDICINE_PROVIDER_OPTIONS: TelemedicineProviderOption[] = [
  {
    id: "daily",
    label: "Daily.co (recommended)",
    shortLabel: "Daily",
    description:
      "Default in-HMIS video — a private Daily room is created automatically when the session starts. Patients join via SMS link; staff can watch in-page.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    embedsInPage: true,
    placeholder: "https://your-domain.daily.co/room-name (auto-created if blank)",
  },
  {
    id: "zoom_manual",
    label: "Zoom",
    shortLabel: "Zoom",
    description:
      "Zoom join link — optional field below, saved Zoom defaults, or session panel after start. Optional Meeting SDK embed when configured.",
    usesZoomDefaults: true,
    linkUiImplemented: true,
    embedsInPage: true,
    placeholder: "https://zoom.us/j/… or https://us02web.zoom.us/j/…",
  },
  {
    id: "google_meet",
    label: "Google Meet",
    shortLabel: "Meet",
    description:
      "Google Meet join URL (meet.google.com/…). Opens in a separate tab — paste the link below or in the session panel.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    embedsInPage: false,
    placeholder: "https://meet.google.com/xxx-xxxx-xxx",
  },
  {
    id: "microsoft_teams",
    label: "Microsoft Teams",
    shortLabel: "Teams",
    description: "Teams meeting link. Opens externally — paste below or in the session panel.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    embedsInPage: false,
    placeholder: "https://teams.microsoft.com/l/meetup-join/…",
  },
  {
    id: "other_link",
    label: "Other (meeting URL)",
    shortLabel: "Other",
    description: "Any HTTPS join link — opens externally.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    embedsInPage: false,
    placeholder: "https://…",
  },
]

export function getTelemedicineProviderOption(id: string | null | undefined): TelemedicineProviderOption | undefined {
  return TELEMEDICINE_PROVIDER_OPTIONS.find((o) => o.id === id)
}

export function getTelemedicineProviderLabel(id: string | null | undefined): string {
  return getTelemedicineProviderOption(id)?.label ?? "Video"
}

export function meetingLinkFieldLabel(providerId: string | null | undefined): string {
  const p = providerId || DEFAULT_TELEMEDICINE_VIDEO_PROVIDER
  if (p === "daily") return "Daily.co room link"
  if (p === "zoom_manual") return "Zoom meeting link"
  if (p === "google_meet") return "Google Meet link"
  if (p === "microsoft_teams") return "Teams meeting link"
  return "Meeting link"
}

export function isZoomProvider(providerId: string | null | undefined): boolean {
  return providerId === "zoom_manual"
}

export function isDailyProvider(providerId: string | null | undefined): boolean {
  return (providerId || DEFAULT_TELEMEDICINE_VIDEO_PROVIDER) === "daily"
}

/**
 * True when starting a visit requires a pasted join URL (Meet / Teams / Other).
 * Daily auto-creates rooms; Zoom can use My Zoom defaults or paste later.
 */
export function providerRequiresPastedMeetingLink(
  providerId: string | null | undefined,
  joinUrl?: string | null
): boolean {
  if (String(joinUrl || "").trim()) return false
  if (isDailyProvider(providerId) || isZoomProvider(providerId)) return false
  return true
}

export function providerEmbedsInPage(providerId: string | null | undefined): boolean {
  return !!getTelemedicineProviderOption(providerId || DEFAULT_TELEMEDICINE_VIDEO_PROVIDER)?.embedsInPage
}

export function meetingHrefFromUrl(url: string | null | undefined): string {
  const value = String(url || "").trim()
  if (!value) return ""
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function normalizeTelemedicineProviderId(
  id: string | null | undefined
): TelemedicineVideoProviderId {
  if (id && (TELEMEDICINE_VIDEO_PROVIDER_IDS as readonly string[]).includes(id)) {
    return id as TelemedicineVideoProviderId
  }
  return DEFAULT_TELEMEDICINE_VIDEO_PROVIDER
}
