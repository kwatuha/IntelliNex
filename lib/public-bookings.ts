export const PUBLIC_BOOKINGS_STORAGE_KEY = "intellinex_public_bookings_v1"

export type PublicBookingStatus = "pending" | "accepted" | "declined"

export type PublicBooking = {
  id: string
  requestId?: number
  code: string
  firstName: string
  lastName: string
  phone: string
  nationalId: string
  shaMemberNumber?: string
  clinic: string
  preferredDate: string
  preferredTime: string
  reason: string
  insurance: string
  status: PublicBookingStatus
  createdAt: string
  appointmentId?: number | null
  whatsappUrl?: string | null
}

export const PUBLIC_CLINICS = [
  "General OPD",
  "Neurosurgery",
  "Cardiology",
  "Renal & Dialysis",
  "Orthopaedics",
  "Obstetrics & Gynaecology",
  "Paediatrics",
  "Ophthalmology",
  "ENT",
  "Dental",
  "Dermatology",
  "Mental Health",
  "Physiotherapy",
  "Nutrition",
] as const

export const PUBLIC_INSURERS = [
  "Self-pay / Cash",
  "NHIF / SHA",
  "AAR",
  "Jubilee",
  "Madison",
  "CIC",
  "Britam",
  "Other",
] as const

function demoSeed(): PublicBooking[] {
  return [
    {
      id: "bk-demo-kiptoo",
      code: "TH-4821",
      firstName: "Daniel",
      lastName: "Kiptoo",
      phone: "0722 410 883",
      nationalId: "28411902",
      clinic: "Neurosurgery",
      preferredDate: new Date().toISOString().slice(0, 10),
      preferredTime: "09:30",
      reason: "Referred from Bomet for lumbar disc pain; known CKD on twice-weekly dialysis",
      insurance: "AAR",
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  ]
}

export function loadPublicBookings(): PublicBooking[] {
  if (typeof window === "undefined") return demoSeed()
  try {
    const raw = window.localStorage.getItem(PUBLIC_BOOKINGS_STORAGE_KEY)
    if (!raw) {
      const seed = demoSeed()
      window.localStorage.setItem(PUBLIC_BOOKINGS_STORAGE_KEY, JSON.stringify(seed))
      return seed
    }
    const parsed = JSON.parse(raw) as PublicBooking[]
    return Array.isArray(parsed) ? parsed : demoSeed()
  } catch {
    return demoSeed()
  }
}

export function savePublicBookings(bookings: PublicBooking[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PUBLIC_BOOKINGS_STORAGE_KEY, JSON.stringify(bookings))
}

export function addPublicBooking(
  input: Omit<PublicBooking, "id" | "code" | "status" | "createdAt">
): PublicBooking {
  const booking: PublicBooking = {
    ...input,
    id: `bk-${Date.now()}`,
    code: `TH-${Math.floor(1000 + Math.random() * 9000)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  }
  const next = [booking, ...loadPublicBookings()]
  savePublicBookings(next)
  return booking
}

export function updatePublicBookingStatus(id: string, status: PublicBookingStatus) {
  const next = loadPublicBookings().map((b) => (b.id === id ? { ...b, status } : b))
  savePublicBookings(next)
  return next
}

export function mapApiBooking(row: any): PublicBooking {
  const requestId = Number(row?.requestId || row?.id || 0)
  return {
    id: requestId ? String(requestId) : String(row?.code || `bk-${Date.now()}`),
    requestId: requestId || undefined,
    code: String(row?.code || ""),
    firstName: String(row?.firstName || ""),
    lastName: String(row?.lastName || ""),
    phone: String(row?.phone || ""),
    nationalId: String(row?.nationalId || ""),
    shaMemberNumber: row?.shaMemberNumber || "",
    clinic: String(row?.clinic || ""),
    preferredDate: String(row?.preferredDate || "").slice(0, 10),
    preferredTime: String(row?.preferredTime || "").slice(0, 5),
    reason: String(row?.reason || ""),
    insurance: String(row?.insurance || ""),
    status: (row?.status as PublicBookingStatus) || "pending",
    createdAt: row?.createdAt || new Date().toISOString(),
    appointmentId: row?.appointmentId ?? null,
    whatsappUrl: row?.whatsappUrl || null,
  }
}
