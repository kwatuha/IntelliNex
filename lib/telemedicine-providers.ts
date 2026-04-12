/**
 * Video platform for telemedicine sessions (stored in telemedicine_sessions.provider).
 * All current options use the same manual "paste join link" flow unless noted.
 */
export const TELEMEDICINE_VIDEO_PROVIDER_IDS = [
  "zoom_manual",
  "google_meet",
  "microsoft_teams",
  "other_link",
  "daily",
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
  placeholder: string
}

export const TELEMEDICINE_PROVIDER_OPTIONS: TelemedicineProviderOption[] = [
  {
    id: "zoom_manual",
    label: "Zoom",
    shortLabel: "Zoom",
    description:
      "Zoom join link — optional field below, saved Zoom defaults, or session panel after start (HMIS stores link + optional passcode).",
    usesZoomDefaults: true,
    linkUiImplemented: true,
    placeholder: "https://zoom.us/j/… or https://us02web.zoom.us/j/…",
  },
  {
    id: "google_meet",
    label: "Google Meet",
    shortLabel: "Meet",
    description:
      "Google Meet join URL (meet.google.com/…). Enter it in the optional fields below or in the session panel after you start.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    placeholder: "https://meet.google.com/xxx-xxxx-xxx",
  },
  {
    id: "microsoft_teams",
    label: "Microsoft Teams",
    shortLabel: "Teams",
    description:
      "Teams meeting link. Enter it in the optional fields below or in the session panel after you start.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    placeholder: "https://teams.microsoft.com/l/meetup-join/…",
  },
  {
    id: "other_link",
    label: "Other (meeting URL)",
    shortLabel: "Other",
    description: "Any HTTPS join link — optional field below or session panel after start.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    placeholder: "https://…",
  },
  {
    id: "daily",
    label: "Daily.co",
    shortLabel: "Daily",
    description: "Legacy Daily.co — optional field below or session panel after start.",
    usesZoomDefaults: false,
    linkUiImplemented: true,
    placeholder: "https://… .daily.co/…",
  },
]

export function getTelemedicineProviderOption(id: string | null | undefined): TelemedicineProviderOption | undefined {
  return TELEMEDICINE_PROVIDER_OPTIONS.find((o) => o.id === id)
}

export function getTelemedicineProviderLabel(id: string | null | undefined): string {
  return getTelemedicineProviderOption(id)?.label ?? "Video"
}

export function meetingLinkFieldLabel(providerId: string | null | undefined): string {
  const p = providerId || "zoom_manual"
  if (p === "zoom_manual") return "Zoom meeting link"
  if (p === "google_meet") return "Google Meet link"
  if (p === "microsoft_teams") return "Teams meeting link"
  if (p === "daily") return "Daily.co link"
  return "Meeting link"
}

export function isZoomProvider(providerId: string | null | undefined): boolean {
  return (providerId || "zoom_manual") === "zoom_manual"
}
