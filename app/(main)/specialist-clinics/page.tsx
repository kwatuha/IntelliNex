"use client"

import { useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/use-toast"
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Apple,
  Brain,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Ear,
  Eye,
  Heart,
  Hourglass,
  Plus,
  RefreshCw,
  Smile,
  Stethoscope,
  Users,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ClinicKey =
  | "neurosurgery"
  | "cardiology"
  | "renal"
  | "ophthalmology"
  | "ent"
  | "dermatology"
  | "mental-health"
  | "dental"
  | "nutrition"
  | "physiotherapy"

type ClinicSubtabKey = "appointments" | "patients" | "notes"
type AppointmentPriority = "Urgent" | "Routine"
type AppointmentStatus = "Scheduled" | "Completed" | "Cancelled"

type PatientStatus = "Active" | "Discharged"

interface ClinicMeta {
  key: ClinicKey
  label: string
  icon: LucideIcon
}

interface Doctor {
  id: string
  name: string
}

interface Patient {
  id: string
  patientNumber: string
  name: string
  age: number
  diagnosis: string
  lastVisitDate: string // YYYY-MM-DD
  nextAppointmentDate: string // YYYY-MM-DD
  status: PatientStatus
}

interface Appointment {
  id: string
  clinicKey: ClinicKey
  patientId: string
  patientName: string
  doctorId: string
  doctorName: string
  appointmentType: string
  appointmentDate: string // YYYY-MM-DD
  appointmentTime: string // HH:mm
  priority: AppointmentPriority
  status: AppointmentStatus
  notes: string
}

interface ClinicalNote {
  id: string
  clinicKey: ClinicKey
  patientId: string
  patientName: string
  date: string // YYYY-MM-DD
  doctorName: string
  fullText: string
}

const CLINICS: ClinicMeta[] = [
  { key: "neurosurgery", label: "Neurosurgery", icon: Brain },
  { key: "cardiology", label: "Cardiology", icon: Heart },
  { key: "renal", label: "Renal & Dialysis", icon: Activity },
  { key: "ophthalmology", label: "Ophthalmology", icon: Eye },
  { key: "ent", label: "ENT", icon: Ear },
  { key: "dermatology", label: "Dermatology", icon: Stethoscope },
  { key: "mental-health", label: "Mental Health", icon: Smile },
  { key: "dental", label: "Dental", icon: Stethoscope },
  { key: "nutrition", label: "Nutrition", icon: Apple },
  { key: "physiotherapy", label: "Physiotherapy", icon: Dumbbell },
]

const DOCTORS_BY_CLINIC: Record<ClinicKey, Doctor[]> = {
  neurosurgery: [
    { id: "ns-doc-1", name: "Dr. Samuel Kibet" },
    { id: "ns-doc-2", name: "Dr. Catherine Wanjala" },
    { id: "ns-doc-3", name: "Dr. Michael Otieno" },
  ],
  cardiology: [
    { id: "card-doc-1", name: "Dr. James Mwaura" },
    { id: "card-doc-2", name: "Dr. Beatrice Njeri" },
    { id: "card-doc-3", name: "Dr. Francis Odhiambo" },
  ],
  renal: [
    { id: "renal-doc-1", name: "Dr. Peter Njoroge" },
    { id: "renal-doc-2", name: "Dr. Grace Kirubi" },
    { id: "renal-doc-3", name: "Dr. Isaac Otieno" },
  ],
  ophthalmology: [
    { id: "oph-doc-1", name: "Dr. Helen Achieng" },
    { id: "oph-doc-2", name: "Dr. Collins Okoth" },
    { id: "oph-doc-3", name: "Dr. Lydia Wanjira" },
  ],
  ent: [
    { id: "ent-doc-1", name: "Dr. Robert Mwangi" },
    { id: "ent-doc-2", name: "Dr. Sarah Gitau" },
    { id: "ent-doc-3", name: "Dr. Daniel Oduor" },
  ],
  dermatology: [
    { id: "derm-doc-1", name: "Dr. Ann Nyaga" },
    { id: "derm-doc-2", name: "Dr. Richard Otunga" },
    { id: "derm-doc-3", name: "Dr. Miriam Wambui" },
  ],
  "mental-health": [
    { id: "mh-doc-1", name: "Dr. Beatrice Wafula" },
    { id: "mh-doc-2", name: "Dr. Paul Ouma" },
    { id: "mh-doc-3", name: "Dr. Diana Kirimi" },
  ],
  dental: [
    { id: "dent-doc-1", name: "Dr. Samuel Ndegwa" },
    { id: "dent-doc-2", name: "Dr. Grace Odhiambo" },
    { id: "dent-doc-3", name: "Dr. Peter Kimani" },
  ],
  nutrition: [
    { id: "nut-doc-1", name: "Dr. Naomi Wanjiku" },
    { id: "nut-doc-2", name: "Dr. Kelvin Ochieng" },
    { id: "nut-doc-3", name: "Dr. Irene Muthoni" },
  ],
  physiotherapy: [
    { id: "physio-doc-1", name: "Dr. Victor Wekesa" },
    { id: "physio-doc-2", name: "Dr. Faith Muthoni" },
    { id: "physio-doc-3", name: "Dr. Kevin Njenga" },
  ],
}

const APPOINTMENT_TYPES_BY_CLINIC: Record<ClinicKey, string[]> = {
  neurosurgery: [
    "Brain Tumor Follow-up",
    "Spinal Cord Injury Review",
    "Herniated Disc Assessment",
    "Post-op Cranial Wound Check",
    "Neurological Consultation",
    "Imaging Review (MRI/CT)",
  ],
  cardiology: [
    "ECG Monitoring",
    "Echocardiogram Review (Echo)",
    "Heart Failure Clinic Follow-up",
    "Hypertension Medication Review",
    "Palpitations Assessment",
    "Cardiac Risk Counseling",
  ],
  renal: [
    "Haemodialysis Session",
    "CKD Management Review",
    "Dialysis Access Check (Fistula)",
    "Electrolyte Monitoring (Potassium)",
    "Urine Output Review",
    "Anemia in CKD Review",
  ],
  ophthalmology: [
    "Cataract Evaluation",
    "Glaucoma Pressure Check",
    "Diabetic Retinopathy Screening",
    "Retina Treatment Review",
    "Visual Field Assessment",
    "Dry Eye Management",
  ],
  ent: [
    "Chronic Sinusitis Consult",
    "Hearing Loss Audiology",
    "Vertigo & Balance Assessment",
    "Throat Examination (Tonsils/Larynx)",
    "Ear Infection Follow-up",
    "Allergy Rhinitis Review",
  ],
  dermatology: [
    "Eczema Flare Control",
    "Psoriasis Follow-up",
    "Acne & Scar Management",
    "Suspected Drug Eruption Review",
    "Fungal Skin Assessment (Tinea)",
    "Vitiligo Treatment Review",
  ],
  "mental-health": [
    "Depression Counselling Session",
    "Anxiety & Stress Management",
    "Trauma-focused Therapy",
    "Bipolar Mood Review",
    "Substance Use Counselling",
    "Grief Support & Coping",
  ],
  dental: [
    "Dental Abscess Review",
    "Wisdom Tooth Consultation",
    "Gum Disease Staging",
    "Orthodontic Progress Check",
    "Denture Adjustment",
    "Oral Ulcer Evaluation",
  ],
  nutrition: [
    "Diabetes Nutrition Plan",
    "CKD Renal Diet Counselling",
    "Weight Management Session",
    "Pregnancy Nutrition Guidance",
    "Hypertension Nutrition Review",
    "Hyperlipidemia Diet Counseling",
  ],
  physiotherapy: [
    "Stroke Rehab Assessment",
    "Back Pain & Disc Rehab",
    "Knee Osteoarthritis Exercises",
    "Post-op Rehabilitation",
    "Sports Injury Recovery",
    "Shoulder Mobility Program",
  ],
}

const FEE_BY_CLINIC_TYPE: Partial<Record<ClinicKey, Record<string, number>>> = {
  neurosurgery: {
    "Brain Tumor Follow-up": 8500,
    "Spinal Cord Injury Review": 9000,
    "Herniated Disc Assessment": 6500,
    "Post-op Cranial Wound Check": 7000,
    "Neurological Consultation": 8000,
    "Imaging Review (MRI/CT)": 5500,
  },
  cardiology: {
    "ECG Monitoring": 3500,
    "Echocardiogram Review (Echo)": 9000,
    "Heart Failure Clinic Follow-up": 12000,
    "Hypertension Medication Review": 5000,
    "Palpitations Assessment": 4500,
    "Cardiac Risk Counseling": 4000,
  },
  renal: {
    "Haemodialysis Session": 12000,
    "CKD Management Review": 7500,
    "Dialysis Access Check (Fistula)": 4000,
    "Electrolyte Monitoring (Potassium)": 5000,
    "Urine Output Review": 4500,
    "Anemia in CKD Review": 5500,
  },
  ophthalmology: {
    "Cataract Evaluation": 6000,
    "Glaucoma Pressure Check": 4500,
    "Diabetic Retinopathy Screening": 5500,
    "Retina Treatment Review": 12000,
    "Visual Field Assessment": 4000,
    "Dry Eye Management": 3500,
  },
  ent: {
    "Chronic Sinusitis Consult": 4500,
    "Hearing Loss Audiology": 6500,
    "Vertigo & Balance Assessment": 5000,
    "Throat Examination (Tonsils/Larynx)": 5500,
    "Ear Infection Follow-up": 3000,
    "Allergy Rhinitis Review": 3500,
  },
  dermatology: {
    "Eczema Flare Control": 4000,
    "Psoriasis Follow-up": 8000,
    "Acne & Scar Management": 3500,
    "Suspected Drug Eruption Review": 4500,
    "Fungal Skin Assessment (Tinea)": 2500,
    "Vitiligo Treatment Review": 6000,
  },
  "mental-health": {
    "Depression Counselling Session": 3500,
    "Anxiety & Stress Management": 3000,
    "Trauma-focused Therapy": 6000,
    "Bipolar Mood Review": 7000,
    "Substance Use Counselling": 4500,
    "Grief Support & Coping": 2800,
  },
  dental: {
    "Dental Abscess Review": 5000,
    "Wisdom Tooth Consultation": 8000,
    "Gum Disease Staging": 4500,
    "Orthodontic Progress Check": 6500,
    "Denture Adjustment": 5200,
    "Oral Ulcer Evaluation": 3200,
  },
  nutrition: {
    "Diabetes Nutrition Plan": 2500,
    "CKD Renal Diet Counselling": 3500,
    "Weight Management Session": 2200,
    "Pregnancy Nutrition Guidance": 2600,
    "Hypertension Nutrition Review": 2300,
    "Hyperlipidemia Diet Counseling": 2400,
  },
  physiotherapy: {
    "Stroke Rehab Assessment": 5000,
    "Back Pain & Disc Rehab": 4200,
    "Knee Osteoarthritis Exercises": 3800,
    "Post-op Rehabilitation": 5500,
    "Sports Injury Recovery": 4000,
    "Shoulder Mobility Program": 3600,
  },
}

function toYMD(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function addDays(base: Date, offsetDays: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + offsetDays)
  return toYMD(d)
}

function toTimeHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

function formatDate(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`)
  try {
    return date.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return ymd
  }
}

function formatKES(amount: number) {
  try {
    return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(amount)
  } catch {
    return String(amount)
  }
}

function getAppointmentStatusBadgeVariant(status: AppointmentStatus) {
  switch (status) {
    case "Completed":
      return "default"
    case "Cancelled":
      return "destructive"
    case "Scheduled":
    default:
      return "outline"
  }
}

function getPriorityBadgeVariant(priority: AppointmentPriority) {
  if (priority === "Urgent") return "destructive"
  return "secondary"
}

function excerpt(text: string, maxLen = 120) {
  if (text.length <= maxLen) return text
  return `${text.slice(0, Math.max(0, maxLen - 1)).trim()}…`
}

function makeMockData(baseNow: Date) {
  // Keep dates stable for this page load.
  const d = (offsetDays: number) => addDays(baseNow, offsetDays)

  const neurosurgeryPatients: Patient[] = [
    {
      id: "ns-p-1",
      patientNumber: "HN-1017",
      name: "Amina Njeri",
      age: 38,
      diagnosis: "Recurrent meningioma (follow-up MRI review)",
      lastVisitDate: d(-20),
      nextAppointmentDate: d(7),
      status: "Active",
    },
    {
      id: "ns-p-2",
      patientNumber: "HN-1024",
      name: "Brian Otieno",
      age: 45,
      diagnosis: "Spinal cord injury recovery (T12)",
      lastVisitDate: d(-12),
      nextAppointmentDate: d(10),
      status: "Active",
    },
    {
      id: "ns-p-3",
      patientNumber: "HN-1033",
      name: "Wanjiku Muthoni",
      age: 29,
      diagnosis: "Herniated disc with radiculopathy",
      lastVisitDate: d(-18),
      nextAppointmentDate: d(4),
      status: "Active",
    },
    {
      id: "ns-p-4",
      patientNumber: "HN-1041",
      name: "Joseph Kiplagat",
      age: 52,
      diagnosis: "Post-op cranial wound healing review",
      lastVisitDate: d(-28),
      nextAppointmentDate: d(1),
      status: "Discharged",
    },
    {
      id: "ns-p-5",
      patientNumber: "HN-1049",
      name: "Fatuma Adhiambo",
      age: 34,
      diagnosis: "Neurological consultation: seizures follow-up",
      lastVisitDate: d(-9),
      nextAppointmentDate: d(14),
      status: "Active",
    },
    {
      id: "ns-p-6",
      patientNumber: "HN-1056",
      name: "Peter Ngetich",
      age: 61,
      diagnosis: "Imaging review: suspected spinal stenosis",
      lastVisitDate: d(-33),
      nextAppointmentDate: d(21),
      status: "Active",
    },
  ]

  const neurosurgeryAppointments: Appointment[] = [
    {
      id: "ns-a-1",
      clinicKey: "neurosurgery",
      patientId: "ns-p-1",
      patientName: "Amina Njeri",
      doctorId: "ns-doc-1",
      doctorName: "Dr. Samuel Kibet",
      appointmentType: "Brain Tumor Follow-up",
      appointmentDate: d(0),
      appointmentTime: "09:30",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Discuss MRI changes and review headache diary; assess neuro deficits.",
    },
    {
      id: "ns-a-2",
      clinicKey: "neurosurgery",
      patientId: "ns-p-3",
      patientName: "Wanjiku Muthoni",
      doctorId: "ns-doc-2",
      doctorName: "Dr. Catherine Wanjala",
      appointmentType: "Herniated Disc Assessment",
      appointmentDate: d(1),
      appointmentTime: "10:15",
      priority: "Routine",
      status: "Scheduled",
      notes: "Review pain control response; plan physiotherapy and analgesia adjustment.",
    },
    {
      id: "ns-a-3",
      clinicKey: "neurosurgery",
      patientId: "ns-p-2",
      patientName: "Brian Otieno",
      doctorId: "ns-doc-3",
      doctorName: "Dr. Michael Otieno",
      appointmentType: "Spinal Cord Injury Review",
      appointmentDate: d(5),
      appointmentTime: "14:00",
      priority: "Routine",
      status: "Scheduled",
      notes: "Assess wound sites, strength, and bladder training progress.",
    },
    {
      id: "ns-a-4",
      clinicKey: "neurosurgery",
      patientId: "ns-p-4",
      patientName: "Joseph Kiplagat",
      doctorId: "ns-doc-1",
      doctorName: "Dr. Samuel Kibet",
      appointmentType: "Post-op Cranial Wound Check",
      appointmentDate: d(-2),
      appointmentTime: "11:45",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled by patient due to transport constraints; reschedule next week.",
    },
    {
      id: "ns-a-5",
      clinicKey: "neurosurgery",
      patientId: "ns-p-5",
      patientName: "Fatuma Adhiambo",
      doctorId: "ns-doc-2",
      doctorName: "Dr. Catherine Wanjala",
      appointmentType: "Neurological Consultation",
      appointmentDate: d(-7),
      appointmentTime: "08:50",
      priority: "Routine",
      status: "Completed",
      notes: "Reviewed seizure frequency; adjusted dose with safety counselling.",
    },
    {
      id: "ns-a-6",
      clinicKey: "neurosurgery",
      patientId: "ns-p-6",
      patientName: "Peter Ngetich",
      doctorId: "ns-doc-3",
      doctorName: "Dr. Michael Otieno",
      appointmentType: "Imaging Review (MRI/CT)",
      appointmentDate: d(3),
      appointmentTime: "13:20",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Explain imaging findings and plan next steps for suspected stenosis.",
    },
  ]

  const neurosurgeryNotes: ClinicalNote[] = [
    {
      id: "ns-n-1",
      clinicKey: "neurosurgery",
      patientId: "ns-p-1",
      patientName: "Amina Njeri",
      date: d(-2),
      doctorName: "Dr. Samuel Kibet",
      fullText:
        "Clinical review: Amina reports intermittent headaches with morning worsening. Neurologic exam shows no new focal deficits. MRI reviewed in detail; suspected progression appears limited, no urgent mass effect noted. Plan: continue current regimen, start gradual steroid taper, and schedule repeat imaging in 8 weeks. Provide return precautions for worsening headache, vomiting, or weakness.",
    },
    {
      id: "ns-n-2",
      clinicKey: "neurosurgery",
      patientId: "ns-p-2",
      patientName: "Brian Otieno",
      date: d(-9),
      doctorName: "Dr. Michael Otieno",
      fullText:
        "Spinal cord injury follow-up: wound sites healed; no signs of infection. Strength improving with assisted standing. Bladder training ongoing with reduced incontinence episodes. Plan: continue physiotherapy, reinforce catheter schedule, and check full blood count for rehabilitation tolerance. Next review after dialysis of rehab schedule.",
    },
    {
      id: "ns-n-3",
      clinicKey: "neurosurgery",
      patientId: "ns-p-3",
      patientName: "Wanjiku Muthoni",
      date: d(-6),
      doctorName: "Dr. Catherine Wanjala",
      fullText:
        "Herniated disc assessment: persistent radiating pain to left thigh improved with analgesia but still bothers daily activities. Straight-leg raise positive on the left at 40 degrees. Plan: adjust analgesics, initiate core strengthening program, and repeat neurologic screening in 2 weeks. Consider repeat imaging if worsening numbness occurs.",
    },
    {
      id: "ns-n-4",
      clinicKey: "neurosurgery",
      patientId: "ns-p-4",
      patientName: "Joseph Kiplagat",
      date: d(-26),
      doctorName: "Dr. Samuel Kibet",
      fullText:
        "Post-op wound review: incision clean, dry and intact with minimal scar tissue. No fever or discharge. Patient educated on wound care and activity restriction. Discharge criteria reviewed; follow-up only if new symptoms emerge.",
    },
    {
      id: "ns-n-5",
      clinicKey: "neurosurgery",
      patientId: "ns-p-5",
      patientName: "Fatuma Adhiambo",
      date: d(-7),
      doctorName: "Dr. Catherine Wanjala",
      fullText:
        "Seizure follow-up: no major seizures since last review. Mild dizziness reported after medication change. Safety counselling given; discuss adherence and trigger avoidance. Plan: monitor side effects, maintain updated seizure diary, and follow up in 6 weeks.",
    },
    {
      id: "ns-n-6",
      clinicKey: "neurosurgery",
      patientId: "ns-p-6",
      patientName: "Peter Ngetich",
      date: d(-14),
      doctorName: "Dr. Michael Otieno",
      fullText:
        "Imaging interpretation: suspected lumbar spinal stenosis correlates with pain pattern and reduced walking distance. No red-flag bowel/bladder symptoms. Plan: conservative management with physiotherapy and scheduled follow-up; escalate if neurologic deterioration occurs.",
    },
  ]

  const cardiologyPatients: Patient[] = [
    {
      id: "card-p-1",
      patientNumber: "HK-2008",
      name: "Grace Wambui",
      age: 57,
      diagnosis: "Hypertension (Stage 2) with LVH on ECG",
      lastVisitDate: d(-21),
      nextAppointmentDate: d(6),
      status: "Active",
    },
    {
      id: "card-p-2",
      patientNumber: "HK-2014",
      name: "Musa Hassan",
      age: 48,
      diagnosis: "Chronic heart failure (NYHA II) review",
      lastVisitDate: d(-10),
      nextAppointmentDate: d(2),
      status: "Active",
    },
    {
      id: "card-p-3",
      patientNumber: "HK-2021",
      name: "Esther Achieng",
      age: 36,
      diagnosis: "Palpitations - ECG monitoring & follow-up",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(9),
      status: "Active",
    },
    {
      id: "card-p-4",
      patientNumber: "HK-2030",
      name: "Patrick Ochieng",
      age: 63,
      diagnosis: "Ischemic heart disease follow-up (risk modification)",
      lastVisitDate: d(-30),
      nextAppointmentDate: d(16),
      status: "Discharged",
    },
    {
      id: "card-p-5",
      patientNumber: "HK-2036",
      name: "Asha Ndirangu",
      age: 25,
      diagnosis: "Cardiac risk assessment & counselling (family history)",
      lastVisitDate: d(-15),
      nextAppointmentDate: d(3),
      status: "Active",
    },
    {
      id: "card-p-6",
      patientNumber: "HK-2042",
      name: "Daniel Kimani",
      age: 40,
      diagnosis: "ECG abnormality - repeat monitoring",
      lastVisitDate: d(-5),
      nextAppointmentDate: d(8),
      status: "Active",
    },
  ]

  const cardiologyAppointments: Appointment[] = [
    {
      id: "card-a-1",
      clinicKey: "cardiology",
      patientId: "card-p-2",
      patientName: "Musa Hassan",
      doctorId: "card-doc-3",
      doctorName: "Dr. Francis Odhiambo",
      appointmentType: "Heart Failure Clinic Follow-up",
      appointmentDate: d(0),
      appointmentTime: "09:10",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Review weight gain, adjust diuretics, and check symptoms of breathlessness.",
    },
    {
      id: "card-a-2",
      clinicKey: "cardiology",
      patientId: "card-p-1",
      patientName: "Grace Wambui",
      doctorId: "card-doc-1",
      doctorName: "Dr. James Mwaura",
      appointmentType: "Hypertension Medication Review",
      appointmentDate: d(1),
      appointmentTime: "10:40",
      priority: "Routine",
      status: "Scheduled",
      notes: "BP log review; reinforce low-salt diet and adherence to medication.",
    },
    {
      id: "card-a-3",
      clinicKey: "cardiology",
      patientId: "card-p-3",
      patientName: "Esther Achieng",
      doctorId: "card-doc-2",
      doctorName: "Dr. Beatrice Njeri",
      appointmentType: "ECG Monitoring",
      appointmentDate: d(5),
      appointmentTime: "14:10",
      priority: "Routine",
      status: "Scheduled",
      notes: "Holter results review; evaluate for ectopy and patient triggers.",
    },
    {
      id: "card-a-4",
      clinicKey: "cardiology",
      patientId: "card-p-4",
      patientName: "Patrick Ochieng",
      doctorId: "card-doc-1",
      doctorName: "Dr. James Mwaura",
      appointmentType: "Cardiac Risk Counseling",
      appointmentDate: d(-2),
      appointmentTime: "12:05",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - patient attended outside facility for follow-up.",
    },
    {
      id: "card-a-5",
      clinicKey: "cardiology",
      patientId: "card-p-6",
      patientName: "Daniel Kimani",
      doctorId: "card-doc-2",
      doctorName: "Dr. Beatrice Njeri",
      appointmentType: "Echocardiogram Review (Echo)",
      appointmentDate: d(-7),
      appointmentTime: "08:30",
      priority: "Routine",
      status: "Completed",
      notes: "Echo reviewed showing normal ejection fraction; reassured and scheduled routine monitoring.",
    },
    {
      id: "card-a-6",
      clinicKey: "cardiology",
      patientId: "card-p-5",
      patientName: "Asha Ndirangu",
      doctorId: "card-doc-3",
      doctorName: "Dr. Francis Odhiambo",
      appointmentType: "Palpitations Assessment",
      appointmentDate: d(3),
      appointmentTime: "13:05",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Assess episodic chest discomfort; plan event monitoring if symptoms persist.",
    },
  ]

  const cardiologyNotes: ClinicalNote[] = [
    {
      id: "card-n-1",
      clinicKey: "cardiology",
      patientId: "card-p-2",
      patientName: "Musa Hassan",
      date: d(-1),
      doctorName: "Dr. Francis Odhiambo",
      fullText:
        "Heart failure follow-up: Musa reports improved cough but still experiences exertional shortness of breath. Exam shows mild pedal edema; lungs with basal crackles. Reviewed medication adherence and salt intake. Plan: increase dose of loop diuretic for 3 days, reinforce daily weight monitoring, and schedule repeat electrolytes.",
    },
    {
      id: "card-n-2",
      clinicKey: "cardiology",
      patientId: "card-p-1",
      patientName: "Grace Wambui",
      date: d(-12),
      doctorName: "Dr. James Mwaura",
      fullText:
        "Hypertension review: home BP readings remain above target on some days. No chest pain or neurological symptoms. Plan: adjust regimen and provide counselling on diet, exercise, and medication timing. Follow up in 2 weeks with BP log.",
    },
    {
      id: "card-n-3",
      clinicKey: "cardiology",
      patientId: "card-p-3",
      patientName: "Esther Achieng",
      date: d(-9),
      doctorName: "Dr. Beatrice Njeri",
      fullText:
        "ECG monitoring: Holter showed occasional premature atrial complexes without sustained arrhythmia. Symptoms correlate with stress and caffeine intake. Plan: lifestyle counselling, consider beta-blocker if symptoms worsen, and repeat ECG if new red flags occur.",
    },
    {
      id: "card-n-4",
      clinicKey: "cardiology",
      patientId: "card-p-6",
      patientName: "Daniel Kimani",
      date: d(-7),
      doctorName: "Dr. Beatrice Njeri",
      fullText:
        "Echocardiogram result review: structure and function within expected ranges. No significant valvular disease. Patient counselled on cardiovascular risk reduction and encouraged adherence to medications and follow-up schedule.",
    },
    {
      id: "card-n-5",
      clinicKey: "cardiology",
      patientId: "card-p-5",
      patientName: "Asha Ndirangu",
      date: d(-4),
      doctorName: "Dr. Francis Odhiambo",
      fullText:
        "Palpitations assessment: episodes last 1–3 minutes and resolve spontaneously. No syncope or persistent dizziness. Plan: symptomatic diary, avoid stimulants, and consider event monitor if frequency increases. Provide safety advice for emergency symptoms.",
    },
    {
      id: "card-n-6",
      clinicKey: "cardiology",
      patientId: "card-p-4",
      patientName: "Patrick Ochieng",
      date: d(-28),
      doctorName: "Dr. James Mwaura",
      fullText:
        "Risk counselling: patient educated on medication adherence and lifestyle modifications. Discussed importance of lipid control and regular follow-up. Patient opted to continue care closer to home; advised to return if symptoms recur.",
    },
  ]

  const renalPatients: Patient[] = [
    {
      id: "renal-p-1",
      patientNumber: "RN-3001",
      name: "Naomi Wanjira",
      age: 49,
      diagnosis: "CKD stage 5 (haemodialysis ongoing)",
      lastVisitDate: d(-15),
      nextAppointmentDate: d(2),
      status: "Active",
    },
    {
      id: "renal-p-2",
      patientNumber: "RN-3008",
      name: "Josephine Otieno",
      age: 34,
      diagnosis: "Haemodialysis sessions - access and adequacy review",
      lastVisitDate: d(-10),
      nextAppointmentDate: d(0),
      status: "Active",
    },
    {
      id: "renal-p-3",
      patientNumber: "RN-3015",
      name: "Khalid Mohamed",
      age: 52,
      diagnosis: "Hypertension nephropathy with electrolyte monitoring",
      lastVisitDate: d(-20),
      nextAppointmentDate: d(6),
      status: "Active",
    },
    {
      id: "renal-p-4",
      patientNumber: "RN-3022",
      name: "Ruth Aketch",
      age: 61,
      diagnosis: "Diabetic kidney disease (anemia management)",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(9),
      status: "Active",
    },
    {
      id: "renal-p-5",
      patientNumber: "RN-3030",
      name: "Samson Karanja",
      age: 27,
      diagnosis: "Post-AKI review with urine output tracking",
      lastVisitDate: d(-25),
      nextAppointmentDate: d(12),
      status: "Active",
    },
    {
      id: "renal-p-6",
      patientNumber: "RN-3037",
      name: "Irene Muthoni",
      age: 44,
      diagnosis: "Chronic glomerulonephritis (dialysis planning)",
      lastVisitDate: d(-13),
      nextAppointmentDate: d(3),
      status: "Discharged",
    },
  ]

  const renalAppointments: Appointment[] = [
    {
      id: "renal-a-1",
      clinicKey: "renal",
      patientId: "renal-p-2",
      patientName: "Josephine Otieno",
      doctorId: "renal-doc-2",
      doctorName: "Dr. Grace Kirubi",
      appointmentType: "Haemodialysis Session",
      appointmentDate: d(0),
      appointmentTime: "07:30",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Check access patency; start session with target ultrafiltration per plan.",
    },
    {
      id: "renal-a-2",
      clinicKey: "renal",
      patientId: "renal-p-1",
      patientName: "Naomi Wanjira",
      doctorId: "renal-doc-1",
      doctorName: "Dr. Peter Njoroge",
      appointmentType: "CKD Management Review",
      appointmentDate: d(1),
      appointmentTime: "09:15",
      priority: "Routine",
      status: "Scheduled",
      notes: "Review urea, creatinine trend and adjust CKD medications.",
    },
    {
      id: "renal-a-3",
      clinicKey: "renal",
      patientId: "renal-p-3",
      patientName: "Khalid Mohamed",
      doctorId: "renal-doc-3",
      doctorName: "Dr. Isaac Otieno",
      appointmentType: "Electrolyte Monitoring (Potassium)",
      appointmentDate: d(5),
      appointmentTime: "13:50",
      priority: "Routine",
      status: "Scheduled",
      notes: "Review K+ levels and counsel on dietary restriction.",
    },
    {
      id: "renal-a-4",
      clinicKey: "renal",
      patientId: "renal-p-6",
      patientName: "Irene Muthoni",
      doctorId: "renal-doc-1",
      doctorName: "Dr. Peter Njoroge",
      appointmentType: "Dialysis Access Check (Fistula)",
      appointmentDate: d(-2),
      appointmentTime: "11:10",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - fistula assessment done elsewhere; documentation requested.",
    },
    {
      id: "renal-a-5",
      clinicKey: "renal",
      patientId: "renal-p-4",
      patientName: "Ruth Aketch",
      doctorId: "renal-doc-2",
      doctorName: "Dr. Grace Kirubi",
      appointmentType: "Anemia in CKD Review",
      appointmentDate: d(-7),
      appointmentTime: "08:20",
      priority: "Routine",
      status: "Completed",
      notes: "Erythropoietin response reviewed; iron studies considered for next cycle.",
    },
    {
      id: "renal-a-6",
      clinicKey: "renal",
      patientId: "renal-p-5",
      patientName: "Samson Karanja",
      doctorId: "renal-doc-3",
      doctorName: "Dr. Isaac Otieno",
      appointmentType: "Urine Output Review",
      appointmentDate: d(3),
      appointmentTime: "14:35",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Track urine output, assess recovery, and plan next labs.",
    },
  ]

  const renalNotes: ClinicalNote[] = [
    {
      id: "renal-n-1",
      clinicKey: "renal",
      patientId: "renal-p-2",
      patientName: "Josephine Otieno",
      date: d(-1),
      doctorName: "Dr. Grace Kirubi",
      fullText:
        "Dialysis session note: Josephine arrived stable with no fever. Access site showed mild tenderness but good thrill and bruit. Pre-dialysis labs reviewed; potassium slightly elevated. Plan: cautious ultrafiltration, potassium recheck post-session, reinforce fluid restriction and medications schedule.",
    },
    {
      id: "renal-n-2",
      clinicKey: "renal",
      patientId: "renal-p-1",
      patientName: "Naomi Wanjira",
      date: d(-12),
      doctorName: "Dr. Peter Njoroge",
      fullText:
        "CKD management review: adherence good. Discussed phosphorus binders and dietary phosphate control. Patient reports improved energy after last anemia management. Plan: continue medications, repeat renal profile, and schedule follow-up in 4 weeks.",
    },
    {
      id: "renal-n-3",
      clinicKey: "renal",
      patientId: "renal-p-3",
      patientName: "Khalid Mohamed",
      date: d(-10),
      doctorName: "Dr. Isaac Otieno",
      fullText:
        "Electrolyte monitoring: K+ trend trending upward; advised low-potassium foods. No palpitations or weakness reported. Plan: repeat electrolytes next visit, evaluate for medication contributors, and consider adjustment if persistently high.",
    },
    {
      id: "renal-n-4",
      clinicKey: "renal",
      patientId: "renal-p-4",
      patientName: "Ruth Aketch",
      date: d(-7),
      doctorName: "Dr. Grace Kirubi",
      fullText:
        "Anemia review: fatigue improved after recent cycle. Hemoglobin response adequate; iron stores to be rechecked. Plan: continue erythropoietin per protocol and schedule follow-up labs to guide dosing.",
    },
    {
      id: "renal-n-5",
      clinicKey: "renal",
      patientId: "renal-p-5",
      patientName: "Samson Karanja",
      date: d(-19),
      doctorName: "Dr. Isaac Otieno",
      fullText:
        "Urine output review after AKI: patient reports increased urination volume, with stable blood pressure. No edema noted. Plan: monitor creatinine, counsel on hydration within fluid limits, and re-assess in 3–4 weeks.",
    },
    {
      id: "renal-n-6",
      clinicKey: "renal",
      patientId: "renal-p-6",
      patientName: "Irene Muthoni",
      date: d(-13),
      doctorName: "Dr. Peter Njoroge",
      fullText:
        "Dialysis planning: Irene reports ongoing symptoms but stable. Access history reviewed; planned fistula assessment. Patient attended outside facility for access check; will continue follow-up at HMIS as records become available.",
    },
  ]

  const ophthalmologyPatients: Patient[] = [
    {
      id: "oph-p-1",
      patientNumber: "OPH-4001",
      name: "Maryline Chebet",
      age: 46,
      diagnosis: "Age-related cataract (visual impairment)",
      lastVisitDate: d(-22),
      nextAppointmentDate: d(4),
      status: "Active",
    },
    {
      id: "oph-p-2",
      patientNumber: "OPH-4010",
      name: "David Mwangi",
      age: 59,
      diagnosis: "Glaucoma suspect - pressure monitoring",
      lastVisitDate: d(-9),
      nextAppointmentDate: d(0),
      status: "Active",
    },
    {
      id: "oph-p-3",
      patientNumber: "OPH-4020",
      name: "Salome Awuor",
      age: 33,
      diagnosis: "Diabetic retinopathy screening",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(7),
      status: "Active",
    },
    {
      id: "oph-p-4",
      patientNumber: "OPH-4027",
      name: "Ahmed Ali",
      age: 62,
      diagnosis: "Chronic anterior uveitis follow-up",
      lastVisitDate: d(-27),
      nextAppointmentDate: d(14),
      status: "Active",
    },
    {
      id: "oph-p-5",
      patientNumber: "OPH-4033",
      name: "Monica Wanjiku",
      age: 28,
      diagnosis: "Refractive error and dry eye symptoms",
      lastVisitDate: d(-5),
      nextAppointmentDate: d(10),
      status: "Active",
    },
    {
      id: "oph-p-6",
      patientNumber: "OPH-4040",
      name: "Charles Ouma",
      age: 40,
      diagnosis: "Ocular injury follow-up (healing assessment)",
      lastVisitDate: d(-16),
      nextAppointmentDate: d(6),
      status: "Discharged",
    },
  ]

  const ophthalmologyAppointments: Appointment[] = [
    {
      id: "oph-a-1",
      clinicKey: "ophthalmology",
      patientId: "oph-p-2",
      patientName: "David Mwangi",
      doctorId: "oph-doc-2",
      doctorName: "Dr. Collins Okoth",
      appointmentType: "Glaucoma Pressure Check",
      appointmentDate: d(0),
      appointmentTime: "08:45",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Check IOP, review drops adherence, perform optic nerve assessment.",
    },
    {
      id: "oph-a-2",
      clinicKey: "ophthalmology",
      patientId: "oph-p-1",
      patientName: "Maryline Chebet",
      doctorId: "oph-doc-1",
      doctorName: "Dr. Helen Achieng",
      appointmentType: "Cataract Evaluation",
      appointmentDate: d(1),
      appointmentTime: "11:25",
      priority: "Routine",
      status: "Scheduled",
      notes: "Vision assessment and planning for cataract surgery candidacy.",
    },
    {
      id: "oph-a-3",
      clinicKey: "ophthalmology",
      patientId: "oph-p-3",
      patientName: "Salome Awuor",
      doctorId: "oph-doc-3",
      doctorName: "Dr. Lydia Wanjira",
      appointmentType: "Diabetic Retinopathy Screening",
      appointmentDate: d(5),
      appointmentTime: "14:20",
      priority: "Routine",
      status: "Scheduled",
      notes: "Dilated fundus examination and retina documentation.",
    },
    {
      id: "oph-a-4",
      clinicKey: "ophthalmology",
      patientId: "oph-p-6",
      patientName: "Charles Ouma",
      doctorId: "oph-doc-1",
      doctorName: "Dr. Helen Achieng",
      appointmentType: "Visual Field Assessment",
      appointmentDate: d(-2),
      appointmentTime: "10:00",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - patient rescheduled due to eye drops availability.",
    },
    {
      id: "oph-a-5",
      clinicKey: "ophthalmology",
      patientId: "oph-p-4",
      patientName: "Ahmed Ali",
      doctorId: "oph-doc-2",
      doctorName: "Dr. Collins Okoth",
      appointmentType: "Retina Treatment Review",
      appointmentDate: d(-7),
      appointmentTime: "09:05",
      priority: "Routine",
      status: "Completed",
      notes: "Review inflammation response; taper drops and advise monitoring.",
    },
    {
      id: "oph-a-6",
      clinicKey: "ophthalmology",
      patientId: "oph-p-5",
      patientName: "Monica Wanjiku",
      doctorId: "oph-doc-3",
      doctorName: "Dr. Lydia Wanjira",
      appointmentType: "Dry Eye Management",
      appointmentDate: d(3),
      appointmentTime: "13:15",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Assess tear film and improve adherence to lid hygiene; prescribe lubricants.",
    },
  ]

  const ophthalmologyNotes: ClinicalNote[] = [
    {
      id: "oph-n-1",
      clinicKey: "ophthalmology",
      patientId: "oph-p-2",
      patientName: "David Mwangi",
      date: d(-1),
      doctorName: "Dr. Collins Okoth",
      fullText:
        "IOP monitoring note: patient reports occasional blurred vision after drops; no pain. Prior IOP readings mildly elevated. Plan: reinforce drop schedule, check adherence technique, and perform optic nerve/OCT if available. Provide follow-up for any sudden vision changes.",
    },
    {
      id: "oph-n-2",
      clinicKey: "ophthalmology",
      patientId: "oph-p-1",
      patientName: "Maryline Chebet",
      date: d(-18),
      doctorName: "Dr. Helen Achieng",
      fullText:
        "Cataract evaluation: progressive difficulty with night vision and glare. BCVA reduced; cataract grade reviewed. Plan: discuss surgery benefits, expected recovery timeline, and pre-op tests. Schedule for biometry and counseling session.",
    },
    {
      id: "oph-n-3",
      clinicKey: "ophthalmology",
      patientId: "oph-p-3",
      patientName: "Salome Awuor",
      date: d(-8),
      doctorName: "Dr. Lydia Wanjira",
      fullText:
        "Diabetic retinopathy screening: no active macular edema noted. Microaneurysms present with mild non-proliferative changes. Plan: optimize glycemic control with care team and repeat screening in 6 months. Educate on warning signs.",
    },
    {
      id: "oph-n-4",
      clinicKey: "ophthalmology",
      patientId: "oph-p-4",
      patientName: "Ahmed Ali",
      date: d(-7),
      doctorName: "Dr. Collins Okoth",
      fullText:
        "Uveitis follow-up: inflammation improved compared to prior visit; no hypopyon. Plan: continue taper under supervision and advise prompt review for redness, photophobia, or pain.",
    },
    {
      id: "oph-n-5",
      clinicKey: "ophthalmology",
      patientId: "oph-p-5",
      patientName: "Monica Wanjiku",
      date: d(-5),
      doctorName: "Dr. Lydia Wanjira",
      fullText:
        "Dry eye management: patient reports burning and intermittent tearing, worse with phone use. Exam suggests evaporative dry eye. Plan: recommend warm compresses, lid hygiene, and lubricating drops. Review again in 2 weeks.",
    },
    {
      id: "oph-n-6",
      clinicKey: "ophthalmology",
      patientId: "oph-p-6",
      patientName: "Charles Ouma",
      date: d(-14),
      doctorName: "Dr. Helen Achieng",
      fullText:
        "Ocular injury note: healing progressing well with no persistent foreign body symptoms. Vision stability improving. Plan: finalize rehabilitation exercises and discharge if symptoms remain resolved.",
    },
  ]

  const entPatients: Patient[] = [
    {
      id: "ent-p-1",
      patientNumber: "ENT-5002",
      name: "Pauline Njeri",
      age: 22,
      diagnosis: "Chronic sinusitis with intermittent headaches",
      lastVisitDate: d(-19),
      nextAppointmentDate: d(6),
      status: "Active",
    },
    {
      id: "ent-p-2",
      patientNumber: "ENT-5010",
      name: "Reuben Nderitu",
      age: 35,
      diagnosis: "Recurrent tonsillitis - throat examination review",
      lastVisitDate: d(-11),
      nextAppointmentDate: d(0),
      status: "Active",
    },
    {
      id: "ent-p-3",
      patientNumber: "ENT-5017",
      name: "Jane Wanjiku",
      age: 47,
      diagnosis: "Age-related hearing loss - audiology assessment",
      lastVisitDate: d(-26),
      nextAppointmentDate: d(9),
      status: "Active",
    },
    {
      id: "ent-p-4",
      patientNumber: "ENT-5024",
      name: "Elvis Otieno",
      age: 30,
      diagnosis: "Vertigo & balance assessment (possible BPPV)",
      lastVisitDate: d(-15),
      nextAppointmentDate: d(3),
      status: "Active",
    },
    {
      id: "ent-p-5",
      patientNumber: "ENT-5031",
      name: "Mercy Akinyi",
      age: 19,
      diagnosis: "Allergic rhinitis with nasal congestion",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(12),
      status: "Active",
    },
    {
      id: "ent-p-6",
      patientNumber: "ENT-5039",
      name: "George Kirimi",
      age: 54,
      diagnosis: "Laryngeal polyp surveillance (ENT throat check)",
      lastVisitDate: d(-31),
      nextAppointmentDate: d(16),
      status: "Discharged",
    },
  ]

  const entAppointments: Appointment[] = [
    {
      id: "ent-a-1",
      clinicKey: "ent",
      patientId: "ent-p-2",
      patientName: "Reuben Nderitu",
      doctorId: "ent-doc-1",
      doctorName: "Dr. Robert Mwangi",
      appointmentType: "Throat Examination (Tonsils/Larynx)",
      appointmentDate: d(0),
      appointmentTime: "09:20",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Assess recurring sore throat; check for chronic tonsillar hypertrophy.",
    },
    {
      id: "ent-a-2",
      clinicKey: "ent",
      patientId: "ent-p-1",
      patientName: "Pauline Njeri",
      doctorId: "ent-doc-2",
      doctorName: "Dr. Sarah Gitau",
      appointmentType: "Chronic Sinusitis Consult",
      appointmentDate: d(1),
      appointmentTime: "10:05",
      priority: "Routine",
      status: "Scheduled",
      notes: "Review response to nasal saline; consider guideline-based steroid spray.",
    },
    {
      id: "ent-a-3",
      clinicKey: "ent",
      patientId: "ent-p-4",
      patientName: "Elvis Otieno",
      doctorId: "ent-doc-3",
      doctorName: "Dr. Daniel Oduor",
      appointmentType: "Vertigo & Balance Assessment",
      appointmentDate: d(5),
      appointmentTime: "13:45",
      priority: "Routine",
      status: "Scheduled",
      notes: "Dix-Hallpike exam and plan canalith repositioning if indicated.",
    },
    {
      id: "ent-a-4",
      clinicKey: "ent",
      patientId: "ent-p-6",
      patientName: "George Kirimi",
      doctorId: "ent-doc-1",
      doctorName: "Dr. Robert Mwangi",
      appointmentType: "Ear Infection Follow-up",
      appointmentDate: d(-2),
      appointmentTime: "11:20",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - patient infection settled; return if symptoms return.",
    },
    {
      id: "ent-a-5",
      clinicKey: "ent",
      patientId: "ent-p-3",
      patientName: "Jane Wanjiku",
      doctorId: "ent-doc-2",
      doctorName: "Dr. Sarah Gitau",
      appointmentType: "Hearing Loss Audiology",
      appointmentDate: d(-7),
      appointmentTime: "08:15",
      priority: "Routine",
      status: "Completed",
      notes: "Audiology performed; discussed hearing aid options and follow-up.",
    },
    {
      id: "ent-a-6",
      clinicKey: "ent",
      patientId: "ent-p-5",
      patientName: "Mercy Akinyi",
      doctorId: "ent-doc-3",
      doctorName: "Dr. Daniel Oduor",
      appointmentType: "Allergy Rhinitis Review",
      appointmentDate: d(3),
      appointmentTime: "14:10",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Review ongoing congestion; optimize antihistamine regimen.",
    },
  ]

  const entNotes: ClinicalNote[] = [
    {
      id: "ent-n-1",
      clinicKey: "ent",
      patientId: "ent-p-2",
      patientName: "Reuben Nderitu",
      date: d(-1),
      doctorName: "Dr. Robert Mwangi",
      fullText:
        "Throat examination: patient has history of recurrent tonsillitis with episodes of fever. Current visit: mild tonsillar enlargement, no airway compromise. Plan: advise symptomatic treatment and hygiene; schedule ENT follow-up for further evaluation. Educate on red flags requiring urgent review.",
    },
    {
      id: "ent-n-2",
      clinicKey: "ent",
      patientId: "ent-p-1",
      patientName: "Pauline Njeri",
      date: d(-18),
      doctorName: "Dr. Sarah Gitau",
      fullText:
        "Sinusitis consult: persistent nasal congestion and facial pressure. Reviewed triggers and adherence to saline irrigation. Plan: start intranasal steroid, continue saline, and consider imaging if no improvement in 4 weeks.",
    },
    {
      id: "ent-n-3",
      clinicKey: "ent",
      patientId: "ent-p-4",
      patientName: "Elvis Otieno",
      date: d(-15),
      doctorName: "Dr. Daniel Oduor",
      fullText:
        "Vertigo assessment: episodic spinning sensation with head movement. No neurological deficits on screening. Plan: perform Dix-Hallpike during visit and treat with repositioning exercises. Follow up for symptom response.",
    },
    {
      id: "ent-n-4",
      clinicKey: "ent",
      patientId: "ent-p-3",
      patientName: "Jane Wanjiku",
      date: d(-7),
      doctorName: "Dr. Sarah Gitau",
      fullText:
        "Hearing loss audiology review: audiogram indicates age-related sensorineural hearing reduction. Counselling provided; recommended hearing aid trial and speech clarity tips.",
    },
    {
      id: "ent-n-5",
      clinicKey: "ent",
      patientId: "ent-p-5",
      patientName: "Mercy Akinyi",
      date: d(-8),
      doctorName: "Dr. Daniel Oduor",
      fullText:
        "Allergic rhinitis management: symptoms improved but remain during high dust exposure. Plan: optimize antihistamine and encourage dust control; consider nasal steroid if persistent.",
    },
    {
      id: "ent-n-6",
      clinicKey: "ent",
      patientId: "ent-p-6",
      patientName: "George Kirimi",
      date: d(-31),
      doctorName: "Dr. Robert Mwangi",
      fullText:
        "Laryngeal surveillance note: follow-up completed previously with no concerning change. Ear infection now resolved. Plan: patient discharged with instructions to return if symptoms recur.",
    },
  ]

  const dermatologyPatients: Patient[] = [
    {
      id: "derm-p-1",
      patientNumber: "DER-6001",
      name: "Zawadi Otieno",
      age: 28,
      diagnosis: "Atopic eczema - flare control and itch management",
      lastVisitDate: d(-16),
      nextAppointmentDate: d(3),
      status: "Active",
    },
    {
      id: "derm-p-2",
      patientNumber: "DER-6010",
      name: "Isaac Langat",
      age: 41,
      diagnosis: "Plaque psoriasis - follow-up for response",
      lastVisitDate: d(-10),
      nextAppointmentDate: d(8),
      status: "Active",
    },
    {
      id: "derm-p-3",
      patientNumber: "DER-6021",
      name: "Ruth Wanjiru",
      age: 35,
      diagnosis: "Acne & scar management (post-treatment)",
      lastVisitDate: d(-6),
      nextAppointmentDate: d(1),
      status: "Active",
    },
    {
      id: "derm-p-4",
      patientNumber: "DER-6030",
      name: "Naomi Chepkirui",
      age: 23,
      diagnosis: "Suspected drug eruption - review of rash resolution",
      lastVisitDate: d(-22),
      nextAppointmentDate: d(12),
      status: "Active",
    },
    {
      id: "derm-p-5",
      patientNumber: "DER-6036",
      name: "Victor Mungai",
      age: 58,
      diagnosis: "Tinea corporis / fungal skin assessment",
      lastVisitDate: d(-14),
      nextAppointmentDate: d(5),
      status: "Active",
    },
    {
      id: "derm-p-6",
      patientNumber: "DER-6044",
      name: "Tatu Kilonzo",
      age: 46,
      diagnosis: "Vitiligo treatment review and skin care plan",
      lastVisitDate: d(-9),
      nextAppointmentDate: d(0),
      status: "Active",
    },
  ]

  const dermatologyAppointments: Appointment[] = [
    {
      id: "derm-a-1",
      clinicKey: "dermatology",
      patientId: "derm-p-6",
      patientName: "Tatu Kilonzo",
      doctorId: "derm-doc-1",
      doctorName: "Dr. Ann Nyaga",
      appointmentType: "Vitiligo Treatment Review",
      appointmentDate: d(0),
      appointmentTime: "10:10",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Review response to topical regimen; discuss sun protection and progression.",
    },
    {
      id: "derm-a-2",
      clinicKey: "dermatology",
      patientId: "derm-p-3",
      patientName: "Ruth Wanjiru",
      doctorId: "derm-doc-2",
      doctorName: "Dr. Richard Otunga",
      appointmentType: "Acne & Scar Management",
      appointmentDate: d(1),
      appointmentTime: "09:40",
      priority: "Routine",
      status: "Scheduled",
      notes: "Assess inflammation; continue skin care and evaluate scarring progress.",
    },
    {
      id: "derm-a-3",
      clinicKey: "dermatology",
      patientId: "derm-p-2",
      patientName: "Isaac Langat",
      doctorId: "derm-doc-3",
      doctorName: "Dr. Miriam Wambui",
      appointmentType: "Psoriasis Follow-up",
      appointmentDate: d(5),
      appointmentTime: "14:25",
      priority: "Routine",
      status: "Scheduled",
      notes: "Evaluate plaque response and check for adverse effects of current therapy.",
    },
    {
      id: "derm-a-4",
      clinicKey: "dermatology",
      patientId: "derm-p-4",
      patientName: "Naomi Chepkirui",
      doctorId: "derm-doc-1",
      doctorName: "Dr. Ann Nyaga",
      appointmentType: "Suspected Drug Eruption Review",
      appointmentDate: d(-2),
      appointmentTime: "11:15",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - rash resolved fully; follow-up only if recurrence.",
    },
    {
      id: "derm-a-5",
      clinicKey: "dermatology",
      patientId: "derm-p-5",
      patientName: "Victor Mungai",
      doctorId: "derm-doc-2",
      doctorName: "Dr. Richard Otunga",
      appointmentType: "Fungal Skin Assessment (Tinea)",
      appointmentDate: d(-7),
      appointmentTime: "08:40",
      priority: "Routine",
      status: "Completed",
      notes: "Improved lesions after antifungal; continue maintenance topical until clear.",
    },
    {
      id: "derm-a-6",
      clinicKey: "dermatology",
      patientId: "derm-p-1",
      patientName: "Zawadi Otieno",
      doctorId: "derm-doc-3",
      doctorName: "Dr. Miriam Wambui",
      appointmentType: "Eczema Flare Control",
      appointmentDate: d(3),
      appointmentTime: "13:00",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Severe itch; review emollient use and consider step-up topical corticosteroid.",
    },
  ]

  const dermatologyNotes: ClinicalNote[] = [
    {
      id: "derm-n-1",
      clinicKey: "dermatology",
      patientId: "derm-p-6",
      patientName: "Tatu Kilonzo",
      date: d(-1),
      doctorName: "Dr. Ann Nyaga",
      fullText:
        "Vitiligo review: patient notes slight repigmentation on small areas. Skin remains sensitive to sun exposure. Plan: emphasize consistent sunblock, continue topical regimen, and consider phototherapy scheduling if available.",
    },
    {
      id: "derm-n-2",
      clinicKey: "dermatology",
      patientId: "derm-p-3",
      patientName: "Ruth Wanjiru",
      date: d(-6),
      doctorName: "Dr. Richard Otunga",
      fullText:
        "Acne & scar management: fewer inflamed papules; scarring persists mainly on cheeks. Discussed non-comedogenic skincare and gentle exfoliation plan. Plan: continue current topical therapy, review in 4–6 weeks.",
    },
    {
      id: "derm-n-3",
      clinicKey: "dermatology",
      patientId: "derm-p-2",
      patientName: "Isaac Langat",
      date: d(-10),
      doctorName: "Dr. Miriam Wambui",
      fullText:
        "Psoriasis follow-up: plaques reduced with mild scaling. No systemic symptoms reported. Plan: monitor for irritation, maintain adherence, and schedule lab review if escalating therapy.",
    },
    {
      id: "derm-n-4",
      clinicKey: "dermatology",
      patientId: "derm-p-1",
      patientName: "Zawadi Otieno",
      date: d(-16),
      doctorName: "Dr. Miriam Wambui",
      fullText:
        "Eczema flare control: dry skin persists with nocturnal itching. Reviewed bathing routine and emollient application frequency. Plan: step-up topical steroid for short course, add antihistamine at night if needed, and provide trigger avoidance counselling.",
    },
    {
      id: "derm-n-5",
      clinicKey: "dermatology",
      patientId: "derm-p-5",
      patientName: "Victor Mungai",
      date: d(-7),
      doctorName: "Dr. Richard Otunga",
      fullText:
        "Fungal skin assessment: lesions improved with treatment; borders less active. Plan: complete remaining antifungal course and continue hygiene measures to prevent reinfection.",
    },
    {
      id: "derm-n-6",
      clinicKey: "dermatology",
      patientId: "derm-p-4",
      patientName: "Naomi Chepkirui",
      date: d(-22),
      doctorName: "Dr. Ann Nyaga",
      fullText:
        "Suspected drug eruption: rash resolved without systemic complications. Documented possible culprit medicine; advised avoidance and return if rash recurs. Plan: update allergy list and reassess if symptoms return.",
    },
  ]

  const mentalHealthPatients: Patient[] = [
    {
      id: "mh-p-1",
      patientNumber: "MH-7001",
      name: "Fatuma Karanja",
      age: 32,
      diagnosis: "Depression counselling - low mood and sleep disturbance",
      lastVisitDate: d(-18),
      nextAppointmentDate: d(6),
      status: "Active",
    },
    {
      id: "mh-p-2",
      patientNumber: "MH-7012",
      name: "Musa Ndegwa",
      age: 39,
      diagnosis: "Anxiety & stress management - panic symptoms",
      lastVisitDate: d(-10),
      nextAppointmentDate: d(0),
      status: "Active",
    },
    {
      id: "mh-p-3",
      patientNumber: "MH-7021",
      name: "Esther Njoroge",
      age: 26,
      diagnosis: "Trauma-focused therapy - coping and safety plan",
      lastVisitDate: d(-22),
      nextAppointmentDate: d(3),
      status: "Active",
    },
    {
      id: "mh-p-4",
      patientNumber: "MH-7030",
      name: "Josephine Wekesa",
      age: 45,
      diagnosis: "Bipolar mood review - stabilization follow-up",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(8),
      status: "Active",
    },
    {
      id: "mh-p-5",
      patientNumber: "MH-7038",
      name: "Peter Kamau",
      age: 31,
      diagnosis: "Substance use counselling - relapse prevention",
      lastVisitDate: d(-14),
      nextAppointmentDate: d(12),
      status: "Active",
    },
    {
      id: "mh-p-6",
      patientNumber: "MH-7046",
      name: "Asha Mwende",
      age: 54,
      diagnosis: "Grief support & coping - adjustment period",
      lastVisitDate: d(-27),
      nextAppointmentDate: d(18),
      status: "Discharged",
    },
  ]

  const mentalHealthAppointments: Appointment[] = [
    {
      id: "mh-a-1",
      clinicKey: "mental-health",
      patientId: "mh-p-2",
      patientName: "Musa Ndegwa",
      doctorId: "mh-doc-2",
      doctorName: "Dr. Paul Ouma",
      appointmentType: "Anxiety & Stress Management",
      appointmentDate: d(0),
      appointmentTime: "09:05",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Address panic episode frequency; review breathing techniques and triggers.",
    },
    {
      id: "mh-a-2",
      clinicKey: "mental-health",
      patientId: "mh-p-1",
      patientName: "Fatuma Karanja",
      doctorId: "mh-doc-1",
      doctorName: "Dr. Beatrice Wafula",
      appointmentType: "Depression Counselling Session",
      appointmentDate: d(1),
      appointmentTime: "10:20",
      priority: "Routine",
      status: "Scheduled",
      notes: "Sleep hygiene plan and motivational interviewing; check progress on goals.",
    },
    {
      id: "mh-a-3",
      clinicKey: "mental-health",
      patientId: "mh-p-3",
      patientName: "Esther Njoroge",
      doctorId: "mh-doc-3",
      doctorName: "Dr. Diana Kirimi",
      appointmentType: "Trauma-focused Therapy",
      appointmentDate: d(5),
      appointmentTime: "13:55",
      priority: "Routine",
      status: "Scheduled",
      notes: "Safety plan review; continue therapy session focused on coping tools.",
    },
    {
      id: "mh-a-4",
      clinicKey: "mental-health",
      patientId: "mh-p-6",
      patientName: "Asha Mwende",
      doctorId: "mh-doc-1",
      doctorName: "Dr. Beatrice Wafula",
      appointmentType: "Grief Support & Coping",
      appointmentDate: d(-2),
      appointmentTime: "11:30",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - patient improving and requested later appointment.",
    },
    {
      id: "mh-a-5",
      clinicKey: "mental-health",
      patientId: "mh-p-4",
      patientName: "Josephine Wekesa",
      doctorId: "mh-doc-2",
      doctorName: "Dr. Paul Ouma",
      appointmentType: "Bipolar Mood Review",
      appointmentDate: d(-7),
      appointmentTime: "08:35",
      priority: "Routine",
      status: "Completed",
      notes: "Mood stabilized; reviewed medication adherence and early warning signs.",
    },
    {
      id: "mh-a-6",
      clinicKey: "mental-health",
      patientId: "mh-p-5",
      patientName: "Peter Kamau",
      doctorId: "mh-doc-3",
      doctorName: "Dr. Diana Kirimi",
      appointmentType: "Substance Use Counselling",
      appointmentDate: d(3),
      appointmentTime: "14:25",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Relapse prevention plan and counselling on community support resources.",
    },
  ]

  const mentalHealthNotes: ClinicalNote[] = [
    {
      id: "mh-n-1",
      clinicKey: "mental-health",
      patientId: "mh-p-2",
      patientName: "Musa Ndegwa",
      date: d(-1),
      doctorName: "Dr. Paul Ouma",
      fullText:
        "Counselling session: Musa reported recent panic symptoms triggered by crowded transport. Reviewed coping skills including grounding exercises and structured breathing. Patient appears engaged and motivated. Plan: practice daily coping routine and monitor triggers; follow up in 1 week if symptoms worsen.",
    },
    {
      id: "mh-n-2",
      clinicKey: "mental-health",
      patientId: "mh-p-1",
      patientName: "Fatuma Karanja",
      date: d(-18),
      doctorName: "Dr. Beatrice Wafula",
      fullText:
        "Depression counselling: persistent low mood and reduced appetite, with sleep fragmentation. Discussed behavioural activation and supportive communication. Plan: set small achievable goals and consider medication review if symptoms persist.",
    },
    {
      id: "mh-n-3",
      clinicKey: "mental-health",
      patientId: "mh-p-3",
      patientName: "Esther Njoroge",
      date: d(-22),
      doctorName: "Dr. Diana Kirimi",
      fullText:
        "Trauma-focused therapy: focused on building coping resources and strengthening safety plan. Patient acknowledged improvement with sleep in recent days. Plan: continue therapy focusing on cognitive re-framing and grounding techniques.",
    },
    {
      id: "mh-n-4",
      clinicKey: "mental-health",
      patientId: "mh-p-4",
      patientName: "Josephine Wekesa",
      date: d(-7),
      doctorName: "Dr. Paul Ouma",
      fullText:
        "Bipolar mood review: patient mood stable with good adherence; no manic symptoms. Discussed early warning signs and the importance of routine sleep. Plan: maintain medication, schedule follow-up in 6–8 weeks.",
    },
    {
      id: "mh-n-5",
      clinicKey: "mental-health",
      patientId: "mh-p-5",
      patientName: "Peter Kamau",
      date: d(-14),
      doctorName: "Dr. Diana Kirimi",
      fullText:
        "Substance counselling: patient expressed insight into triggers and showed willingness to engage with support groups. Plan: relapse prevention plan update, identify high-risk times, and set up follow-up counselling session.",
    },
    {
      id: "mh-n-6",
      clinicKey: "mental-health",
      patientId: "mh-p-6",
      patientName: "Asha Mwende",
      date: d(-27),
      doctorName: "Dr. Beatrice Wafula",
      fullText:
        "Grief support: patient coping gradually improved. Discussed emotional processing and supported communication. Plan: continue self-care and return if distress increases; discharge with community resources guidance.",
    },
  ]

  const dentalPatients: Patient[] = [
    {
      id: "dent-p-1",
      patientNumber: "DN-8003",
      name: "Collins Wanjala",
      age: 37,
      diagnosis: "Dental abscess - pain management and drainage review",
      lastVisitDate: d(-16),
      nextAppointmentDate: d(6),
      status: "Active",
    },
    {
      id: "dent-p-2",
      patientNumber: "DN-8011",
      name: "Alice Njeri",
      age: 29,
      diagnosis: "Wisdom tooth consultation (impaction evaluation)",
      lastVisitDate: d(-10),
      nextAppointmentDate: d(0),
      status: "Active",
    },
    {
      id: "dent-p-3",
      patientNumber: "DN-8020",
      name: "Hassan Abdalla",
      age: 46,
      diagnosis: "Gum disease staging (periodontal health check)",
      lastVisitDate: d(-22),
      nextAppointmentDate: d(8),
      status: "Active",
    },
    {
      id: "dent-p-4",
      patientNumber: "DN-8030",
      name: "Christine Achieng",
      age: 33,
      diagnosis: "Orthodontic progress check (braces adjustment)",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(4),
      status: "Active",
    },
    {
      id: "dent-p-5",
      patientNumber: "DN-8039",
      name: "Josephine Muthoni",
      age: 54,
      diagnosis: "Denture adjustment (fit and comfort review)",
      lastVisitDate: d(-14),
      nextAppointmentDate: d(1),
      status: "Active",
    },
    {
      id: "dent-p-6",
      patientNumber: "DN-8048",
      name: "Bernard Otieno",
      age: 22,
      diagnosis: "Oral ulcer evaluation (non-healing lesion)",
      lastVisitDate: d(-30),
      nextAppointmentDate: d(12),
      status: "Discharged",
    },
  ]

  const dentalAppointments: Appointment[] = [
    {
      id: "dent-a-1",
      clinicKey: "dental",
      patientId: "dent-p-2",
      patientName: "Alice Njeri",
      doctorId: "dent-doc-2",
      doctorName: "Dr. Grace Odhiambo",
      appointmentType: "Wisdom Tooth Consultation",
      appointmentDate: d(0),
      appointmentTime: "10:30",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Evaluate impaction, check infection signs, and plan extraction timeline.",
    },
    {
      id: "dent-a-2",
      clinicKey: "dental",
      patientId: "dent-p-1",
      patientName: "Collins Wanjala",
      doctorId: "dent-doc-1",
      doctorName: "Dr. Samuel Ndegwa",
      appointmentType: "Dental Abscess Review",
      appointmentDate: d(1),
      appointmentTime: "09:15",
      priority: "Routine",
      status: "Scheduled",
      notes: "Review response to antibiotics; check for residual swelling; confirm drainage status.",
    },
    {
      id: "dent-a-3",
      clinicKey: "dental",
      patientId: "dent-p-3",
      patientName: "Hassan Abdalla",
      doctorId: "dent-doc-3",
      doctorName: "Dr. Peter Kimani",
      appointmentType: "Gum Disease Staging",
      appointmentDate: d(5),
      appointmentTime: "14:10",
      priority: "Routine",
      status: "Scheduled",
      notes: "Periodontal probing and staging; plan scaling session and maintenance.",
    },
    {
      id: "dent-a-4",
      clinicKey: "dental",
      patientId: "dent-p-6",
      patientName: "Bernard Otieno",
      doctorId: "dent-doc-1",
      doctorName: "Dr. Samuel Ndegwa",
      appointmentType: "Oral Ulcer Evaluation",
      appointmentDate: d(-2),
      appointmentTime: "11:00",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - lesion healed; patient requested no further evaluation.",
    },
    {
      id: "dent-a-5",
      clinicKey: "dental",
      patientId: "dent-p-4",
      patientName: "Christine Achieng",
      doctorId: "dent-doc-2",
      doctorName: "Dr. Grace Odhiambo",
      appointmentType: "Orthodontic Progress Check",
      appointmentDate: d(-7),
      appointmentTime: "08:55",
      priority: "Routine",
      status: "Completed",
      notes: "Braces adjustment done; discussed oral hygiene and expected tooth movement.",
    },
    {
      id: "dent-a-6",
      clinicKey: "dental",
      patientId: "dent-p-5",
      patientName: "Josephine Muthoni",
      doctorId: "dent-doc-3",
      doctorName: "Dr. Peter Kimani",
      appointmentType: "Denture Adjustment",
      appointmentDate: d(3),
      appointmentTime: "13:30",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Assess denture fit and sore spots; adjust occlusion and provide care guidance.",
    },
  ]

  const dentalNotes: ClinicalNote[] = [
    {
      id: "dent-n-1",
      clinicKey: "dental",
      patientId: "dent-p-2",
      patientName: "Alice Njeri",
      date: d(-1),
      doctorName: "Dr. Grace Odhiambo",
      fullText:
        "Dental consultation: patient reports pain and intermittent swelling around the lower third molar. Examination suggests impacted wisdom tooth with local inflammation. Plan: check imaging if required, start short course analgesia, and schedule extraction after infection settles.",
    },
    {
      id: "dent-n-2",
      clinicKey: "dental",
      patientId: "dent-p-1",
      patientName: "Collins Wanjala",
      date: d(-16),
      doctorName: "Dr. Samuel Ndegwa",
      fullText:
        "Abscess review: initial drainage improved symptoms. Patient has reduced swelling and no fever. Plan: complete antibiotics course, perform follow-up check, and schedule definitive dental care if needed.",
    },
    {
      id: "dent-n-3",
      clinicKey: "dental",
      patientId: "dent-p-3",
      patientName: "Hassan Abdalla",
      date: d(-22),
      doctorName: "Dr. Peter Kimani",
      fullText:
        "Gum disease staging: moderate gingival inflammation and probing depths suggest periodontitis stage. Counselling provided on oral hygiene, flossing, and supportive periodontal care. Plan: scaling and reassessment in 4 weeks.",
    },
    {
      id: "dent-n-4",
      clinicKey: "dental",
      patientId: "dent-p-4",
      patientName: "Christine Achieng",
      date: d(-8),
      doctorName: "Dr. Grace Odhiambo",
      fullText:
        "Orthodontic review: braces adjusted; patient tolerated procedure. Emphasized diet modifications and hygiene to reduce plaque accumulation. Plan: continue current regimen and return for next adjustment cycle.",
    },
    {
      id: "dent-n-5",
      clinicKey: "dental",
      patientId: "dent-p-5",
      patientName: "Josephine Muthoni",
      date: d(-14),
      doctorName: "Dr. Peter Kimani",
      fullText:
        "Denture adjustment note: patient reports sore spots after prolonged use. Fit evaluated; pressure points identified. Plan: perform adjustment and provide guidance on gradual wear schedule to reduce trauma.",
    },
    {
      id: "dent-n-6",
      clinicKey: "dental",
      patientId: "dent-p-6",
      patientName: "Bernard Otieno",
      date: d(-30),
      doctorName: "Dr. Samuel Ndegwa",
      fullText:
        "Oral ulcer evaluation: non-healing lesion previously monitored. At time of last review it appeared to be resolving. Plan: patient advised to return if ulcer persists or if associated systemic symptoms develop.",
    },
  ]

  const nutritionPatients: Patient[] = [
    {
      id: "nut-p-1",
      patientNumber: "NT-9001",
      name: "Rose Wambui",
      age: 52,
      diagnosis: "Diabetes nutrition plan (carb counting and meal timing)",
      lastVisitDate: d(-18),
      nextAppointmentDate: d(6),
      status: "Active",
    },
    {
      id: "nut-p-2",
      patientNumber: "NT-9013",
      name: "Daniel Otieno",
      age: 44,
      diagnosis: "CKD renal diet counselling (low protein & electrolyte guidance)",
      lastVisitDate: d(-12),
      nextAppointmentDate: d(1),
      status: "Active",
    },
    {
      id: "nut-p-3",
      patientNumber: "NT-9020",
      name: "Asha Ndirangu",
      age: 27,
      diagnosis: "Weight management session (healthy calorie deficit)",
      lastVisitDate: d(-10),
      nextAppointmentDate: d(4),
      status: "Active",
    },
    {
      id: "nut-p-4",
      patientNumber: "NT-9029",
      name: "Mary Njoroge",
      age: 35,
      diagnosis: "Pregnancy nutrition guidance (iron, folate & protein)",
      lastVisitDate: d(-8),
      nextAppointmentDate: d(10),
      status: "Active",
    },
    {
      id: "nut-p-5",
      patientNumber: "NT-9036",
      name: "Josephine Chege",
      age: 60,
      diagnosis: "Hypertension nutrition review (DASH-style counselling)",
      lastVisitDate: d(-22),
      nextAppointmentDate: d(7),
      status: "Active",
    },
    {
      id: "nut-p-6",
      patientNumber: "NT-9044",
      name: "Musa Hassan",
      age: 38,
      diagnosis: "Hyperlipidemia diet counseling (cholesterol control)",
      lastVisitDate: d(-15),
      nextAppointmentDate: d(14),
      status: "Discharged",
    },
  ]

  const nutritionAppointments: Appointment[] = [
    {
      id: "nut-a-1",
      clinicKey: "nutrition",
      patientId: "nut-p-2",
      patientName: "Daniel Otieno",
      doctorId: "nut-doc-3",
      doctorName: "Dr. Irene Muthoni",
      appointmentType: "CKD Renal Diet Counselling",
      appointmentDate: d(0),
      appointmentTime: "11:00",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Review potassium/phosphorus foods; adjust meal plan for dialysis days.",
    },
    {
      id: "nut-a-2",
      clinicKey: "nutrition",
      patientId: "nut-p-1",
      patientName: "Rose Wambui",
      doctorId: "nut-doc-1",
      doctorName: "Dr. Naomi Wanjiku",
      appointmentType: "Diabetes Nutrition Plan",
      appointmentDate: d(1),
      appointmentTime: "09:30",
      priority: "Routine",
      status: "Scheduled",
      notes: "Carb distribution counselling; set weekly goals and monitor glucose logs.",
    },
    {
      id: "nut-a-3",
      clinicKey: "nutrition",
      patientId: "nut-p-3",
      patientName: "Asha Ndirangu",
      doctorId: "nut-doc-2",
      doctorName: "Dr. Kelvin Ochieng",
      appointmentType: "Weight Management Session",
      appointmentDate: d(5),
      appointmentTime: "14:05",
      priority: "Routine",
      status: "Scheduled",
      notes: "Review exercise adherence and adjust portion sizes to support deficit goals.",
    },
    {
      id: "nut-a-4",
      clinicKey: "nutrition",
      patientId: "nut-p-6",
      patientName: "Musa Hassan",
      doctorId: "nut-doc-1",
      doctorName: "Dr. Naomi Wanjiku",
      appointmentType: "Hyperlipidemia Diet Counseling",
      appointmentDate: d(-2),
      appointmentTime: "12:15",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - patient attending follow-up with another clinician.",
    },
    {
      id: "nut-a-5",
      clinicKey: "nutrition",
      patientId: "nut-p-5",
      patientName: "Josephine Chege",
      doctorId: "nut-doc-2",
      doctorName: "Dr. Kelvin Ochieng",
      appointmentType: "Hypertension Nutrition Review",
      appointmentDate: d(-7),
      appointmentTime: "08:25",
      priority: "Routine",
      status: "Completed",
      notes: "DASH-style plan reviewed; discussed reducing sodium and incorporating potassium-rich foods.",
    },
    {
      id: "nut-a-6",
      clinicKey: "nutrition",
      patientId: "nut-p-4",
      patientName: "Mary Njoroge",
      doctorId: "nut-doc-3",
      doctorName: "Dr. Irene Muthoni",
      appointmentType: "Pregnancy Nutrition Guidance",
      appointmentDate: d(3),
      appointmentTime: "13:20",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Review iron and folate adherence; plan balanced meal for trimester.",
    },
  ]

  const nutritionNotes: ClinicalNote[] = [
    {
      id: "nut-n-1",
      clinicKey: "nutrition",
      patientId: "nut-p-2",
      patientName: "Daniel Otieno",
      date: d(-1),
      doctorName: "Dr. Irene Muthoni",
      fullText:
        "Renal diet counselling: reviewed patient’s typical meals and identified high-potassium foods. Discussed portion control, dialysis-day modifications, and safe hydration guidance within limits. Plan: follow revised meal plan, bring food diary next visit, and repeat labs as scheduled.",
    },
    {
      id: "nut-n-2",
      clinicKey: "nutrition",
      patientId: "nut-p-1",
      patientName: "Rose Wambui",
      date: d(-18),
      doctorName: "Dr. Naomi Wanjiku",
      fullText:
        "Diabetes nutrition plan: addressed carb counting and meal timing to reduce post-meal spikes. Patient set goals for portion sizes and inclusion of fibre. Plan: monitor glucose logs and return for review in 2 weeks.",
    },
    {
      id: "nut-n-3",
      clinicKey: "nutrition",
      patientId: "nut-p-3",
      patientName: "Asha Ndirangu",
      date: d(-10),
      doctorName: "Dr. Kelvin Ochieng",
      fullText:
        "Weight management session: improved adherence to planned meals but reduced physical activity this week. Plan: adjust calorie deficit gently, set realistic exercise targets, and review progress at next appointment.",
    },
    {
      id: "nut-n-4",
      clinicKey: "nutrition",
      patientId: "nut-p-5",
      patientName: "Josephine Chege",
      date: d(-7),
      doctorName: "Dr. Kelvin Ochieng",
      fullText:
        "Hypertension nutrition review: counselled on DASH approach with reduced sodium. Patient motivated to try home-cooked meals. Plan: follow sodium reduction plan and incorporate potassium-rich foods within individual restrictions.",
    },
    {
      id: "nut-n-5",
      clinicKey: "nutrition",
      patientId: "nut-p-4",
      patientName: "Mary Njoroge",
      date: d(-8),
      doctorName: "Dr. Irene Muthoni",
      fullText:
        "Pregnancy nutrition guidance: discussed iron-rich foods and folate adherence. Reviewed balanced macronutrients and hydration. Plan: continue prenatal vitamins and schedule follow-up to check dietary consistency.",
    },
    {
      id: "nut-n-6",
      clinicKey: "nutrition",
      patientId: "nut-p-6",
      patientName: "Musa Hassan",
      date: d(-15),
      doctorName: "Dr. Naomi Wanjiku",
      fullText:
        "Hyperlipidemia diet counselling: reviewed cholesterol-lowering foods and reduced saturated fats. Patient advised to follow meal swaps and re-evaluate in future if needed. Follow-up deferred at patient request.",
    },
  ]

  const physiotherapyPatients: Patient[] = [
    {
      id: "physio-p-1",
      patientNumber: "PHYS-10001",
      name: "Brian Otieno",
      age: 45,
      diagnosis: "Stroke recovery rehabilitation - gait and strength retraining",
      lastVisitDate: d(-16),
      nextAppointmentDate: d(5),
      status: "Active",
    },
    {
      id: "physio-p-2",
      patientNumber: "PHYS-10011",
      name: "Wanjiru Muthoni",
      age: 29,
      diagnosis: "Back pain & disc rehab - core stabilization",
      lastVisitDate: d(-11),
      nextAppointmentDate: d(0),
      status: "Active",
    },
    {
      id: "physio-p-3",
      patientNumber: "PHYS-10021",
      name: "Ahmed Ali",
      age: 62,
      diagnosis: "Knee osteoarthritis exercises - pain management plan",
      lastVisitDate: d(-22),
      nextAppointmentDate: d(9),
      status: "Active",
    },
    {
      id: "physio-p-4",
      patientNumber: "PHYS-10031",
      name: "Mercy Akinyi",
      age: 34,
      diagnosis: "Post-op rehabilitation - mobility and strengthening",
      lastVisitDate: d(-9),
      nextAppointmentDate: d(3),
      status: "Active",
    },
    {
      id: "physio-p-5",
      patientNumber: "PHYS-10041",
      name: "Samuel Kiplagat",
      age: 23,
      diagnosis: "Sports injury recovery - ankle stability",
      lastVisitDate: d(-15),
      nextAppointmentDate: d(12),
      status: "Active",
    },
    {
      id: "physio-p-6",
      patientNumber: "PHYS-10051",
      name: "Pauline Njeri",
      age: 38,
      diagnosis: "Shoulder mobility program - impingement management",
      lastVisitDate: d(-18),
      nextAppointmentDate: d(7),
      status: "Discharged",
    },
  ]

  const physiotherapyAppointments: Appointment[] = [
    {
      id: "physio-a-1",
      clinicKey: "physiotherapy",
      patientId: "physio-p-2",
      patientName: "Wanjiru Muthoni",
      doctorId: "physio-doc-2",
      doctorName: "Dr. Faith Muthoni",
      appointmentType: "Back Pain & Disc Rehab",
      appointmentDate: d(0),
      appointmentTime: "09:40",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Core stabilization session; review home exercises and pain trigger patterns.",
    },
    {
      id: "physio-a-2",
      clinicKey: "physiotherapy",
      patientId: "physio-p-1",
      patientName: "Brian Otieno",
      doctorId: "physio-doc-1",
      doctorName: "Dr. Victor Wekesa",
      appointmentType: "Stroke Rehab Assessment",
      appointmentDate: d(1),
      appointmentTime: "10:10",
      priority: "Routine",
      status: "Scheduled",
      notes: "Gait assessment and strengthening plan update; check balance improvements.",
    },
    {
      id: "physio-a-3",
      clinicKey: "physiotherapy",
      patientId: "physio-p-4",
      patientName: "Mercy Akinyi",
      doctorId: "physio-doc-3",
      doctorName: "Dr. Kevin Njenga",
      appointmentType: "Post-op Rehabilitation",
      appointmentDate: d(5),
      appointmentTime: "14:20",
      priority: "Routine",
      status: "Scheduled",
      notes: "Mobility and strengthening; evaluate wound healing and pain scale.",
    },
    {
      id: "physio-a-4",
      clinicKey: "physiotherapy",
      patientId: "physio-p-6",
      patientName: "Pauline Njeri",
      doctorId: "physio-doc-2",
      doctorName: "Dr. Faith Muthoni",
      appointmentType: "Shoulder Mobility Program",
      appointmentDate: d(-2),
      appointmentTime: "11:05",
      priority: "Routine",
      status: "Cancelled",
      notes: "Cancelled - patient improving and requested later follow-up.",
    },
    {
      id: "physio-a-5",
      clinicKey: "physiotherapy",
      patientId: "physio-p-3",
      patientName: "Ahmed Ali",
      doctorId: "physio-doc-1",
      doctorName: "Dr. Victor Wekesa",
      appointmentType: "Knee Osteoarthritis Exercises",
      appointmentDate: d(-7),
      appointmentTime: "08:30",
      priority: "Routine",
      status: "Completed",
      notes: "Reviewed exercise progression; pain reduced with adherence.",
    },
    {
      id: "physio-a-6",
      clinicKey: "physiotherapy",
      patientId: "physio-p-5",
      patientName: "Samuel Kiplagat",
      doctorId: "physio-doc-3",
      doctorName: "Dr. Kevin Njenga",
      appointmentType: "Sports Injury Recovery",
      appointmentDate: d(3),
      appointmentTime: "13:15",
      priority: "Urgent",
      status: "Scheduled",
      notes: "Ankle stability program; assess swelling and step-up balance training.",
    },
  ]

  const physiotherapyNotes: ClinicalNote[] = [
    {
      id: "physio-n-1",
      clinicKey: "physiotherapy",
      patientId: "physio-p-2",
      patientName: "Wanjiru Muthoni",
      date: d(-1),
      doctorName: "Dr. Faith Muthoni",
      fullText:
        "Back pain rehab note: patient reports reduced leg radiating pain after home core program. Identified aggravating movements during prolonged sitting. Plan: increase core strengthening repetitions gradually and add hip mobility stretches. Reviewed posture cues and set next session goals.",
    },
    {
      id: "physio-n-2",
      clinicKey: "physiotherapy",
      patientId: "physio-p-1",
      patientName: "Brian Otieno",
      date: d(-16),
      doctorName: "Dr. Victor Wekesa",
      fullText:
        "Stroke rehab assessment: improved sit-to-stand transfer and balance with reduced wobble. Gait remains asymmetrical. Plan: treadmill assisted walking, strengthen hip abductors, and continue balance training with close supervision.",
    },
    {
      id: "physio-n-3",
      clinicKey: "physiotherapy",
      patientId: "physio-p-4",
      patientName: "Mercy Akinyi",
      date: d(-9),
      doctorName: "Dr. Kevin Njenga",
      fullText:
        "Post-op rehabilitation note: mild pain with movement; wound healing progressing. Strength improving with progressive resistance. Plan: continue mobility exercises, adjust pain management and progress strengthening based on comfort.",
    },
    {
      id: "physio-n-4",
      clinicKey: "physiotherapy",
      patientId: "physio-p-5",
      patientName: "Samuel Kiplagat",
      date: d(-15),
      doctorName: "Dr. Kevin Njenga",
      fullText:
        "Sports injury recovery: ankle swelling reduced with rest and exercises. Balance improved; still mild tenderness during lateral movement. Plan: strengthen peroneals, continue proprioception drills, and reassess progression next visit.",
    },
    {
      id: "physio-n-5",
      clinicKey: "physiotherapy",
      patientId: "physio-p-3",
      patientName: "Ahmed Ali",
      date: d(-7),
      doctorName: "Dr. Victor Wekesa",
      fullText:
        "Knee osteoarthritis review: pain scale decreased; improved range of motion. Plan: continue quadriceps strengthening and encourage low-impact activities. Follow up for progress and adjust exercise dosage.",
    },
    {
      id: "physio-n-6",
      clinicKey: "physiotherapy",
      patientId: "physio-p-6",
      patientName: "Pauline Njeri",
      date: d(-18),
      doctorName: "Dr. Faith Muthoni",
      fullText:
        "Shoulder mobility program: patient reported improved overhead reach with reduced discomfort. Plan: continue mobility and posture exercises; patient to return if symptoms persist or worsen.",
    },
  ]

  const patientsByClinic: Record<ClinicKey, Patient[]> = {
    neurosurgery: neurosurgeryPatients,
    cardiology: cardiologyPatients,
    renal: renalPatients,
    ophthalmology: ophthalmologyPatients,
    ent: entPatients,
    dermatology: dermatologyPatients,
    "mental-health": mentalHealthPatients,
    dental: dentalPatients,
    nutrition: nutritionPatients,
    physiotherapy: physiotherapyPatients,
  }

  const appointmentsByClinic: Record<ClinicKey, Appointment[]> = {
    neurosurgery: neurosurgeryAppointments,
    cardiology: cardiologyAppointments,
    renal: renalAppointments,
    ophthalmology: ophthalmologyAppointments,
    ent: entAppointments,
    dermatology: dermatologyAppointments,
    "mental-health": mentalHealthAppointments,
    dental: dentalAppointments,
    nutrition: nutritionAppointments,
    physiotherapy: physiotherapyAppointments,
  }

  const notesByClinic: Record<ClinicKey, ClinicalNote[]> = {
    neurosurgery: neurosurgeryNotes,
    cardiology: cardiologyNotes,
    renal: renalNotes,
    ophthalmology: ophthalmologyNotes,
    ent: entNotes,
    dermatology: dermatologyNotes,
    "mental-health": mentalHealthNotes,
    dental: dentalNotes,
    nutrition: nutritionNotes,
    physiotherapy: physiotherapyNotes,
  }

  return { patientsByClinic, appointmentsByClinic, notesByClinic }
}

function getClinicMeta(key: ClinicKey) {
  const found = CLINICS.find((c) => c.key === key)
  if (!found) throw new Error(`Unknown clinic key: ${key}`)
  return found
}

function buildClinicSubtabDefaults(): Record<ClinicKey, ClinicSubtabKey> {
  return CLINICS.reduce((acc, c) => {
    acc[c.key] = "appointments"
    return acc
  }, {} as Record<ClinicKey, ClinicSubtabKey>)
}

export default function SpecialistClinicsPage() {
  const baseNow = useMemo(() => new Date(), [])
  const todayYMD = useMemo(() => toYMD(baseNow), [baseNow])

  const mockData = useMemo(() => makeMockData(baseNow), [baseNow])

  const [activeClinic, setActiveClinic] = useState<ClinicKey>("neurosurgery")
  const [activeSubtabByClinic, setActiveSubtabByClinic] = useState<Record<ClinicKey, ClinicSubtabKey>>(
    () => buildClinicSubtabDefaults(),
  )

  const [patientsByClinic, setPatientsByClinic] = useState<Record<ClinicKey, Patient[]>>(
    () => mockData.patientsByClinic,
  )
  const [appointmentsByClinic, setAppointmentsByClinic] = useState<Record<ClinicKey, Appointment[]>>(
    () => mockData.appointmentsByClinic,
  )
  const [notesByClinic] = useState<Record<ClinicKey, ClinicalNote[]>>(
    () => mockData.notesByClinic,
  )

  const idSeqRef = useRef(10_000)
  const nextId = (prefix: string) => `${prefix}-${idSeqRef.current++}`

  // Dialog state: New Appointment
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false)
  const [newAppointmentClinicKey, setNewAppointmentClinicKey] = useState<ClinicKey>(activeClinic)
  const [newAppointmentPatientSelection, setNewAppointmentPatientSelection] = useState<string>("")
  const [newAppointmentOtherPatientName, setNewAppointmentOtherPatientName] = useState("")
  const [newAppointmentDoctorId, setNewAppointmentDoctorId] = useState("")
  const [newAppointmentType, setNewAppointmentType] = useState("")
  const [newAppointmentDate, setNewAppointmentDate] = useState(todayYMD)
  const [newAppointmentTime, setNewAppointmentTime] = useState(() => {
    const t = new Date(baseNow)
    t.setMinutes(0)
    t.setHours(t.getHours() + 1)
    return toTimeHHMM(t)
  })
  const [newAppointmentPriority, setNewAppointmentPriority] = useState<AppointmentPriority>("Routine")
  const [newAppointmentNotes, setNewAppointmentNotes] = useState("")

  // Dialog state: View Appointment
  const [viewAppointmentOpen, setViewAppointmentOpen] = useState(false)
  const [viewAppointmentLocator, setViewAppointmentLocator] = useState<{ clinicKey: ClinicKey; appointmentId: string } | null>(
    null,
  )

  // Dialog state: Reschedule Appointment
  const [rescheduleAppointmentOpen, setRescheduleAppointmentOpen] = useState(false)
  const [rescheduleAppointmentLocator, setRescheduleAppointmentLocator] = useState<{ clinicKey: ClinicKey; appointmentId: string } | null>(
    null,
  )
  const [rescheduleDate, setRescheduleDate] = useState(todayYMD)
  const [rescheduleTime, setRescheduleTime] = useState("10:00")
  const [rescheduleNotes, setRescheduleNotes] = useState("")

  // Dialog state: Cancel Appointment
  const [cancelAppointmentOpen, setCancelAppointmentOpen] = useState(false)
  const [cancelAppointmentLocator, setCancelAppointmentLocator] = useState<{ clinicKey: ClinicKey; appointmentId: string } | null>(
    null,
  )

  // Dialog state: Full note
  const [fullNoteOpen, setFullNoteOpen] = useState(false)
  const [fullNote, setFullNote] = useState<ClinicalNote | null>(null)

  const todayAppointmentsCountForClinic = (clinicKey: ClinicKey) => {
    const appts = appointmentsByClinic[clinicKey] ?? []
    return appts.filter((a) => a.appointmentDate === todayYMD && a.status !== "Cancelled").length
  }

  const activePatientsCountForClinic = (clinicKey: ClinicKey) => {
    const pts = patientsByClinic[clinicKey] ?? []
    return pts.filter((p) => p.status === "Active").length
  }

  const pendingConsultationsCountForClinic = (clinicKey: ClinicKey) => {
    // Pending means scheduled and not cancelled/completed.
    const appts = appointmentsByClinic[clinicKey] ?? []
    return appts.filter((a) => a.status === "Scheduled").length
  }

  const completedThisMonthCountForClinic = (clinicKey: ClinicKey) => {
    const appts = appointmentsByClinic[clinicKey] ?? []
    const month = baseNow.getMonth()
    const year = baseNow.getFullYear()
    return appts.filter((a) => {
      if (a.status !== "Completed") return false
      const dt = new Date(`${a.appointmentDate}T00:00:00`)
      return dt.getMonth() === month && dt.getFullYear() === year
    }).length
  }

  const openNewAppointmentDialogForClinic = (clinicKey: ClinicKey) => {
    const patients = patientsByClinic[clinicKey] ?? []
    const doctors = DOCTORS_BY_CLINIC[clinicKey] ?? []
    const types = APPOINTMENT_TYPES_BY_CLINIC[clinicKey] ?? []
    const defaultPatientId = patients[0]?.id ?? ""
    const defaultDoctorId = doctors[0]?.id ?? ""
    const defaultType = types[0] ?? ""

    setNewAppointmentClinicKey(clinicKey)
    setNewAppointmentPatientSelection(defaultPatientId || "other")
    setNewAppointmentOtherPatientName("")
    setNewAppointmentDoctorId(defaultDoctorId)
    setNewAppointmentType(defaultType)
    setNewAppointmentDate(todayYMD)
    const t = new Date(baseNow)
    t.setMinutes(0)
    t.setHours(t.getHours() + 1)
    setNewAppointmentTime(toTimeHHMM(t))
    setNewAppointmentPriority("Routine")
    setNewAppointmentNotes("")
    setNewAppointmentOpen(true)
  }

  const estimatedFeeForForm = useMemo(() => {
    const feeTable = FEE_BY_CLINIC_TYPE[newAppointmentClinicKey] ?? {}
    const fee = feeTable[newAppointmentType]
    if (fee) return fee
    // Fallback fee by clinic.
    const fallback: Record<ClinicKey, number> = {
      neurosurgery: 6500,
      cardiology: 4500,
      renal: 7000,
      ophthalmology: 4000,
      ent: 4000,
      dermatology: 3500,
      "mental-health": 3200,
      dental: 4500,
      nutrition: 2500,
      physiotherapy: 4200,
    }
    return fallback[newAppointmentClinicKey] ?? 4000
  }, [newAppointmentClinicKey, newAppointmentType])

  const selectedViewAppointment: Appointment | null = useMemo(() => {
    if (!viewAppointmentLocator) return null
    const { clinicKey, appointmentId } = viewAppointmentLocator
    const list = appointmentsByClinic[clinicKey] ?? []
    return list.find((a) => a.id === appointmentId) ?? null
  }, [appointmentsByClinic, viewAppointmentLocator])

  const selectedRescheduleAppointment: Appointment | null = useMemo(() => {
    if (!rescheduleAppointmentLocator) return null
    const { clinicKey, appointmentId } = rescheduleAppointmentLocator
    const list = appointmentsByClinic[clinicKey] ?? []
    return list.find((a) => a.id === appointmentId) ?? null
  }, [appointmentsByClinic, rescheduleAppointmentLocator])

  const openViewAppointment = (clinicKey: ClinicKey, appointmentId: string) => {
    setViewAppointmentLocator({ clinicKey, appointmentId })
    setViewAppointmentOpen(true)
  }

  const openRescheduleAppointment = (clinicKey: ClinicKey, appointmentId: string) => {
    const list = appointmentsByClinic[clinicKey] ?? []
    const found = list.find((a) => a.id === appointmentId)
    if (!found) return
    setRescheduleAppointmentLocator({ clinicKey, appointmentId })
    setRescheduleDate(found.appointmentDate)
    setRescheduleTime(found.appointmentTime)
    setRescheduleNotes("")
    setRescheduleAppointmentOpen(true)
  }

  const openCancelAppointment = (clinicKey: ClinicKey, appointmentId: string) => {
    setCancelAppointmentLocator({ clinicKey, appointmentId })
    setCancelAppointmentOpen(true)
  }

  const updateAppointment = (clinicKey: ClinicKey, appointmentId: string, updater: (a: Appointment) => Appointment) => {
    setAppointmentsByClinic((prev) => {
      const list = prev[clinicKey] ?? []
      return {
        ...prev,
        [clinicKey]: list.map((a) => (a.id === appointmentId ? updater(a) : a)),
      }
    })
  }

  const handleRescheduleSave = () => {
    if (!rescheduleAppointmentLocator) return
    const { clinicKey, appointmentId } = rescheduleAppointmentLocator
    const found = (appointmentsByClinic[clinicKey] ?? []).find((a) => a.id === appointmentId)
    if (!found) return

    if (!rescheduleDate.trim() || !rescheduleTime.trim()) {
      toast({ title: "Missing date/time", description: "Please provide a valid date and time.", variant: "destructive" })
      return
    }

    updateAppointment(clinicKey, appointmentId, (a) => ({
      ...a,
      appointmentDate: rescheduleDate,
      appointmentTime: rescheduleTime,
      status: "Scheduled",
      notes: rescheduleNotes.trim() ? `${a.notes}\n\nRescheduled notes: ${rescheduleNotes.trim()}` : a.notes,
    }))

    setRescheduleAppointmentOpen(false)
    setRescheduleAppointmentLocator(null)
    toast({ title: "Appointment rescheduled", description: `${found.patientName} is now scheduled for ${formatDate(rescheduleDate)} at ${rescheduleTime}.` })
  }

  const handleCancelConfirm = () => {
    if (!cancelAppointmentLocator) return
    const { clinicKey, appointmentId } = cancelAppointmentLocator
    const found = (appointmentsByClinic[clinicKey] ?? []).find((a) => a.id === appointmentId)
    if (!found) return

    updateAppointment(clinicKey, appointmentId, (a) => ({
      ...a,
      status: "Cancelled",
    }))

    setCancelAppointmentOpen(false)
    setCancelAppointmentLocator(null)
    toast({ title: "Appointment cancelled", description: `${found.patientName}'s appointment has been cancelled.` })
  }

  const handleCreateAppointment = () => {
    const clinicKey = newAppointmentClinicKey
    const doctors = DOCTORS_BY_CLINIC[clinicKey] ?? []
    const types = APPOINTMENT_TYPES_BY_CLINIC[clinicKey] ?? []

    const doctor = doctors.find((d) => d.id === newAppointmentDoctorId)
    const appointmentType = types.find((t) => t === newAppointmentType)

    if (!doctor) {
      toast({ title: "Doctor required", description: "Please select a doctor.", variant: "destructive" })
      return
    }
    if (!appointmentType) {
      toast({ title: "Appointment type required", description: "Please select an appointment type.", variant: "destructive" })
      return
    }
    if (!newAppointmentDate.trim() || !newAppointmentTime.trim()) {
      toast({ title: "Date & time required", description: "Please select appointment date and time.", variant: "destructive" })
      return
    }

    const patients = patientsByClinic[clinicKey] ?? []
    let patientId = ""
    let patientName = ""
    let diagnosis = "Clinic assessment follow-up (demo)"

    if (newAppointmentPatientSelection === "other") {
      const name = newAppointmentOtherPatientName.trim()
      if (!name) {
        toast({ title: "Patient name required", description: "Please enter the patient name.", variant: "destructive" })
        return
      }
      patientId = nextId("pat")
      patientName = name

      const fallbackDiagnosisByClinic: Record<ClinicKey, string> = {
        neurosurgery: "Neurological assessment (demo diagnosis)",
        cardiology: "Cardiac review (demo diagnosis)",
        renal: "Renal assessment (demo diagnosis)",
        ophthalmology: "Ophthalmology assessment (demo diagnosis)",
        ent: "ENT assessment (demo diagnosis)",
        dermatology: "Dermatology assessment (demo diagnosis)",
        "mental-health": "Mental health assessment (demo diagnosis)",
        dental: "Dental/oral assessment (demo diagnosis)",
        nutrition: "Nutrition/diet assessment (demo diagnosis)",
        physiotherapy: "Physiotherapy assessment (demo diagnosis)",
      }
      diagnosis = fallbackDiagnosisByClinic[clinicKey]

      const patientNumber = `HN-${Math.floor(1000 + idSeqRef.current)}`
      const newPatient: Patient = {
        id: patientId,
        patientNumber,
        name: patientName,
        age: 35,
        diagnosis,
        lastVisitDate: newAppointmentDate,
        nextAppointmentDate: newAppointmentDate,
        status: "Active",
      }

      setPatientsByClinic((prev) => ({
        ...prev,
        [clinicKey]: [newPatient, ...(prev[clinicKey] ?? [])],
      }))
    } else {
      const selectedPatient = patients.find((p) => p.id === newAppointmentPatientSelection)
      if (!selectedPatient) {
        toast({ title: "Patient required", description: "Please select a valid patient.", variant: "destructive" })
        return
      }
      patientId = selectedPatient.id
      patientName = selectedPatient.name
      diagnosis = selectedPatient.diagnosis
    }

    const newAppointment: Appointment = {
      id: nextId("apt"),
      clinicKey,
      patientId,
      patientName,
      doctorId: doctor.id,
      doctorName: doctor.name,
      appointmentType,
      appointmentDate: newAppointmentDate,
      appointmentTime: newAppointmentTime,
      priority: newAppointmentPriority,
      status: "Scheduled",
      notes: newAppointmentNotes.trim() ? newAppointmentNotes.trim() : diagnosis,
    }

    setAppointmentsByClinic((prev) => ({
      ...prev,
      [clinicKey]: [newAppointment, ...(prev[clinicKey] ?? [])],
    }))

    setNewAppointmentOpen(false)
    setNewAppointmentPatientSelection("")
    setNewAppointmentOtherPatientName("")
    setNewAppointmentNotes("")

    toast({
      title: "Appointment scheduled",
      description: `${patientName} • ${getClinicMeta(clinicKey).label} on ${formatDate(newAppointmentDate)} at ${newAppointmentTime}. Estimated fee: KES ${formatKES(estimatedFeeForForm)}.`,
    })
  }

  const sortedAppointmentsForClinic = (clinicKey: ClinicKey) => {
    return (appointmentsByClinic[clinicKey] ?? []).slice().sort((a, b) => {
      if (a.appointmentDate !== b.appointmentDate) return a.appointmentDate.localeCompare(b.appointmentDate)
      return a.appointmentTime.localeCompare(b.appointmentTime)
    })
  }

  const sortedNotesForClinic = (clinicKey: ClinicKey) => {
    return (notesByClinic[clinicKey] ?? []).slice().sort((a, b) => b.date.localeCompare(a.date))
  }

  const timeBadge = (clinicKey: ClinicKey) => {
    // Small label under the title to make it feel “operational”.
    const pending = pendingConsultationsCountForClinic(clinicKey)
    if (pending >= 6) return <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">High demand</Badge>
    if (pending >= 3) return <Badge variant="outline">Steady demand</Badge>
    return <Badge variant="secondary">Low demand</Badge>
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Stethoscope className="h-7 w-7 text-primary" />
            Specialist Clinics
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage specialist department appointments, patients and clinical notes
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {timeBadge(activeClinic)}
            <Badge variant="outline" className="bg-background/60">
              Today: {todayAppointmentsCountForClinic(activeClinic)} appointments
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => openNewAppointmentDialogForClinic(activeClinic)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Appointment
          </Button>
        </div>
      </div>

      <Tabs
        value={activeClinic}
        onValueChange={(v) => setActiveClinic(v as ClinicKey)}
        className="w-full"
      >
        <TabsList className="flex flex-wrap gap-1 h-auto min-h-10 justify-start overflow-x-auto">
          {CLINICS.map((clinic) => {
            const Icon = clinic.icon
            const isActive = clinic.key === activeClinic
            return (
              <TabsTrigger
                key={clinic.key}
                value={clinic.key}
                className={cn("gap-2 py-2.5", isActive ? "bg-primary/10" : undefined)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {clinic.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {CLINICS.map((clinic) => {
          const clinicKey = clinic.key
          const Icon = clinic.icon
          const isActive = clinicKey === activeClinic
          const appointmentsSorted = sortedAppointmentsForClinic(clinicKey)
          const notesSorted = sortedNotesForClinic(clinicKey)

          return (
            <TabsContent key={clinic.key} value={clinic.key} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Today&apos;s Appointments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{todayAppointmentsCountForClinic(clinicKey)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(todayYMD)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Active Patients
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{activePatientsCountForClinic(clinicKey)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ongoing consultations
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Hourglass className="h-4 w-4 text-primary" />
                      Pending Consultations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{pendingConsultationsCountForClinic(clinicKey)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Scheduled visits
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Completed This Month
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{completedThisMonthCountForClinic(clinicKey)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on clinical status
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      {clinic.label} overview
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Track appointments, patient status, and recent clinical notes for {clinic.label}.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    {isActive ? (
                      <Badge variant="outline" className="bg-background/60">
                        Viewing active clinic
                      </Badge>
                    ) : null}
                    <Badge variant="secondary">
                      {appointmentsSorted.length} appointments
                    </Badge>
                    <Badge variant="secondary">
                      {(patientsByClinic[clinicKey] ?? []).length} patients
                    </Badge>
                  </div>
                </div>

                <Tabs
                  value={activeSubtabByClinic[clinicKey]}
                  onValueChange={(v) =>
                    setActiveSubtabByClinic((prev) => ({
                      ...prev,
                      [clinicKey]: v as ClinicSubtabKey,
                    }))
                  }
                  className="w-full"
                >
                  <TabsList className="flex flex-wrap gap-1 h-auto min-h-10 justify-start">
                    <TabsTrigger value="appointments">Appointments</TabsTrigger>
                    <TabsTrigger value="patients">Patient List</TabsTrigger>
                    <TabsTrigger value="notes">Clinical Notes</TabsTrigger>
                  </TabsList>

                  <TabsContent value="appointments" className="mt-4">
                    <Card>
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">Appointments</CardTitle>
                          <CardDescription>
                            Time, patient, doctor, priority and visit status.
                          </CardDescription>
                        </div>
                        <Badge variant="outline">{appointmentsSorted.filter((a) => a.status === "Scheduled").length} scheduled</Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[170px]">Time</TableHead>
                                <TableHead>Patient Name</TableHead>
                                <TableHead>Doctor</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {appointmentsSorted.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                    No appointments found for this clinic.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                appointmentsSorted.map((a) => {
                                  const canReschedule = a.status === "Scheduled"
                                  const canCancel = a.status === "Scheduled"
                                  return (
                                    <TableRow key={a.id}>
                                      <TableCell className="align-top">
                                        <div className="font-medium">{a.appointmentTime}</div>
                                        <div className="text-xs text-muted-foreground">{formatDate(a.appointmentDate)}</div>
                                      </TableCell>
                                      <TableCell className="align-top">
                                        <div className="font-medium">{a.patientName}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {patientsByClinic[clinicKey]?.find((p) => p.id === a.patientId)?.patientNumber ?? "—"}
                                        </div>
                                      </TableCell>
                                      <TableCell className="align-top">{a.doctorName}</TableCell>
                                      <TableCell className="align-top">
                                        <div className="font-medium">{a.appointmentType}</div>
                                      </TableCell>
                                      <TableCell className="align-top">
                                        <Badge variant={getPriorityBadgeVariant(a.priority)}>{a.priority}</Badge>
                                      </TableCell>
                                      <TableCell className="align-top">
                                        <Badge variant={getAppointmentStatusBadgeVariant(a.status)}>{a.status}</Badge>
                                      </TableCell>
                                      <TableCell className="text-right align-top">
                                        <div className="flex justify-end gap-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openViewAppointment(clinicKey, a.id)}
                                          >
                                            <Eye className="h-4 w-4 mr-1" />
                                            View
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={!canReschedule}
                                            onClick={() => openRescheduleAppointment(clinicKey, a.id)}
                                          >
                                            <RefreshCw className="h-4 w-4 mr-1" />
                                            Reschedule
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={!canCancel}
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => openCancelAppointment(clinicKey, a.id)}
                                          >
                                            <XCircle className="h-4 w-4 mr-1" />
                                            Cancel
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="patients" className="mt-4">
                    <Card>
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">Patient List</CardTitle>
                          <CardDescription>
                            Current specialist clinic patients and their visit schedule.
                          </CardDescription>
                        </div>
                        <Badge variant="outline">{(patientsByClinic[clinicKey] ?? []).filter((p) => p.status === "Active").length} active</Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[130px]">Patient #</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Age</TableHead>
                                <TableHead>Diagnosis</TableHead>
                                <TableHead>Last Visit</TableHead>
                                <TableHead>Next Appointment</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(patientsByClinic[clinicKey] ?? []).map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-mono text-sm">{p.patientNumber}</TableCell>
                                  <TableCell className="font-medium">{p.name}</TableCell>
                                  <TableCell>{p.age}</TableCell>
                                  <TableCell className="min-w-[260px]">{p.diagnosis}</TableCell>
                                  <TableCell>{formatDate(p.lastVisitDate)}</TableCell>
                                  <TableCell>{formatDate(p.nextAppointmentDate)}</TableCell>
                                  <TableCell>
                                    <Badge variant={p.status === "Active" ? "secondary" : "outline"}>{p.status}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="notes" className="mt-4">
                    <Card>
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">Clinical Notes</CardTitle>
                          <CardDescription>
                            Recent consultation notes for patients in {clinic.label}.
                          </CardDescription>
                        </div>
                        <Badge variant="outline">{notesSorted.length} notes</Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {notesSorted.map((n) => (
                            <Card key={n.id} className="border-primary/20 bg-primary/5">
                              <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <CardTitle className="text-base font-semibold">{n.patientName}</CardTitle>
                                    <div className="text-sm text-muted-foreground">
                                      {formatDate(n.date)} • {n.doctorName}
                                    </div>
                                  </div>
                                  <Badge variant="outline">Clinical</Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3 pt-0">
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {excerpt(n.fullText, 140)}
                                </p>
                                <div className="flex items-center justify-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setFullNote(n)
                                      setFullNoteOpen(true)
                                    }}
                                  >
                                    View Full Note
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>

      {/* New Appointment Dialog */}
      <Dialog open={newAppointmentOpen} onOpenChange={setNewAppointmentOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Appointment</DialogTitle>
            <DialogDescription>
              Create a specialist clinic appointment for Tophill Hospital. Mock data only (no API calls).
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clinic-select">Clinic</Label>
              <Select
                value={newAppointmentClinicKey}
                onValueChange={(v) => {
                  const nextKey = v as ClinicKey
                  setNewAppointmentClinicKey(nextKey)

                  // Keep form coherent across clinic changes.
                  const nextPatients = patientsByClinic[nextKey] ?? []
                  const nextDoctors = DOCTORS_BY_CLINIC[nextKey] ?? []
                  const nextTypes = APPOINTMENT_TYPES_BY_CLINIC[nextKey] ?? []

                  setNewAppointmentPatientSelection(nextPatients[0]?.id ?? "other")
                  setNewAppointmentOtherPatientName("")
                  setNewAppointmentDoctorId(nextDoctors[0]?.id ?? "")
                  setNewAppointmentType(nextTypes[0] ?? "")
                  setNewAppointmentPriority("Routine")
                }}
              >
                <SelectTrigger id="clinic-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLINICS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient-select">Patient</Label>
              <Select
                value={newAppointmentPatientSelection || "other"}
                onValueChange={(v) => {
                  setNewAppointmentPatientSelection(v)
                  if (v !== "other") setNewAppointmentOtherPatientName("")
                }}
              >
                <SelectTrigger id="patient-select">
                  <SelectValue placeholder="Select patient..." />
                </SelectTrigger>
                <SelectContent>
                  {(patientsByClinic[newAppointmentClinicKey] ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.patientNumber})
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other (type below)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newAppointmentPatientSelection === "other" ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="patient-other-name">Other patient name</Label>
                <Input
                  id="patient-other-name"
                  value={newAppointmentOtherPatientName}
                  onChange={(e) => setNewAppointmentOtherPatientName(e.target.value)}
                  placeholder="e.g. Amina Njeri"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="doctor-select">Doctor</Label>
              <Select value={newAppointmentDoctorId} onValueChange={setNewAppointmentDoctorId}>
                <SelectTrigger id="doctor-select">
                  <SelectValue placeholder="Select doctor..." />
                </SelectTrigger>
                <SelectContent>
                  {(DOCTORS_BY_CLINIC[newAppointmentClinicKey] ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type-select">Appointment Type</Label>
              <Select value={newAppointmentType} onValueChange={setNewAppointmentType}>
                <SelectTrigger id="type-select">
                  <SelectValue placeholder="Select appointment type..." />
                </SelectTrigger>
                <SelectContent>
                  {(APPOINTMENT_TYPES_BY_CLINIC[newAppointmentClinicKey] ?? []).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-input">Date</Label>
              <Input id="date-input" type="date" value={newAppointmentDate} onChange={(e) => setNewAppointmentDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time-input">Time</Label>
              <Input id="time-input" type="time" value={newAppointmentTime} onChange={(e) => setNewAppointmentTime(e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="priority-select">Priority</Label>
              <Select value={newAppointmentPriority} onValueChange={(v) => setNewAppointmentPriority(v as AppointmentPriority)}>
                <SelectTrigger id="priority-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                  <SelectItem value="Routine">Routine</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes-input">Notes</Label>
              <Textarea
                id="notes-input"
                value={newAppointmentNotes}
                onChange={(e) => setNewAppointmentNotes(e.target.value)}
                placeholder="Enter clinical notes for triage (optional)."
                className="min-h-[110px]"
              />
            </div>

            <div className="md:col-span-2">
              <div className="rounded-md border bg-background/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Estimated consultation fee</p>
                    <p className="text-xs text-muted-foreground">Demo pricing for the selected appointment type.</p>
                  </div>
                  <Badge variant="outline" className="text-base">
                    KES {formatKES(estimatedFeeForForm)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewAppointmentOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateAppointment}>
              Schedule Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Appointment Dialog */}
      <Dialog open={viewAppointmentOpen} onOpenChange={setViewAppointmentOpen}>
        <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogDescription>Quick view for planning and documentation (demo data).</DialogDescription>
          </DialogHeader>

          {selectedViewAppointment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md border p-3 bg-background/50">
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="text-base font-semibold">{selectedViewAppointment.patientName}</p>
                </div>
                <div className="rounded-md border p-3 bg-background/50">
                  <p className="text-sm text-muted-foreground">Doctor</p>
                  <p className="text-base font-semibold">{selectedViewAppointment.doctorName}</p>
                </div>
                <div className="rounded-md border p-3 bg-background/50">
                  <p className="text-sm text-muted-foreground">Date & Time</p>
                  <p className="text-base font-semibold">
                    {formatDate(selectedViewAppointment.appointmentDate)} • {selectedViewAppointment.appointmentTime}
                  </p>
                </div>
                <div className="rounded-md border p-3 bg-background/50">
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="text-base font-semibold">{selectedViewAppointment.appointmentType}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant={getPriorityBadgeVariant(selectedViewAppointment.priority)}>
                  {selectedViewAppointment.priority} Priority
                </Badge>
                <Badge variant={getAppointmentStatusBadgeVariant(selectedViewAppointment.status)}>
                  {selectedViewAppointment.status}
                </Badge>
                <Badge variant="outline">
                  {getClinicMeta(selectedViewAppointment.clinicKey).label}
                </Badge>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <div className="rounded-md border bg-background/50 p-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedViewAppointment.notes || "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Appointment not found.</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewAppointmentOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Appointment Dialog */}
      <Dialog open={rescheduleAppointmentOpen} onOpenChange={setRescheduleAppointmentOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              Update the date and time (demo state update only).
            </DialogDescription>
          </DialogHeader>

          {selectedRescheduleAppointment ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selectedRescheduleAppointment.patientName}</Badge>
                <Badge variant="secondary">{selectedRescheduleAppointment.appointmentType}</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reschedule-date">New Date</Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reschedule-time">New Time</Label>
                  <Input
                    id="reschedule-time"
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reschedule-notes">Notes (optional)</Label>
                <Textarea
                  id="reschedule-notes"
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  placeholder="Add rescheduling context for clinical handover (optional)."
                  className="min-h-[100px]"
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Appointment not found.</div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRescheduleAppointmentOpen(false)
                setRescheduleAppointmentLocator(null)
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleRescheduleSave} disabled={!selectedRescheduleAppointment || selectedRescheduleAppointment.status !== "Scheduled"}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Appointment AlertDialog */}
      <AlertDialog
        open={cancelAppointmentOpen}
        onOpenChange={(open) => {
          setCancelAppointmentOpen(open)
          if (!open) setCancelAppointmentLocator(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the appointment as <strong>Cancelled</strong>. (Demo-only; no external API calls.)
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelConfirm}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full Clinical Note Dialog */}
      <Dialog
        open={fullNoteOpen}
        onOpenChange={(open) => {
          setFullNoteOpen(open)
          if (!open) setFullNote(null)
        }}
      >
        <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Clinical Note</DialogTitle>
            <DialogDescription>Full text for clinical documentation.</DialogDescription>
          </DialogHeader>

          {fullNote ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="outline">{fullNote.patientName}</Badge>
                <Badge variant="secondary">{getClinicMeta(fullNote.clinicKey).label}</Badge>
                <Badge variant="outline">{formatDate(fullNote.date)}</Badge>
              </div>

              <div className="rounded-md border bg-background/50 p-3">
                <p className="text-sm text-muted-foreground">Doctor</p>
                <p className="text-base font-semibold">{fullNote.doctorName}</p>
              </div>

              <div className="rounded-md border bg-background/50 p-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {fullNote.fullText}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Note not found.</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFullNoteOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

