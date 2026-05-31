"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Clock, Activity, Stethoscope, Pill, FlaskConical, Calendar, User, FileText, AlertCircle, AlertTriangle, Eye, Package, Scan, Pencil, Trash2, LogOut, ArrowRightLeft, Printer, Receipt, Download, Loader2, Video } from "lucide-react"
import { inpatientApi, laboratoryApi, userApi, doctorsApi, serviceChargeApi, billingApi, proceduresApi, pharmacyApi, radiologyApi, roleApi, telemedicineApi } from "@/lib/api"
import { format } from "date-fns"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import { useTelemedicineFloating } from "@/lib/telemedicine-floating-context"
import { ProcedureCombobox } from "@/components/procedure-combobox"
import { TestTypeCombobox } from "@/components/test-type-combobox"
import { ExamTypeCombobox } from "@/components/exam-type-combobox"
import { DischargeSummary } from "@/components/discharge-summary"
import { MedicationCombobox } from "@/components/medication-combobox"
import { PatientVitals } from "@/components/patient-vitals"
import { TelemedicineProviderSelect } from "@/components/telemedicine-provider-select"
import {
  TelemedicineOptionalMeetingLinkFields,
  telemedicineOptionalLinkBody,
} from "@/components/telemedicine-optional-meeting-link-fields"
import { isZoomProvider, type TelemedicineVideoProviderId } from "@/lib/telemedicine-providers"
import { telemedicineCreateToast } from "@/lib/telemedicine-create-result"
import { TelemedicineZoomDefaultsRequiredBanner } from "@/components/telemedicine-zoom-defaults-banner"
import { useTelemedicineZoomDefaults } from "@/lib/hooks/use-telemedicine-zoom-defaults"

interface InpatientManagementProps {
  admissionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after discharge or transfer so parent can refresh lists */
  onAdmissionUpdated?: () => void
}

