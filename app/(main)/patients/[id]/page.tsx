"use client"
import { useState, useEffect } from "react"
import {
  Activity,
  Calendar,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskRoundIcon as Flask,
  HeartPulse,
  History,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PillIcon as Pills,
  Stethoscope,
  Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RoleFilteredTabs } from "@/components/role-filtered-tabs"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { PatientTimeline } from "@/components/patient-timeline"
import { PatientVitals } from "@/components/patient-vitals"
import { PatientAlerts } from "@/components/patient-alerts"
import { PatientMedicalOverview } from "@/components/patient-medical-overview"
import { PatientLabResults } from "@/components/patient-lab-results"
import { PatientMedications } from "@/components/patient-medications"
import { PatientProcedures } from "@/components/patient-procedures"
import { PatientRadiology } from "@/components/patient-radiology"
import { PatientOrders } from "@/components/patient-orders"
import { PatientAppointments } from "@/components/patient-appointments"
import { PatientBilling } from "@/components/patient-billing"
import { PatientAdmissions } from "@/components/patient-admissions"
import { PatientDocuments } from "@/components/patient-documents"
import { PatientAllergies } from "@/components/patient-allergies"
import { PatientNcd } from "@/components/patient-ncd"
import { PatientVitalsTrendCharts } from "@/components/patient-vitals-trend-charts"
import { PatientInsurance } from "@/components/patient-insurance"
import { PatientFamilyHistory } from "@/components/patient-family-history"
import { PatientQueueStatus } from "@/components/patient-queue-status"
import { patientApi, insuranceApi, queueApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { AddToQueueDialog, type QueueServicePointChoice, queueTypeLabel } from "@/components/add-to-queue-dialog"
import { StaticRouteRegex, useResolvedRouteParam, STATIC_EXPORT_PARAM_PLACEHOLDER } from "@/lib/utils/static-export-params"

export default function PatientProfilePage() {
  const { toast } = useToast()
  const patientId = useResolvedRouteParam("id", StaticRouteRegex.patientId)
  const [patient, setPatient] = useState<any>(null)
  const [insuranceCompanyName, setInsuranceCompanyName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingToTriage, setAddingToTriage] = useState(false)
  const [confirmTriageOpen, setConfirmTriageOpen] = useState(false)
  const [patientInfoOpen, setPatientInfoOpen] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const loadPatient = async () => {
      if (!patientId || patientId === STATIC_EXPORT_PARAM_PLACEHOLDER) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const data = await patientApi.getById(patientId)
        if (cancelled) return
        setPatient(data)

        if (data.insuranceCompanyId) {
          try {
            const provider = await insuranceApi.getProviderById(data.insuranceCompanyId.toString())
            if (cancelled) return
            setInsuranceCompanyName(provider.providerName || null)
          } catch (err) {
            console.error('Error loading insurance provider:', err)
            if (!cancelled) setInsuranceCompanyName(null)
          }
        } else if (!cancelled) {
          setInsuranceCompanyName(null)
        }
      } catch (err: any) {
        if (cancelled) return
        setError(err.message || 'Failed to load patient')
        console.error('Error loading patient:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPatient()
    return () => {
      cancelled = true
    }
  }, [patientId, reloadKey])

  const retryLoadPatient = () => setReloadKey((k) => k + 1)
  const calculateAge = (dateOfBirth?: string): number | null => {
    if (!dateOfBirth) return null
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  const getInitials = (firstName?: string, lastName?: string): string => {
    const first = firstName?.charAt(0) || ''
    const last = lastName?.charAt(0) || ''
    return (first + last).toUpperCase()
  }

  const executeAddToQueue = async (servicePoint: QueueServicePointChoice) => {
    if (!patient || !patient.patientId) return

    try {
      setAddingToTriage(true)

      const queues = await queueApi.getAll(servicePoint, undefined, 1, 100, false)
      const existingEntry = queues.find(
        (entry: any) =>
          entry.patientId?.toString() === patient.patientId.toString() &&
          entry.status !== "completed" &&
          entry.status !== "cancelled",
      )

      const label = queueTypeLabel(servicePoint)

      if (existingEntry) {
        toast({
          title: `Patient Already in ${label} Queue`,
          description: `${patient.firstName} ${patient.lastName} is already in the ${label.toLowerCase()} queue (Ticket: ${existingEntry.ticketNumber || "N/A"}).`,
          variant: "default",
        })
        return
      }

      const payload = {
        patientId: patient.patientId,
        servicePoint,
        priority: "normal",
        status: "waiting",
        notes: `Returning patient - added to ${servicePoint} queue`,
      }

      await queueApi.create(payload)

      toast({
        title: `✅ Patient Added to ${label} Queue`,
        description: `${patient.firstName} ${patient.lastName} has been successfully added to the ${label.toLowerCase()} queue.`,
        variant: "default",
      })
    } catch (error: any) {
      console.error("Error adding patient to queue:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to add patient to queue. Please try again.",
        variant: "destructive",
      })
    } finally {
      setAddingToTriage(false)
    }
  }

  const handleConfirmAddToQueue = async (servicePoint: QueueServicePointChoice) => {
    await executeAddToQueue(servicePoint)
    setConfirmTriageOpen(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center py-8">Loading patient data...</div>
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center py-8 text-red-500">
          {error || 'Patient not found'}
        </div>
        <Button onClick={retryLoadPatient}>Retry</Button>
      </div>
    )
  }

  // Transform API data to match component expectations
  const getInsuranceDisplay = () => {
    if (patient.patientType === 'insurance') {
      const providerName = insuranceCompanyName || 'Unknown Provider'
      const insuranceNum = patient.insuranceNumber || 'N/A'
      return `${providerName}${insuranceNum !== 'N/A' ? ` - ${insuranceNum}` : ''}`
    }
    return 'Paying Patient'
  }

  const patientDisplay = {
    id: patient.patientNumber,
    name: `${patient.firstName} ${patient.lastName}`,
    age: calculateAge(patient.dateOfBirth),
    gender: patient.gender,
    dob: patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'N/A',
    bloodType: patient.bloodGroup || 'N/A',
    contact: patient.phone || 'N/A',
    email: patient.email || 'N/A',
    address: patient.address || 'N/A',
    emergencyContact: patient.nextOfKinName
      ? `${patient.nextOfKinName} (${patient.nextOfKinRelationship || 'N/A'}) - ${patient.nextOfKinPhone || 'N/A'}`
      : 'N/A',
    occupation: 'N/A', // Not in current schema
    maritalStatus: 'N/A', // Not in current schema
    nationalId: patient.idNumber || 'N/A',
    patientType: patient.patientType || 'paying',
    insuranceProvider: insuranceCompanyName || 'N/A',
    insuranceNumber: patient.insuranceNumber || 'N/A',
    insuranceDisplay: getInsuranceDisplay(),
    registrationDate: patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : 'N/A',
    status: patient.voided === 0 ? "Active" : "Inactive",
    avatar: "/thoughtful-portrait.png",
    initials: getInitials(patient.firstName, patient.lastName),
    primaryDoctor: 'N/A', // Will be fetched from appointments/doctors
    lastVisit: 'N/A', // Will be calculated from appointments
    nextAppointment: 'N/A', // Will be fetched from appointments
    alerts: [], // Will be populated from allergies and other sources
  }

  return (
    <div className="flex flex-col gap-6">
      <AddToQueueDialog
        open={confirmTriageOpen}
        onOpenChange={setConfirmTriageOpen}
        patientName={`${patient.firstName} ${patient.lastName}`}
        patientNumber={patient.patientNumber}
        onConfirm={handleConfirmAddToQueue}
        loading={addingToTriage}
      />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patient Profile</h1>
          <p className="text-muted-foreground">Comprehensive view of patient information and medical history</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="default"
            onClick={() => setConfirmTriageOpen(true)}
            disabled={addingToTriage}
          >
            <Stethoscope className="mr-2 h-4 w-4" />
            Add to queue
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/patients/${patientId}/history`}>
              <FileText className="mr-2 h-4 w-4" />
              View & Download History
            </Link>
          </Button>
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Export Summary
          </Button>
          <Button>
            <ClipboardList className="mr-2 h-4 w-4" />
            Add Note
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {!patientInfoOpen && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={patientDisplay.avatar || "/placeholder.svg"} alt={patientDisplay.name} />
              <AvatarFallback>{patientDisplay.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{patientDisplay.name}</p>
                <Badge variant={patientDisplay.status === "Active" ? "default" : "outline"}>
                  {patientDisplay.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                #{patientDisplay.id}
                {patientDisplay.age !== null ? ` • ${patientDisplay.age} years` : ""}
                {patientDisplay.gender ? ` • ${patientDisplay.gender}` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPatientInfoOpen(true)}
              className="gap-2"
            >
              <PanelLeftOpen className="h-4 w-4" />
              Patient details
            </Button>
          </div>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-6",
            patientInfoOpen ? "xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]" : "grid-cols-1",
          )}
        >
          {patientInfoOpen && (
            <Card className="min-w-0 self-start">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2 pb-2">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-lg font-medium">Patient Information</CardTitle>
                  <Badge variant={patientDisplay.status === "Active" ? "default" : "outline"}>
                    {patientDisplay.status}
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Hide patient information to give Medical Information more space"
                  onClick={() => setPatientInfoOpen(false)}
                >
                  <PanelLeftClose className="h-4 w-4" />
                  <span className="sr-only">Hide patient information</span>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center space-y-3 pb-4">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={patientDisplay.avatar || "/placeholder.svg"} alt={patientDisplay.name} />
                    <AvatarFallback>{patientDisplay.initials}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 text-center">
                    <h3 className="text-xl font-semibold">{patientDisplay.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      #{patientDisplay.id} • {patientDisplay.age !== null ? `${patientDisplay.age} years` : 'Age N/A'} • {patientDisplay.gender}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="text-sm font-medium">{patientDisplay.dob}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Blood Type</p>
                      <p className="text-sm font-medium">{patientDisplay.bloodType}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Contact</p>
                    <p className="text-sm font-medium">{patientDisplay.contact}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{patientDisplay.email}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm font-medium">{patientDisplay.address}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Emergency Contact</p>
                    <p className="text-sm font-medium">{patientDisplay.emergencyContact}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Occupation</p>
                      <p className="text-sm font-medium">{patientDisplay.occupation}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Marital Status</p>
                      <p className="text-sm font-medium">{patientDisplay.maritalStatus}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">National ID</p>
                    <p className="text-sm font-medium">{patientDisplay.nationalId}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Patient Type</p>
                    <p className="text-sm font-medium capitalize">{patientDisplay.patientType}</p>
                  </div>
                  {patientDisplay.patientType === 'insurance' && (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Insurance Company</p>
                        <p className="text-sm font-medium">{patientDisplay.insuranceProvider}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Insurance Number</p>
                        <p className="text-sm font-medium">{patientDisplay.insuranceNumber}</p>
                      </div>
                    </>
                  )}

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Primary Doctor</p>
                    <p className="text-sm font-medium">{patientDisplay.primaryDoctor}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Registration Date</p>
                      <p className="text-sm font-medium">{patientDisplay.registrationDate}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Last Visit</p>
                      <p className="text-sm font-medium">{patientDisplay.lastVisit}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Next Appointment</p>
                    <p className="text-sm font-medium">{patientDisplay.nextAppointment}</p>
                  </div>

                  <PatientQueueStatus patientId={patientDisplay.id} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Patient Medical Information Tabs */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Medical Information</CardTitle>
              <CardDescription>Comprehensive medical history and current health status</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleFilteredTabs
                pagePath="/patients/[id]"
                defaultValue="overview"
                tabs={[
                  { value: "overview", label: "Overview" },
                  { value: "vitals", label: "Vitals" },
                  { value: "lab-results", label: "Lab Results" },
                  { value: "medications", label: "Medications" },
                  { value: "procedures", label: "Procedures" },
                  { value: "radiology", label: "Radiology" },
                  { value: "orders", label: "Orders" },
                  { value: "appointments", label: "Appointments" },
                  { value: "billing", label: "Billing" },
                  { value: "admissions", label: "Admissions" },
                  { value: "documents", label: "Documents" },
                  { value: "allergies", label: "Allergies" },
                  { value: "ncd", label: "NCD Care" },
                  { value: "insurance", label: "Insurance" },
                  { value: "family-history", label: "Family History" },
                ]}
                className="space-y-6"
              >
                <TabsContent value="overview" className="space-y-4">
                  <PatientMedicalOverview patientId={patientId} />
                </TabsContent>

                <TabsContent value="vitals" className="space-y-4">
                  <PatientVitalsTrendCharts patientId={patientId} />
                  <PatientVitals patientId={patientId} />
                </TabsContent>

                <TabsContent value="lab-results" className="space-y-4">
                  <PatientLabResults patientId={patientId} />
                </TabsContent>

                <TabsContent value="medications" className="space-y-4">
                  <PatientMedications patientId={patientId} />
                </TabsContent>

                <TabsContent value="procedures" className="space-y-4">
                  <PatientProcedures patientId={patientId} />
                </TabsContent>

                <TabsContent value="radiology" className="space-y-4">
                  <PatientRadiology patientId={patientId} />
                </TabsContent>

                <TabsContent value="orders" className="space-y-4">
                  <PatientOrders patientId={patientId} />
                </TabsContent>

                <TabsContent value="appointments" className="space-y-4">
                  <PatientAppointments patientId={patientId} />
                </TabsContent>

                <TabsContent value="billing" className="space-y-4">
                  <PatientBilling patientId={patientId} />
                </TabsContent>

                <TabsContent value="admissions" className="space-y-4">
                  <PatientAdmissions patientId={patientId} />
                </TabsContent>

                <TabsContent value="documents" className="space-y-4">
                  <PatientDocuments patientId={patientId} />
                </TabsContent>

                <TabsContent value="allergies" className="space-y-4">
                  <PatientAllergies patientId={patientId} />
                </TabsContent>

                <TabsContent value="ncd" className="space-y-4">
                  <PatientNcd patientId={patientId} />
                </TabsContent>

                <TabsContent value="insurance" className="space-y-4">
                  <PatientInsurance patientId={patientId} />
                </TabsContent>

                <TabsContent value="family-history" className="space-y-4">
                  <PatientFamilyHistory patientId={patientId} />
                </TabsContent>
              </RoleFilteredTabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
