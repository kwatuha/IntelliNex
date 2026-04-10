"use client"

import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar, Clock, FileEdit, FilePlus, MapPin, Printer, Share2, User } from "lucide-react"

// Sample appointment data - in a real app, this would come from an API call
const appointments = {
  "A-2001": {
    id: "A-2001",
    patientId: "P-1001",
    patientName: "Alice Kimutai",
    patientAge: 35,
    patientGender: "Female",
    time: "10:30 AM",
    date: "2023-05-25",
    doctor: "Dr. James Ndiwa",
    doctorId: "D-1001",
    department: "Cardiology",
    status: "Confirmed",
    type: "Follow-up",
    duration: 30,
    room: "Room 105",
    floor: "1st Floor",
    building: "Main Building",
    reason: "Blood pressure check",
    notes: "Patient has been compliant with medication",
    history: [
      { date: "2023-05-20", action: "Appointment scheduled", by: "Alice Kimutai" },
      { date: "2023-05-22", action: "Appointment confirmed", by: "Reception" },
    ],
    patientAvatar: "/diverse-group-city.png",
    patientInitials: "AK",
    doctorAvatar: "/vibrant-street-market.png",
    doctorInitials: "JN",
    insurance: "SHA",
    policyNumber: "SHA-123456",
    copay: "KES 500",
    previousAppointments: [
      { date: "2023-04-25", doctor: "Dr. James Ndiwa", reason: "Initial consultation" },
      { date: "2023-03-15", doctor: "Dr. James Ndiwa", reason: "Chest pain" },
    ],
  },
  "A-2002": {
    id: "A-2002",
    patientId: "P-1002",
    patientName: "Robert Tarus",
    patientAge: 42,
    patientGender: "Male",
    time: "11:15 AM",
    date: "2023-05-25",
    doctor: "Dr. Sarah Isuvi",
    doctorId: "D-1002",
    department: "Dermatology",
    status: "Pending",
    type: "Initial",
    duration: 45,
    room: "Room 210",
    floor: "2nd Floor",
    building: "Outpatient Building",
    reason: "Skin rash evaluation",
    notes: "New patient referral from Dr. Kimani",
    history: [
      { date: "2023-05-18", action: "Appointment requested", by: "Dr. Kimani (Referral)" },
      { date: "2023-05-19", action: "Appointment scheduled", by: "Reception" },
    ],
    patientAvatar: "/diverse-group-city.png",
    patientInitials: "RT",
    doctorAvatar: "/diverse-group-chatting.png",
    doctorInitials: "SI",
    insurance: "Jubilee",
    policyNumber: "JUB-789012",
    copay: "KES 1,000",
    previousAppointments: [],
  },
  "A-2003": {
    id: "A-2003",
    patientId: "P-1003",
    patientName: "Jennifer Elkana",
    patientAge: 28,
    patientGender: "Female",
    time: "1:00 PM",
    date: "2023-05-25",
    doctor: "Dr. Michael Siva",
    doctorId: "D-1003",
    department: "Ophthalmology",
    status: "Confirmed",
    type: "Follow-up",
    duration: 30,
    room: "Room 305",
    floor: "3rd Floor",
    building: "Specialist Wing",
    reason: "Post-surgery checkup",
    notes: "Two weeks after cataract surgery",
    history: [
      { date: "2023-05-10", action: "Appointment scheduled", by: "Dr. Michael Siva" },
      { date: "2023-05-12", action: "Appointment confirmed", by: "Reception" },
      { date: "2023-05-20", action: "Reminder sent", by: "System" },
    ],
    patientAvatar: "/diverse-group-chatting.png",
    patientInitials: "JE",
    doctorAvatar: "/diverse-group-meeting.png",
    doctorInitials: "MS",
    insurance: "AAR",
    policyNumber: "AAR-345678",
    copay: "KES 800",
    previousAppointments: [
      { date: "2023-05-11", doctor: "Dr. Michael Siva", reason: "Cataract surgery" },
      { date: "2023-04-28", doctor: "Dr. Michael Siva", reason: "Pre-surgery consultation" },
      { date: "2023-04-15", doctor: "Dr. Michael Siva", reason: "Initial eye examination" },
    ],
  },
}

export default function AppointmentDetailPage() {
  const appointmentId = useResolvedRouteParam("id", StaticRouteRegex.appointmentId)
  const appointment = appointments[appointmentId] || null

  if (!appointment) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h1 className="text-2xl font-bold">Appointment Not Found</h1>
        <p className="text-muted-foreground">The appointment with ID {appointmentId} could not be found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Appointment Details</h1>
            <Badge
              variant={
                appointment.status === "Confirmed"
                  ? "default"
                  : appointment.status === "Pending"
                    ? "secondary"
                    : appointment.status === "Cancelled"
                      ? "destructive"
                      : "outline"
              }
            >
              {appointment.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {appointment.date} at {appointment.time} • {appointment.type} • {appointment.duration} minutes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <FileEdit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" size="sm">
            <FilePlus className="h-4 w-4 mr-2" />
            Add Notes
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Patient Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarImage src={appointment.patientAvatar || "/placeholder.svg"} alt={appointment.patientName} />
                <AvatarFallback>{appointment.patientInitials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium">{appointment.patientName}</h3>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>
                    {appointment.patientAge} yrs • {appointment.patientGender}
                  </span>
                </div>
                <p className="text-sm">ID: {appointment.patientId}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Insurance</p>
                <p>{appointment.insurance}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Policy Number</p>
                <p>{appointment.policyNumber}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Copay</p>
                <p>{appointment.copay}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Doctor Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarImage src={appointment.doctorAvatar || "/placeholder.svg"} alt={appointment.doctor} />
                <AvatarFallback>{appointment.doctorInitials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium">{appointment.doctor}</h3>
                <p className="text-sm text-muted-foreground">{appointment.department}</p>
                <p className="text-sm">ID: {appointment.doctorId}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>
                  {appointment.room}, {appointment.floor}, {appointment.building}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {appointment.date} at {appointment.time} ({appointment.duration} min)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{appointment.type} Appointment</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Appointment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Reason for Visit</h3>
              <p className="text-sm">{appointment.reason}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Notes</h3>
              <p className="text-sm">{appointment.notes}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="history" className="w-full">
        <TabsList>
          <TabsTrigger value="history">Appointment History</TabsTrigger>
          <TabsTrigger value="previous">Previous Appointments</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Appointment Timeline</CardTitle>
                <CardDescription>History of actions for this appointment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {appointment.history.map((item, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm font-medium">{item.date}</p>
                        <p className="text-sm">
                          {item.action} <span className="text-muted-foreground">by {item.by}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="previous">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Previous Appointments</CardTitle>
                <CardDescription>Patient's appointment history</CardDescription>
              </CardHeader>
              <CardContent>
                {appointment.previousAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {appointment.previousAppointments.map((item, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="h-2 w-2 mt-2 rounded-full bg-secondary" />
                        <div>
                          <p className="text-sm font-medium">{item.date}</p>
                          <p className="text-sm">
                            {item.doctor} <span className="text-muted-foreground">• {item.reason}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No previous appointments found.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="documents">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Related Documents</CardTitle>
                <CardDescription>Documents associated with this appointment</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No documents found for this appointment.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
