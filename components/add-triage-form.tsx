"use client"

import { useState, useEffect, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PatientCombobox } from "@/components/patient-combobox"
import { triageApi, doctorsApi, patientApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import { useCriticalNotifications } from "@/lib/critical-notifications-context"
import { checkAndNotifyCriticalVitals } from "@/lib/critical-vitals-utils"

const triageFormSchema = z
  .object({
  patientId: z.string({
    required_error: "Please select a patient.",
  }),
  temperature: z.string().optional().or(z.literal("")),
  systolicBP: z.string().optional().or(z.literal("")),
  diastolicBP: z.string().optional().or(z.literal("")),
  heartRate: z.string().optional().or(z.literal("")),
  respiratoryRate: z.string().optional().or(z.literal("")),
  oxygenSaturation: z.string().optional().or(z.literal("")),
  painLevel: z.string().optional().or(z.literal("")),
  weight: z.string().optional().or(z.literal("")),
  height: z.string().optional().or(z.literal("")),
  priority: z.string({
    required_error: "Please select a priority level.",
  }),
  assignedToDoctorId: z.string({
    required_error: "Please select a doctor.",
  }),
  assignedToDepartment: z.string().optional(),
  /** Post-triage destination: in-person consultation or telemedicine queue */
  servicePoint: z.enum(["consultation", "telemedicine"]),
})
  .superRefine((data, ctx) => {
    const s = data.systolicBP?.trim() ?? ""
    const d = data.diastolicBP?.trim() ?? ""
    if (!s && !d) return
    if (!s || !d) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter both systolic and diastolic BP, or leave both empty.",
        path: ["diastolicBP"],
      })
      return
    }
    const sys = parseInt(s, 10)
    const dia = parseInt(d, 10)
    if (Number.isNaN(sys) || sys < 40 || sys > 300) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Systolic BP should be between 40 and 300 mmHg.",
        path: ["systolicBP"],
      })
    }
    if (Number.isNaN(dia) || dia < 20 || dia > 200) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Diastolic BP should be between 20 and 200 mmHg.",
        path: ["diastolicBP"],
      })
    }
  })

type TriageFormValues = z.infer<typeof triageFormSchema>

const TRIAGE_STORAGE_KEY_PREFIX = "triage_form_draft"

const defaultValues: Partial<TriageFormValues> = {
  patientId: "",
  temperature: "",
  systolicBP: "",
  diastolicBP: "",
  heartRate: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  painLevel: "",
  weight: "",
  height: "",
  priority: "",
  assignedToDoctorId: "",
  assignedToDepartment: "",
  servicePoint: "consultation",
}

