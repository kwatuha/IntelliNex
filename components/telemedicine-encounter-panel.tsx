"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { format } from "date-fns"
import { History, Loader2, Plus, Printer, Stethoscope, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import {
  laboratoryApi,
  medicalRecordsApi,
  patientApi,
  pharmacyApi,
  proceduresApi,
} from "@/lib/api"
import { MedicationCombobox } from "@/components/medication-combobox"
import { SymptomsAutocomplete } from "@/components/symptoms-autocomplete"
import { cn } from "@/lib/utils"
import { printPrescriptionFromApi } from "@/lib/print-prescription"

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
  const [fullEncounterOpen, setFullEncounterOpen] = useState(false)

  const [chiefComplaint, setChiefComplaint] = useState("")
  const [symptoms, setSymptoms] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [treatment, setTreatment] = useState("")
  const [notes, setNotes] = useState("")
  const [medLines, setMedLines] = useState<MedLine[]>([])

  const [histLoading, setHistLoading] = useState(false)
  const [patientRow, setPatientRow] = useState<any>(null)
  const [allergies, setAllergies] = useState<any[]>([])
  const [vitals, setVitals] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [rx, setRx] = useState<any[]>([])
  const [labs, setLabs] = useState<any[]>([])
  const [procedures, setProcedures] = useState<any[]>([])

  const loadHistory = useCallback(async () => {
    if (!patientId) return
    setHistLoading(true)
    try {
      const [p, al, v, rec, presc, lab, proc] = await Promise.all([
        patientApi.getById(patientId).catch(() => null),
        patientApi.getAllergies(patientId).catch(() => []),
        patientApi.getVitals(patientId, true).catch(() => []),
        medicalRecordsApi.getAll(undefined, patientId, undefined, undefined, undefined, 1, 12).catch(() => []),
        pharmacyApi.getPrescriptions(patientId, undefined, 1, 20).catch(() => []),
        laboratoryApi.getOrders(patientId, undefined, 1, 15).catch(() => []),
        proceduresApi.getPatientProcedures(patientId).catch(() => []),
      ])
      setPatientRow(p)
      setAllergies(Array.isArray(al) ? al : [])
      setVitals(Array.isArray(v) ? v.slice(0, 15) : [])
      setRecords(Array.isArray(rec) ? rec : [])
      setRx(Array.isArray(presc) ? presc : [])
      setLabs(Array.isArray(lab) ? lab : [])
      setProcedures(Array.isArray(proc) ? proc.slice(0, 20) : [])
    } catch (e: any) {
      toast({ title: "History load failed", description: e?.message || "Could not load patient data", variant: "destructive" })
    } finally {
      setHistLoading(false)
    }
  }, [patientId, toast])

  useEffect(() => {
    if (tab === "history" && patientId) void loadHistory()
  }, [tab, patientId, loadHistory])

  const addMedLine = () => {
    setMedLines((prev) => [...prev, { medicationId: "", dosage: "", frequency: "", duration: "", instructions: "" }])
  }
  const removeMedLine = (i: number) => setMedLines((prev) => prev.filter((_, idx) => idx !== i))
  const updateMedLine = (i: number, patch: Partial<MedLine>) =>
    setMedLines((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

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
        /** Pharmacy `prescriptions` + items — same pipeline as main encounter form. */
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
          </CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{headerName}</span>
            {patientRow?.patientNumber ? ` · ${patientRow.patientNumber}` : ""}
          </p>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3 pt-0">
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
                    {vitals.length > 0 && (
                      <section>
                        <h4 className="mb-1 font-semibold">Recent vitals</h4>
                        <ul className="space-y-1 text-muted-foreground">
                          {vitals.slice(0, 8).map((v: any, idx: number) => (
                            <li key={idx}>
                              {v.recordedAt ? format(new Date(v.recordedAt), "yyyy-MM-dd HH:mm") : "—"}: BP {v.bloodPressure ?? "—"}, HR {v.heartRate ?? "—"}, Temp{" "}
                              {v.temperature ?? "—"}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {labs.length > 0 && (
                      <section>
                        <h4 className="mb-1 font-semibold">Lab orders</h4>
                        <ul className="space-y-1 text-muted-foreground">
                          {labs.slice(0, 10).map((o: any) => (
                            <li key={o.orderId}>
                              {o.orderDate ? format(new Date(o.orderDate), "yyyy-MM-dd") : "—"} — {o.status || "pending"}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
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
                                            {it.status && String(it.status).toLowerCase() !== String(p.status || "").toLowerCase() ? (
                                              <Badge variant="outline" className="mt-1 h-5 text-[10px]">
                                                Line: {it.status}
                                              </Badge>
                                            ) : null}
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
                    {records.length > 0 && (
                      <section>
                        <h4 className="mb-1 font-semibold">Prior visits</h4>
                        <ul className="space-y-2 text-muted-foreground">
                          {records.map((r: any) => (
                            <li key={r.recordId} className="border-b border-border/50 pb-2 last:border-0">
                              <div className="font-medium text-foreground">
                                {r.visitDate ? format(new Date(r.visitDate), "yyyy-MM-dd") : "—"} · {r.visitType || "Visit"}
                              </div>
                              {r.diagnosis && <div>Dx: {r.diagnosis}</div>}
                              {r.chiefComplaint && <div>CC: {r.chiefComplaint}</div>}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {allergies.length === 0 &&
                      vitals.length === 0 &&
                      labs.length === 0 &&
                      rx.length === 0 &&
                      procedures.length === 0 &&
                      records.length === 0 && <p className="text-muted-foreground">No history loaded yet.</p>}
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
