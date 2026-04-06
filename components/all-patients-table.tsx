"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, Download, Eye, ListPlus, MoreHorizontal, RefreshCcw, Search, Stethoscope } from "lucide-react"
import { PatientProfileDialog } from "./patient-profile-dialog"
import { hasPermission } from "@/lib/auth/permissions"
import { queueApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { AddToQueueDialog, type QueueServicePointChoice, queueTypeLabel } from "@/components/add-to-queue-dialog"

// Sample patient data
const patients = [
  {
    id: "P-1001",
    name: "John Imbayi",
    age: 45,
    gender: "Male",
    contact: "+254 712 345 678",
    address: "123 Moi Avenue, Nairobi",
    status: "Active",
    registrationDate: "2022-03-10",
    lastVisit: "2023-04-15",
    primaryDoctor: "Dr. James Ndiwa",
    avatar: "/thoughtful-portrait.png",
    initials: "JI",
  },
  // Other patients...
]

interface AllPatientsTableProps {
  onAddToQueue?: (patientId: string, patientName: string) => void
}

export function AllPatientsTable({ onAddToQueue }: AllPatientsTableProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<string>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [triagePending, setTriagePending] = useState<{ id: string; name: string } | null>(null)
  const [addingToTriage, setAddingToTriage] = useState(false)

  const itemsPerPage = 5

  // Helper function to compare dates as strings (YYYY-MM-DD format)
  const compareDates = (dateA: string, dateB: string) => {
    // Simple string comparison works for YYYY-MM-DD format
    return dateA.localeCompare(dateB)
  }

  // Filter patients based on search query and status
  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.contact.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.primaryDoctor.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = !statusFilter || patient.status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Sort patients
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    let comparison = 0

    if (sortField === "name") {
      comparison = a.name.localeCompare(b.name)
    } else if (sortField === "id") {
      comparison = a.id.localeCompare(b.id)
    } else if (sortField === "age") {
      comparison = a.age - b.age
    } else if (sortField === "registrationDate") {
      comparison = compareDates(a.registrationDate, b.registrationDate)
    } else if (sortField === "lastVisit") {
      comparison = compareDates(a.lastVisit, b.lastVisit)
    }

    return sortDirection === "asc" ? comparison : -comparison
  })

  // Paginate patients
  const totalPages = Math.ceil(sortedPatients.length / itemsPerPage)
  const paginatedPatients = sortedPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const handleViewPatient = (patientId: string) => {
    // If user has full access, navigate directly to the patient profile page
    if (hasPermission("view_patient_full")) {
      router.push(`/patients/${patientId}`)
    } else {
      // Otherwise, open the dialog with limited information
      setSelectedPatient(patientId)
      setProfileDialogOpen(true)
    }
  }

  const executeAddToQueue = async (
    patientId: string,
    patientName: string,
    servicePoint: QueueServicePointChoice,
  ) => {
    try {
      setAddingToTriage(true)
      const queues = await queueApi.getAll(servicePoint, undefined, 1, 100, false)
      const existingEntry = queues.find(
        (entry: any) =>
          entry.patientId?.toString() === patientId.toString() &&
          entry.status !== "completed" &&
          entry.status !== "cancelled",
      )

      const label = queueTypeLabel(servicePoint)

      if (existingEntry) {
        toast({
          title: `Patient Already in ${label} Queue`,
          description: `${patientName} is already in the ${label.toLowerCase()} queue (Ticket: ${existingEntry.ticketNumber || "N/A"}).`,
          variant: "default",
        })
        return
      }

      const payload = {
        patientId: parseInt(patientId, 10),
        servicePoint,
        priority: "normal",
        status: "waiting",
        notes: `Returning patient - added to ${servicePoint} queue`,
      }

      await queueApi.create(payload)

      toast({
        title: `✅ Patient Added to ${label} Queue`,
        description: `${patientName} has been successfully added to the ${label.toLowerCase()} queue.`,
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
    if (!triagePending) return
    await executeAddToQueue(triagePending.id, triagePending.name, servicePoint)
    setTriagePending(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search patients..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={statusFilter || "all"}
            onValueChange={(value) => setStatusFilter(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
                Patient {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("id")}>
                ID {sortField === "id" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("age")}>
                Age {sortField === "age" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Primary Doctor</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("lastVisit")}>
                Last Visit {sortField === "lastVisit" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPatients.length > 0 ? (
              paginatedPatients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={patient.avatar || "/placeholder.svg"} alt={patient.name} />
                        <AvatarFallback>{patient.initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{patient.name}</span>
                        <span className="text-xs text-muted-foreground">{patient.gender}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{patient.id}</TableCell>
                  <TableCell>{patient.age}</TableCell>
                  <TableCell>{patient.contact}</TableCell>
                  <TableCell>{patient.primaryDoctor}</TableCell>
                  <TableCell>{patient.lastVisit}</TableCell>
                  <TableCell>
                    <Badge variant={patient.status === "Active" ? "default" : "secondary"}>{patient.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAddToQueue && onAddToQueue(patient.id, patient.name)}
                      >
                        <ListPlus className="h-4 w-4" />
                        <span className="sr-only">Add to queue</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleViewPatient(patient.id)}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">More</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setTriagePending({ id: patient.id, name: patient.name })}>
                            <Stethoscope className="mr-2 h-4 w-4" />
                            Add to queue
                          </DropdownMenuItem>
                          <DropdownMenuItem>Edit Patient</DropdownMenuItem>
                          <DropdownMenuItem>Schedule Appointment</DropdownMenuItem>
                          <DropdownMenuItem>Print ID Card</DropdownMenuItem>
                          <DropdownMenuItem>View Medical History</DropdownMenuItem>
                          <DropdownMenuItem>View Billing History</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4">
                  No patients found matching your search criteria
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, filteredPatients.length)} of {filteredPatients.length} patients
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous Page</span>
            </Button>
            <div className="text-sm">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next Page</span>
            </Button>
          </div>
        </div>
      )}

      <AddToQueueDialog
        open={!!triagePending}
        onOpenChange={(open) => !open && setTriagePending(null)}
        patientName={triagePending?.name ?? ""}
        patientNumber={triagePending?.id}
        onConfirm={handleConfirmAddToQueue}
        loading={addingToTriage}
      />

      {/* Patient Profile Dialog */}
      {selectedPatient && (
        <PatientProfileDialog
          patientId={selectedPatient}
          open={profileDialogOpen}
          onOpenChange={setProfileDialogOpen}
        />
      )}
    </div>
  )
}
