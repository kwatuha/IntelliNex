/** After POST /api/telemedicine/sessions — server may reuse one active session per patient. */
export function isTelemedicineReusedSession(created: { reusedExistingSession?: boolean } | null | undefined): boolean {
  return !!created?.reusedExistingSession
}

export function telemedicineCreateToast(
  created: { reusedExistingSession?: boolean; providerSwitched?: boolean; provider?: string } | null | undefined,
  defaults: { title: string; description: string },
): { title: string; description: string } {
  if (created?.providerSwitched) {
    return {
      title: "Video platform switched",
      description: "This patient already had an active telemedicine session, so HMIS switched that same visit to the selected platform.",
    }
  }
  if (isTelemedicineReusedSession(created)) {
    return {
      title: "Joined existing visit",
      description:
        "This patient already has an active telemedicine session. Opening the same meeting so all providers share one video room.",
    }
  }
  return defaults
}
