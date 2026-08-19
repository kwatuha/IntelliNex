"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { format } from "date-fns"
import {
  CalendarPlus,
  ChevronDown,
  Flag,
  History,
  Loader2,
  Plus,
  Printer,
  Stethoscope,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import {
  appointmentsApi,
  laboratoryApi,
  medicalRecordsApi,
  patientApi,
  pharmacyApi,
  proceduresApi,
  radiologyApi,
  triageApi,
} from "@/lib/api"
import { MedicationCombobox } from "@/components/medication-combobox"
import { SymptomsAutocomplete } from "@/components/symptoms-autocomplete"
import { cn } from "@/lib/utils"
import { printPrescriptionFromApi } from "@/lib/print-prescription"
import { TelemedicineVitalsCharts } from "@/components/telemedicine-vitals-charts"

/** Visible scrollbars (Radix ScrollArea thumb was too faint in the telemedicine dock). */
const encounterScrollClass = cn(
  "min-h-[160px] flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-muted/20 py-2 pl-2 pr-1",
  "[scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.75)_hsl(var(--muted))]",
  "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/90",
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/55 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/75"
)

const PatientEncounterForm = dynamic(
  () => import("@/components/patient-encounter-form").then((m) => m.PatientEncounterForm),
  { ssr: false }
)

type MedLine = {
  medicationId: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
}

type ReadyResultFlag = {
  key: string
  kind: "lab" | "radiology"
  label: string
  dateLabel: string
  status: string
}

const APPOINTMENT_TYPES = [
  "Telemedicine",
  "Outpatient",
  "Specialty Clinic",
  "Laboratory",
  "Radiology",
  "Follow-up",
  "Other",
] as const

function ackStorageKey(userId: string) {
  return `tm-order-result-ack:${userId}`
}

function loadAckKeys(userId: string): Set<string> {
  if (typeof window === "undefined" || !userId) return new Set()
  try {
    const raw = localStorage.getItem(ackStorageKey(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function persistAckKeys(userId: string, keys: Set<string>) {
  if (typeof window === "undefined" || !userId) return
  localStorage.setItem(ackStorageKey(userId), JSON.stringify([...keys]))
}

function orderDateKey(value: unknown): string {
  if (!value) return "unknown"
  try {
    return format(new Date(String(value)), "yyyy-MM-dd")
  } catch {
    return "unknown"
  }
}

function isResultsReadyStatus(status: unknown): boolean {
  const s = String(status || "").toLowerCase()
  return s === "completed" || s === "verified" || s === "released" || s === "reported"
}

function formatVitalWhen(v: any): string {
  const d = v?.recordedAt || v?.recordedDate
  if (!d) return "—"
  try {
    return format(new Date(d), "yyyy-MM-dd HH:mm")
  } catch {
    return "—"
  }
}

function formatVitalBp(v: any): string {
  if (v?.bloodPressure) return String(v.bloodPressure)
  if (v?.systolicBP != null || v?.diastolicBP != null) {
    return `${v.systolicBP ?? "—"}/${v.diastolicBP ?? "—"}`
  }
  return "—"
}

const FACILITY_INTERVENTION_TAG = "[Facility intervention]"

function unwrapList(data: unknown): any[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object" && Array.isArray((data as any).data)) return (data as any).data
  return []
}

export type TelemedicineEncounterPanelProps = {
  patientId: string | null
  patientDisplayName?: string | null
  sessionId: string
}

export function TelemedicineEncounterPanel({ patientId, patientDisplayName, sessionId }: TelemedicineEncounterPanelProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const doctorId = user?.id != null ? String(user.id) : ""

  const [tab, setTab] = useState("encounter")
  const [saving, setSaving] = useState(false)
  const [booking, setBooking] = useState(false)
  const [fullEncounterOpen, setFullEncounterOpen] = useState(false)

  const [chiefComplaint, setChiefComplaint] = useState("")
  const [symptoms, setSymptoms] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [treatment, setTreatment] = useState("")
  const [notes, setNotes] = useState("")
  const [medLines, setMedLines] = useState<MedLine[]>([])

  const [apptDate, setApptDate] = useState("")
  const [apptTime, setApptTime] = useState("")
  const [apptType, setApptType] = useState<string>("Telemedicine")
  const [apptReason, setApptReason] = useState("")
  const [interventionDraft, setInterventionDraft] = useState("")
  const [savingIntervention, setSavingIntervention] = useState(false)

  const [histLoading, setHistLoading] = useState(false)
  const [patientRow, setPatientRow] = useState<any>(null)
  const [allergies, setAllergies] = useState<any[]>([])
  const [vitals, setVitals] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [rx, setRx] = useState<any[]>([])
  const [labs, setLabs] = useState<any[]>([])
  const [radiology, setRadiology] = useState<any[]>([])
  const [completedLabs, setCompletedLabs] = useState<any[]>([])
  const [completedRadiology, setCompletedRadiology] = useState<any[]>([])
  const [procedures, setProcedures] = useState<any[]>([])
  const [triageRows, setTriageRows] = useState<any[]>([])
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({})
  const [ackedKeys, setAckedKeys] = useState<Set<string>>(() => loadAckKeys(doctorId))

  useEffect(() => {
    setAckedKeys(loadAckKeys(doctorId))
  }, [doctorId])

  const loadHistory = useCallback(async () => {
    if (!patientId) return
    setHistLoading(true)
    try {
      const [p, al, v, rec, presc, lab, labDone, rad, radDone, proc, triage] = await Promise.all([
        patientApi.getById(patientId).catch(() => null),
        patientApi.getAllergies(patientId).catch(() => []),
        /** Recent vitals (not today-only — telemed patients often triaged earlier). */
        patientApi.getVitals(patientId).catch(() => []),
        medicalRecordsApi.getAll(undefined, patientId, undefined, undefined, undefined, 1, 40).catch(() => []),
        pharmacyApi.getPrescriptions(patientId, undefined, 1, 20).catch(() => []),
        laboratoryApi.getOrders(patientId, undefined, 1, 40).catch(() => []),
        laboratoryApi.getOrders(patientId, "completed", 1, 30).catch(() => []),
        radiologyApi.getOrders(patientId, undefined, 1, 40).catch(() => []),
        radiologyApi.getOrders(patientId, "completed", 1, 30).catch(() => []),
        proceduresApi.getPatientProcedures(patientId).catch(() => []),
        triageApi.getAll(undefined, undefined, undefined, 1, 30, patientId).catch(() => []),
      ])
      setPatientRow(p)
      setAllergies(unwrapList(al))
      setVitals(unwrapList(v).slice(0, 15))
      setRecords(unwrapList(rec))
      setRx(unwrapList(presc))
      setLabs(unwrapList(lab))
      setCompletedLabs(unwrapList(labDone))
      setRadiology(unwrapList(rad))
      setCompletedRadiology(unwrapList(radDone))
      setProcedures(unwrapList(proc).slice(0, 20))
      setTriageRows(unwrapList(triage))
    } catch (e: any) {
      toast({ title: "History load failed", description: e?.message || "Could not load patient data", variant: "destructive" })
    } finally {
      setHistLoading(false)
    }
  }, [patientId, toast])

  useEffect(() => {
    if (patientId) void loadHistory()
  }, [patientId, loadHistory])

  const readyFlags = useMemo((): ReadyResultFlag[] => {
    const flags: ReadyResultFlag[] = []
    const seen = new Set<string>()
    const pushLab = (o: any) => {
      if (!o?.orderId || !isResultsReadyStatus(o.status)) return
      const key = `lab:${o.orderId}`
      if (seen.has(key) || ackedKeys.has(key)) return
      seen.add(key)
      const tests = String(o.testNames || "").trim()
      flags.push({
        key,
        kind: "lab",
        label: tests
          ? `Lab: ${tests.slice(0, 80)}${tests.length > 80 ? "…" : ""}`
          : o.orderNumber
            ? `Lab #${o.orderNumber}`
            : `Lab order #${o.orderId}`,
        dateLabel: o.orderDate ? format(new Date(o.orderDate), "yyyy-MM-dd") : "—",
        status: String(o.status || "completed"),
      })
    }
    const pushRad = (o: any) => {
      if (!o?.orderId || !isResultsReadyStatus(o.status)) return
      const key = `radiology:${o.orderId}`
      if (seen.has(key) || ackedKeys.has(key)) return
      seen.add(key)
      const exam = String(o.examName || o.bodyPart || "").trim()
      flags.push({
        key,
        kind: "radiology",
        label: exam
          ? `Imaging: ${exam}`
          : o.orderNumber
            ? `Imaging #${o.orderNumber}`
            : `Imaging order #${o.orderId}`,
        dateLabel: o.orderDate ? format(new Date(o.orderDate), "yyyy-MM-dd") : "—",
        status: String(o.status || "completed"),
      })
    }
    completedLabs.forEach(pushLab)
    labs.forEach(pushLab)
    completedRadiology.forEach(pushRad)
    radiology.forEach(pushRad)
    return flags
  }, [labs, radiology, completedLabs, completedRadiology, ackedKeys])

  const facilityInterventions = useMemo(() => {
    const items: { id: string; when: string; text: string; by?: string }[] = []
    for (const t of triageRows) {
      const parts = [t.chiefComplaint, t.notes].map((x: unknown) => String(x || "").trim()).filter(Boolean)
      if (parts.length === 0) continue
      const when = t.triageDate || t.createdAt
      items.push({
        id: `triage-${t.triageId}`,
        when: when ? format(new Date(when), "yyyy-MM-dd HH:mm") : "—",
        text: parts.join(" — "),
        by: [t.triagedByFirstName, t.triagedByLastName].filter(Boolean).join(" ") || "Triage",
      })
    }
    for (const v of vitals) {
      const note = String(v.notes || "").trim()
      if (!note) continue
      items.push({
        id: `vital-note-${v.vitalSignId || formatVitalWhen(v)}`,
        when: formatVitalWhen(v),
        text: note,
        by: [v.recordedByFirstName, v.recordedByLastName].filter(Boolean).join(" ") || "Facility",
      })
    }
    for (const r of records) {
      const note = String(r.notes || "")
      if (!note.includes(FACILITY_INTERVENTION_TAG) && String(r.department || "") !== "Facility") continue
      const text = note.replace(FACILITY_INTERVENTION_TAG, "").trim() || r.treatment || r.chiefComplaint
      if (!String(text || "").trim()) continue
      const when = r.visitDate || r.createdAt
      items.push({
        id: `rec-${r.recordId}`,
        when: when ? format(new Date(when), "yyyy-MM-dd HH:mm") : "—",
        text: String(text).trim(),
        by: [r.doctorFirstName, r.doctorLastName].filter(Boolean).join(" ") || "Facility",
      })
    }
    return items
      .sort((a, b) => String(b.when).localeCompare(String(a.when)))
      .slice(0, 12)
  }, [triageRows, vitals, records])

  const encountersByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of records) {
      const key = orderDateKey(r.visitDate || r.createdAt)
      const list = map.get(key) || []
      list.push(r)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [records])

  const acknowledgeFlag = (key: string) => {
    setAckedKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      persistAckKeys(doctorId, next)
      return next
    })
  }

  const handleSaveIntervention = async () => {
    const text = interventionDraft.trim()
    if (!text) {
      toast({ title: "Nothing to save", description: "Enter the facility intervention first.", variant: "destructive" })
      return
    }
    if (!patientId || !doctorId) {
      toast({ title: "Cannot save", description: "Patient and signed-in clinician are required.", variant: "destructive" })
      return
    }
    setSavingIntervention(true)
    try {
      const today = format(new Date(), "yyyy-MM-dd")
      await medicalRecordsApi.create({
        patientId: parseInt(patientId, 10),
        doctorId: parseInt(doctorId, 10),
        visitDate: today,
        visitType: "Outpatient",
        department: "Facility",
        chiefComplaint: null,
        symptoms: null,
        historyOfPresentIllness: null,
        physicalExamination: null,
        diagnosis: null,
        treatment: text,
        outcome: null,
        prescription: null,
        notes: `${FACILITY_INTERVENTION_TAG}\n${text}\n[Telemedicine] Session #${sessionId}`,
      })
      setInterventionDraft("")
      toast({ title: "Intervention saved", description: "Visible to consultants on this panel." })
      void loadHistory()
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || "Could not save intervention", variant: "destructive" })
    } finally {
      setSavingIntervention(false)
    }
  }

  const toggleDate = (dateKey: string) => {
    setExpandedDates((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }))
  }

  const addMedLine = () => {
    setMedLines((prev) => [...prev, { medicationId: "", dosage: "", frequency: "", duration: "", instructions: "" }])
  }
  const removeMedLine = (i: number) => setMedLines((prev) => prev.filter((_, idx) => idx !== i))
  const updateMedLine = (i: number, patch: Partial<MedLine>) =>
    setMedLines((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const handleBookAppointment = async () => {
    if (!patientId) {
      toast({ title: "No patient", description: "Wait for the session to load.", variant: "destructive" })
      return
    }
    if (!apptDate || !apptTime) {
      toast({ title: "Date and time required", description: "Choose appointment date and time.", variant: "destructive" })
      return
    }
    setBooking(true)
    try {
      await appointmentsApi.create({
        patientId: parseInt(patientId, 10),
        doctorId: doctorId ? parseInt(doctorId, 10) : null,
        appointmentDate: apptDate,
        appointmentTime: apptTime,
        department: apptType || "Telemedicine",
        reason: apptReason.trim() || `Follow-up from telemedicine session #${sessionId}`,
        status: "scheduled",
        notes: `Booked during telemedicine session #${sessionId}`,
      })
      toast({
        title: "Appointment booked",
        description: `${apptType} on ${apptDate} at ${apptTime}`,
      })
      setApptReason("")
    } catch (e: any) {
      toast({ title: "Booking failed", description: e?.message || "Could not create appointment", variant: "destructive" })
    } finally {
      setBooking(false)
    }
  }

  const handleSaveEncounter = async () => {
    if (!patientId) {
      toast({ title: "No patient", description: "Wait for the session to load or reopen from the queue.", variant: "destructive" })
      return
    }
    if (!doctorId) {
      toast({ title: "Not signed in", description: "Sign in as a clinician to save an encounter.", variant: "destructive" })
      return
    }
    const trimmedDx = diagnosis.trim()
    const filledMeds = medLines.filter((m) => m.medicationId && m.dosage && m.frequency && m.duration)
    if (filledMeds.length > 0 && !trimmedDx) {
      toast({ title: "Diagnosis required", description: "Enter a diagnosis before adding prescriptions.", variant: "destructive" })
      return
    }
    const hasNarrative =
      chiefComplaint.trim() || symptoms.trim() || trimmedDx || treatment.trim() || notes.trim() || filledMeds.length > 0
    if (!hasNarrative) {
      toast({ title: "Nothing to save", description: "Add at least one field (e.g. chief complaint, symptoms, or diagnosis).", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const today = format(new Date(), "yyyy-MM-dd")
      /** `visitType` is DB ENUM(Outpatient|Inpatient|Emergency) — telemedicine is tagged in `notes`. */
      await medicalRecordsApi.create({
        patientId: parseInt(patientId, 10),
        doctorId: parseInt(doctorId, 10),
        visitDate: today,
        visitType: "Outpatient",
        department: null,
        chiefComplaint: chiefComplaint.trim() || null,
        symptoms: symptoms.trim() || null,
        historyOfPresentIllness: null,
        physicalExamination: null,
        diagnosis: trimmedDx || null,
        treatment: treatment.trim() || null,
        outcome: null,
        prescription: null,
        notes: notes.trim()
          ? `${notes.trim()}\n\n[Telemedicine] Session #${sessionId}`
          : `[Telemedicine] Session #${sessionId}`,
      })

      if (filledMeds.length > 0) {
        const items = filledMeds.map((m) => ({
          medicationId: parseInt(m.medicationId, 10),
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          quantity: null as number | null,
          instructions: m.instructions.trim() || null,
        }))
        await pharmacyApi.createPrescription({
          patientId: parseInt(patientId, 10),
          doctorId: parseInt(doctorId, 10),
          prescriptionDate: today,
          status: "pending",
          notes: trimmedDx || notes.trim() || null,
          items,
        })
      }

      toast({
        title: "Encounter saved",
        description: filledMeds.length
          ? "Saved to Medical records and Pharmacy (new prescription)."
          : "Saved to Medical records (Outpatient; telemedicine noted in record).",
      })
      setChiefComplaint("")
      setSymptoms("")
      setDiagnosis("")
      setTreatment("")
      setNotes("")
      setMedLines([])
      void loadHistory()
    } catch (e: any) {
      const msg = e?.message || "Could not save encounter"
      console.error("[Telemedicine encounter] save failed", e)
      toast({ title: "Save failed", description: msg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const headerName =
    patientDisplayName?.trim() ||
    (patientRow ? `${patientRow.firstName || ""} ${patientRow.lastName || ""}`.trim() : null) ||
    "Patient"

  if (!patientId) {
    return (
      <Card className="flex h-full min-h-[200px] flex-col border-dashed">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Stethoscope className="h-4 w-4" />
            Telemedicine encounter
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">Loading patient from session…</CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border bg-card shadow-sm">
        <CardHeader className="shrink-0 space-y-1 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Stethoscope className="h-4 w-4 shrink-0" />
            <span className="truncate">Encounter</span>
            {readyFlags.length > 0 ? (
              <Badge variant="destructive" className="ml-auto gap-1 text-[10px] font-normal">
                <Flag className="h-3 w-3" />
                {readyFlags.length} result{readyFlags.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{headerName}</span>
            {patientRow?.patientNumber ? ` · ${patientRow.patientNumber}` : ""}
          </p>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3 pt-0">
          <div
            className={cn(
              "shrink-0 space-y-1.5 rounded-md border p-2",
              readyFlags.length > 0
                ? "border-amber-500/40 bg-amber-50/80 dark:bg-amber-950/30"
                : "border-border/60 bg-muted/20"
            )}
          >
            <p
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-semibold",
                readyFlags.length > 0 ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground"
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              {readyFlags.length > 0
                ? `Results ready (${readyFlags.length}) — tick to clear`
                : "Results ready — none awaiting review"}
            </p>
            {readyFlags.length > 0 ? (
              <ul className="space-y-1.5">
                {readyFlags.map((f) => (
                  <li key={f.key} className="flex items-start gap-2 text-[11px]">
                    <Checkbox
                      id={`ack-${f.key}`}
                      className="mt-0.5"
                      checked={false}
                      onCheckedChange={(checked) => {
                        if (checked) acknowledgeFlag(f.key)
                      }}
                    />
                    <label htmlFor={`ack-${f.key}`} className="cursor-pointer leading-snug text-foreground">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {f.dateLabel} · {f.status}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Completed lab or imaging orders for this patient appear here until you acknowledge them.
              </p>
            )}
          </div>

          <div className="shrink-0 max-h-[200px] space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
            <section>
              <h4 className="mb-1 font-semibold">Triage vitals</h4>
              {vitals.length > 0 ? (
                <ul className="space-y-1 text-muted-foreground">
                  {vitals.slice(0, 5).map((v: any, idx: number) => (
                    <li key={v.vitalSignId ?? idx}>
                      {formatVitalWhen(v)}: BP {formatVitalBp(v)}, HR {v.heartRate ?? "—"}, Temp {v.temperature ?? "—"}
                      {v.oxygenSaturation != null ? `, SpO₂ ${v.oxygenSaturation}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[10px] text-muted-foreground">No vitals on record for this patient.</p>
              )}
              <div className="mt-2">
                <TelemedicineVitalsCharts vitals={vitals} />
              </div>
            </section>
            <section className="border-t border-border/40 pt-2">
              <h4 className="mb-1 font-semibold">Facility interventions</h4>
              {facilityInterventions.length > 0 ? (
                <ul className="mb-2 space-y-1.5 text-muted-foreground">
                  {facilityInterventions.map((item) => (
                    <li key={item.id} className="leading-snug">
                      <span className="font-medium text-foreground">{item.when}</span>
                      {item.by ? <span> · {item.by}</span> : null}
                      <div className="whitespace-pre-wrap text-foreground/90">{item.text}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-2 text-[10px] text-muted-foreground">
                  No interventions yet. Triage notes and entries below appear here.
                </p>
              )}
              <Textarea
                className="min-h-[52px] text-xs"
                placeholder="What facility providers did (oxygen, IV, wound care…)"
                value={interventionDraft}
                onChange={(e) => setInterventionDraft(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1.5 h-7 w-full text-[10px]"
                disabled={savingIntervention || !interventionDraft.trim()}
                onClick={() => void handleSaveIntervention()}
              >
                {savingIntervention ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save facility intervention"}
              </Button>
            </section>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-2">
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger value="encounter" className="text-xs">
                This visit
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1 text-xs">
                <History className="h-3 w-3" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="encounter" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <div className={encounterScrollClass}>
                <div className="space-y-3 pb-2 pr-1">
                  <div className="space-y-1">
                    <Label className="text-xs">Chief complaint</Label>
                    <Input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className="h-8 text-sm" placeholder="Brief reason for visit" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Symptoms</Label>
                    <SymptomsAutocomplete value={symptoms} onChange={setSymptoms} placeholder="Signs and symptoms" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Diagnosis</Label>
                    <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} className="text-sm" placeholder="Assessment / diagnosis" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Treatment / plan</Label>
                    <Textarea value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={2} className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
                  </div>

                  <div className="space-y-2 border-t pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold">Prescriptions</Label>
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addMedLine}>
                        <Plus className="mr-1 h-3 w-3" />
                        Add drug
                      </Button>
                    </div>
                    {medLines.map((row, i) => (
                      <div key={i} className="space-y-2 rounded-md border p-2">
                        <div className="flex justify-end">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMedLine(i)} title="Remove">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <MedicationCombobox
                          value={row.medicationId}
                          onValueChange={(v) => updateMedLine(i, { medicationId: v })}
                          placeholder="Medication"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input className="h-8 text-xs" placeholder="Dose" value={row.dosage} onChange={(e) => updateMedLine(i, { dosage: e.target.value })} />
                          <Input className="h-8 text-xs" placeholder="Frequency" value={row.frequency} onChange={(e) => updateMedLine(i, { frequency: e.target.value })} />
                          <Input className="h-8 text-xs" placeholder="Duration" value={row.duration} onChange={(e) => updateMedLine(i, { duration: e.target.value })} />
                          <Input
                            className="h-8 text-xs"
                            placeholder="Instructions"
                            value={row.instructions}
                            onChange={(e) => updateMedLine(i, { instructions: e.target.value })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 border-t pt-2">
                    <div className="flex items-center gap-1.5">
                      <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-xs font-semibold">Book next appointment</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Schedule another telemedicine or facility encounter for this patient.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Date</Label>
                        <Input type="date" className="h-8 text-xs" value={apptDate} onChange={(e) => setApptDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Time</Label>
                        <Input type="time" className="h-8 text-xs" value={apptTime} onChange={(e) => setApptTime(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Encounter type</Label>
                      <Select value={apptType} onValueChange={setApptType}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {APPOINTMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Reason (optional)</Label>
                      <Textarea
                        className="text-xs"
                        rows={2}
                        placeholder="e.g. Review labs, follow-up cough"
                        value={apptReason}
                        onChange={(e) => setApptReason(e.target.value)}
                      />
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="h-8 w-full text-xs" disabled={booking} onClick={() => void handleBookAppointment()}>
                      {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book appointment"}
                    </Button>
                  </div>

                  <Button type="button" variant="secondary" size="sm" className="h-8 w-full text-xs" onClick={() => setFullEncounterOpen(true)}>
                    Open full encounter form (labs, imaging, procedures…)
                  </Button>
                </div>
              </div>
              <Button type="button" className="mt-2 shrink-0" size="sm" disabled={saving} onClick={handleSaveEncounter}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save encounter"}
              </Button>
            </TabsContent>

            <TabsContent value="history" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <div className={encounterScrollClass}>
                {histLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4 pb-2 text-xs">
                    {allergies.length > 0 && (
                      <section>
                        <h4 className="mb-1 font-semibold text-amber-700 dark:text-amber-400">Allergies</h4>
                        <ul className="list-inside list-disc text-muted-foreground">
                          {allergies.map((a: any, idx: number) => (
                            <li key={idx}>{a.allergen || a.substance || JSON.stringify(a)}</li>
                          ))}
                        </ul>
                      </section>
                    )}

                    <section>
                      <h4 className="mb-2 font-semibold">Historical encounters</h4>
                      {encountersByDate.length === 0 ? (
                        <p className="text-muted-foreground">No prior encounters on record.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {encountersByDate.map(([dateKey, dayRecords]) => {
                            const open = expandedDates[dateKey] ?? false
                            const first = dayRecords[0]
                            const summary =
                              first?.diagnosis ||
                              first?.chiefComplaint ||
                              first?.visitType ||
                              `${dayRecords.length} visit${dayRecords.length === 1 ? "" : "s"}`
                            return (
                              <li key={dateKey}>
                                <Collapsible open={open} onOpenChange={() => toggleDate(dateKey)}>
                                  <CollapsibleTrigger asChild>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-md border border-border/70 bg-background/80 px-2 py-1.5 text-left hover:bg-muted/50"
                                    >
                                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")} />
                                      <span className="font-medium text-foreground">{dateKey === "unknown" ? "Unknown date" : dateKey}</span>
                                      <span className="truncate text-muted-foreground">· {summary}</span>
                                      <Badge variant="outline" className="ml-auto h-5 shrink-0 text-[10px]">
                                        {dayRecords.length}
                                      </Badge>
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="space-y-2 px-1 pt-2">
                                    {dayRecords.map((r: any) => (
                                      <div key={r.recordId} className="rounded-md border border-border/50 bg-muted/20 p-2 text-muted-foreground">
                                        <div className="font-medium text-foreground">
                                          {r.visitType || "Visit"}
                                          {r.department ? ` · ${r.department}` : ""}
                                        </div>
                                        {r.chiefComplaint ? <div>CC: {r.chiefComplaint}</div> : null}
                                        {r.symptoms ? <div>Sx: {r.symptoms}</div> : null}
                                        {r.diagnosis ? <div>Dx: {r.diagnosis}</div> : null}
                                        {r.treatment ? <div>Plan: {r.treatment}</div> : null}
                                        {r.notes ? <div className="whitespace-pre-wrap">Notes: {r.notes}</div> : null}
                                        {(r.doctorFirstName || r.doctorLastName) && (
                                          <div className="mt-1 text-[10px]">
                                            Dr {r.doctorFirstName || ""} {r.doctorLastName || ""}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    {labs.filter((o: any) => orderDateKey(o.orderDate) === dateKey).length > 0 ? (
                                      <div className="pl-1 text-muted-foreground">
                                        <span className="font-medium text-foreground">Labs that day: </span>
                                        {labs
                                          .filter((o: any) => orderDateKey(o.orderDate) === dateKey)
                                          .map((o: any) => `${o.orderNumber || o.orderId} (${o.status || "—"})`)
                                          .join(", ")}
                                      </div>
                                    ) : null}
                                    {rx.filter((p: any) => orderDateKey(p.prescriptionDate) === dateKey).length > 0 ? (
                                      <div className="pl-1 text-muted-foreground">
                                        <span className="font-medium text-foreground">Rx that day: </span>
                                        {rx
                                          .filter((p: any) => orderDateKey(p.prescriptionDate) === dateKey)
                                          .map((p: any) => `#${p.prescriptionNumber || p.prescriptionId} (${p.status || "—"})`)
                                          .join(", ")}
                                      </div>
                                    ) : null}
                                  </CollapsibleContent>
                                </Collapsible>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </section>

                    {rx.length > 0 && (
                      <section>
                        <h4 className="mb-2 font-semibold">Prescriptions</h4>
                        <ul className="space-y-2 text-muted-foreground">
                          {[...rx]
                            .sort((a: any, b: any) => {
                              const ap = String(a.status || "").toLowerCase() === "pending" ? 0 : 1
                              const bp = String(b.status || "").toLowerCase() === "pending" ? 0 : 1
                              return ap - bp
                            })
                            .map((p: any) => {
                              const items: any[] = Array.isArray(p.items) ? p.items : []
                              return (
                                <li
                                  key={p.prescriptionId}
                                  className="rounded-md border border-border/70 bg-background/80 p-2 text-xs shadow-sm"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                                    <span className="font-medium text-foreground">
                                      {p.prescriptionDate ? format(new Date(p.prescriptionDate), "yyyy-MM-dd") : "—"}
                                      {p.prescriptionNumber ? (
                                        <span className="ml-1.5 font-normal text-muted-foreground">#{p.prescriptionNumber}</span>
                                      ) : null}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 gap-1 px-2 text-[10px]"
                                        title="Open print-friendly view"
                                        onClick={() => {
                                          const ok = printPrescriptionFromApi(
                                            {
                                              name: headerName,
                                              patientNumber: patientRow?.patientNumber,
                                            },
                                            p as Record<string, unknown>
                                          )
                                          if (!ok) {
                                            toast({
                                              title: "Popup blocked",
                                              description: "Allow popups for this site to print the prescription.",
                                              variant: "destructive",
                                            })
                                          }
                                        }}
                                      >
                                        <Printer className="h-3 w-3" />
                                        Print
                                      </Button>
                                      <Badge
                                        variant={String(p.status).toLowerCase() === "pending" ? "default" : "secondary"}
                                        className="text-[10px] font-normal"
                                      >
                                        {p.status || "—"}
                                      </Badge>
                                    </div>
                                  </div>
                                  {p.doctorFirstName || p.doctorLastName ? (
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      Dr {p.doctorFirstName || ""} {p.doctorLastName || ""}
                                    </p>
                                  ) : null}
                                  {items.length > 0 ? (
                                    <ul className="mt-2 space-y-2 border-t border-border/30 pt-2">
                                      {items.map((it: any) => {
                                        const name =
                                          it.medicationNameFromCatalog ||
                                          it.medicationName ||
                                          it.genericName ||
                                          "Medication"
                                        return (
                                          <li key={it.itemId ?? `${p.prescriptionId}-${it.medicationId}`} className="text-foreground">
                                            <div className="font-medium leading-snug">{name}</div>
                                            <div className="mt-0.5 pl-0.5 text-[11px] leading-snug text-muted-foreground">
                                              <span>
                                                {it.dosage} · {it.frequency} · {it.duration}
                                              </span>
                                              {it.quantity != null && it.quantity !== "" ? (
                                                <span> · Qty {it.quantity}</span>
                                              ) : null}
                                              {it.instructions ? <span> · {it.instructions}</span> : null}
                                            </div>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  ) : (
                                    <p className="mt-2 text-[11px] italic text-muted-foreground">No medication lines on this prescription.</p>
                                  )}
                                </li>
                              )
                            })}
                        </ul>
                      </section>
                    )}

                    {procedures.length > 0 && (
                      <section>
                        <h4 className="mb-1 font-semibold">Procedures</h4>
                        <ul className="space-y-1 text-muted-foreground">
                          {procedures.map((pr: any, idx: number) => (
                            <li key={pr.patientProcedureId ?? idx}>
                              {pr.procedureDate ? format(new Date(pr.procedureDate), "yyyy-MM-dd") : "—"} — {pr.procedureName || pr.name || "Procedure"}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {allergies.length === 0 &&
                      encountersByDate.length === 0 &&
                      labs.length === 0 &&
                      rx.length === 0 &&
                      procedures.length === 0 && <p className="text-muted-foreground">No history loaded yet.</p>}
                  </div>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2 h-8 shrink-0 text-xs" onClick={() => void loadHistory()}>
                Refresh history
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PatientEncounterForm
        open={fullEncounterOpen}
        onOpenChange={setFullEncounterOpen}
        initialPatientId={patientId}
        initialDoctorId={doctorId}
        onSuccess={() => {
          setFullEncounterOpen(false)
          void loadHistory()
        }}
      />
    </>
  )
}
