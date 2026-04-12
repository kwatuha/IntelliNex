/**
 * Compare Zoom join URLs for “same meeting” (PMI / meeting id).
 * Query params (pwd, uname, etc.) are ignored for the numeric id in /j/{id}.
 */
export function extractZoomMeetingId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null
  const t = url.trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    const j = u.pathname.match(/\/j\/(\d{5,20})/)
    if (j) return j[1]
    const wc = u.pathname.match(/\/wc\/(\d{5,20})/)
    if (wc) return wc[1]
    const join = u.pathname.match(/\/join\?.*confno=(\d{5,20})/i) || u.search.match(/[?&]confno=(\d{5,20})/i)
    if (join) return join[1]
  } catch {
    const m = t.match(/\/j\/(\d{5,20})/)
    if (m) return m[1]
  }
  return null
}

/** True when both URLs refer to the same Zoom meeting number (typical “my default link” check). */
export function zoomMeetingUrlsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ida = extractZoomMeetingId(a)
  const idb = extractZoomMeetingId(b)
  if (!ida || !idb) return false
  return ida === idb
}