export function AddTriageForm({
  open,
  onOpenChange,
  onSuccess,
  triage,
  initialPatientId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  triage?: any
  initialPatientId?: string
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<any[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(false)
  const [patientName, setPatientName] = useState<string | undefined>(undefined)
  const isEditing = !!triage
  const { user } = useAuth()
  const { addNotification } = useCriticalNotifications()
  const restoringDraftRef = useRef(false)
  const prevPatientIdRef = useRef<string>("")

  const form = useForm<TriageFormValues>({
    resolver: zodResolver(triageFormSchema),
    defaultValues: {
      ...defaultValues,
      // Ensure all values are explicitly set to empty strings, not undefined
      patientId: "",
      temperature: "",
      systolicBP: "",
      diastolicBP: "",
      heartRate: "",
      respiratoryRate: "",
      oxygenSaturation: "",
      painLevel: "",
      weight: "",
      height: "",
      priority: "",
      assignedToDoctorId: "",
      assignedToDepartment: "",
      servicePoint: "consultation",
    },
  })

  const watchedPatientId = form.watch("patientId")

  /** Build vitals for critical alerts from submitted form data */
  const buildVitalsFromData = (data: TriageFormValues): Record<string, number> | null => {
    const vitals: Record<string, number> = {}

    if (data.temperature?.trim() && !Number.isNaN(parseFloat(data.temperature))) {
      vitals.temperature = parseFloat(data.temperature)
    }
    if (data.systolicBP?.trim() && data.diastolicBP?.trim()) {
      const sys = parseInt(data.systolicBP, 10)
      const dia = parseInt(data.diastolicBP, 10)
      if (!Number.isNaN(sys) && !Number.isNaN(dia)) {
        vitals.systolicBP = sys
        vitals.diastolicBP = dia
      }
    }
    if (data.heartRate?.trim() && !Number.isNaN(parseFloat(data.heartRate))) {
      vitals.heartRate = parseFloat(data.heartRate)
    }
    if (data.respiratoryRate?.trim() && !Number.isNaN(parseFloat(data.respiratoryRate))) {
      vitals.respiratoryRate = parseFloat(data.respiratoryRate)
    }
    if (data.oxygenSaturation?.trim() && !Number.isNaN(parseFloat(data.oxygenSaturation))) {
      vitals.oxygenSaturation = parseFloat(data.oxygenSaturation)
    }

    return Object.keys(vitals).length > 0 ? vitals : null
  }

  // Load doctors when form opens
  useEffect(() => {
    if (open) {
      loadDoctors()
    }
  }, [open])

  // Auto-save form data to localStorage
  useEffect(() => {
    if (!open || isEditing) return

    const subscription = form.watch((value) => {
      // Skip auto-save while we're restoring/resetting values
      if (restoringDraftRef.current) return

      const hasData = value.patientId ||
                      value.temperature || value.systolicBP || value.diastolicBP || value.heartRate ||
                      value.respiratoryRate || value.oxygenSaturation || value.painLevel || value.weight || value.height ||
                      value.priority || value.assignedToDoctorId

      // Only save drafts once a patient is selected (drafts are scoped per patient)
      const patientId = (value as any)?.patientId as string | undefined
      if (hasData && patientId) {
        // Never persist patientId inside the draft payload to avoid cross-patient leakage
        const { patientId: _pid, ...rest } = (value as any) || {}
        saveDraftToStorage(patientId, rest as any)
      } else {
        // If no patient selected or no data, clear the last patient's draft (if any)
        if (patientId) clearDraftFromStorage(patientId)
      }
    })

    return () => subscription.unsubscribe()
  }, [form, open, isEditing])

  // Removed: No longer checking critical values during typing
  // Critical values are now checked only after form is saved

  // Load patient name when patientId changes
  useEffect(() => {
    if (watchedPatientId) {
      loadPatientName(watchedPatientId)
    } else {
      setPatientName(undefined)
    }
  }, [watchedPatientId])

  const loadPatientName = async (patientId: string) => {
    try {
      const patient = await patientApi.getById(patientId)
      if (patient) {
        const name = `${patient.firstName || ''} ${patient.lastName || ''}`.trim()
        setPatientName(name || undefined)
      }
    } catch (err) {
      console.error('Error loading patient name:', err)
      setPatientName(undefined)
    }
  }

  const loadDoctors = async () => {
    try {
      setLoadingDoctors(true)
      const doctorsData = await doctorsApi.getAll()
      setDoctors(doctorsData)
    } catch (error) {
      console.error("Error loading doctors:", error)
    } finally {
      setLoadingDoctors(false)
    }
  }

  // Draft management functions (scoped per patient)
  const getDraftKey = (patientId: string) => `${TRIAGE_STORAGE_KEY_PREFIX}:${patientId}`

  const saveDraftToStorage = (patientId: string, data: Partial<TriageFormValues>) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(getDraftKey(patientId), JSON.stringify(data))
    } catch (error) {
      console.error('Error saving draft to localStorage:', error)
    }
  }

  const loadDraftFromStorage = (patientId: string): Partial<TriageFormValues> | null => {
    if (typeof window === 'undefined') return null
    try {
      const saved = localStorage.getItem(getDraftKey(patientId))
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (error) {
      console.error('Error loading draft from localStorage:', error)
    }
    return null
  }

  const clearDraftFromStorage = (patientId: string) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(getDraftKey(patientId))
    } catch (error) {
      console.error('Error clearing draft from localStorage:', error)
    }
  }

  // Populate form when editing, otherwise start fresh (drafts are loaded per-patient after selection)
  useEffect(() => {
    if (open) {
      if (isEditing && triage) {
        // If editing, populate from triage data
        form.reset({
          patientId: triage.patientId?.toString() || "",
          temperature: triage.temperature?.toString() || "",
          systolicBP: triage.systolicBP != null ? String(triage.systolicBP) : "",
          diastolicBP: triage.diastolicBP != null ? String(triage.diastolicBP) : "",
          heartRate: triage.heartRate?.toString() || "",
          respiratoryRate: triage.respiratoryRate?.toString() || "",
          oxygenSaturation: triage.oxygenSaturation?.toString() || "",
          painLevel: triage.painLevel?.toString() || "",
          weight: triage.weight?.toString() || "",
          height: triage.height?.toString() || "",
          priority: triage.triageCategory === 'red' ? 'Emergency' :
                    triage.triageCategory === 'yellow' ? (triage.priorityLevel === 2 ? 'Urgent' : 'Semi-urgent') :
                    'Non-urgent',
          assignedToDoctorId: triage.assignedToDoctorId != null ? String(triage.assignedToDoctorId) : "",
          assignedToDepartment: triage.assignedToDepartment || "",
          servicePoint: "consultation",
        })
      } else if (initialPatientId) {
        // New triage with initial patient ID (e.g., from queue)
        restoringDraftRef.current = true
        prevPatientIdRef.current = initialPatientId
        const savedDraft = loadDraftFromStorage(initialPatientId)
        const normalizedDraft = savedDraft
          ? (() => {
              let sys = savedDraft.systolicBP ?? ""
              let dia = savedDraft.diastolicBP ?? ""
              if ((!sys || !dia) && savedDraft.bloodPressure) {
                const m = String(savedDraft.bloodPressure).match(/(\d+)\s*\/\s*(\d+)/)
                if (m) {
                  sys = m[1]
                  dia = m[2]
                }
              }
              return {
              temperature: savedDraft.temperature ?? "",
              systolicBP: sys,
              diastolicBP: dia,
              heartRate: savedDraft.heartRate ?? "",
              respiratoryRate: savedDraft.respiratoryRate ?? "",
              oxygenSaturation: savedDraft.oxygenSaturation ?? "",
              painLevel: savedDraft.painLevel ?? "",
              weight: savedDraft.weight ?? "",
              height: savedDraft.height ?? "",
              priority: savedDraft.priority ?? "",
              assignedToDoctorId: savedDraft.assignedToDoctorId ?? "",
              assignedToDepartment: savedDraft.assignedToDepartment ?? "",
              servicePoint: "consultation",
              }
            })()
          : null

        form.reset({
          ...defaultValues,
          patientId: initialPatientId,
          ...(normalizedDraft || {}),
        })
        loadPatientName(initialPatientId)
        setTimeout(() => {
          restoringDraftRef.current = false
        }, 0)
      } else {
        // New triage: always start with a clean form (no cross-patient draft restore)
        restoringDraftRef.current = true
        prevPatientIdRef.current = ""
        setPatientName(undefined)
        form.reset(defaultValues)
        // Allow watch subscription to resume on next tick
        setTimeout(() => {
          restoringDraftRef.current = false
        }, 0)
      }
    }
  }, [open, isEditing, triage, initialPatientId, form])

  // When a patient is selected (or changed), reset non-patient fields and restore that patient's draft (if any)
  useEffect(() => {
    if (!open || isEditing) return

    const patientId = form.getValues("patientId") || ""

    // If patient cleared, reset everything
    if (!patientId) {
      if (prevPatientIdRef.current !== "") {
        prevPatientIdRef.current = ""
      }
      return
    }

    if (prevPatientIdRef.current === patientId) return
    prevPatientIdRef.current = patientId

    // Reset fields for the newly selected patient, then merge their draft (without overwriting patientId)
    restoringDraftRef.current = true
    const savedDraft = loadDraftFromStorage(patientId)
    const normalizedDraft = savedDraft
      ? (() => {
          let sys = savedDraft.systolicBP ?? ""
          let dia = savedDraft.diastolicBP ?? ""
          if ((!sys || !dia) && savedDraft.bloodPressure) {
            const m = String(savedDraft.bloodPressure).match(/(\d+)\s*\/\s*(\d+)/)
            if (m) {
              sys = m[1]
              dia = m[2]
            }
          }
          return {
          temperature: savedDraft.temperature ?? "",
          systolicBP: sys,
          diastolicBP: dia,
          heartRate: savedDraft.heartRate ?? "",
          respiratoryRate: savedDraft.respiratoryRate ?? "",
          oxygenSaturation: savedDraft.oxygenSaturation ?? "",
          painLevel: savedDraft.painLevel ?? "",
          weight: savedDraft.weight ?? "",
          height: savedDraft.height ?? "",
          priority: savedDraft.priority ?? "",
          assignedToDoctorId: savedDraft.assignedToDoctorId ?? "",
          assignedToDepartment: savedDraft.assignedToDepartment ?? "",
          servicePoint: "consultation",
          }
        })()
      : null

    form.reset({
      ...defaultValues,
      patientId,
      ...(normalizedDraft || {}),
    })

    setTimeout(() => {
      restoringDraftRef.current = false
    }, 0)
  }, [open, isEditing, form])

  async function onSubmit(data: TriageFormValues) {
    try {
      setIsSubmitting(true)
      setError(null)

      const payload = {
        patientId: parseInt(data.patientId),
        chiefComplaint: "", // Removed from form, send empty string
        temperature: data.temperature || null,
        systolicBP: data.systolicBP?.trim() ? parseInt(data.systolicBP, 10) : null,
        diastolicBP: data.diastolicBP?.trim() ? parseInt(data.diastolicBP, 10) : null,
        bloodPressure:
          data.systolicBP?.trim() && data.diastolicBP?.trim()
            ? `${parseInt(data.systolicBP, 10)}/${parseInt(data.diastolicBP, 10)}`
            : null,
        heartRate: data.heartRate || null,
        respiratoryRate: data.respiratoryRate || null,
        oxygenSaturation: data.oxygenSaturation || null,
        painLevel: data.painLevel || null,
        weight: data.weight || null,
        height: data.height || null,
        priority: data.priority,
        assignedToDoctorId: data.assignedToDoctorId ? parseInt(data.assignedToDoctorId) : null,
        assignedToDepartment: data.assignedToDepartment || null,
        servicePoint: data.servicePoint || "consultation",
        // Notes field hidden; preserve existing on edit, none on create
        notes: isEditing && triage ? (triage.notes ?? null) : null,
        triagedBy: user?.id ? parseInt(user.id) : 68, // Use current user ID or default to 68 (first doctor)
      }

      if (isEditing && triage?.triageId) {
        await triageApi.update(triage.triageId.toString(), payload)
        toast({
          title: "Triage updated",
          description: "Triage assessment has been updated successfully.",
        })
      } else {
        await triageApi.create(payload)
        toast({
          title: "Triage created",
          description:
            data.servicePoint === "telemedicine"
              ? "Patient scheduled on the telemedicine queue for the assigned doctor."
              : "Triage assessment has been created successfully.",
        })
      }

      // Check for critical values AFTER saving
      const vitals = buildVitalsFromData(data)
      if (vitals && data.patientId) {
        await checkAndNotifyCriticalVitals(
          vitals,
          data.patientId,
          patientName,
          addNotification
        )
      }

      // Clear draft after successful submission (for this patient only)
      clearDraftFromStorage(data.patientId)
      form.reset()
      onOpenChange(false)
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      const errorMessage = err.message || "Failed to save triage assessment"
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Triage Assessment" : "New Triage Assessment"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the patient's triage information."
              : "Enter the patient's triage information to assess their priority level."}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
            {error}
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="patientId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Patient</FormLabel>
                  <FormControl>
                    <PatientCombobox
                      value={field.value || ""}
                      onValueChange={(value) => {
                        field.onChange(value)
                      }}
                      placeholder="Search patient by name, ID, or number..."
                      disabled={isEditing}
                    />
                  </FormControl>
                  {isEditing && (
                    <p className="text-xs text-muted-foreground">Patient cannot be changed after triage</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-3">
              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Temp (°C)</FormLabel>
                    <FormControl>
                      <Input placeholder="37.0" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="systolicBP"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">BP systolic (mmHg)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" min={40} max={300} placeholder="120" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="diastolicBP"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">BP diastolic (mmHg)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" min={20} max={200} placeholder="80" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="heartRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Heart rate (bpm)</FormLabel>
                    <FormControl>
                      <Input placeholder="75" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="respiratoryRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Resp. rate (/min)</FormLabel>
                    <FormControl>
                      <Input placeholder="16" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="oxygenSaturation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">SpO₂ (%)</FormLabel>
                    <FormControl>
                      <Input placeholder="98" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="painLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Pain (0–10)</FormLabel>
                    <FormControl>
                      <Input placeholder="0" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Weight (kg)</FormLabel>
                    <FormControl>
                      <Input placeholder="70" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="height"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Height (cm)</FormLabel>
                    <FormControl>
                      <Input placeholder="170" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Leave BP fields empty if not measured. Choose where the patient goes after triage.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="servicePoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule for</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "consultation"}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select destination" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="consultation">In-person consultation</SelectItem>
                        <SelectItem value="telemedicine">Telemedicine consult</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select priority level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Emergency">Emergency</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                        <SelectItem value="Semi-urgent">Semi-urgent</SelectItem>
                        <SelectItem value="Non-urgent">Non-urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignedToDoctorId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Assigned doctor *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      disabled={loadingDoctors}
                    >
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={loadingDoctors ? "Loading doctors..." : "Select doctor"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.userId} value={doctor.userId.toString()}>
                            {doctor.firstName} {doctor.lastName} {doctor.department ? `(${doctor.department})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Saving..." : isEditing ? "Update Triage" : "Submit Triage"}
              </Button>
            </DialogFooter>
          </form>
        </Form>

        {/* Critical alerts are now shown in the floating component after form is saved */}
      </DialogContent>
    </Dialog>
  )
}
