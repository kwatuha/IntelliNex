"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell, CheckCircle, Clock, UserCheck, FileText } from "lucide-react"
import {
  getQueueByServicePoint,
  getServicePointName,
  calculateWaitTime,
  getPriorityColor,
  type ServicePoint,
  type QueueEntry,
  type QueueStatus,
} from "@/lib/data/queue-data"
import { toast } from "@/components/ui/use-toast"
import dynamic from "next/dynamic"
import { useAuth } from "@/lib/auth/auth-context"
import { queueApi } from "@/lib/api"
import { Loader2, Pill } from "lucide-react"

const PatientEncounterForm = dynamic(
  () => import("@/components/patient-encounter-form").then((m) => m.PatientEncounterForm),
  { ssr: false, loading: () => null }
)
const DispenseMedicationDialog = dynamic(
  () => import("@/components/dispense-medication-dialog").then((m) => m.DispenseMedicationDialog),
  { ssr: false, loading: () => null }
)

interface CallPatientPanelProps {
  servicePoint: ServicePoint
  staffName: string
  counterNumber?: number
}

export function CallPatientPanel({ servicePoint, staffName, counterNumber = 1 }: CallPatientPanelProps) {
  const [currentPatient, setCurrentPatient] = useState<QueueEntry | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [encounterFormOpen, setEncounterFormOpen] = useState(false)
  const [currentDoctorId, setCurrentDoctorId] = useState<string | undefined>()
  const [queueData, setQueueData] = useState<QueueEntry[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [dispenseDialogOpen, setDispenseDialogOpen] = useState(false)
  const { user } = useAuth()
  const isPharmacy = servicePoint === "pharmacy"

  // Get current doctor ID from auth context or localStorage
  useEffect(() => {
    // Try to get doctor ID from auth context
    if (user?.id) {
      // Check if user is a doctor by checking role or trying to find doctor record
      // For now, we'll use the user ID directly if available
      setCurrentDoctorId(user.id)
    } else {
      // Fallback: try to get from localStorage token
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('jwt_token')
        if (token) {
          // Decode JWT to get user ID (basic decode, not verified)
          const payload = JSON.parse(atob(token.split('.')[1]))
          if (payload?.user?.id) {
            setCurrentDoctorId(payload.user.id.toString())
          }
        }
      } catch (e) {
        console.error('Error getting doctor ID:', e)
      }
    }
  }, [user])

  // Fetch queue data from API
  useEffect(() => {
    const loadQueueData = async () => {
      try {
        setLoadingQueue(true)
        const data = await queueApi.getAll(servicePoint, "waiting")
        
        // Map API response to QueueEntry format
        const mappedData: QueueEntry[] = data.map((entry: any) => ({
          id: entry.queueId?.toString() || entry.id?.toString() || "",
          patientId: entry.patientId?.toString() || "",
          patientName: entry.patientFirstName && entry.patientLastName
            ? `${entry.patientFirstName} ${entry.patientLastName}`
            : entry.patientName || "Unknown Patient",
          servicePoint: entry.servicePoint || servicePoint,
          ticketNumber: entry.ticketNumber || "",
          status: entry.status || "waiting",
          priority: entry.priority || "normal",
          estimatedWaitTime: entry.estimatedWaitTime,
          arrivalTime: entry.arrivalTime || new Date().toISOString(),
          startTime: entry.startTime,
          endTime: entry.endTime,
        }))
        
        setQueueData(mappedData)
      } catch (error) {
        console.error('Error loading queue data:', error)
        // Fallback to mock data if API fails
        const mockData = getQueueByServicePoint(servicePoint).filter((entry) => entry.status === "waiting")
        setQueueData(mockData)
      } finally {
        setLoadingQueue(false)
      }
    }

    loadQueueData()
  }, [servicePoint, refreshTrigger])

  const waitingQueue = queueData.filter((entry) => entry.status === "waiting" || entry.status === "called")
  const nextPatient = waitingQueue.length > 0 ? waitingQueue[0] : null

  const handleCallNext = async () => {
    if (!nextPatient) {
      toast({
        title: "No patients in queue",
        description: "There are no patients waiting in the queue.",
        variant: "destructive",
      })
      return
    }

    console.log('handleCallNext called:', {
      servicePoint,
      isConsultation: servicePoint === "consultation",
      nextPatient: nextPatient.patientName,
      patientId: nextPatient.patientId
    })

    try {
      // Update patient status via API
      const queueId = nextPatient.id
      if (queueId) {
        await queueApi.updateStatus(queueId, "called")
      }

      // Update local state
      const updatedPatient = { ...nextPatient, status: "serving" as QueueStatus }
      setCurrentPatient(updatedPatient)
      console.log('Current patient set:', updatedPatient)

      // Notify that patient has been called
      toast({
        title: "Patient Called",
        description: `${nextPatient.patientName} has been called to ${getServicePointName(servicePoint)}`,
      })

      // Auto-open encounter form for consultation service point
      console.log('Checking service point:', {
        servicePoint,
        isConsultation: servicePoint === "consultation",
        willOpen: servicePoint === "consultation"
      })
      
      if (servicePoint === "consultation") {
        console.log('Setting encounter form to open for patient:', {
          patientId: nextPatient.patientId,
          patientName: nextPatient.patientName,
          servicePoint: servicePoint,
          doctorId: currentDoctorId
        })
        // Use state updater function to ensure it works
        setEncounterFormOpen(true)
        console.log('Encounter form open state set to true')
      } else {
        console.log('Not opening form - service point is:', servicePoint)
      }

      // Trigger refresh of queue data
      setRefreshTrigger((prev) => prev + 1)
    } catch (error: any) {
      console.error('Error calling patient:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to call patient",
        variant: "destructive",
      })
    }
  }

  const handleCompleteService = () => {
    if (!currentPatient) {
      toast({
        title: "No active patient",
        description: "There is no patient currently being served.",
        variant: "destructive",
      })
      return
    }

    // In a real app, this would be an API call to update the patient's status
    toast({
      title: "Service Completed",
      description: `Service for ${currentPatient.patientName} has been completed.`,
    })

    // Clear current patient
    setCurrentPatient(null)

    // Trigger refresh of queue data
    setRefreshTrigger((prev) => prev + 1)
  }

  const handleTransferPatient = (targetServicePoint: ServicePoint) => {
    if (!currentPatient) {
      toast({
        title: "No active patient",
        description: "There is no patient to transfer.",
        variant: "destructive",
      })
      return
    }

    // In a real app, this would be an API call to transfer the patient
    toast({
      title: "Patient Transferred",
      description: `${currentPatient.patientName} has been transferred to ${getServicePointName(targetServicePoint)}.`,
    })

    // Clear current patient
    setCurrentPatient(null)

    // Trigger refresh of queue data
    setRefreshTrigger((prev) => prev + 1)
  }

  // All available service points for transfer
  const transferServicePoints: ServicePoint[] = [
    "triage",
    "consultation",
    "laboratory",
    "radiology",
    "pharmacy",
    "cashier",
    "billing",
    "telemedicine",
    "procedure",
  ].filter((point) => point !== servicePoint)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Service Station</CardTitle>
              <CardDescription>
                {getServicePointName(servicePoint)} - Counter {counterNumber}
              </CardDescription>
            </div>
            <Badge variant="outline">{staffName}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {currentPatient ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Currently Serving</p>
                  <h3 className="text-2xl font-bold mt-1">{currentPatient.patientName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">#{currentPatient.ticketNumber}</Badge>
                    <Badge variant="outline" className={getPriorityColor(currentPatient.priority)}>
                      {currentPatient.priority}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{calculateWaitTime(currentPatient)} min wait</span>
                </div>
              </div>

              <div className="flex gap-2">
                {servicePoint === "consultation" && (
                  <Button 
                    onClick={() => setEncounterFormOpen(true)} 
                    className="flex-1" 
                    size="sm"
                    variant="default"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Start Encounter
                  </Button>
                )}
                {isPharmacy && (
                  <Button 
                    onClick={() => setDispenseDialogOpen(true)} 
                    className="flex-1" 
                    size="sm"
                    variant="default"
                  >
                    <Pill className="h-4 w-4 mr-2" />
                    Dispense Medication
                  </Button>
                )}
                <Button onClick={handleCompleteService} className="flex-1" size="sm" variant="outline">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete Service
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Patient Being Served</h3>
              <p className="text-sm text-muted-foreground mt-1">Call the next patient in queue</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t pt-4">
          <Button onClick={handleCallNext} disabled={!nextPatient || currentPatient !== null || loadingQueue} className="w-full">
            {loadingQueue ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Call Next Patient
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {currentPatient && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Transfer Patient</CardTitle>
            <CardDescription>Send patient to another service point</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {transferServicePoints.map((point) => (
                <Button key={point} variant="outline" size="sm" onClick={() => handleTransferPatient(point)}>
                  {getServicePointName(point)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Next in Queue</CardTitle>
          <CardDescription>Patients waiting for service</CardDescription>
        </CardHeader>
        <CardContent>
          {queueData.length > 0 ? (
            <div className="space-y-3">
              {queueData.slice(0, 3).map((entry, index) => (
                <div key={entry.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Badge variant={index === 0 ? "default" : "outline"}>#{entry.ticketNumber}</Badge>
                    <span className="font-medium">{entry.patientName}</span>
                    <Badge variant="outline" className={getPriorityColor(entry.priority)}>
                      {entry.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {calculateWaitTime(entry)} min
                  </div>
                </div>
              ))}

              {queueData.length > 3 && (
                <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                  +{queueData.length - 3} more patients in queue
                </p>
              )}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">No patients waiting in queue</div>
          )}
        </CardContent>
      </Card>

      {/* Patient Encounter Form - Only show for consultation service point */}
      {(() => {
        const shouldShow = servicePoint === "consultation" && currentPatient
        console.log('Rendering encounter form check:', {
          servicePoint,
          isConsultation: servicePoint === "consultation",
          hasCurrentPatient: !!currentPatient,
          shouldShow,
          encounterFormOpen,
          patientId: currentPatient?.patientId
        })
        return shouldShow ? (
          <>
            {process.env.NODE_ENV === 'development' && (
              <div className="text-xs text-muted-foreground p-2 bg-muted rounded mb-2">
                Debug: ServicePoint={servicePoint}, Patient={currentPatient?.patientId}, Open={encounterFormOpen ? 'Yes' : 'No'}
              </div>
            )}
            <PatientEncounterForm
              open={encounterFormOpen}
              onOpenChange={(open) => {
                console.log('Encounter form onOpenChange called:', open, 'Current patient:', currentPatient?.patientId)
                setEncounterFormOpen(open)
              }}
              initialPatientId={currentPatient.patientId}
              initialDoctorId={currentDoctorId}
              onSuccess={() => {
                toast({
                  title: "Encounter Saved",
                  description: `Encounter for ${currentPatient.patientName} has been saved successfully.`,
                })
                // Optionally complete the service after encounter is saved
                // handleCompleteService()
              }}
            />
          </>
        ) : null
      })()}

      {/* Dispense Medication Dialog for pharmacy */}
      {isPharmacy && currentPatient && (
        <DispenseMedicationDialog
          open={dispenseDialogOpen}
          onOpenChange={(open) => {
            setDispenseDialogOpen(open)
          }}
          patientId={parseInt(currentPatient.patientId)}
          onDispensed={() => {
            toast({
              title: "Medications Dispensed",
              description: `Medications for ${currentPatient.patientName} have been dispensed successfully.`,
            })
          }}
        />
      )}
    </div>
  )
}