export function InpatientManagement({ admissionId, open, onOpenChange, onAdmissionUpdated }: InpatientManagementProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { openSession: openTelemedicineFloating } = useTelemedicineFloating()
  const { loading: zoomDefaultsLoading, hasDefaults: hasZoomDefaults } = useTelemedicineZoomDefaults()
  const currentRoleName = String((user as any)?.role || (user as any)?.roleName || "").toLowerCase()
  const canApproveBillAdjustments =
    currentRoleName.includes("admin") ||
    currentRoleName.includes("finance") ||
    currentRoleName.includes("billing") ||
    currentRoleName.includes("account") ||
    currentRoleName.includes("cashier") ||
    currentRoleName.includes("manager")
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [doctors, setDoctors] = useState<any[]>([])
  const [nurses, setNurses] = useState<any[]>([])

  // Doctor Review states
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    reviewDate: new Date().toISOString().slice(0, 16),
    reviewingDoctorId: user?.userId?.toString() || "",
    reviewType: "morning_round",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    notes: "",
    nextReviewDate: "",
  })
  const [savingReview, setSavingReview] = useState(false)

  const [telemedicineModalOpen, setTelemedicineModalOpen] = useState(false)
  const [startingTelemedicine, setStartingTelemedicine] = useState(false)
  const [telemedicineVideoProvider, setTelemedicineVideoProvider] = useState<TelemedicineVideoProviderId>("zoom_manual")
  const [telemedicineMeetingUrl, setTelemedicineMeetingUrl] = useState("")
  const [telemedicineMeetingPasscode, setTelemedicineMeetingPasscode] = useState("")
  const selectedProviderNeedsZoomDefaults =
    isZoomProvider(telemedicineVideoProvider) && !telemedicineMeetingUrl.trim()
  const canStartNewTelemedicineVisit =
    !selectedProviderNeedsZoomDefaults || (!zoomDefaultsLoading && hasZoomDefaults)
  const telemedicineInFlightRef = useRef(false)

  // Clear stuck "Starting…" when the admission dialog closes (parent may unmount without intermediate open=false)
  useEffect(() => {
    if (!open) {
      telemedicineInFlightRef.current = false
      setStartingTelemedicine(false)
      setTelemedicineModalOpen(false)
    }
  }, [open])

  // Nursing Care states
  const [nursingDialogOpen, setNursingDialogOpen] = useState(false)
  const [nursingForm, setNursingForm] = useState({
    careDate: new Date().toISOString().slice(0, 16),
    nurseId: user?.userId?.toString() || "",
    careType: "observation",
    shift: "morning",
    vitalSignsRecorded: false,
    observations: "",
    interventions: "",
    patientResponse: "",
    concerns: "",
    notes: "",
  })
  const [savingNursing, setSavingNursing] = useState(false)

  // Vitals states
  const [vitalsDialogOpen, setVitalsDialogOpen] = useState(false)
  const [editingVital, setEditingVital] = useState<any>(null)
  const [vitalsForm, setVitalsForm] = useState({
    recordedDate: new Date().toISOString().slice(0, 16),
    systolicBP: "",
    diastolicBP: "",
    heartRate: "",
    respiratoryRate: "",
    temperature: "",
    oxygenSaturation: "",
    painScore: "",
    weight: "",
    height: "",
    notes: "",
  })
  const [savingVitals, setSavingVitals] = useState(false)
  const [vitalsSchedule, setVitalsSchedule] = useState<any>(null)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [inpatientVitalsView, setInpatientVitalsView] = useState<"table" | "charts">("table")

  // Lab order states
  const [labOrderDialogOpen, setLabOrderDialogOpen] = useState(false)
  const [testTypes, setTestTypes] = useState<any[]>([])
  const [labOrderForm, setLabOrderForm] = useState({
    testTypeId: "",
    priority: "routine",
    clinicalIndication: "",
  })
  const [savingLabOrder, setSavingLabOrder] = useState(false)

  // Procedures states
  const [procedureDialogOpen, setProcedureDialogOpen] = useState(false)
  const [procedures, setProcedures] = useState<any[]>([])
  const [procedureForm, setProcedureForm] = useState({
    procedureId: "",
    procedureDate: new Date().toISOString().split('T')[0],
    performedBy: user?.userId?.toString() || "",
    notes: "",
    complications: "",
  })
  const [savingProcedure, setSavingProcedure] = useState(false)

  // Radiology states
  const [radiologyOrderDialogOpen, setRadiologyOrderDialogOpen] = useState(false)
  const [examTypes, setExamTypes] = useState<any[]>([])
  const [radiologyOrderForm, setRadiologyOrderForm] = useState({
    examTypeId: "",
    bodyPart: "",
    clinicalIndication: "",
    priority: "routine",
    scheduledDate: "",
    notes: "",
  })
  const [savingRadiologyOrder, setSavingRadiologyOrder] = useState(false)

  // Medications/Prescriptions states
  const [prescriptionDialogOpen, setPrescriptionDialogOpen] = useState(false)
  const [medicationsInventory, setMedicationsInventory] = useState<Record<number, { totalQuantity: number; hasStock: boolean }>>({})
  const [prescriptionForm, setPrescriptionForm] = useState({
    medicationId: "",
    dosage: "",
    frequency: "",
    duration: "",
    quantity: "",
    instructions: "",
  })
  const [savingPrescription, setSavingPrescription] = useState(false)
  const [isQuantityManuallyEdited, setIsQuantityManuallyEdited] = useState(false)

  // Orders/Consumables states
  const [consumables, setConsumables] = useState<any[]>([])
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  const [orderForm, setOrderForm] = useState({
    chargeId: "",
    quantity: 1,
    notes: "",
  })
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)
  const [deleteOrderDialogOpen, setDeleteOrderDialogOpen] = useState(false)
  const [deletingOrder, setDeletingOrder] = useState(false)

  // Bill (comprehensive) state
  const [billData, setBillData] = useState<any>(null)
  const [billLoading, setBillLoading] = useState(false)
  const [billAdjustments, setBillAdjustments] = useState<any[]>([])
  const [billAdjustmentDialogOpen, setBillAdjustmentDialogOpen] = useState(false)
  const [selectedBillLine, setSelectedBillLine] = useState<any>(null)
  const [billAdjustmentForm, setBillAdjustmentForm] = useState({
    adjustmentType: "credit",
    deltaAmount: "",
    reason: "",
  })
  const [savingBillAdjustment, setSavingBillAdjustment] = useState(false)
  const [reviewingAdjustmentId, setReviewingAdjustmentId] = useState<string | null>(null)

  // View review dialog states
  const [viewReviewDialogOpen, setViewReviewDialogOpen] = useState(false)
  const [viewingReview, setViewingReview] = useState<any>(null)
  const [editingReview, setEditingReview] = useState<any>(null)

  // View nursing care dialog states
  const [viewNursingDialogOpen, setViewNursingDialogOpen] = useState(false)
  const [viewingNursing, setViewingNursing] = useState<any>(null)
  const [editingNursing, setEditingNursing] = useState<any>(null)

  // Delete vital dialog states
  const [deleteVitalDialogOpen, setDeleteVitalDialogOpen] = useState(false)
  const [vitalToDelete, setVitalToDelete] = useState<any>(null)
  const [deletingVital, setDeletingVital] = useState(false)

  // Edit states for other items
  const [editingProcedure, setEditingProcedure] = useState<any>(null)
  const [editingRadiologyOrder, setEditingRadiologyOrder] = useState<any>(null)
  const [editingLabOrder, setEditingLabOrder] = useState<any>(null)
  const [editingPrescription, setEditingPrescription] = useState<any>(null)

  // View states for other items
  const [viewingProcedure, setViewingProcedure] = useState<any>(null)
  const [viewProcedureDialogOpen, setViewProcedureDialogOpen] = useState(false)
  const [viewingRadiologyOrder, setViewingRadiologyOrder] = useState<any>(null)
  const [viewRadiologyOrderDialogOpen, setViewRadiologyOrderDialogOpen] = useState(false)
  const [viewingLabOrder, setViewingLabOrder] = useState<any>(null)
  const [viewLabOrderDialogOpen, setViewLabOrderDialogOpen] = useState(false)
  const [viewingPrescription, setViewingPrescription] = useState<any>(null)
  const [viewPrescriptionDialogOpen, setViewPrescriptionDialogOpen] = useState(false)

  // Discharge dialog
  const [dischargeDialogOpen, setDischargeDialogOpen] = useState(false)
  const [dischargeDate, setDischargeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dischargeNotes, setDischargeNotes] = useState("")
  const [savingDischarge, setSavingDischarge] = useState(false)

  // Transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferWardId, setTransferWardId] = useState<string>("")
  const [transferBedId, setTransferBedId] = useState<string>("")
  const [transferReason, setTransferReason] = useState("")
  const [transferWards, setTransferWards] = useState<any[]>([])
  const [transferBeds, setTransferBeds] = useState<any[]>([])
  const [savingTransfer, setSavingTransfer] = useState(false)

  const [dischargeSummaryOpen, setDischargeSummaryOpen] = useState(false)

  useEffect(() => {
    if (open && admissionId) {
      loadOverview()
      loadDoctorsAndNurses()
    }
  }, [open, admissionId])

  const loadDoctorsAndNurses = async () => {
    try {
      // Load doctors
      const doctorsList = await doctorsApi.getAll()
      setDoctors(doctorsList || [])

      // Load nurses - first get all roles to find nurse role(s), then get users by role
      try {
        const allRoles = await roleApi.getAll()
        const nurseRoles = (allRoles || []).filter((role: any) => {
          const roleName = (role.roleName || '').toLowerCase().trim()
          return roleName === 'nurse' ||
                 roleName === 'nursing' ||
                 roleName === 'registered nurse' ||
                 roleName === 'enrolled nurse' ||
                 (roleName.includes('nurse') && !roleName.includes('doctor'))
        })

        if (nurseRoles.length > 0) {
          // Get users for each nurse role
          const allNurses: any[] = []
          for (const nurseRole of nurseRoles) {
            try {
              const roleUsers = await roleApi.getUsersByRole(nurseRole.roleId.toString())
              if (roleUsers?.users) {
                allNurses.push(...roleUsers.users)
              }
            } catch (err) {
              console.error(`Error loading users for role ${nurseRole.roleName}:`, err)
            }
          }
          setNurses(allNurses)
          console.log(`Loaded ${allNurses.length} nurse(s) from ${nurseRoles.length} role(s)`)
        } else {
          // Fallback: filter all users by role name if no nurse role found
          console.warn("No nurse role found in roles table, falling back to user filtering")
          const allUsers = await userApi.getAll()
          const nursesList = allUsers.filter((u: any) => {
            const roleName = (u.role || u.roleName || '').toLowerCase().trim()
            return roleName === 'nurse' ||
                   roleName === 'nursing' ||
                   roleName === 'registered nurse' ||
                   roleName === 'enrolled nurse' ||
                   (roleName.includes('nurse') && !roleName.includes('doctor'))
          })
          setNurses(nursesList || [])

          if (nursesList.length === 0) {
            console.warn("No nurses found. Available roles:",
              Array.from(new Set(allUsers.map((u: any) => u.role || u.roleName).filter(Boolean))))
          }
        }
      } catch (roleError) {
        console.error("Error loading roles for nurses:", roleError)
        // Fallback to direct user filtering
        const allUsers = await userApi.getAll()
        const nursesList = allUsers.filter((u: any) => {
          const roleName = (u.role || u.roleName || '').toLowerCase().trim()
          return roleName === 'nurse' ||
                 roleName === 'nursing' ||
                 (roleName.includes('nurse') && !roleName.includes('doctor'))
        })
        setNurses(nursesList || [])
      }
    } catch (error) {
      console.error("Error loading doctors and nurses:", error)
      toast({
        title: "Error",
        description: "Failed to load doctors and nurses. Please try again.",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    if (orderDialogOpen) {
      loadConsumables()
    }
  }, [orderDialogOpen, editingOrder])

  const loadBill = async () => {
    if (!admissionId) return
    try {
      setBillLoading(true)
      const data = await inpatientApi.getAdmissionBill(admissionId)
      setBillData(data)
      // Adjustments are optional; don't block core bill loading on this call.
      try {
        const adjustments = await inpatientApi.getAdmissionBillAdjustments(admissionId)
        setBillAdjustments(adjustments || [])
      } catch (adjErr) {
        console.warn("Bill adjustments endpoint unavailable; continuing without adjustments list.", adjErr)
        setBillAdjustments([])
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to load bill", variant: "destructive" })
      setBillData(null)
      setBillAdjustments([])
    } finally {
      setBillLoading(false)
    }
  }

  const getProcedureStatus = (procedure: any) => {
    const raw = String(procedure?.status || "").toLowerCase()
    if (raw === "completed" || raw === "performed") return "Completed"
    if (raw === "cancelled") return "Cancelled"
    if (raw === "pending" || raw === "scheduled" || raw === "in_progress") return raw.replace("_", " ")
    return procedure?.procedureDate ? "Completed" : "Pending"
  }

  const getProcedureStatusVariant = (procedure: any): "default" | "outline" | "secondary" | "destructive" => {
    const s = getProcedureStatus(procedure).toLowerCase()
    if (s === "completed") return "default"
    if (s === "cancelled") return "destructive"
    if (s === "pending" || s === "scheduled" || s === "in progress") return "outline"
    return "secondary"
  }

  const handleOpenBillAdjustmentDialog = (line: any) => {
    setSelectedBillLine(line)
    setBillAdjustmentForm({
      adjustmentType: "credit",
      deltaAmount: "",
      reason: "",
    })
    setBillAdjustmentDialogOpen(true)
  }

  const handleCreateBillAdjustment = async () => {
    if (!admissionId || !selectedBillLine?.lineRef) return
    const deltaRaw = parseFloat(billAdjustmentForm.deltaAmount || "0")
    if (!Number.isFinite(deltaRaw) || deltaRaw === 0) {
      toast({ title: "Invalid amount", description: "Enter a non-zero adjustment amount.", variant: "destructive" })
      return
    }
    if (!billAdjustmentForm.reason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for this adjustment.", variant: "destructive" })
      return
    }
    // Credit/discount should reduce bill, debit should increase
    const sign = billAdjustmentForm.adjustmentType === "debit" ? 1 : -1
    const deltaAmount = Math.round(Math.abs(deltaRaw) * 100) / 100 * sign

    try {
      setSavingBillAdjustment(true)
      await inpatientApi.createAdmissionBillAdjustment(admissionId, {
        lineRef: selectedBillLine.lineRef,
        adjustmentType: billAdjustmentForm.adjustmentType,
        deltaAmount,
        reason: billAdjustmentForm.reason.trim(),
      })
      toast({ title: "Adjustment requested", description: "Line-item adjustment has been submitted for approval." })
      setBillAdjustmentDialogOpen(false)
      setSelectedBillLine(null)
      await loadBill()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to request adjustment", variant: "destructive" })
    } finally {
      setSavingBillAdjustment(false)
    }
  }

  const handleReviewBillAdjustment = async (adjustmentId: string, status: "approved" | "rejected") => {
    if (!admissionId) return
    try {
      setReviewingAdjustmentId(adjustmentId)
      await inpatientApi.updateAdmissionBillAdjustment(admissionId, adjustmentId, { status })
      toast({ title: `Adjustment ${status}`, description: `The bill adjustment was ${status}.` })
      await loadBill()
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to update adjustment", variant: "destructive" })
    } finally {
      setReviewingAdjustmentId(null)
    }
  }

  useEffect(() => {
    if (activeTab === "bill" && admissionId) {
      loadBill()
    }
  }, [activeTab, admissionId])

  useEffect(() => {
    if (radiologyOrderDialogOpen) {
      loadExamTypes()
    }
  }, [radiologyOrderDialogOpen])

  const loadExamTypes = async () => {
    try {
      const examTypesList = await radiologyApi.getExamTypes(undefined, undefined, 1, 1000)
      setExamTypes(examTypesList || [])
    } catch (error) {
      console.error("Error loading exam types:", error)
    }
  }

  const loadConsumables = async () => {
    try {
      const consumablesList = await serviceChargeApi.getAll(undefined, undefined, undefined, undefined, 'Consumable')
      setConsumables(consumablesList || [])
    } catch (error) {
      console.error("Error loading consumables:", error)
    }
  }

  const loadProcedures = async () => {
    try {
      const proceduresList = await proceduresApi.getAll(undefined, undefined, true)
      console.log("Loaded procedures:", proceduresList?.length || 0, proceduresList)
      // Filter out radiology from procedures
      const filteredProcedures = (proceduresList || []).filter((proc: any) => {
        const category = (proc.category || '').toLowerCase()
        const name = (proc.procedureName || '').toLowerCase()
        return !category.includes('radiology') &&
               !name.includes('x-ray') &&
               !name.includes('xray') &&
               !name.includes('ct scan') &&
               !name.includes('mri') &&
               !name.includes('ultrasound') &&
               !name.includes('radiology')
      })
      setProcedures(filteredProcedures)
    } catch (error) {
      console.error("Error loading procedures:", error)
      toast({
        title: "Error",
        description: "Failed to load procedures. Please try again.",
        variant: "destructive",
      })
    }
  }

  /** Inventory totals for prescription form badges (combobox loads catalog + stock in dropdown like encounter form). */
  const refreshPrescriptionInventory = async () => {
    await loadMedicationInventory()
  }

  const loadMedicationInventory = async () => {
    try {
      const inventoryItems = await pharmacyApi.getDrugInventory()
      const inventoryMap: Record<number, { totalQuantity: number; hasStock: boolean }> = {}
      ;(inventoryItems || []).forEach((item: any) => {
        const medicationId = Number(item.medicationId)
        if (!Number.isFinite(medicationId) || medicationId <= 0) return
        const quantity = Number(item.quantity || 0)
        if (!inventoryMap[medicationId]) {
          inventoryMap[medicationId] = { totalQuantity: 0, hasStock: false }
        }
        inventoryMap[medicationId].totalQuantity += quantity
        if (quantity > 0) {
          inventoryMap[medicationId].hasStock = true
        }
      })
      setMedicationsInventory(inventoryMap)
    } catch (error) {
      console.error("Error loading medication inventory:", error)
      setMedicationsInventory({})
    }
  }

  const getMedicationInventoryStatus = (medicationId?: number | string | null) => {
    const parsedMedicationId = Number(medicationId)
    if (!Number.isFinite(parsedMedicationId) || parsedMedicationId <= 0) {
      return { hasStock: false, quantity: 0 }
    }
    const inventory = medicationsInventory[parsedMedicationId]
    if (!inventory) {
      return { hasStock: false, quantity: 0 }
    }
    return {
      hasStock: inventory.hasStock && inventory.totalQuantity > 0,
      quantity: Math.max(0, Number(inventory.totalQuantity || 0)),
    }
  }

  const loadOverview = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true)
      }
      const data = await inpatientApi.getAdmissionOverview(admissionId)
      setOverview(data)

      // Load vitals schedule
      if (data.vitalsSchedule) {
        setVitalsSchedule(data.vitalsSchedule)
      } else {
        // Create default schedule if none exists
        await createDefaultVitalsSchedule()
      }
    } catch (error: any) {
      console.error("Error loading overview:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load admission overview",
        variant: "destructive",
      })
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  const createDefaultVitalsSchedule = async () => {
    try {
      const schedule = await inpatientApi.createVitalsSchedule(admissionId, {
        scheduleDate: new Date().toISOString().split('T')[0],
        scheduledTime1: "06:00:00",
        scheduledTime2: "12:00:00",
        scheduledTime3: "18:00:00",
        scheduledTime4: "00:00:00",
        frequency: "4x",
      })
      setVitalsSchedule(schedule)
    } catch (error) {
      console.error("Error creating vitals schedule:", error)
    }
  }

  const handleDischarge = async () => {
    try {
      setSavingDischarge(true)
      await inpatientApi.updateAdmission(admissionId, {
        status: "discharged",
        dischargeDate: dischargeDate || new Date().toISOString().slice(0, 10),
        notes: dischargeNotes || undefined,
      })
      toast({ title: "Success", description: "Patient discharged successfully." })
      setDischargeDialogOpen(false)
      setDischargeDate(new Date().toISOString().slice(0, 10))
      setDischargeNotes("")
      onAdmissionUpdated?.()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to discharge",
        variant: "destructive",
      })
    } finally {
      setSavingDischarge(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferBedId) {
      toast({ title: "Select a bed", description: "Please select destination ward and bed.", variant: "destructive" })
      return
    }
    try {
      setSavingTransfer(true)
      await inpatientApi.updateAdmission(admissionId, {
        bedId: parseInt(transferBedId, 10),
        transferReason: transferReason || undefined,
      })
      toast({ title: "Success", description: "Patient transferred successfully." })
      setTransferDialogOpen(false)
      setTransferWardId("")
      setTransferBedId("")
      setTransferReason("")
      setTransferBeds([])
      onAdmissionUpdated?.()
      await loadOverview(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to transfer",
        variant: "destructive",
      })
    } finally {
      setSavingTransfer(false)
    }
  }

  const openTransferDialog = async () => {
    setTransferDialogOpen(true)
    setTransferWardId("")
    setTransferBedId("")
    setTransferReason("")
    setTransferBeds([])
    try {
      const wardsList = await inpatientApi.getWards(undefined, 1, 100)
      setTransferWards(Array.isArray(wardsList) ? wardsList : [])
    } catch {
      setTransferWards([])
    }
  }

  const loadTransferBeds = async (wardId: string) => {
    if (!wardId) {
      setTransferBeds([])
      return
    }
    try {
      const bedsList = await inpatientApi.getBeds(wardId, "available", 1, 200)
      const list = Array.isArray(bedsList) ? bedsList : []
      setTransferBeds(list.filter((b: any) => b.status === "available"))
    } catch {
      setTransferBeds([])
    }
  }

  const handleSaveReview = async () => {
    // Validate required fields
    if (!reviewForm.reviewingDoctorId || reviewForm.reviewingDoctorId === "") {
      toast({
        title: "Error",
        description: "Reviewing doctor is required",
        variant: "destructive",
      })
      return
    }

    try {
      setSavingReview(true)
      const reviewData = {
        ...reviewForm,
        reviewingDoctorId: parseInt(reviewForm.reviewingDoctorId),
      }

      if (editingReview) {
        // Update existing review
        await inpatientApi.updateDoctorReview(editingReview.reviewId.toString(), reviewData)
        toast({
          title: "Success",
          description: "Doctor review updated successfully",
        })
      } else {
        // Create new review
      }
      toast({
        title: "Success",
        description: "Doctor review saved successfully",
      })
      setReviewDialogOpen(false)
      setEditingReview(null)
      setReviewForm({
        reviewDate: new Date().toISOString().slice(0, 16),
        reviewingDoctorId: user?.userId?.toString() || "",
        reviewType: "morning_round",
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
        notes: "",
        nextReviewDate: "",
      })
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save doctor review",
        variant: "destructive",
      })
    } finally {
      setSavingReview(false)
    }
  }

  /** Create telemedicine session (Zoom link mode) and open session page */
  const handleStartTelemedicine = async () => {
    if (!canStartNewTelemedicineVisit) {
      toast({
        title: "Meeting link required",
        description: "Save Telemedicine → My Zoom defaults, paste a Zoom link, or choose Google Meet and paste a Meet link.",
        variant: "destructive",
      })
      return
    }
    if (telemedicineInFlightRef.current) return
    telemedicineInFlightRef.current = true
    setStartingTelemedicine(true)
    try {
      if (!overview?.admission?.patientId) {
        toast({
          title: "Missing patient",
          description: "Patient ID is not available for this admission.",
          variant: "destructive",
        })
        return
      }
      if (!admissionId) {
        toast({ title: "Missing admission", description: "Admission ID is not available.", variant: "destructive" })
        return
      }
      const actorDoctorId = (user as any)?.userId ?? (user as any)?.id
      if (!actorDoctorId) {
        toast({ title: "Missing doctor", description: "Doctor user is not available.", variant: "destructive" })
        return
      }

      const created = await telemedicineApi.createSession({
        originType: "inpatient",
        admissionId: Number(admissionId),
        patientId: Number(overview.admission.patientId),
        doctorId: Number(actorDoctorId),
        videoProvider: telemedicineVideoProvider,
        notes: `Inpatient remote review (Admission: ${overview.admission.admissionNumber || admissionId})`,
        ...telemedicineOptionalLinkBody(telemedicineMeetingUrl, telemedicineMeetingPasscode),
      })

      if (!created?.sessionId) {
        toast({ title: "Telemedicine", description: "Session created but no sessionId returned.", variant: "destructive" })
        return
      }

      openTelemedicineFloating(created.sessionId, {
        patientId: overview.admission.patientId,
        patientDisplayName: `${overview.admission.firstName || ""} ${overview.admission.lastName || ""}`.trim() || undefined,
      })
      // Close admission dialog — if we don't, the full-screen modal stays above the floating panel
      onOpenChange(false)
      toast(
        telemedicineCreateToast(created, {
          title: "Telemedicine session ready",
          description: "Use the floating panel — minimize it to browse charts or notes.",
        }),
      )
    } catch (err: any) {
      console.error("Telemedicine create failed:", err)
      toast({
        title: "Telemedicine failed",
        description: err?.message || "Could not create telemedicine session",
        variant: "destructive",
      })
    } finally {
      telemedicineInFlightRef.current = false
      setStartingTelemedicine(false)
    }
  }

  const handleSaveNursing = async () => {
    // Validate required fields
    if (!nursingForm.nurseId || nursingForm.nurseId === "") {
      toast({
        title: "Error",
        description: "Nurse is required",
        variant: "destructive",
      })
      setSavingNursing(false)
      return
    }

    try {
      setSavingNursing(true)
      const nursingData = {
        ...nursingForm,
        nurseId: parseInt(nursingForm.nurseId),
      }

      if (editingNursing) {
        // Update existing nursing care note
        await inpatientApi.updateNursingCare(editingNursing.careId.toString(), nursingData)
        toast({
          title: "Success",
          description: "Nursing care note updated successfully",
        })
      } else {
        // Create new nursing care note
      }
      toast({
        title: "Success",
        description: "Nursing care note saved successfully",
      })
      setNursingDialogOpen(false)
      setEditingNursing(null)
      setNursingForm({
        careDate: new Date().toISOString().slice(0, 16),
        nurseId: user?.userId?.toString() || "",
        careType: "observation",
        shift: "morning",
        vitalSignsRecorded: false,
        observations: "",
        interventions: "",
        patientResponse: "",
        concerns: "",
        notes: "",
      })
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save nursing care note",
        variant: "destructive",
      })
    } finally {
      setSavingNursing(false)
    }
  }

  const handleSaveVitals = async () => {
    try {
      setSavingVitals(true)

      if (editingVital) {
        // Update existing vital
        await inpatientApi.updateVitals(editingVital.vitalSignId.toString(), {
          ...vitalsForm,
        })
        toast({
          title: "Success",
          description: "Vital signs updated successfully",
        })
      } else {
        // Create new vital
        await inpatientApi.recordVitals(admissionId, {
          ...vitalsForm,
          recordedBy: user?.id || user?.userId,
        })
        toast({
          title: "Success",
          description: "Vital signs recorded successfully",
        })
      }

      setVitalsDialogOpen(false)
      setEditingVital(null)
      setVitalsForm({
        recordedDate: new Date().toISOString().slice(0, 16),
        systolicBP: "",
        diastolicBP: "",
        heartRate: "",
        respiratoryRate: "",
        temperature: "",
        oxygenSaturation: "",
        painScore: "",
        notes: "",
      })
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingVital ? "Failed to update vital signs" : "Failed to record vital signs"),
        variant: "destructive",
      })
    } finally {
      setSavingVitals(false)
    }
  }

  const handleEditVital = (vital: any) => {
    // Format datetime-local string from recordedDate
    const date = new Date(vital.recordedDate)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`

    setEditingVital(vital)
    setVitalsForm({
      recordedDate: datetimeLocal,
      systolicBP: vital.systolicBP?.toString() || "",
      diastolicBP: vital.diastolicBP?.toString() || "",
      heartRate: vital.heartRate?.toString() || "",
      respiratoryRate: vital.respiratoryRate?.toString() || "",
      temperature: vital.temperature?.toString() || "",
      oxygenSaturation: vital.oxygenSaturation?.toString() || "",
      painScore: vital.painScore?.toString() || "",
      weight: vital.weight?.toString() || "",
      height: vital.height?.toString() || "",
      notes: vital.notes || "",
    })
    setVitalsDialogOpen(true)
  }

  const handleDeleteVital = (vital: any) => {
    setVitalToDelete(vital)
    setDeleteVitalDialogOpen(true)
  }

  const confirmDeleteVital = async () => {
    if (!vitalToDelete) return

    try {
      setDeletingVital(true)
      await inpatientApi.deleteVitals(vitalToDelete.vitalSignId.toString())
      toast({
        title: "Success",
        description: "Vital sign record deleted successfully",
      })
      setDeleteVitalDialogOpen(false)
      setVitalToDelete(null)
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vital sign",
        variant: "destructive",
      })
    } finally {
      setDeletingVital(false)
    }
  }

  const handleSaveLabOrder = async () => {
    if (!labOrderForm.testTypeId || labOrderForm.testTypeId.trim() === "") {
      toast({
        title: "Error",
        description: "Please select a test type",
        variant: "destructive",
      })
      return
    }

    try {
      setSavingLabOrder(true)
      // Get patient ID from overview
      const patientId = overview?.admission?.patientId
      if (!patientId) {
        throw new Error("Patient ID not found")
      }

      const userId = user?.id || user?.userId
      if (!userId) {
        throw new Error("User not authenticated. Please log in again.")
      }

      if (editingLabOrder) {
        // Update existing order
        await laboratoryApi.updateOrder(editingLabOrder.orderId.toString(), {
          priority: labOrderForm.priority,
          clinicalIndication: labOrderForm.clinicalIndication || null,
        })
        toast({
          title: "Success",
          description: "Lab order updated successfully",
        })
      } else {
        // Create new order
        const labOrderData = {
          patientId: parseInt(patientId.toString()),
          admissionId: admissionId,
          orderedBy: parseInt(userId.toString()),
          orderDate: new Date().toISOString().split('T')[0],
          priority: labOrderForm.priority,
          clinicalIndication: labOrderForm.clinicalIndication || null,
          items: [{
            testTypeId: parseInt(labOrderForm.testTypeId),
            notes: labOrderForm.clinicalIndication || null,
          }],
        }

        console.log("Saving lab order:", labOrderData)
        const result = await laboratoryApi.createOrder(labOrderData)
        console.log("Lab order saved:", result)
        toast({
          title: "Success",
          description: "Lab order created successfully",
        })
        setActiveTab("labs")
      }

      setLabOrderDialogOpen(false)
      setEditingLabOrder(null)
      setLabOrderForm({
        testTypeId: "",
        priority: "routine",
        clinicalIndication: "",
      })
      await loadOverview(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingLabOrder ? "Failed to update lab order" : "Failed to create lab order"),
        variant: "destructive",
      })
    } finally {
      setSavingLabOrder(false)
    }
  }

  useEffect(() => {
    if (labOrderDialogOpen) {
      loadTestTypes()
    }
  }, [labOrderDialogOpen])

  useEffect(() => {
    if (procedureDialogOpen) {
      loadProcedures()
    }
  }, [procedureDialogOpen, editingProcedure])

  useEffect(() => {
    if (radiologyOrderDialogOpen && editingRadiologyOrder) {
      loadExamTypes()
    }
  }, [radiologyOrderDialogOpen, editingRadiologyOrder])

  useEffect(() => {
    if (labOrderDialogOpen && editingLabOrder) {
      loadTestTypes()
    }
  }, [labOrderDialogOpen, editingLabOrder])

  useEffect(() => {
    if (prescriptionDialogOpen) {
      refreshPrescriptionInventory()
    }
  }, [prescriptionDialogOpen])

  // Auto-calculate prescription quantity based on frequency and duration
  // Formula: Quantity = Frequency (per day) * Duration (days)
  useEffect(() => {
    if (!isQuantityManuallyEdited) {
      // Parse frequency - more flexible parsing
      let frequencyPerDay = 0
      const frequencyText = prescriptionForm.frequency?.trim().toLowerCase() || ""

      if (frequencyText) {
        // Try to extract number from patterns like "2x daily", "3 times daily", "twice daily", etc.
        const numericMatch = frequencyText.match(/(\d+)\s*(?:x|times?|×)\s*(?:daily|day|per day|d)/i)
        if (numericMatch) {
          frequencyPerDay = parseInt(numericMatch[1]) || 0
        } else {
          // Try word-based patterns
          if (frequencyText.includes('once') || frequencyText.includes('one') || frequencyText === 'od' || frequencyText === 'qd') {
            frequencyPerDay = 1
          } else if (frequencyText.includes('twice') || frequencyText.includes('two') || frequencyText === 'bid' || frequencyText === 'bd') {
            frequencyPerDay = 2
          } else if (frequencyText.includes('thrice') || frequencyText.includes('three') || frequencyText === 'tid' || frequencyText === 'tds') {
            frequencyPerDay = 3
          } else if (frequencyText === 'qid' || frequencyText === 'qds') {
            frequencyPerDay = 4
          } else if (frequencyText === 'q6h' || frequencyText === 'q6') {
            frequencyPerDay = 4 // Every 6 hours = 4 times per day
          } else if (frequencyText === 'q8h' || frequencyText === 'q8') {
            frequencyPerDay = 3 // Every 8 hours = 3 times per day
          } else if (frequencyText === 'q12h' || frequencyText === 'q12') {
            frequencyPerDay = 2 // Every 12 hours = 2 times per day
          } else {
            // Try to extract any number from the text
            const anyNumberMatch = frequencyText.match(/(\d+)/)
            if (anyNumberMatch) {
              frequencyPerDay = parseInt(anyNumberMatch[1]) || 0
            }
          }
        }
      }

      // Parse duration - more flexible parsing
      let durationDays = 0
      const durationText = prescriptionForm.duration?.trim().toLowerCase() || ""

      if (durationText) {
        // Try to extract number and unit
        const daysMatch = durationText.match(/(\d+)\s*(?:days?|d)/i)
        const weeksMatch = durationText.match(/(\d+)\s*(?:weeks?|w|wk)/i)
        const monthsMatch = durationText.match(/(\d+)\s*(?:months?|m|mo)/i)

        if (daysMatch) {
          durationDays = parseInt(daysMatch[1]) || 0
        } else if (weeksMatch) {
          durationDays = (parseInt(weeksMatch[1]) || 0) * 7
        } else if (monthsMatch) {
          durationDays = (parseInt(monthsMatch[1]) || 0) * 30
        } else {
          // Try to extract any number (assume days if no unit specified)
          const anyNumberMatch = durationText.match(/(\d+)/)
          if (anyNumberMatch) {
            durationDays = parseInt(anyNumberMatch[1]) || 0
          }
        }
      }

      // Calculate quantity: Frequency * Duration
      if (frequencyPerDay > 0 && durationDays > 0) {
        const calculatedQuantity = frequencyPerDay * durationDays
        setPrescriptionForm((prev) => ({ ...prev, quantity: calculatedQuantity.toString() }))
      } else if (prescriptionForm.frequency || prescriptionForm.duration) {
        // Clear quantity if fields are partially filled but calculation can't be done
        setPrescriptionForm((prev) => ({ ...prev, quantity: "" }))
      }
    }
  }, [prescriptionForm.frequency, prescriptionForm.duration, isQuantityManuallyEdited])

  const loadTestTypes = async () => {
    try {
      const types = await laboratoryApi.getTestTypes()
      console.log("Loaded test types:", types?.length || 0, types)
      setTestTypes(types || [])
    } catch (error) {
      console.error("Error loading test types:", error)
      toast({
        title: "Error",
        description: "Failed to load test types. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSaveOrder = async () => {
    if (!orderForm.chargeId) {
      toast({
        title: "Error",
        description: "Please select a consumable",
        variant: "destructive",
      })
      return
    }

    if (!orderForm.quantity || orderForm.quantity < 1) {
      toast({
        title: "Error",
        description: "Quantity must be at least 1",
        variant: "destructive",
      })
      return
    }

    try {
      setSavingOrder(true)
      const patientId = overview?.admission?.patientId
      if (!patientId) {
        throw new Error("Patient ID not found")
      }

      // Find the selected consumable
      const consumable = consumables.find((c: any) => c.chargeId?.toString() === orderForm.chargeId)
      if (!consumable) {
        throw new Error("Selected consumable not found")
      }

      const unitPrice = consumable.cost ? parseFloat(consumable.cost) : 0
      const quantity = orderForm.quantity || 1
      const totalPrice = unitPrice * quantity

      if (editingOrder) {
        // Update existing invoice
        const invoiceData = {
          items: [{
            itemId: editingOrder.items?.[0]?.itemId || null,
            description: consumable.name || 'Consumable',
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: totalPrice,
            chargeId: consumable.chargeId,
          }],
          notes: `Consumables ordered during inpatient stay. ${orderForm.notes || ''}`.trim(),
        }

        await billingApi.updateInvoice(editingOrder.invoiceId.toString(), invoiceData)

        toast({
          title: "Success",
          description: "Order updated successfully",
        })
      } else {
        // Create invoice for the order
        const invoiceData = {
          patientId: patientId,
          admissionId: admissionId,
          invoiceDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'pending',
          items: [{
            description: consumable.name || 'Consumable',
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: totalPrice,
            chargeId: consumable.chargeId,
          }],
          notes: `Consumables ordered during inpatient stay. ${orderForm.notes || ''}`.trim(),
        }

        await billingApi.createInvoice(invoiceData)

        toast({
          title: "Success",
          description: "Order created successfully",
        })
      }
      setOrderDialogOpen(false)
      setEditingOrder(null)
      setOrderForm({
        chargeId: "",
        quantity: 1,
        notes: "",
      })
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingOrder ? "Failed to update order" : "Failed to create order"),
        variant: "destructive",
      })
    } finally {
      setSavingOrder(false)
    }
  }

  const handleEditOrder = async (invoice: any, item: any) => {
    try {
      // Load consumables if not already loaded
      if (consumables.length === 0) {
        await loadConsumables()
      }
      setEditingOrder({ ...invoice, items: [item] })
      setOrderForm({
        chargeId: item.chargeId?.toString() || "",
        quantity: item.quantity || 1,
        notes: invoice.notes?.replace('Consumables ordered during inpatient stay.', '').trim() || "",
      })
      setOrderDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load order details",
        variant: "destructive",
      })
    }
  }

  const handleDeleteOrder = (invoice: any) => {
    setOrderToDelete(invoice)
    setDeleteOrderDialogOpen(true)
  }

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return

    try {
      setDeletingOrder(true)
      await billingApi.deleteInvoice(orderToDelete.invoiceId.toString())
      toast({
        title: "Success",
        description: "Order deleted successfully",
      })
      setDeleteOrderDialogOpen(false)
      setOrderToDelete(null)
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete order",
        variant: "destructive",
      })
    } finally {
      setDeletingOrder(false)
    }
  }

  const handleSaveProcedure = async () => {
    if (!procedureForm.procedureId) {
      toast({
        title: "Error",
        description: "Please select a procedure",
        variant: "destructive",
      })
      return
    }

    try {
      setSavingProcedure(true)
      const patientId = overview?.admission?.patientId
      if (!patientId) {
        throw new Error("Patient ID not found")
      }

      if (editingProcedure) {
        // Update existing procedure
        await proceduresApi.updatePatientProcedure(editingProcedure.patientProcedureId.toString(), {
          procedureId: parseInt(procedureForm.procedureId),
          procedureDate: procedureForm.procedureDate,
          performedBy: parseInt(procedureForm.performedBy),
          notes: procedureForm.notes || null,
          complications: procedureForm.complications || null,
        })
        toast({
          title: "Success",
          description: "Procedure updated successfully",
        })
      } else {
        // Create new procedure
        await proceduresApi.createPatientProcedure({
          patientId: patientId.toString(),
          procedureId: parseInt(procedureForm.procedureId),
          procedureDate: procedureForm.procedureDate,
          performedBy: parseInt(procedureForm.performedBy),
          notes: procedureForm.notes || null,
          complications: procedureForm.complications || null,
          admissionId: admissionId,
        })

        toast({
          title: "Success",
          description: "Procedure created successfully",
        })
      }
      setProcedureDialogOpen(false)
      setEditingProcedure(null)
      setProcedureForm({
        procedureId: "",
        procedureDate: new Date().toISOString().split('T')[0],
        performedBy: user?.userId?.toString() || "",
        notes: "",
        complications: "",
      })
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingProcedure ? "Failed to update procedure" : "Failed to create procedure"),
        variant: "destructive",
      })
    } finally {
      setSavingProcedure(false)
    }
  }

  const handleSaveRadiologyOrder = async () => {
    if (!radiologyOrderForm.examTypeId || radiologyOrderForm.examTypeId.trim() === "") {
      toast({
        title: "Error",
        description: "Please select an examination type",
        variant: "destructive",
      })
      return
    }

    try {
      setSavingRadiologyOrder(true)

      const patientId = overview?.admission?.patientId
      if (!patientId) {
        toast({
          title: "Error",
          description: "Patient ID not found. Please refresh the page and try again.",
          variant: "destructive",
        })
        setSavingRadiologyOrder(false)
        return
      }

      const userId = user?.id || user?.userId
      if (!userId) {
        toast({
          title: "Error",
          description: "User not authenticated. Please log in again.",
          variant: "destructive",
        })
        setSavingRadiologyOrder(false)
        return
      }

      if (!admissionId) {
        toast({
          title: "Error",
          description: "Admission ID not found. Please refresh the page and try again.",
          variant: "destructive",
        })
        setSavingRadiologyOrder(false)
        return
      }

      // Format scheduledDate if provided (datetime-local to ISO string)
      let formattedScheduledDate = null
      if (radiologyOrderForm.scheduledDate && radiologyOrderForm.scheduledDate.trim() !== "") {
        // datetime-local format is "YYYY-MM-DDTHH:mm", convert to ISO string
        formattedScheduledDate = new Date(radiologyOrderForm.scheduledDate).toISOString()
      }

      if (editingRadiologyOrder) {
        // Update existing order
        await radiologyApi.updateOrder(editingRadiologyOrder.orderId.toString(), {
          examTypeId: parseInt(radiologyOrderForm.examTypeId),
          bodyPart: radiologyOrderForm.bodyPart || null,
          clinicalIndication: radiologyOrderForm.clinicalIndication || null,
          priority: radiologyOrderForm.priority || 'routine',
          scheduledDate: formattedScheduledDate,
          notes: radiologyOrderForm.notes || null,
        })
        toast({
          title: "Success",
          description: "Radiology order updated successfully",
        })
      } else {
        // Create new order
        const orderData = {
          patientId: parseInt(patientId.toString()),
          orderedBy: parseInt(userId.toString()),
          examTypeId: parseInt(radiologyOrderForm.examTypeId),
          orderDate: new Date().toISOString().split('T')[0],
          bodyPart: radiologyOrderForm.bodyPart || null,
          clinicalIndication: radiologyOrderForm.clinicalIndication || null,
          priority: radiologyOrderForm.priority || 'routine',
          status: 'pending',
          scheduledDate: formattedScheduledDate,
          notes: radiologyOrderForm.notes || null,
          admissionId: admissionId,
        }

        await radiologyApi.createOrder(orderData)
        toast({
          title: "Success",
          description: "Radiology order created successfully",
        })
        // Switch to Radiology tab to show the new order
        setActiveTab("radiology")
      }

      setRadiologyOrderDialogOpen(false)
      setEditingRadiologyOrder(null)
      setRadiologyOrderForm({
        examTypeId: "",
        bodyPart: "",
        clinicalIndication: "",
        priority: "routine",
        scheduledDate: "",
        notes: "",
      })
      // Reload overview to get the new/updated order (without showing loading state)
      await loadOverview(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingRadiologyOrder ? "Failed to update radiology order" : "Failed to create radiology order"),
        variant: "destructive",
      })
    } finally {
      setSavingRadiologyOrder(false)
    }
  }

  const handleSavePrescription = async () => {
    if (!prescriptionForm.medicationId || !prescriptionForm.dosage || !prescriptionForm.frequency || !prescriptionForm.duration) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (medication, dosage, frequency, duration)",
        variant: "destructive",
      })
      return
    }

    try {
      setSavingPrescription(true)
      const patientId = overview?.admission?.patientId
      if (!patientId) {
        throw new Error("Patient ID not found")
      }

      const userId = user?.id || user?.userId
      if (!userId) {
        throw new Error("User not authenticated. Please log in again.")
      }

      // Calculate quantity if not provided or empty
      let calculatedQuantity = null
      if (prescriptionForm.quantity && prescriptionForm.quantity.trim() !== "") {
        calculatedQuantity = parseInt(prescriptionForm.quantity)
      } else {
        // Try to auto-calculate from frequency and duration
        const frequencyMatch = prescriptionForm.frequency.match(/(\d+)\s*(?:times?|x)\s*(?:daily|day|per day)/i) ||
                              prescriptionForm.frequency.match(/(once|one)\s*(?:daily|day|per day)/i) ||
                              prescriptionForm.frequency.match(/(twice|two)\s*(?:daily|day|per day)/i) ||
                              prescriptionForm.frequency.match(/(thrice|three)\s*(?:daily|day|per day)/i)

        let frequencyPerDay = 1
        if (frequencyMatch) {
          if (frequencyMatch[1]) {
            frequencyPerDay = parseInt(frequencyMatch[1]) || 1
          } else if (frequencyMatch[0]?.toLowerCase().includes('once') || frequencyMatch[0]?.toLowerCase().includes('one')) {
            frequencyPerDay = 1
          } else if (frequencyMatch[0]?.toLowerCase().includes('twice') || frequencyMatch[0]?.toLowerCase().includes('two')) {
            frequencyPerDay = 2
          } else if (frequencyMatch[0]?.toLowerCase().includes('thrice') || frequencyMatch[0]?.toLowerCase().includes('three')) {
            frequencyPerDay = 3
          }
        }

        const durationMatch = prescriptionForm.duration.match(/(\d+)\s*(?:days?|day)/i) ||
                             prescriptionForm.duration.match(/(\d+)\s*(?:weeks?|week)/i) ||
                             prescriptionForm.duration.match(/(\d+)\s*(?:months?|month)/i)

        let durationDays = 0
        if (durationMatch) {
          const number = parseInt(durationMatch[1]) || 0
          if (durationMatch[0]?.toLowerCase().includes('week')) {
            durationDays = number * 7
          } else if (durationMatch[0]?.toLowerCase().includes('month')) {
            durationDays = number * 30
          } else {
            durationDays = number
          }
        }

        if (frequencyPerDay > 0 && durationDays > 0) {
          calculatedQuantity = frequencyPerDay * durationDays
        }
      }

      if (editingPrescription) {
        // Update existing prescription with items
        const item = editingPrescription.items?.[0]
        if (!item) {
          throw new Error("Prescription item not found")
        }

        await pharmacyApi.updatePrescription(editingPrescription.prescriptionId.toString(), {
          items: [{
            itemId: item.itemId,
            medicationId: parseInt(prescriptionForm.medicationId),
            dosage: prescriptionForm.dosage,
            frequency: prescriptionForm.frequency,
            duration: prescriptionForm.duration,
            quantity: calculatedQuantity,
            instructions: prescriptionForm.instructions || null,
          }],
        })
        toast({
          title: "Success",
          description: "Prescription updated successfully",
        })
      } else {
        // Create new prescription
        const prescriptionData = {
          patientId: patientId.toString(),
          doctorId: userId.toString(),
          prescriptionDate: new Date().toISOString().split('T')[0],
          status: 'pending',
          admissionId: admissionId,
          items: [{
            medicationId: parseInt(prescriptionForm.medicationId),
            dosage: prescriptionForm.dosage,
            frequency: prescriptionForm.frequency,
            duration: prescriptionForm.duration,
            quantity: calculatedQuantity,
            instructions: prescriptionForm.instructions || null,
          }],
        }

        console.log("Saving prescription:", prescriptionData)
        await pharmacyApi.createPrescription(prescriptionData)
        toast({
          title: "Success",
          description: "Prescription created successfully",
        })
      }

      setPrescriptionDialogOpen(false)
      setEditingPrescription(null)
      setPrescriptionForm({
        medicationId: "",
        dosage: "",
        frequency: "",
        duration: "",
        quantity: "",
        instructions: "",
      })
      setIsQuantityManuallyEdited(false) // Reset manual edit flag
      loadOverview()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || (editingPrescription ? "Failed to update prescription" : "Failed to create prescription"),
        variant: "destructive",
      })
    } finally {
      setSavingPrescription(false)
    }
  }

  // Edit handlers
  const handleEditReview = (review: any) => {
    const date = new Date(review.reviewDate)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`

    setEditingReview(review)
    setReviewForm({
      reviewDate: datetimeLocal,
      reviewingDoctorId: review.reviewingDoctorId?.toString() || "",
      reviewType: review.reviewType || "morning_round",
      subjective: review.subjective || "",
      objective: review.objective || "",
      assessment: review.assessment || "",
      plan: review.plan || "",
      notes: review.notes || "",
      nextReviewDate: review.nextReviewDate ? new Date(review.nextReviewDate).toISOString().slice(0, 16) : "",
    })
    setReviewDialogOpen(true)
  }

  const handleEditNursing = (care: any) => {
    const date = new Date(care.careDate)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`

    setEditingNursing(care)
    setNursingForm({
      careDate: datetimeLocal,
      nurseId: care.nurseId?.toString() || "",
      careType: care.careType || "observation",
      shift: care.shift || "morning",
      vitalSignsRecorded: care.vitalSignsRecorded || false,
      observations: care.observations || "",
      interventions: care.interventions || "",
      patientResponse: care.patientResponse || "",
      concerns: care.concerns || "",
      notes: care.notes || "",
    })
    setNursingDialogOpen(true)
  }

  const handleEditProcedure = async (procedure: any) => {
    try {
      // Load procedures if not already loaded
      if (procedures.length === 0) {
        await loadProcedures()
      }
      setEditingProcedure(procedure)
      setProcedureForm({
        procedureId: procedure.procedureId?.toString() || "",
        procedureDate: procedure.procedureDate ? new Date(procedure.procedureDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        performedBy: procedure.performedBy?.toString() || "",
        notes: procedure.notes || "",
        complications: procedure.complications || "",
      })
      setProcedureDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load procedure details",
        variant: "destructive",
      })
    }
  }

  const handleEditRadiologyOrder = async (order: any) => {
    try {
      // Load exam types if not already loaded
      if (examTypes.length === 0) {
        await loadExamTypes()
      }
      // Fetch full order details
      const fullOrder = await radiologyApi.getOrder(order.orderId.toString())
      setEditingRadiologyOrder(fullOrder)

      const scheduledDate = fullOrder.scheduledDate ? new Date(fullOrder.scheduledDate).toISOString().slice(0, 16) : ""

      setRadiologyOrderForm({
        examTypeId: fullOrder.examTypeId?.toString() || "",
        bodyPart: fullOrder.bodyPart || "",
        clinicalIndication: fullOrder.clinicalIndication || "",
        priority: fullOrder.priority || "routine",
        scheduledDate: scheduledDate,
        notes: fullOrder.notes || "",
      })
      setRadiologyOrderDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load radiology order details",
        variant: "destructive",
      })
    }
  }

  const handleEditLabOrder = async (order: any) => {
    try {
      // Load test types if not already loaded
      if (testTypes.length === 0) {
        await loadTestTypes()
      }
      // Fetch full order details
      const fullOrder = await laboratoryApi.getOrder(order.orderId.toString())
      setEditingLabOrder(fullOrder)

      // Get test type from order items
      const testTypeId = fullOrder.items?.[0]?.testTypeId?.toString() || ""

      setLabOrderForm({
        testTypeId: testTypeId,
        priority: fullOrder.priority || "routine",
        clinicalIndication: fullOrder.clinicalIndication || "",
      })
      setLabOrderDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load lab order details",
        variant: "destructive",
      })
    }
  }

  const handleEditPrescription = async (prescription: any) => {
    try {
      // Fetch full prescription details
      const fullPrescription = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
      setEditingPrescription(fullPrescription)

      // Get first item for editing (most prescriptions have one item)
      const item = fullPrescription.items?.[0]
      if (item) {
        setPrescriptionForm({
          medicationId: item.medicationId?.toString() || "",
          dosage: item.dosage || "",
          frequency: item.frequency || "",
          duration: item.duration || "",
          quantity: item.quantity?.toString() || "",
          instructions: item.instructions || "",
        })
        setIsQuantityManuallyEdited(true) // Prevent auto-calculation when editing
      }
      setPrescriptionDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load prescription details",
        variant: "destructive",
      })
    }
  }

  // View handlers
  const handleViewProcedure = (procedure: any) => {
    setViewingProcedure(procedure)
    setViewProcedureDialogOpen(true)
  }

  const handleViewRadiologyOrder = async (order: any) => {
    try {
      const fullOrder = await radiologyApi.getOrder(order.orderId.toString())
      setViewingRadiologyOrder(fullOrder)
      setViewRadiologyOrderDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load radiology order details",
        variant: "destructive",
      })
    }
  }

  const handleViewLabOrder = async (order: any) => {
    try {
      const fullOrder = await laboratoryApi.getOrder(order.orderId.toString())
      setViewingLabOrder(fullOrder)
      setViewLabOrderDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load lab order details",
        variant: "destructive",
      })
    }
  }

  const handleViewPrescription = async (prescription: any, overviewPrescriptions?: any[]) => {
    try {
      const fullPrescription = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
      const fromOverview = overviewPrescriptions?.find((p: any) => p.prescriptionId === prescription.prescriptionId)
      const merged = fromOverview?.pickupInfo
        ? { ...fullPrescription, status: 'picked_up', pickupInfo: fromOverview.pickupInfo }
        : fullPrescription
      setViewingPrescription(merged)
      setViewPrescriptionDialogOpen(true)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load prescription details",
        variant: "destructive",
      })
    }
  }

  const chartVitals = useMemo(() => overview?.vitals ?? [], [overview])

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] w-[96vw] max-h-[95vh] h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading</DialogTitle>
            <DialogDescription>Loading admission details...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading admission details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!overview) {
    return null
  }

  const admission = overview.admission

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] max-h-[95vh] h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Inpatient Management - {admission.admissionNumber}</span>
            <Badge variant={admission.status === "admitted" ? "secondary" : "default"}>
              {admission.status}
            </Badge>
          </DialogTitle>
          {/* asChild: Radix Description is a <p> by default; block children (div/button row) must use a wrapper div */}
          <DialogDescription asChild className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span>{admission.firstName} {admission.lastName} - {admission.wardName} - Bed {admission.bedNumber}</span>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => setTelemedicineModalOpen(true)}>
                  <Video className="h-4 w-4 mr-2" />
                  Telemedicine
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDischargeSummaryOpen(true)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print discharge summary
                </Button>
                {admission.status === "admitted" && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => { setDischargeDate(new Date().toISOString().slice(0, 10)); setDischargeNotes(""); setDischargeDialogOpen(true); }}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Discharge
                    </Button>
                    <Button variant="outline" size="sm" onClick={openTransferDialog}>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transfer
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium px-0.5">Inpatient chart &amp; billing</p>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="nursing">Nursing</TabsTrigger>
            <TabsTrigger value="vitals">Vitals</TabsTrigger>
            <TabsTrigger value="procedures">Procedures</TabsTrigger>
            <TabsTrigger value="radiology">Radiology</TabsTrigger>
            <TabsTrigger value="labs">Labs</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="medications">Medications</TabsTrigger>
            <TabsTrigger value="bill">Bill</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Patient Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p><span className="text-muted-foreground">Name:</span> {admission.firstName} {admission.lastName}</p>
                  <p><span className="text-muted-foreground">Patient Number:</span> {admission.patientNumber}</p>
                  <p><span className="text-muted-foreground">Ward/Bed:</span> {admission.wardName} - {admission.bedNumber}</p>
                  <p><span className="text-muted-foreground">Admission Date:</span> {format(new Date(admission.admissionDate), "PPp")}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Clinical Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p><span className="text-muted-foreground">Admitting Doctor:</span> {admission.doctorFirstName} {admission.doctorLastName}</p>
                  <p><span className="text-muted-foreground">Diagnosis:</span> {admission.admissionDiagnosis || "N/A"}</p>
                  {admission.expectedDischargeDate && (
                    <p><span className="text-muted-foreground">Expected Discharge:</span> {format(new Date(admission.expectedDischargeDate), "PP")}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Doctor Reviews</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{overview.reviews?.length || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Nursing Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{overview.nursingCare?.length || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Vital Signs</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{overview.vitals?.length || 0}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Procedures</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{overview.procedures?.length || 0}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Doctor Reviews Tab */}
          <TabsContent value="reviews" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold shrink-0">Doctor Reviews & Rounds</h3>
              <div className="flex flex-wrap items-center gap-2">
              <Dialog open={reviewDialogOpen} onOpenChange={(open) => {
                setReviewDialogOpen(open)
                if (!open) {
                  setEditingReview(null)
                  setReviewForm({
                    reviewDate: new Date().toISOString().slice(0, 16),
                    reviewingDoctorId: user?.userId?.toString() || "",
                    reviewType: "morning_round",
                    subjective: "",
                    objective: "",
                    assessment: "",
                    plan: "",
                    notes: "",
                    nextReviewDate: "",
                  })
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Add Review</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingReview ? "Edit Doctor Review" : "Doctor Review"}</DialogTitle>
                    <DialogDescription>{editingReview ? "Update doctor review or round" : "Record a doctor review or round"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Review Date & Time</Label>
                        <Input
                          type="datetime-local"
                          value={reviewForm.reviewDate}
                          onChange={(e) => setReviewForm({ ...reviewForm, reviewDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Reviewing Doctor *</Label>
                        <Select
                          value={reviewForm.reviewingDoctorId}
                          onValueChange={(v) => setReviewForm({ ...reviewForm, reviewingDoctorId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            {doctors.map((doctor: any) => (
                              <SelectItem key={doctor.userId} value={doctor.userId.toString()}>
                                {doctor.firstName} {doctor.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Review Type</Label>
                      <Select value={reviewForm.reviewType} onValueChange={(v) => setReviewForm({ ...reviewForm, reviewType: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="morning_round">Morning Round</SelectItem>
                          <SelectItem value="evening_round">Evening Round</SelectItem>
                          <SelectItem value="consultation">Consultation</SelectItem>
                          <SelectItem value="emergency">Emergency</SelectItem>
                          <SelectItem value="follow_up">Follow Up</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Subjective (S)</Label>
                      <Textarea
                        placeholder="Patient complaints, history since last review..."
                        value={reviewForm.subjective}
                        onChange={(e) => setReviewForm({ ...reviewForm, subjective: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Objective (O)</Label>
                      <Textarea
                        placeholder="Physical examination findings..."
                        value={reviewForm.objective}
                        onChange={(e) => setReviewForm({ ...reviewForm, objective: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Assessment (A)</Label>
                      <Textarea
                        placeholder="Clinical assessment, diagnosis updates..."
                        value={reviewForm.assessment}
                        onChange={(e) => setReviewForm({ ...reviewForm, assessment: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Plan (P)</Label>
                      <Textarea
                        placeholder="Treatment plan, medications, investigations, procedures..."
                        value={reviewForm.plan}
                        onChange={(e) => setReviewForm({ ...reviewForm, plan: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Additional notes..."
                        value={reviewForm.notes}
                        onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setReviewDialogOpen(false)
                        setEditingReview(null)
                        setReviewForm({
                          reviewDate: new Date().toISOString().slice(0, 16),
                          reviewingDoctorId: user?.userId?.toString() || "",
                          reviewType: "morning_round",
                          subjective: "",
                          objective: "",
                          assessment: "",
                          plan: "",
                          notes: "",
                          nextReviewDate: "",
                        })
                      }}>Cancel</Button>
                      <Button onClick={handleSaveReview} disabled={savingReview}>
                        {savingReview ? "Saving..." : editingReview ? "Update Review" : "Save Review"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Assessment</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.reviews?.length > 0 ? (
                      overview.reviews.map((review: any) => {
                        const assessmentTruncated = review.assessment && review.assessment.length > 50
                        const planTruncated = review.plan && review.plan.length > 50
                        const needsView = assessmentTruncated || planTruncated || review.subjective || review.objective

                        return (
                          <TableRow key={review.reviewId}>
                            <TableCell>{format(new Date(review.reviewDate), "PPp")}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{review.reviewType.replace("_", " ")}</Badge>
                            </TableCell>
                            <TableCell>{review.doctorFirstName} {review.doctorLastName}</TableCell>
                            <TableCell className="max-w-xs truncate">{review.assessment || "N/A"}</TableCell>
                            <TableCell className="max-w-xs truncate">{review.plan || "N/A"}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setViewingReview(review)
                                    setViewReviewDialogOpen(true)
                                  }}
                                  title="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditReview(review)}
                                  title="Edit review"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No reviews recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* View Review Dialog */}
            <Dialog open={viewReviewDialogOpen} onOpenChange={setViewReviewDialogOpen}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Doctor Review Details</DialogTitle>
                  <DialogDescription>
                    {viewingReview ? (
                      <>
                        {format(new Date(viewingReview.reviewDate), "PPp")} - {viewingReview.doctorFirstName} {viewingReview.doctorLastName}
                      </>
                    ) : (
                      "View detailed information about this doctor review"
                    )}
                  </DialogDescription>
                </DialogHeader>
                {viewingReview && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-semibold">Review Type</Label>
                        <p>
                          <Badge variant="outline">{viewingReview.reviewType.replace("_", " ")}</Badge>
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Review Date & Time</Label>
                        <p>{format(new Date(viewingReview.reviewDate), "PPp")}</p>
                      </div>
                    </div>

                    {viewingReview.subjective && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Subjective (S)</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingReview.subjective}</p>
                        </div>
                      </div>
                    )}

                    {viewingReview.objective && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Objective (O)</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingReview.objective}</p>
                        </div>
                      </div>
                    )}

                    {viewingReview.assessment && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Assessment (A)</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingReview.assessment}</p>
                        </div>
                      </div>
                    )}

                    {viewingReview.plan && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Plan (P)</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingReview.plan}</p>
                        </div>
                      </div>
                    )}

                    {viewingReview.notes && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Additional Notes</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingReview.notes}</p>
                        </div>
                      </div>
                    )}

                    {viewingReview.nextReviewDate && (
                      <div>
                        <Label className="text-sm font-semibold">Next Review Date</Label>
                        <p>{format(new Date(viewingReview.nextReviewDate), "PPp")}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => setViewReviewDialogOpen(false)}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Nursing Care Tab */}
          <TabsContent value="nursing" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Nursing Care Notes</h3>
              <Dialog open={nursingDialogOpen} onOpenChange={(open) => {
                setNursingDialogOpen(open)
                if (!open) {
                  setEditingNursing(null)
                  setNursingForm({
                    careDate: new Date().toISOString().slice(0, 16),
                    nurseId: user?.userId?.toString() || "",
                    careType: "observation",
                    shift: "morning",
                    vitalSignsRecorded: false,
                    observations: "",
                    interventions: "",
                    patientResponse: "",
                    concerns: "",
                    notes: "",
                  })
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Add Note</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingNursing ? "Edit Nursing Care Note" : "Nursing Care Note"}</DialogTitle>
                    <DialogDescription>{editingNursing ? "Update nursing observations and care" : "Record nursing observations and care"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Date & Time</Label>
                        <Input
                          type="datetime-local"
                          value={nursingForm.careDate}
                          onChange={(e) => setNursingForm({ ...nursingForm, careDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Nurse *</Label>
                        <Select value={nursingForm.nurseId} onValueChange={(v) => setNursingForm({ ...nursingForm, nurseId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select nurse" />
                          </SelectTrigger>
                          <SelectContent>
                            {nurses.length > 0 ? (
                              nurses.map((nurse: any) => (
                                <SelectItem key={nurse.userId} value={nurse.userId.toString()}>
                                  {nurse.firstName} {nurse.lastName}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                No nurses available
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Shift</Label>
                        <Select value={nursingForm.shift} onValueChange={(v) => setNursingForm({ ...nursingForm, shift: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="morning">Morning</SelectItem>
                            <SelectItem value="afternoon">Afternoon</SelectItem>
                            <SelectItem value="night">Night</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Care Type</Label>
                        <Select value={nursingForm.careType} onValueChange={(v) => setNursingForm({ ...nursingForm, careType: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="assessment">Assessment</SelectItem>
                            <SelectItem value="medication">Medication</SelectItem>
                            <SelectItem value="procedure">Procedure</SelectItem>
                            <SelectItem value="observation">Observation</SelectItem>
                            <SelectItem value="education">Education</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="vitalSignsRecorded"
                        checked={nursingForm.vitalSignsRecorded}
                        onChange={(e) => setNursingForm({ ...nursingForm, vitalSignsRecorded: e.target.checked })}
                      />
                      <Label htmlFor="vitalSignsRecorded">Vital signs recorded</Label>
                    </div>

                    <div>
                      <Label>Observations</Label>
                      <Textarea
                        placeholder="General observations, patient condition..."
                        value={nursingForm.observations}
                        onChange={(e) => setNursingForm({ ...nursingForm, observations: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Interventions</Label>
                      <Textarea
                        placeholder="Nursing interventions performed..."
                        value={nursingForm.interventions}
                        onChange={(e) => setNursingForm({ ...nursingForm, interventions: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label>Patient Response</Label>
                      <Textarea
                        placeholder="Patient's response to care..."
                        value={nursingForm.patientResponse}
                        onChange={(e) => setNursingForm({ ...nursingForm, patientResponse: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div>
                      <Label>Concerns</Label>
                      <Textarea
                        placeholder="Any concerns or issues noted..."
                        value={nursingForm.concerns}
                        onChange={(e) => setNursingForm({ ...nursingForm, concerns: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Additional notes..."
                        value={nursingForm.notes}
                        onChange={(e) => setNursingForm({ ...nursingForm, notes: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setNursingDialogOpen(false)
                        setEditingNursing(null)
                        setNursingForm({
                          careDate: new Date().toISOString().slice(0, 16),
                          nurseId: user?.userId?.toString() || "",
                          careType: "observation",
                          shift: "morning",
                          vitalSignsRecorded: false,
                          observations: "",
                          interventions: "",
                          patientResponse: "",
                          concerns: "",
                          notes: "",
                        })
                      }}>Cancel</Button>
                      <Button onClick={handleSaveNursing} disabled={savingNursing}>
                        {savingNursing ? "Saving..." : editingNursing ? "Update Note" : "Save Note"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Nurse</TableHead>
                      <TableHead>Observations</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.nursingCare?.length > 0 ? (
                      overview.nursingCare.map((care: any) => {
                        const observationsTruncated = care.observations && care.observations.length > 50
                        const needsView = observationsTruncated || care.interventions || care.patientResponse || care.concerns || care.notes

                        return (
                          <TableRow key={care.careId}>
                            <TableCell>{format(new Date(care.careDate), "PPp")}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{care.shift}</Badge>
                            </TableCell>
                            <TableCell>{care.careType}</TableCell>
                            <TableCell>{care.nurseFirstName} {care.nurseLastName}</TableCell>
                            <TableCell className="max-w-xs truncate">{care.observations || "N/A"}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setViewingNursing(care)
                                    setViewNursingDialogOpen(true)
                                  }}
                                  title="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditNursing(care)}
                                  title="Edit note"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No nursing care notes recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* View Nursing Care Note Dialog */}
            <Dialog open={viewNursingDialogOpen} onOpenChange={setViewNursingDialogOpen}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nursing Care Note Details</DialogTitle>
                  <DialogDescription>
                    {viewingNursing ? (
                      <>
                        {format(new Date(viewingNursing.careDate), "PPp")} - {viewingNursing.nurseFirstName} {viewingNursing.nurseLastName}
                      </>
                    ) : (
                      "View detailed information about this nursing care note"
                    )}
                  </DialogDescription>
                </DialogHeader>
                {viewingNursing && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-semibold">Care Type</Label>
                        <p>
                          <Badge variant="outline">{viewingNursing.careType}</Badge>
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Shift</Label>
                        <p>
                          <Badge variant="outline">{viewingNursing.shift}</Badge>
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Date & Time</Label>
                        <p>{format(new Date(viewingNursing.careDate), "PPp")}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Nurse</Label>
                        <p>{viewingNursing.nurseFirstName} {viewingNursing.nurseLastName}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Vital Signs Recorded</Label>
                        <p>
                          <Badge variant={viewingNursing.vitalSignsRecorded ? "default" : "outline"}>
                            {viewingNursing.vitalSignsRecorded ? "Yes" : "No"}
                          </Badge>
                        </p>
                      </div>
                    </div>

                    {viewingNursing.observations && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Observations</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingNursing.observations}</p>
                        </div>
                      </div>
                    )}

                    {viewingNursing.interventions && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Interventions</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingNursing.interventions}</p>
                        </div>
                      </div>
                    )}

                    {viewingNursing.patientResponse && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Patient Response</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingNursing.patientResponse}</p>
                        </div>
                      </div>
                    )}

                    {viewingNursing.concerns && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Concerns</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingNursing.concerns}</p>
                        </div>
                      </div>
                    )}

                    {viewingNursing.notes && (
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Additional Notes</Label>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{viewingNursing.notes}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => setViewNursingDialogOpen(false)}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Vitals Tab */}
          <TabsContent value="vitals" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">Vital Signs</h3>
                <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                  <Button
                    type="button"
                    variant={inpatientVitalsView === "table" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-3"
                    onClick={() => setInpatientVitalsView("table")}
                  >
                    Table
                  </Button>
                  <Button
                    type="button"
                    variant={inpatientVitalsView === "charts" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-3"
                    onClick={() => setInpatientVitalsView("charts")}
                  >
                    Charts
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setScheduleDialogOpen(true)}>
                  <Clock className="mr-2 h-4 w-4" />Schedule
                </Button>
                <Dialog open={vitalsDialogOpen} onOpenChange={(open) => {
                  setVitalsDialogOpen(open)
                  if (!open) {
                    setEditingVital(null)
                    setVitalsForm({
                      recordedDate: new Date().toISOString().slice(0, 16),
                      systolicBP: "",
                      diastolicBP: "",
                      heartRate: "",
                      respiratoryRate: "",
                      temperature: "",
                      oxygenSaturation: "",
                      painScore: "",
                      weight: "",
                      height: "",
                      notes: "",
                    })
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Record Vitals</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingVital ? "Edit Vital Signs" : "Record Vital Signs"}</DialogTitle>
                      <DialogDescription>{editingVital ? "Update patient vital signs" : "Record patient vital signs"}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Date & Time</Label>
                        <Input
                          type="datetime-local"
                          value={vitalsForm.recordedDate}
                          onChange={(e) => setVitalsForm({ ...vitalsForm, recordedDate: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Systolic BP</Label>
                          <Input
                            type="number"
                            placeholder="120"
                            value={vitalsForm.systolicBP}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, systolicBP: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Diastolic BP</Label>
                          <Input
                            type="number"
                            placeholder="80"
                            value={vitalsForm.diastolicBP}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, diastolicBP: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Heart Rate</Label>
                          <Input
                            type="number"
                            placeholder="72"
                            value={vitalsForm.heartRate}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, heartRate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Respiratory Rate</Label>
                          <Input
                            type="number"
                            placeholder="16"
                            value={vitalsForm.respiratoryRate}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Temperature (°C)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="36.5"
                            value={vitalsForm.temperature}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>SpO2 (%)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="98"
                            value={vitalsForm.oxygenSaturation}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, oxygenSaturation: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Pain Score (0-10)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="10"
                            placeholder="0"
                            value={vitalsForm.painScore}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, painScore: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Weight (kg)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="70"
                            value={vitalsForm.weight}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Height (cm)</Label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="170"
                            value={vitalsForm.height}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Notes</Label>
                        <Textarea
                          placeholder="Additional notes..."
                          value={vitalsForm.notes}
                          onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => {
                          setVitalsDialogOpen(false)
                          setEditingVital(null)
                          setVitalsForm({
                            recordedDate: new Date().toISOString().slice(0, 16),
                            systolicBP: "",
                            diastolicBP: "",
                            heartRate: "",
                            respiratoryRate: "",
                            temperature: "",
                            oxygenSaturation: "",
                            painScore: "",
                            notes: "",
                          })
                        }}>Cancel</Button>
                        <Button onClick={handleSaveVitals} disabled={savingVitals}>
                          {savingVitals ? "Saving..." : editingVital ? "Update Vitals" : "Save Vitals"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {vitalsSchedule && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Vitals Schedule (4x Daily)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Morning</p>
                      <p className="font-semibold">{vitalsSchedule.scheduledTime1 || "06:00"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Noon</p>
                      <p className="font-semibold">{vitalsSchedule.scheduledTime2 || "12:00"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Evening</p>
                      <p className="font-semibold">{vitalsSchedule.scheduledTime3 || "18:00"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Night</p>
                      <p className="font-semibold">{vitalsSchedule.scheduledTime4 || "00:00"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {inpatientVitalsView === "charts" ? (
              <PatientVitals
                patientId={String(admission.patientId)}
                vitals={chartVitals}
                chartsOnly
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date/Time</TableHead>
                        <TableHead>BP</TableHead>
                        <TableHead>HR</TableHead>
                        <TableHead>RR</TableHead>
                        <TableHead>Temp</TableHead>
                        <TableHead>SpO2</TableHead>
                        <TableHead>Pain</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Height</TableHead>
                        <TableHead>Recorded By</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.vitals?.length > 0 ? (
                        overview.vitals.map((vital: any) => (
                          <TableRow key={vital.vitalSignId}>
                            <TableCell>{format(new Date(vital.recordedDate), "PPp")}</TableCell>
                            <TableCell>
                              {vital.systolicBP && vital.diastolicBP ? `${vital.systolicBP}/${vital.diastolicBP}` : "N/A"}
                            </TableCell>
                            <TableCell>{vital.heartRate || "N/A"}</TableCell>
                            <TableCell>{vital.respiratoryRate || "N/A"}</TableCell>
                            <TableCell>{vital.temperature ? `${vital.temperature}°C` : "N/A"}</TableCell>
                            <TableCell>{vital.oxygenSaturation ? `${vital.oxygenSaturation}%` : "N/A"}</TableCell>
                            <TableCell>{vital.painScore !== null ? vital.painScore : "N/A"}</TableCell>
                            <TableCell>{vital.weight ? `${vital.weight}kg` : "N/A"}</TableCell>
                            <TableCell>{vital.height ? `${vital.height}cm` : "N/A"}</TableCell>
                            <TableCell>{vital.recordedByFirstName} {vital.recordedByLastName}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditVital(vital)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteVital(vital)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-muted-foreground">
                            No vital signs recorded yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            <Dialog open={billAdjustmentDialogOpen} onOpenChange={setBillAdjustmentDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Request Bill Adjustment</DialogTitle>
                  <DialogDescription>
                    Submit a per-line adjustment for approval. Credits reduce the bill; debits increase it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-md border p-3 text-sm bg-muted/30">
                    <p><span className="font-medium">Line:</span> {selectedBillLine?.description ?? "—"}</p>
                    <p><span className="font-medium">Current total:</span> {Number(selectedBillLine?.totalPrice ?? 0).toFixed(2)} KES</p>
                    <p className="font-mono text-xs text-muted-foreground">{selectedBillLine?.lineRef ?? "—"}</p>
                  </div>
                  <div>
                    <Label>Adjustment type</Label>
                    <Select
                      value={billAdjustmentForm.adjustmentType}
                      onValueChange={(v) => setBillAdjustmentForm({ ...billAdjustmentForm, adjustmentType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">Credit (reduce bill)</SelectItem>
                        <SelectItem value="discount">Discount (reduce bill)</SelectItem>
                        <SelectItem value="debit">Debit (increase bill)</SelectItem>
                        <SelectItem value="override">Override</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 500.00"
                      value={billAdjustmentForm.deltaAmount}
                      onChange={(e) => setBillAdjustmentForm({ ...billAdjustmentForm, deltaAmount: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Textarea
                      rows={3}
                      placeholder="Why this line should be adjusted..."
                      value={billAdjustmentForm.reason}
                      onChange={(e) => setBillAdjustmentForm({ ...billAdjustmentForm, reason: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setBillAdjustmentDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateBillAdjustment} disabled={savingBillAdjustment}>
                      {savingBillAdjustment ? "Submitting..." : "Submit Adjustment"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Procedures Tab */}
          <TabsContent value="procedures" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Procedures</h3>
              <Dialog open={procedureDialogOpen} onOpenChange={(open) => {
                setProcedureDialogOpen(open)
                if (!open) {
                  setEditingProcedure(null)
                  setProcedureForm({
                    procedureId: "",
                    procedureDate: new Date().toISOString().split('T')[0],
                    performedBy: user?.userId?.toString() || "",
                    notes: "",
                    complications: "",
                  })
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Add Procedure</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingProcedure ? "Edit Procedure" : "Add Procedure"}</DialogTitle>
                    <DialogDescription>{editingProcedure ? "Update procedure details" : "Record a procedure performed on this patient"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Procedure *</Label>
                      <ProcedureCombobox
                        value={procedureForm.procedureId || ""}
                        onValueChange={(value, procedure) => {
                          setProcedureForm({
                            ...procedureForm,
                            procedureId: value
                          })
                        }}
                        placeholder="Search procedure by name, code, or category..."
                      />
                    </div>
                    <div>
                      <Label>Procedure Date *</Label>
                      <Input
                        type="date"
                        value={procedureForm.procedureDate}
                        onChange={(e) => setProcedureForm({ ...procedureForm, procedureDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Performed By *</Label>
                      <Select value={procedureForm.performedBy} onValueChange={(v) => setProcedureForm({ ...procedureForm, performedBy: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select doctor" />
                        </SelectTrigger>
                        <SelectContent>
                          {doctors.map((doc: any) => (
                            <SelectItem key={doc.userId} value={doc.userId.toString()}>
                              {doc.firstName} {doc.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Procedure notes..."
                        value={procedureForm.notes}
                        onChange={(e) => setProcedureForm({ ...procedureForm, notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label>Complications</Label>
                      <Textarea
                        placeholder="Any complications..."
                        value={procedureForm.complications}
                        onChange={(e) => setProcedureForm({ ...procedureForm, complications: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setProcedureDialogOpen(false)
                        setEditingProcedure(null)
                        setProcedureForm({
                          procedureId: "",
                          procedureDate: new Date().toISOString().split('T')[0],
                          performedBy: user?.userId?.toString() || "",
                          notes: "",
                          complications: "",
                        })
                      }}>Cancel</Button>
                      <Button onClick={handleSaveProcedure} disabled={savingProcedure}>
                        {savingProcedure ? "Saving..." : editingProcedure ? "Update Procedure" : "Save Procedure"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Procedure</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.procedures?.length > 0 ? (
                      overview.procedures.map((procedure: any) => (
                        <TableRow key={procedure.patientProcedureId}>
                          <TableCell>{format(new Date(procedure.procedureDate), "PP")}</TableCell>
                          <TableCell>{procedure.procedureName}</TableCell>
                          <TableCell>{procedure.performedByFirstName} {procedure.performedByLastName}</TableCell>
                          <TableCell>
                            <Badge variant={getProcedureStatusVariant(procedure)}>
                              {getProcedureStatus(procedure)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{procedure.notes || "N/A"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewProcedure(procedure)}
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditProcedure(procedure)}
                                title="Edit procedure"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No procedures recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Radiology Tab */}
          <TabsContent value="radiology" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Radiology Orders</h3>
              <Dialog open={radiologyOrderDialogOpen} onOpenChange={(open) => {
                setRadiologyOrderDialogOpen(open)
                if (!open) {
                  setEditingRadiologyOrder(null)
                  setRadiologyOrderForm({
                    examTypeId: "",
                    bodyPart: "",
                    clinicalIndication: "",
                    priority: "routine",
                    scheduledDate: "",
                    notes: "",
                  })
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Order Radiology</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingRadiologyOrder ? "Edit Radiology Order" : "Order Radiology Examination"}</DialogTitle>
                    <DialogDescription>{editingRadiologyOrder ? "Update radiology order details" : "Create a new radiology order for this patient"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Examination Type *</Label>
                      <ExamTypeCombobox
                        value={radiologyOrderForm.examTypeId || ""}
                        onValueChange={(value, examType) => {
                          setRadiologyOrderForm({ ...radiologyOrderForm, examTypeId: value })
                        }}
                        placeholder="Search examination type by name, code, or category..."
                      />
                    </div>
                    <div>
                      <Label>Body Part</Label>
                      <Input
                        placeholder="e.g., Chest, Abdomen, Head"
                        value={radiologyOrderForm.bodyPart}
                        onChange={(e) => setRadiologyOrderForm({ ...radiologyOrderForm, bodyPart: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Clinical Indication</Label>
                      <Textarea
                        placeholder="Reason for ordering this examination..."
                        value={radiologyOrderForm.clinicalIndication}
                        onChange={(e) => setRadiologyOrderForm({ ...radiologyOrderForm, clinicalIndication: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={radiologyOrderForm.priority} onValueChange={(v) => setRadiologyOrderForm({ ...radiologyOrderForm, priority: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="routine">Routine</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="stat">STAT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Scheduled Date</Label>
                      <Input
                        type="datetime-local"
                        value={radiologyOrderForm.scheduledDate}
                        onChange={(e) => setRadiologyOrderForm({ ...radiologyOrderForm, scheduledDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Additional notes..."
                        value={radiologyOrderForm.notes}
                        onChange={(e) => setRadiologyOrderForm({ ...radiologyOrderForm, notes: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => {
                        setRadiologyOrderDialogOpen(false)
                        setEditingRadiologyOrder(null)
                        setRadiologyOrderForm({
                          examTypeId: "",
                          bodyPart: "",
                          clinicalIndication: "",
                          priority: "routine",
                          scheduledDate: "",
                          notes: "",
                        })
                      }}>Cancel</Button>
                      <Button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          await handleSaveRadiologyOrder()
                        }}
                        disabled={savingRadiologyOrder}
                      >
                        {savingRadiologyOrder ? (editingRadiologyOrder ? "Updating..." : "Creating...") : editingRadiologyOrder ? "Update Order" : "Create Order"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Order Number</TableHead>
                      <TableHead>Examination</TableHead>
                      <TableHead>Body Part</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.radiologyOrders?.length > 0 ? (
                      overview.radiologyOrders.map((order: any) => (
                        <TableRow key={order.orderId}>
                          <TableCell>{format(new Date(order.orderDate), "PP")}</TableCell>
                          <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                          <TableCell>{order.examName || "Unknown"}</TableCell>
                          <TableCell>{order.bodyPart || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={order.priority === 'stat' || order.priority === 'urgent' ? 'destructive' : 'outline'}>
                              {order.priority?.toUpperCase() || 'ROUTINE'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={order.status === 'completed' ? 'default' : order.status === 'in_progress' ? 'secondary' : 'outline'}>
                              {order.status?.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'PENDING'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewRadiologyOrder(order)}
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRadiologyOrder(order)}
                                title="Edit order"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No radiology orders recorded yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Labs Tab */}
          <TabsContent value="labs" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Laboratory Orders</h3>
              <Dialog open={labOrderDialogOpen} onOpenChange={(open) => {
                setLabOrderDialogOpen(open)
                if (!open) {
                  setEditingLabOrder(null)
                  setLabOrderForm({
                    testTypeId: "",
                    priority: "routine",
                    clinicalIndication: "",
                  })
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Order Lab</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingLabOrder ? "Edit Lab Order" : "Order Laboratory Test"}</DialogTitle>
                    <DialogDescription>{editingLabOrder ? "Update lab order details" : "Create a new lab order for this patient"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Test Type *</Label>
                      <TestTypeCombobox
                        value={labOrderForm.testTypeId || ""}
                        onValueChange={(value, testType) => {
                          setLabOrderForm({ ...labOrderForm, testTypeId: value })
                        }}
                        placeholder="Search test type by name, code, or category..."
                      />
                    </div>

                    <div>
                      <Label>Priority</Label>
                      <Select value={labOrderForm.priority} onValueChange={(v) => setLabOrderForm({ ...labOrderForm, priority: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="routine">Routine</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="stat">STAT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Clinical Indication</Label>
                      <Textarea
                        placeholder="Reason for ordering this test..."
                        value={labOrderForm.clinicalIndication}
                        onChange={(e) => setLabOrderForm({ ...labOrderForm, clinicalIndication: e.target.value })}
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setLabOrderDialogOpen(false)
                        setEditingLabOrder(null)
                        setLabOrderForm({
                          testTypeId: "",
                          priority: "routine",
                          clinicalIndication: "",
                        })
                      }}>Cancel</Button>
                      <Button onClick={handleSaveLabOrder} disabled={savingLabOrder}>
                        {savingLabOrder ? (editingLabOrder ? "Updating..." : "Creating...") : editingLabOrder ? "Update Order" : "Create Order"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Clinical Indication</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ordered By</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.labOrders?.length > 0 ? (
                      overview.labOrders.map((order: any) => (
                        <TableRow key={order.orderId}>
                          <TableCell>{format(new Date(order.orderDate), "PP")}</TableCell>
                          <TableCell>{order.testName || order.items?.[0]?.testTypeName || "N/A"}</TableCell>
                          <TableCell className="max-w-xs truncate">{order.clinicalIndication || "N/A"}</TableCell>
                          <TableCell>
                            <Badge variant={order.priority === "stat" ? "destructive" : order.priority === "urgent" ? "default" : "secondary"}>
                              {order.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{order.status || "pending"}</Badge>
                          </TableCell>
                          <TableCell>{order.orderedByFirstName} {order.orderedByLastName}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewLabOrder(order)}
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditLabOrder(order)}
                                title="Edit order"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No lab orders yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders/Consumables Tab */}
          <TabsContent value="orders" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Orders & Consumables</h3>
              <Dialog open={orderDialogOpen} onOpenChange={(open) => {
                setOrderDialogOpen(open)
                if (!open) {
                  setEditingOrder(null)
                  setOrderForm({
                    chargeId: "",
                    quantity: 1,
                    notes: "",
                  })
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Add Order</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingOrder ? "Edit Order" : "Order Consumable"}</DialogTitle>
                    <DialogDescription>{editingOrder ? "Update consumable order" : "Order consumables/medical supplies for this patient"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Consumable *</Label>
                      <Select
                        value={orderForm.chargeId}
                        onValueChange={(v) => {
                          const consumable = consumables.find((c: any) => c.chargeId?.toString() === v)
                          setOrderForm({ ...orderForm, chargeId: v })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select consumable" />
                        </SelectTrigger>
                        <SelectContent>
                          {consumables.map((consumable: any) => (
                            <SelectItem key={consumable.chargeId} value={consumable.chargeId.toString()}>
                              {consumable.name} - {consumable.cost ? `KES ${parseFloat(consumable.cost).toFixed(2)}` : 'N/A'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={orderForm.quantity}
                        onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })}
                      />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Additional notes about this order..."
                        value={orderForm.notes}
                        onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                        rows={3}
                      />
                    </div>

                    {orderForm.chargeId && (
                      <div className="p-3 bg-muted rounded-md">
                        <p className="text-sm text-muted-foreground">Total Amount</p>
                        <p className="text-lg font-semibold">
                          KES {(() => {
                            const consumable = consumables.find((c: any) => c.chargeId?.toString() === orderForm.chargeId)
                            const unitPrice = consumable?.cost ? parseFloat(consumable.cost) : 0
                            return (unitPrice * (orderForm.quantity || 1)).toFixed(2)
                          })()}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setOrderDialogOpen(false)
                        setEditingOrder(null)
                        setOrderForm({
                          chargeId: "",
                          quantity: 1,
                          notes: "",
                        })
                      }}>Cancel</Button>
                      <Button onClick={handleSaveOrder} disabled={savingOrder}>
                        {savingOrder ? (editingOrder ? "Updating..." : "Creating...") : editingOrder ? "Update Order" : "Create Order"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.orders && overview.orders.length > 0 ? (
                      overview.orders.flatMap((invoice: any) =>
                        invoice.items?.map((item: any, idx: number) => (
                          <TableRow key={`${invoice.invoiceId}-${idx}`}>
                            <TableCell>{format(new Date(invoice.invoiceDate), "PP")}</TableCell>
                            <TableCell>{item.description || "N/A"}</TableCell>
                            <TableCell>{item.quantity || 1}</TableCell>
                            <TableCell>KES {item.unitPrice ? parseFloat(item.unitPrice).toFixed(2) : "0.00"}</TableCell>
                            <TableCell>KES {item.totalPrice ? parseFloat(item.totalPrice).toFixed(2) : "0.00"}</TableCell>
                            <TableCell>
                              <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "waived" ? "secondary" : "outline"}>
                                {invoice.status || "pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditOrder(invoice, item)}
                                  title="Edit order"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteOrder(invoice)}
                                  title="Delete order"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )) || []
                      )
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No orders yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bill Tab */}
          <TabsContent value="bill" className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-lg font-semibold">Bill</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadBill()} disabled={billLoading}>
                  {billLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {billLoading ? "Loading..." : "Refresh"}
                </Button>
                {(() => {
                  const safeFormat = (d: string | number | Date | null | undefined, fmt: string) => {
                    if (d == null) return "—"
                    const date = typeof d === "object" ? d : new Date(d)
                    if (Number.isNaN(date.getTime())) return "—"
                    try { return format(date, fmt) } catch { return "—" }
                  }
                  const openPrintBill = () => {
                    try {
                      if (!billData?.lines?.length) {
                        toast({ title: "No bill", description: "No charges to print yet.", variant: "destructive" })
                        return
                      }
                      const adm = billData.admission || admission
                      const rows = billData.lines
                      const logoOrigin = typeof window !== "undefined" ? window.location.origin : ""
                      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Inpatient Bill - ${String(adm?.admissionNumber ?? "").replace(/</g, "&lt;")}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; color: #111; }
    .bill-header { text-align: center; border-bottom: 2px solid #ddd; padding-bottom: 12px; margin-bottom: 16px; }
    .bill-header img { max-width: 250px; height: auto; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; }
    .bill-header .logo-fallback { display: none; }
    .bill-header .logo-fallback h1 { margin: 0; font-size: 1.5rem; font-weight: bold; letter-spacing: 2px; color: #0f4c75; }
    .bill-header .logo-fallback h2 { margin: 4px 0 0; font-size: 1rem; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; }
    .text-right { text-align: right; }
    .totals { margin-top: 24px; max-width: 320px; margin-left: auto; }
    .totals tr { border: none; }
    .totals td { border: none; padding: 4px 8px; }
    .totals .label { font-weight: 600; }
    h1 { font-size: 1.25rem; margin-bottom: 4px; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 16px; }
    .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: #eee; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="bill-header">
    <img src="${logoOrigin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none'; var n=this.nextElementSibling; if(n) n.style.display='block';" />
    <div class="logo-fallback" style="display: none;">
      <h1>KIPLOMBE</h1>
      <h2>Medical Centre</h2>
    </div>
    <h1 style="margin-top: 12px; margin-bottom: 0;">Inpatient Bill</h1>
  </div>
  <div class="meta">
    ${String(adm?.firstName ?? "").replace(/</g, "&lt;")} ${String(adm?.lastName ?? "").replace(/</g, "&lt;")} &bull; ${String(adm?.patientNumber ?? "").replace(/</g, "&lt;")} &bull; ${String(adm?.wardName ?? "").replace(/</g, "&lt;")} - Bed ${String(adm?.bedNumber ?? "").replace(/</g, "&lt;")}<br>
    Admission: ${String(adm?.admissionNumber ?? "").replace(/</g, "&lt;")} &bull; ${safeFormat(adm?.admissionDate, "PP")}${adm?.dischargeDate ? " to " + safeFormat(adm.dischargeDate, "PP") : ""}<br>
    Patient type: ${billData.patientType === "insurance" ? "Insurance" : "Cash"}${billData.insuranceProviderName ? " &bull; " + String(billData.insuranceProviderName).replace(/</g, "&lt;") : ""}<br>
    Generated: ${safeFormat(new Date(), "PPp")}
  </div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Date</th>
        <th>Invoice</th>
        <th>Description</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit (KES)</th>
        <th class="text-right">Total (KES)</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r: any) => `
        <tr>
          <td><span class="badge">${String(r.sourceLabel ?? r.source ?? "—").replace(/</g, "&lt;")}</span></td>
          <td>${safeFormat(r.date, "PP")}</td>
          <td>${String(r.invoiceNumber ?? "—").replace(/</g, "&lt;")}</td>
          <td>${String(r.description ?? "—").replace(/</g, "&lt;")}</td>
          <td class="text-right">${r.quantity ?? 1}</td>
          <td class="text-right">${(r.unitPrice ?? 0).toFixed(2)}</td>
          <td class="text-right">${(r.adjustedTotal ?? r.totalPrice ?? 0).toFixed(2)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <table class="totals">
    <tr><td class="label">Subtotal (KES)</td><td class="text-right">${(billData.subtotal ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Approved Adjustments (KES)</td><td class="text-right">${(billData.adjustmentsTotal ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Grand Total (KES)</td><td class="text-right">${(billData.grandTotal ?? billData.subtotal ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Deposit Expected (KES)</td><td class="text-right">${(billData.deposit?.expectedAmount ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Deposit Paid (KES)</td><td class="text-right">${(billData.deposit?.paidAmount ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Deposit Outstanding (KES)</td><td class="text-right">${(billData.deposit?.outstandingAmount ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Paid (KES)</td><td class="text-right">${(billData.paidTotal ?? 0).toFixed(2)}</td></tr>
    <tr><td class="label">Balance (KES)</td><td class="text-right">${(billData.balanceTotal ?? 0).toFixed(2)}</td></tr>
  </table>
  <p style="margin-top: 24px; font-size: 0.875rem; color: #666;">Use your browser's Print dialog to print or save as PDF.</p>
</body>
</html>`
                      const iframe = document.createElement("iframe")
                      iframe.setAttribute("style", "position:fixed;width:0;height:0;border:none;left:-9999px;top:0;")
                      document.body.appendChild(iframe)
                      const doc = iframe.contentWindow?.document
                      if (!doc) {
                        document.body.removeChild(iframe)
                        toast({ title: "Print failed", description: "Could not create print frame.", variant: "destructive" })
                        return
                      }
                      doc.open()
                      doc.write(html)
                      doc.close()
                      iframe.contentWindow?.focus()
                      setTimeout(() => {
                        try {
                          iframe.contentWindow?.print()
                        } catch (_) {
                          toast({ title: "Print failed", description: "Print dialog could not be opened.", variant: "destructive" })
                        }
                        setTimeout(() => {
                          try { document.body.removeChild(iframe) } catch (_) {}
                        }, 500)
                      }, 300)
                    } catch (e) {
                      console.error("Bill print error:", e)
                      toast({ title: "Print failed", description: e instanceof Error ? e.message : "Could not print bill.", variant: "destructive" })
                    }
                  }
                  return (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!billData || !billData.lines?.length}
                        onClick={() => openPrintBill()}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!billData || !billData.lines?.length}
                        onClick={() => openPrintBill()}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    </>
                  )
                })()}
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Running bill</CardTitle>
                <CardDescription>
                  All charges for this admission: lab, medications, orders, procedures, bed, and consultant. Rates use patient type: {billData?.patientType === "insurance" ? "insurance" : "cash"}.
                  {billData?.insuranceProviderName ? ` Provider: ${billData.insuranceProviderName}.` : ""}{" "}
                  {billData?.deposit?.invoiceNumber ? `Deposit invoice: ${billData.deposit.invoiceNumber} (${billData.deposit.status || "pending"}). ` : ""}
                  Use Print or Download PDF to print or save as PDF.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {billLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : billData?.lines && billData.lines.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit (KES)</TableHead>
                          <TableHead className="text-right">Total (KES)</TableHead>
                          <TableHead className="text-right">Adj. (KES)</TableHead>
                          <TableHead className="text-right">Adjusted (KES)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billData.lines.map((line: any, idx: number) => {
                          const dateObj = line.date ? new Date(line.date) : null
                          const dateStr = dateObj && !Number.isNaN(dateObj.getTime()) ? format(dateObj, "PP") : "—"
                          return (
                          <TableRow key={`${line.source}-${idx}-${String(line.date)}-${String(line.description)}`}>
                            <TableCell><Badge variant="outline">{line.sourceLabel ?? line.source ?? "—"}</Badge></TableCell>
                            <TableCell>{dateStr}</TableCell>
                            <TableCell>{line.invoiceNumber ?? "—"}</TableCell>
                            <TableCell>{line.description ?? "—"}</TableCell>
                            <TableCell className="text-right">{line.quantity ?? 1}</TableCell>
                            <TableCell className="text-right">{(line.unitPrice ?? 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{(line.totalPrice ?? 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{(line.approvedAdjustment ?? 0).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{(line.adjustedTotal ?? line.totalPrice ?? 0).toFixed(2)}</TableCell>
                            <TableCell>
                              {line.status != null ? (
                                <Badge variant={line.status === "paid" ? "default" : line.status === "waived" ? "secondary" : "outline"}>{line.status}</Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenBillAdjustmentDialog(line)}
                              >
                                Adjust
                              </Button>
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    <div className="mt-4 flex justify-end">
                      <div className="rounded-md border bg-muted/30 p-4 min-w-[240px] space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal (KES)</span>
                          <span className="font-medium">{(billData.subtotal ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Approved Adjustments (KES)</span>
                          <span className="font-medium">{(billData.adjustmentsTotal ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Grand Total (KES)</span>
                          <span className="font-medium">{(billData.grandTotal ?? billData.subtotal ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Deposit Expected (KES)</span>
                          <span className="font-medium">{(billData.deposit?.expectedAmount ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Deposit Paid (KES)</span>
                          <span className="font-medium">{(billData.deposit?.paidAmount ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Deposit Outstanding (KES)</span>
                          <span className="font-medium">{(billData.deposit?.outstandingAmount ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Paid (KES)</span>
                          <span className="font-medium">{(billData.paidTotal ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium border-t pt-2 mt-2">
                          <span>Balance (KES)</span>
                          <span>{(billData.balanceTotal ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold mb-2">Line-item adjustment approvals</h4>
                      {billAdjustments.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Line Ref</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Delta (KES)</TableHead>
                              <TableHead>Reason</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Requested By</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {billAdjustments.map((adj: any) => (
                              <TableRow key={adj.adjustmentId}>
                                <TableCell className="font-mono text-xs">{adj.lineRef}</TableCell>
                                <TableCell>{adj.adjustmentType}</TableCell>
                                <TableCell className="text-right">{Number(adj.deltaAmount || 0).toFixed(2)}</TableCell>
                                <TableCell>{adj.reason}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      adj.status === "approved"
                                        ? "default"
                                        : adj.status === "rejected"
                                          ? "secondary"
                                          : "outline"
                                    }
                                  >
                                    {adj.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{[adj.requestedByFirstName, adj.requestedByLastName].filter(Boolean).join(" ") || "—"}</TableCell>
                                <TableCell>
                                  {adj.status === "pending" && canApproveBillAdjustments ? (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => handleReviewBillAdjustment(String(adj.adjustmentId), "approved")}
                                        disabled={reviewingAdjustmentId === String(adj.adjustmentId)}
                                      >
                                        Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleReviewBillAdjustment(String(adj.adjustmentId), "rejected")}
                                        disabled={reviewingAdjustmentId === String(adj.adjustmentId)}
                                      >
                                        Reject
                                      </Button>
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground">No line-item adjustments yet.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {billData && !billLoading ? "No charges yet. Orders, procedures, medications, bed and consultant charges will appear here." : "Loading bill…"}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Medications Tab */}
          <TabsContent value="medications" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Prescriptions</h3>
              <Dialog open={prescriptionDialogOpen} onOpenChange={(open) => {
                setPrescriptionDialogOpen(open)
                if (!open) {
                  setIsQuantityManuallyEdited(false) // Reset when dialog closes
                }
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Add Prescription</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingPrescription ? "Edit Prescription" : "Add Prescription"}</DialogTitle>
                    <DialogDescription>{editingPrescription ? "Update prescription details" : "Prescribe medication for this patient"}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Medication *</Label>
                      <MedicationCombobox
                        value={prescriptionForm.medicationId || undefined}
                        onValueChange={(v) => setPrescriptionForm({ ...prescriptionForm, medicationId: v })}
                        placeholder="Search medication (stock shown in list)..."
                        allowCreate
                        onMedicationCreated={() => {
                          void loadMedicationInventory()
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Same as patient encounter: each option shows available quantity or out of stock.
                      </p>
                      {prescriptionForm.medicationId ? (
                        <div className="mt-2">
                          {getMedicationInventoryStatus(prescriptionForm.medicationId).hasStock ? (
                            <Badge variant="default" className="text-xs">
                              <Package className="h-3 w-3 mr-1" />
                              {getMedicationInventoryStatus(prescriptionForm.medicationId).quantity} in stock
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Out of stock
                            </Badge>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Dosage *</Label>
                        <Input
                          placeholder="e.g., 500mg"
                          value={prescriptionForm.dosage}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, dosage: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Frequency *</Label>
                        <Input
                          placeholder="e.g., Twice daily"
                          value={prescriptionForm.frequency}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, frequency: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Duration *</Label>
                        <Input
                          placeholder="e.g., 7 days"
                          value={prescriptionForm.duration}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, duration: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Quantity <span className="text-xs text-muted-foreground font-normal">(Auto: Frequency × Duration)</span></Label>
                        <Input
                          type="number"
                          placeholder="Auto-calculated from frequency × duration"
                          value={prescriptionForm.quantity}
                          onChange={(e) => {
                            setPrescriptionForm({ ...prescriptionForm, quantity: e.target.value })
                            setIsQuantityManuallyEdited(true)
                          }}
                          onFocus={() => setIsQuantityManuallyEdited(true)}
                        />
                        {prescriptionForm.quantity && !isQuantityManuallyEdited && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Calculated automatically
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label>Instructions</Label>
                      <Textarea
                        placeholder="Special instructions for the patient..."
                        value={prescriptionForm.instructions}
                        onChange={(e) => setPrescriptionForm({ ...prescriptionForm, instructions: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setPrescriptionDialogOpen(false)
                        setEditingPrescription(null)
                        setIsQuantityManuallyEdited(false)
                        setPrescriptionForm({
                          medicationId: "",
                          dosage: "",
                          frequency: "",
                          duration: "",
                          quantity: "",
                          instructions: "",
                        })
                      }}>Cancel</Button>
                      <Button onClick={handleSavePrescription} disabled={savingPrescription}>
                        {savingPrescription ? "Saving..." : editingPrescription ? "Update Prescription" : "Save Prescription"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Prescription Number</TableHead>
                      <TableHead>Medications</TableHead>
                        <TableHead>Availability</TableHead>
                      <TableHead>Dosage</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.prescriptions?.length > 0 ? (
                      overview.prescriptions.map((prescription: any) => {
                        const firstItem = prescription.items?.[0]
                        const items = prescription.items || []
                        const availableCount = items.reduce((count: number, item: any) => {
                          return count + (getMedicationInventoryStatus(item.medicationId).hasStock ? 1 : 0)
                        }, 0)
                        return (
                          <TableRow key={prescription.prescriptionId}>
                            <TableCell>{format(new Date(prescription.prescriptionDate), "PP")}</TableCell>
                            <TableCell>{prescription.prescriptionNumber}</TableCell>
                            <TableCell>{prescription.medicationNames || "N/A"}</TableCell>
                            <TableCell>
                              {items.length > 0 ? (
                                availableCount === items.length ? (
                                  <Badge variant="default">{availableCount}/{items.length} In stock</Badge>
                                ) : (
                                  <Badge variant="secondary">{availableCount}/{items.length} In stock</Badge>
                                )
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                            </TableCell>
                            <TableCell>{firstItem?.dosage || "N/A"}</TableCell>
                            <TableCell>{firstItem?.frequency || "N/A"}</TableCell>
                            <TableCell>{firstItem?.duration || "N/A"}</TableCell>
                            <TableCell>{prescription.doctorFirstName} {prescription.doctorLastName}</TableCell>
                            <TableCell>
                              <Badge variant={prescription.status === "picked_up" ? "default" : "outline"}>
                                {prescription.status === "picked_up" ? "Picked_Up" : (prescription.status || "active")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewPrescription(prescription, overview?.prescriptions)}
                                  title="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPrescription(prescription)}
                                  title="Edit prescription"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground">
                          No prescriptions yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>

        {/* View Procedure Dialog */}
        <Dialog open={viewProcedureDialogOpen} onOpenChange={setViewProcedureDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Procedure Details</DialogTitle>
              <DialogDescription>
                {viewingProcedure ? (
                  <>
                    {format(new Date(viewingProcedure.procedureDate), "PP")} - {viewingProcedure.procedureName}
                  </>
                ) : (
                  "View detailed information about this procedure"
                )}
              </DialogDescription>
            </DialogHeader>
            {viewingProcedure && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Procedure</Label>
                    <p>{viewingProcedure.procedureName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Procedure Date</Label>
                    <p>{format(new Date(viewingProcedure.procedureDate), "PP")}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Performed By</Label>
                    <p>{viewingProcedure.performedByFirstName} {viewingProcedure.performedByLastName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Status</Label>
                    <p>
                      <Badge variant={getProcedureStatusVariant(viewingProcedure)}>
                        {getProcedureStatus(viewingProcedure)}
                      </Badge>
                    </p>
                  </div>
                </div>
                {viewingProcedure.notes && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Notes</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{viewingProcedure.notes}</p>
                    </div>
                  </div>
                )}
                {viewingProcedure.complications && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Complications</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{viewingProcedure.complications}</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setViewProcedureDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* View Radiology Order Dialog */}
        <Dialog open={viewRadiologyOrderDialogOpen} onOpenChange={setViewRadiologyOrderDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Radiology Order Details</DialogTitle>
              <DialogDescription>
                {viewingRadiologyOrder ? (
                  <>
                    {viewingRadiologyOrder.orderNumber} - {format(new Date(viewingRadiologyOrder.orderDate), "PP")}
                  </>
                ) : (
                  "View detailed information about this radiology order"
                )}
              </DialogDescription>
            </DialogHeader>
            {viewingRadiologyOrder && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Order Number</Label>
                    <p className="font-mono">{viewingRadiologyOrder.orderNumber}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Order Date</Label>
                    <p>{format(new Date(viewingRadiologyOrder.orderDate), "PP")}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Examination</Label>
                    <p>{viewingRadiologyOrder.examName || "Unknown"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Body Part</Label>
                    <p>{viewingRadiologyOrder.bodyPart || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Priority</Label>
                    <p>
                      <Badge variant={viewingRadiologyOrder.priority === 'stat' || viewingRadiologyOrder.priority === 'urgent' ? 'destructive' : 'outline'}>
                        {viewingRadiologyOrder.priority?.toUpperCase() || 'ROUTINE'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Status</Label>
                    <p>
                      <Badge variant={viewingRadiologyOrder.status === 'completed' ? 'default' : viewingRadiologyOrder.status === 'in_progress' ? 'secondary' : 'outline'}>
                        {viewingRadiologyOrder.status?.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'PENDING'}
                      </Badge>
                    </p>
                  </div>
                  {viewingRadiologyOrder.scheduledDate && (
                    <div>
                      <Label className="text-sm font-semibold">Scheduled Date</Label>
                      <p>{format(new Date(viewingRadiologyOrder.scheduledDate), "PPp")}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm font-semibold">Ordered By</Label>
                    <p>{viewingRadiologyOrder.doctorFirstName} {viewingRadiologyOrder.doctorLastName}</p>
                  </div>
                </div>
                {viewingRadiologyOrder.clinicalIndication && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Clinical Indication</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{viewingRadiologyOrder.clinicalIndication}</p>
                    </div>
                  </div>
                )}
                {viewingRadiologyOrder.notes && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Notes</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{viewingRadiologyOrder.notes}</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setViewRadiologyOrderDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* View Lab Order Dialog */}
        <Dialog open={viewLabOrderDialogOpen} onOpenChange={setViewLabOrderDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Lab Order Details</DialogTitle>
              <DialogDescription>
                {viewingLabOrder ? (
                  <>
                    Order #{viewingLabOrder.orderId} - {format(new Date(viewingLabOrder.orderDate), "PP")}
                  </>
                ) : (
                  "View detailed information about this lab order"
                )}
              </DialogDescription>
            </DialogHeader>
            {viewingLabOrder && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Order Date</Label>
                    <p>{format(new Date(viewingLabOrder.orderDate), "PP")}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Priority</Label>
                    <p>
                      <Badge variant={viewingLabOrder.priority === "stat" ? "destructive" : viewingLabOrder.priority === "urgent" ? "default" : "secondary"}>
                        {viewingLabOrder.priority}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Status</Label>
                    <p>
                      <Badge variant="outline">{viewingLabOrder.status || "pending"}</Badge>
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Ordered By</Label>
                    <p>{viewingLabOrder.orderedByFirstName} {viewingLabOrder.orderedByLastName}</p>
                  </div>
                </div>
                {viewingLabOrder.items && viewingLabOrder.items.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Test Types</Label>
                    <div className="space-y-2">
                      {viewingLabOrder.items.map((item: any, idx: number) => (
                        <div key={idx} className="p-3 bg-muted rounded-md">
                          <p className="font-medium">{item.testTypeName || `Test ${idx + 1}`}</p>
                          {item.notes && <p className="text-sm text-muted-foreground mt-1">{item.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {viewingLabOrder.clinicalIndication && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Clinical Indication</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{viewingLabOrder.clinicalIndication}</p>
                    </div>
                  </div>
                )}
                {viewingLabOrder.notes && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Notes</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{viewingLabOrder.notes}</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setViewLabOrderDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* View Prescription Dialog */}
        <Dialog open={viewPrescriptionDialogOpen} onOpenChange={setViewPrescriptionDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Prescription Details</DialogTitle>
              <DialogDescription>
                {viewingPrescription ? (
                  <>
                    {viewingPrescription.prescriptionNumber} - {format(new Date(viewingPrescription.prescriptionDate), "PP")}
                  </>
                ) : (
                  "View detailed information about this prescription"
                )}
              </DialogDescription>
            </DialogHeader>
            {viewingPrescription && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Prescription Number</Label>
                    <p className="font-mono">{viewingPrescription.prescriptionNumber}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Prescription Date</Label>
                    <p>{format(new Date(viewingPrescription.prescriptionDate), "PP")}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Doctor</Label>
                    <p>{viewingPrescription.doctorFirstName} {viewingPrescription.doctorLastName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Status</Label>
                    <p>
                      <Badge variant={viewingPrescription.status === "picked_up" ? "default" : "outline"}>
                        {viewingPrescription.status === "picked_up" ? "Picked_Up" : (viewingPrescription.status || "active")}
                      </Badge>
                    </p>
                  </div>
                </div>
                {viewingPrescription.pickupInfo && (
                  <div className="p-4 bg-muted rounded-md space-y-2">
                    <Label className="text-sm font-semibold">Pickup details</Label>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Nurse who picked up:</span>{" "}
                        {viewingPrescription.pickupInfo.nurseName || "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pharmacist who issued:</span>{" "}
                        {viewingPrescription.pickupInfo.pharmacistName || "—"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pickup date:</span>{" "}
                        {viewingPrescription.pickupInfo.pickupDate
                          ? format(new Date(viewingPrescription.pickupInfo.pickupDate), "PP")
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}
                {viewingPrescription.items && viewingPrescription.items.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Medications</Label>
                    <div className="space-y-3">
                      {viewingPrescription.items.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 bg-muted rounded-md space-y-2">
                          <p className="font-medium">{item.medicationName || `Medication ${idx + 1}`}</p>
                          <div>
                            {getMedicationInventoryStatus(item.medicationId).hasStock ? (
                              <Badge variant="default" className="text-xs">
                                <Package className="h-3 w-3 mr-1" />
                                {getMedicationInventoryStatus(item.medicationId).quantity} in stock
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Out of stock
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Dosage:</span> {item.dosage || "N/A"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Frequency:</span> {item.frequency || "N/A"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duration:</span> {item.duration || "N/A"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Quantity:</span> {item.quantity || "N/A"}
                            </div>
                          </div>
                          {item.instructions && (
                            <div className="mt-2">
                              <span className="text-sm text-muted-foreground">Instructions:</span>
                              <p className="text-sm mt-1">{item.instructions}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setViewPrescriptionDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Order Confirmation Dialog */}
        <AlertDialog open={deleteOrderDialogOpen} onOpenChange={setDeleteOrderDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Order?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this order? This action cannot be undone.
                {orderToDelete && (
                  <div className="mt-4 p-3 bg-muted rounded-md space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">Invoice Date:</span>{" "}
                        {format(new Date(orderToDelete.invoiceDate), "PP")}
                      </div>
                      <div>
                        <span className="font-medium">Status:</span>{" "}
                        <Badge variant={orderToDelete.status === "paid" ? "default" : orderToDelete.status === "waived" ? "secondary" : "outline"}>
                          {orderToDelete.status || "pending"}
                        </Badge>
                      </div>
                      {orderToDelete.items && orderToDelete.items.length > 0 && (
                        <>
                          <div>
                            <span className="font-medium">Item:</span> {orderToDelete.items[0].description || "N/A"}
                          </div>
                          <div>
                            <span className="font-medium">Quantity:</span> {orderToDelete.items[0].quantity || 1}
                          </div>
                          <div>
                            <span className="font-medium">Total:</span>{" "}
                            KES {orderToDelete.items[0].totalPrice ? parseFloat(orderToDelete.items[0].totalPrice).toFixed(2) : "0.00"}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingOrder}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteOrder}
                disabled={deletingOrder}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingOrder ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Vital Confirmation Dialog */}
        <AlertDialog open={deleteVitalDialogOpen} onOpenChange={setDeleteVitalDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Vital Sign Record?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this vital sign record? This action cannot be undone.
                {vitalToDelete && (
                  <div className="mt-4 p-3 bg-muted rounded-md space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">Date & Time:</span>{" "}
                        {format(new Date(vitalToDelete.recordedDate), "PPp")}
                      </div>
                      {vitalToDelete.systolicBP && vitalToDelete.diastolicBP && (
                        <div>
                          <span className="font-medium">Blood Pressure:</span>{" "}
                          {vitalToDelete.systolicBP}/{vitalToDelete.diastolicBP}
                        </div>
                      )}
                      {vitalToDelete.heartRate && (
                        <div>
                          <span className="font-medium">Heart Rate:</span> {vitalToDelete.heartRate} bpm
                        </div>
                      )}
                      {vitalToDelete.temperature && (
                        <div>
                          <span className="font-medium">Temperature:</span> {vitalToDelete.temperature}°C
                        </div>
                      )}
                      {vitalToDelete.weight && (
                        <div>
                          <span className="font-medium">Weight:</span> {vitalToDelete.weight} kg
                        </div>
                      )}
                      {vitalToDelete.height && (
                        <div>
                          <span className="font-medium">Height:</span> {vitalToDelete.height} cm
                        </div>
                      )}
                      {vitalToDelete.recordedByFirstName && (
                        <div className="col-span-2">
                          <span className="font-medium">Recorded By:</span>{" "}
                          {vitalToDelete.recordedByFirstName} {vitalToDelete.recordedByLastName}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingVital}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteVital}
                disabled={deletingVital}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingVital ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Discharge dialog */}
        <Dialog open={dischargeDialogOpen} onOpenChange={setDischargeDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Discharge Patient</DialogTitle>
              <DialogDescription>
                Set discharge date and optional notes. The bed will be freed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Discharge Date</Label>
                <Input
                  type="date"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Discharge summary or instructions"
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDischargeDialogOpen(false)} disabled={savingDischarge}>
                Cancel
              </Button>
              <Button onClick={handleDischarge} disabled={savingDischarge}>
                {savingDischarge ? "Discharging..." : "Confirm Discharge"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Transfer dialog */}
        <Dialog open={transferDialogOpen} onOpenChange={(open) => { setTransferDialogOpen(open); if (!open) { setTransferWardId(""); setTransferBedId(""); setTransferBeds([]); } }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Transfer to Another Bed</DialogTitle>
              <DialogDescription>
                Select destination ward and an available bed. Current bed will be freed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Ward</Label>
                <Select value={transferWardId} onValueChange={(v) => { setTransferWardId(v); setTransferBedId(""); loadTransferBeds(v); }}>
                  <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
                  <SelectContent>
                    {transferWards.map((w: any) => (
                      <SelectItem key={w.wardId} value={String(w.wardId)}>{w.wardName} {w.wardType ? `(${w.wardType})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bed</Label>
                <Select value={transferBedId} onValueChange={setTransferBedId} disabled={!transferWardId}>
                  <SelectTrigger><SelectValue placeholder="Select bed" /></SelectTrigger>
                  <SelectContent>
                    {transferBeds.map((b: any) => (
                      <SelectItem key={b.bedId} value={String(b.bedId)}>Bed {b.bedNumber} {b.bedType ? `(${b.bedType})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  placeholder="e.g. Step-down, isolation"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)} disabled={savingTransfer}>
                Cancel
              </Button>
              <Button onClick={handleTransfer} disabled={!transferBedId || savingTransfer}>
                {savingTransfer ? "Transferring..." : "Confirm Transfer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Telemedicine — start session linked to this admission */}
        <Dialog open={telemedicineModalOpen} onOpenChange={setTelemedicineModalOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Telemedicine
              </DialogTitle>
              <DialogDescription>
                HMIS records consent and audit. For outpatients in the <strong>telemedicine queue</strong>, use{" "}
                <Link href="/telemedicine/create" className="underline font-medium" onClick={() => setTelemedicineModalOpen(false)}>
                  Telemedicine → Create session (from queue)
                </Link>{" "}
                instead.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              {isZoomProvider(telemedicineVideoProvider) && (
                <TelemedicineZoomDefaultsRequiredBanner loading={zoomDefaultsLoading} hasDefaults={hasZoomDefaults} startActionLabel="Start Telemedicine" />
              )}
              <TelemedicineProviderSelect
                variant="compact"
                label="Video platform"
                value={telemedicineVideoProvider}
                onChange={setTelemedicineVideoProvider}
                disabled={startingTelemedicine}
              />
              <TelemedicineOptionalMeetingLinkFields
                compact
                videoProvider={telemedicineVideoProvider}
                joinUrl={telemedicineMeetingUrl}
                onJoinUrlChange={setTelemedicineMeetingUrl}
                passcode={telemedicineMeetingPasscode}
                onPasscodeChange={setTelemedicineMeetingPasscode}
              />
              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setTelemedicineModalOpen(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void handleStartTelemedicine()
                  }}
                  disabled={startingTelemedicine || (selectedProviderNeedsZoomDefaults && zoomDefaultsLoading) || !canStartNewTelemedicineVisit}
                  title={
                    !canStartNewTelemedicineVisit && !zoomDefaultsLoading
                      ? "Save Telemedicine → My Zoom defaults or paste a meeting link before starting"
                      : "Start a remote doctor review linked to this admission"
                  }
                >
                  <Activity className="mr-2 h-4 w-4" />
                  {startingTelemedicine ? "Starting…" : "Start Telemedicine"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discharge summary (printable) */}
        <Dialog open={dischargeSummaryOpen} onOpenChange={setDischargeSummaryOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:block print:max-h-none">
            <DischargeSummary overview={overview} />
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

