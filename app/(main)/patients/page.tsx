"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PatientForm } from "@/components/patient-form"
import { AddToQueueDialog, type QueueServicePointChoice, queueTypeLabel } from "@/components/add-to-queue-dialog"
import { patientApi } from "@/lib/api"
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
import { Trash2, Edit, Plus, Search, Stethoscope } from "lucide-react"
import { Input } from "@/components/ui/input"
import { queueApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface Patient {
  patientId: number
  patientNumber: string
  firstName: string
  lastName: string
  middleName?: string
  dateOfBirth?: string
  gender?: string
  phone?: string
  email?: string
  address?: string
  county?: string
  subcounty?: string
  ward?: string
  idNumber?: string
  idType?: string
  bloodGroup?: string
  createdAt?: string
}

export default function PatientsPage() {
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [addingToTriage, setAddingToTriage] = useState<number | null>(null)
  const [patientPendingTriage, setPatientPendingTriage] = useState<Patient | null>(null)
  const requestIdRef = useRef(0)

  const loadPatients = useCallback(async (query: string) => {
    const requestId = ++requestIdRef.current
    try {
      setLoading(true)
      setError(null)
      const data = await patientApi.getAll(query || undefined, 1, 25)
      if (requestId !== requestIdRef.current) return
      setPatients(data)
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return
      // Keep prior rows on transient network blips; only show full error when empty
      const message = err?.message || 'Failed to load patients'
      setError(message)
      console.error('Error loading patients:', err)
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Immediate load for first paint / empty search; debounce only while typing
    const delay = searchQuery ? 300 : 0
    const timer = setTimeout(() => {
      void loadPatients(searchQuery)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [searchQuery, loadPatients])

  const handleCreate = () => {
    setEditingPatient(null)
    setIsFormOpen(true)
  }

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient)
    setIsFormOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingPatient) return

    setDeleteLoading(true)
    try {
      await patientApi.delete(deletingPatient.patientId.toString())
      setDeletingPatient(null)
      loadPatients(searchQuery) // Reload the list
    } catch (err: any) {
      setError(err.message || 'Failed to delete patient')
      console.error('Error deleting patient:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

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

  const formatDate = (date?: string): string => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString()
  }

  const executeAddToQueue = async (patient: Patient, servicePoint: QueueServicePointChoice) => {
    try {
      setAddingToTriage(patient.patientId)

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
      setAddingToTriage(null)
    }
  }

  const handleConfirmAddToQueue = async (servicePoint: QueueServicePointChoice) => {
    if (!patientPendingTriage) return
    await executeAddToQueue(patientPendingTriage, servicePoint)
    setPatientPendingTriage(null)
  }

  if (loading && patients.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">View and manage patient records</p>
        </div>
        <div className="text-center py-8 text-muted-foreground">Loading patients...</div>
      </div>
    )
  }

  if (error && !patients.length) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">View and manage patient records</p>
        </div>
        <div className="text-center py-8 text-red-500">Error: {error}</div>
        <Button onClick={() => loadPatients(searchQuery)}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">View and manage patient records</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Patient
        </Button>
      </div>

      {error && patients.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Could not refresh list ({error}). Showing last loaded results.{" "}
          <button type="button" className="underline" onClick={() => loadPatients(searchQuery)}>
            Retry
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name, patient number, phone, ID number, or email..."
          className="w-full pl-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patients.map((patient) => (
          <Card key={patient.patientId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-md">{patient.firstName} {patient.lastName}</CardTitle>
              <CardDescription>Patient ID: {patient.patientNumber}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm">
                  {patient.dateOfBirth && <p>Age: {calculateAge(patient.dateOfBirth) || 'N/A'}</p>}
                  {patient.gender && <p>Gender: {patient.gender}</p>}
                  {patient.phone && <p>Phone: {patient.phone}</p>}
                  {patient.idNumber && <p>ID No: {patient.idNumber}</p>}
                  {patient.createdAt && <p>Registered: {formatDate(patient.createdAt)}</p>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/patients/${patient.patientId}`}>View</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setPatientPendingTriage(patient)}
                    disabled={addingToTriage === patient.patientId}
                    title="Add to queue (Triage or Telemedicine)"
                  >
                    <Stethoscope className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleEdit(patient)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setDeletingPatient(patient)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {patients.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No patients found. {searchQuery && "Try adjusting your search."}
        </div>
      )}

      <PatientForm
        patient={editingPatient}
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={loadPatients}
      />

      <AddToQueueDialog
        open={!!patientPendingTriage}
        onOpenChange={(open) => !open && setPatientPendingTriage(null)}
        patientName={
          patientPendingTriage
            ? `${patientPendingTriage.firstName} ${patientPendingTriage.lastName}`
            : ""
        }
        patientNumber={patientPendingTriage?.patientNumber}
        onConfirm={handleConfirmAddToQueue}
        loading={patientPendingTriage !== null && addingToTriage === patientPendingTriage?.patientId}
      />

      <AlertDialog open={!!deletingPatient} onOpenChange={(open) => !open && setDeletingPatient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Patient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingPatient?.firstName} {deletingPatient?.lastName}? 
              This will soft delete the patient record (set voided = 1). The record will be hidden but not permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
