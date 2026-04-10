"use client"

import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"
import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DoctorSchedule } from "@/components/doctor-schedule"
import { DoctorPatients } from "@/components/doctor-patients"
import { DoctorAppointments } from "@/components/doctor-appointments"
import { DoctorProcedures } from "@/components/doctor-procedures"
import { DoctorPrescriptions } from "@/components/doctor-prescriptions"
import { DoctorLabOrders } from "@/components/doctor-lab-orders"
import { DoctorQualifications } from "@/components/doctor-qualifications"
import { DoctorCollaborations } from "@/components/doctor-collaborations"
import { DoctorFeedback } from "@/components/doctor-feedback"
import { DoctorRevenue } from "@/components/doctor-revenue"
import { Calendar, FileEdit, Mail, Phone, Printer, Share2, Star, Loader2 } from "lucide-react"
import { doctorsApi } from "@/lib/api"

interface Doctor {
  userId: number
  username: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  department?: string
  isActive: boolean
  role?: string
  createdAt?: string
  updatedAt?: string
}

export default function DoctorDetailPage() {
  const doctorId = useResolvedRouteParam("id", StaticRouteRegex.doctorId)
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDoctor = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await doctorsApi.getById(doctorId)
        setDoctor(data)
      } catch (err: any) {
        setError(err.message || 'Failed to load doctor')
        console.error('Error loading doctor:', err)
      } finally {
        setLoading(false)
      }
    }

    if (doctorId) {
      loadDoctor()
    }
  }, [doctorId])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Loading doctor details...</p>
      </div>
    )
  }

  if (error || !doctor) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h1 className="text-2xl font-bold">Doctor Not Found</h1>
        <p className="text-muted-foreground">
          {error || `The doctor with ID ${doctorId} could not be found.`}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Please check that you're using a valid doctor ID.
        </p>
      </div>
    )
  }

  const doctorName = `${doctor.firstName} ${doctor.lastName}`
  const initials = `${doctor.firstName?.[0] || ''}${doctor.lastName?.[0] || ''}`.toUpperCase()

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 border-2 border-background">
            <AvatarImage src="" alt={doctorName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{doctorName}</h1>
              <Badge variant={doctor.isActive ? "default" : "outline"}>
                {doctor.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>{doctor.role || "Doctor"}</span>
              {doctor.department && (
                <>
                  <span className="mx-1">•</span>
                  <span>{doctor.department}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm mt-1">
              {doctor.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{doctor.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{doctor.email}</span>
              </div>
              {doctor.createdAt && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Joined: {new Date(doctor.createdAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <FileEdit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Schedule
          </Button>
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {doctor.department && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Department</p>
                <p className="text-sm">{doctor.department}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Username</p>
              <p className="text-sm">{doctor.username}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="text-sm">{doctor.isActive ? "Active" : "Inactive"}</p>
            </div>
            {doctor.phone && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                <p className="text-sm">{doctor.phone}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-sm">{doctor.email}</p>
            </div>
            {doctor.updatedAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <p className="text-sm">{new Date(doctor.updatedAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="w-full justify-start overflow-auto">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="procedures">Procedures</TabsTrigger>
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="lab-orders">Lab Orders</TabsTrigger>
          <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
          <TabsTrigger value="collaborations">Collaborations</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>
        <div className="mt-4 space-y-4">
          <TabsContent value="schedule" className="space-y-4">
            <DoctorSchedule doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="patients" className="space-y-4">
            <DoctorPatients doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="appointments" className="space-y-4">
            <DoctorAppointments doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="procedures" className="space-y-4">
            <DoctorProcedures doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="prescriptions" className="space-y-4">
            <DoctorPrescriptions doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="lab-orders" className="space-y-4">
            <DoctorLabOrders doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="qualifications" className="space-y-4">
            <DoctorQualifications doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="collaborations" className="space-y-4">
            <DoctorCollaborations doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="feedback" className="space-y-4">
            <DoctorFeedback doctorId={doctorId} />
          </TabsContent>
          <TabsContent value="revenue" className="space-y-4">
            <DoctorRevenue doctorId={doctorId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
