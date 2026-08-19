"use client"

import React, { useMemo, useState } from "react"
import {
  Activity,
  CalendarDays,
  Droplets,
  Stethoscope,
  Waveform,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type DialysisType = "Haemodialysis" | "Peritoneal"
type SessionStatus = "Scheduled" | "In Progress" | "Completed"
type PatientStatus = "Active" | "Stable" | "On Review"
type MachineStatus = "Available" | "In Use" | "Maintenance"

interface DialysisPatient {
  patientNo: string
  name: string
  age: number
  diagnosis: string
  sessionsPerWeek: number
  lastSessionDisplay: string
  bp: string
  weightKg: number
  status: PatientStatus
}

interface DialysisSession {
  id: string
  sessionNo: string
  patientNo: string
  patientName: string
  machineNo: string
  startTime: string
  endTime: string
  dialysisType: DialysisType
  nurse: string
  status: SessionStatus
}

interface MachineStatusCard {
  machineNo: string
  status: MachineStatus
  currentPatientName?: string
  lastServicedDisplay: string
}

interface ClinicalNote {
  id: string
  patientName: string
  dateDisplay: string
  nephrologist: string
  summary: string
}

interface ScheduleSessionFormState {
  patientNo: string
  machineNo: string
  dateValue: string
  timeValue: string
  durationMinutes: number
  dialysisType: DialysisType
  nurse: string
  notes: string
}

const formatDateDisplay = (value: Date) =>
  new Intl.DateTimeFormat("en-KE", { day: "2-digit", month: "short", year: "numeric" }).format(value)

const toDateInputValue = (value: Date) => value.toISOString().split("T")[0]

const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map((t) => Number(t))
  return h * 60 + m
}

const minutesToTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`

const getSessionBadgeVariant = (status: SessionStatus) => {
  switch (status) {
    case "Completed":
      return "secondary"
    case "In Progress":
      return "default"
    case "Scheduled":
      return "outline"
    default:
      return "secondary"
  }
}

const getMachineBadgeVariant = (status: MachineStatus) => {
  switch (status) {
    case "In Use":
      return "default"
    case "Available":
      return "secondary"
    case "Maintenance":
      return "destructive"
    default:
      return "secondary"
  }
}

export default function RenalDialysisPage() {
  const today = useMemo(() => new Date(), [])
  const todayDisplay = useMemo(() => formatDateDisplay(today), [today])
  const todayDateInput = useMemo(() => toDateInputValue(today), [today])

  const nurses = useMemo(
    () => ["Nurse Akinyi", "Nurse Grace Wambui", "Nurse Josephine", "Nurse Brian Okoth", "Nurse Faith Mugo"],
    []
  )

  const patients: DialysisPatient[] = useMemo(
    () => [
      {
        patientNo: "PT-0018",
        name: "Asha Wanjiru",
        age: 56,
        diagnosis: "CKD Stage 5",
        sessionsPerWeek: 3,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
        bp: "128/74",
        weightKg: 62.4,
        status: "Active",
      },
      {
        patientNo: "PT-0021",
        name: "George Otieno",
        age: 49,
        diagnosis: "ESRD",
        sessionsPerWeek: 4,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)),
        bp: "136/82",
        weightKg: 71.2,
        status: "Stable",
      },
      {
        patientNo: "PT-0034",
        name: "Mary Njeri",
        age: 62,
        diagnosis: "Diabetic Nephropathy",
        sessionsPerWeek: 3,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)),
        bp: "124/78",
        weightKg: 68.9,
        status: "Active",
      },
      {
        patientNo: "PT-0040",
        name: "Daniel Kiptoo",
        age: 54,
        diagnosis: "Hypertensive Nephrosclerosis",
        sessionsPerWeek: 3,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
        bp: "130/80",
        weightKg: 65.3,
        status: "On Review",
      },
      {
        patientNo: "PT-0052",
        name: "Evelyn Karanja",
        age: 45,
        diagnosis: "FSGS",
        sessionsPerWeek: 2,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)),
        bp: "118/70",
        weightKg: 58.6,
        status: "Stable",
      },
      {
        patientNo: "PT-0063",
        name: "Samuel Mutua",
        age: 59,
        diagnosis: "Membranous Nephropathy",
        sessionsPerWeek: 3,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000)),
        bp: "134/76",
        weightKg: 73.1,
        status: "Active",
      },
      {
        patientNo: "PT-0071",
        name: "Catherine Wekesa",
        age: 52,
        diagnosis: "CKD Stage 5",
        sessionsPerWeek: 3,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
        bp: "126/79",
        weightKg: 66.8,
        status: "Stable",
      },
      {
        patientNo: "PT-0088",
        name: "Robert Muthoni",
        age: 60,
        diagnosis: "ESRD",
        sessionsPerWeek: 4,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)),
        bp: "141/88",
        weightKg: 74.6,
        status: "On Review",
      },
      {
        patientNo: "PT-0097",
        name: "Amani Hassan",
        age: 43,
        diagnosis: "Diabetic Nephropathy",
        sessionsPerWeek: 2,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)),
        bp: "116/68",
        weightKg: 57.4,
        status: "Stable",
      },
      {
        patientNo: "PT-0105",
        name: "Judith Mugo",
        age: 63,
        diagnosis: "Urine Obstruction (Chronic)",
        sessionsPerWeek: 3,
        lastSessionDisplay: formatDateDisplay(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)),
        bp: "129/81",
        weightKg: 69.8,
        status: "Active",
      },
    ],
    [today]
  )

  const machines = useMemo(
    () => ["HD-01", "HD-02", "HD-03", "HD-04", "HD-05", "HD-06"],
    []
  )

  const [sessions, setSessions] = useState<DialysisSession[]>(() => [
    {
      id: "ds-1",
      sessionNo: "DS-1001",
      patientNo: "PT-0018",
      patientName: "Asha Wanjiru",
      machineNo: "HD-01",
      startTime: "07:30",
      endTime: "11:30",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Akinyi",
      status: "Scheduled",
    },
    {
      id: "ds-2",
      sessionNo: "DS-1002",
      patientNo: "PT-0021",
      patientName: "George Otieno",
      machineNo: "HD-02",
      startTime: "08:00",
      endTime: "12:00",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Grace Wambui",
      status: "In Progress",
    },
    {
      id: "ds-3",
      sessionNo: "DS-1003",
      patientNo: "PT-0034",
      patientName: "Mary Njeri",
      machineNo: "HD-03",
      startTime: "09:00",
      endTime: "13:00",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Josephine",
      status: "Scheduled",
    },
    {
      id: "ds-4",
      sessionNo: "DS-1004",
      patientNo: "PT-0040",
      patientName: "Daniel Kiptoo",
      machineNo: "HD-04",
      startTime: "10:00",
      endTime: "14:00",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Brian Okoth",
      status: "Scheduled",
    },
    {
      id: "ds-5",
      sessionNo: "DS-1005",
      patientNo: "PT-0052",
      patientName: "Evelyn Karanja",
      machineNo: "HD-01",
      startTime: "13:00",
      endTime: "17:00",
      dialysisType: "Peritoneal",
      nurse: "Nurse Akinyi",
      status: "Scheduled",
    },
    {
      id: "ds-6",
      sessionNo: "DS-1006",
      patientNo: "PT-0063",
      patientName: "Samuel Mutua",
      machineNo: "HD-02",
      startTime: "12:30",
      endTime: "16:30",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Grace Wambui",
      status: "Scheduled",
    },
    {
      id: "ds-7",
      sessionNo: "DS-1007",
      patientNo: "PT-0071",
      patientName: "Catherine Wekesa",
      machineNo: "HD-03",
      startTime: "15:00",
      endTime: "19:00",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Josephine",
      status: "Scheduled",
    },
    {
      id: "ds-8",
      sessionNo: "DS-1008",
      patientNo: "PT-0105",
      patientName: "Judith Mugo",
      machineNo: "HD-04",
      startTime: "16:30",
      endTime: "20:30",
      dialysisType: "Haemodialysis",
      nurse: "Nurse Brian Okoth",
      status: "Completed",
    },
  ])

  const machinesStatus: MachineStatusCard[] = useMemo(
    () => [
      {
        machineNo: "HD-01",
        status: "In Use",
        currentPatientName: "Asha Wanjiru",
        lastServicedDisplay: formatDateDisplay(new Date(today.getTime() - 9 * 24 * 60 * 60 * 1000)),
      },
      {
        machineNo: "HD-02",
        status: "In Use",
        currentPatientName: "George Otieno",
        lastServicedDisplay: formatDateDisplay(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
      },
      {
        machineNo: "HD-03",
        status: "Available",
        lastServicedDisplay: formatDateDisplay(new Date(today.getTime() - 12 * 24 * 60 * 60 * 1000)),
      },
      {
        machineNo: "HD-04",
        status: "Available",
        lastServicedDisplay: formatDateDisplay(new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000)),
      },
      {
        machineNo: "HD-05",
        status: "Maintenance",
        lastServicedDisplay: formatDateDisplay(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
      },
      {
        machineNo: "HD-06",
        status: "Available",
        lastServicedDisplay: formatDateDisplay(new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)),
      },
    ],
    [today]
  )

  const clinicalNotes: ClinicalNote[] = useMemo(
    () => [
      {
        id: "cn-1",
        patientName: "George Otieno",
        dateDisplay: formatDateDisplay(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000)),
        nephrologist: "Dr. Waweru Maina",
        summary: "Haemodialysis tolerated well. BP stable (136/82). No cramps reported.",
      },
      {
        id: "cn-2",
        patientName: "Asha Wanjiru",
        dateDisplay: formatDateDisplay(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)),
        nephrologist: "Dr. Waweru Maina",
        summary: "Kt/V 1.4, well tolerated session, BP stable. UF within target.",
      },
      {
        id: "cn-3",
        patientName: "Mary Njeri",
        dateDisplay: formatDateDisplay(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)),
        nephrologist: "Dr. Josephat Nderitu",
        summary: "Mild nausea during cooling. Improved after rate adjustment. Session completed.",
      },
      {
        id: "cn-4",
        patientName: "Daniel Kiptoo",
        dateDisplay: formatDateDisplay(new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000)),
        nephrologist: "Dr. Josephat Nderitu",
        summary: "BP slightly elevated (130/80). Plan: review antihypertensives next visit.",
      },
      {
        id: "cn-5",
        patientName: "Judith Mugo",
        dateDisplay: formatDateDisplay(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000)),
        nephrologist: "Dr. Waweru Maina",
        summary: "Peritoneal session: clear effluent, no fever. Weight stable post session.",
      },
    ],
    [today]
  )

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [form, setForm] = useState<ScheduleSessionFormState>(() => ({
    patientNo: patients[0]?.patientNo || "PT-0018",
    machineNo: machines[0],
    dateValue: todayDateInput,
    timeValue: "08:30",
    durationMinutes: 240,
    dialysisType: "Haemodialysis",
    nurse: nurses[0],
    notes: "",
  }))

  const patientOptions = patients
  const machineOptions = machines
  const dialysisTypeOptions: DialysisType[] = ["Haemodialysis", "Peritoneal"]

  const patientByNo = (patientNo: string) => patientOptions.find((p) => p.patientNo === patientNo)

  const endTime = useMemo(() => minutesToTime(timeToMinutes(form.timeValue) + form.durationMinutes), [form.durationMinutes, form.timeValue])

  const handleScheduleSubmit = () => {
    const patient = patientByNo(form.patientNo)
    if (!patient) return

    const newSession: DialysisSession = {
      id: `ds-${Date.now()}`,
      sessionNo: `DS-${Math.floor(1000 + Math.random() * 9000)}`,
      patientNo: patient.patientNo,
      patientName: patient.name,
      machineNo: form.machineNo,
      startTime: form.timeValue,
      endTime,
      dialysisType: form.dialysisType,
      nurse: form.nurse,
      status: "Scheduled",
    }

    setSessions((prev) => [newSession, ...prev])
    setScheduleDialogOpen(false)
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Renal Unit & Dialysis Centre</h1>
          <p className="text-muted-foreground">Dialysis scheduling, patient registry, machine status and clinical notes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Active Dialysis Patients</CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription className="text-xs">Currently in care</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">34</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Sessions Today</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription className="text-xs">For {todayDisplay}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">10</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Machines Available</CardTitle>
              <Waveform className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription className="text-xs">Ready for dialysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Sessions This Week</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription className="text-xs">Planned across units</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">52</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="schedule" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="schedule">Dialysis Schedule</TabsTrigger>
          <TabsTrigger value="registry">Patient Registry</TabsTrigger>
          <TabsTrigger value="machines">Machine Status</TabsTrigger>
          <TabsTrigger value="notes">Clinical Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Dialysis Schedule</CardTitle>
                <CardDescription>Sessions for {todayDisplay}</CardDescription>
              </div>
              <Button onClick={() => setScheduleDialogOpen(true)}>
                Schedule Session
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session #</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Machine #</TableHead>
                    <TableHead>Start Time</TableHead>
                    <TableHead>End Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Nurse</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.slice(0, 8).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.sessionNo}</TableCell>
                      <TableCell>{s.patientName}</TableCell>
                      <TableCell>{s.machineNo}</TableCell>
                      <TableCell className="whitespace-nowrap">{s.startTime}</TableCell>
                      <TableCell className="whitespace-nowrap">{s.endTime}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.dialysisType}</Badge>
                      </TableCell>
                      <TableCell>{s.nurse}</TableCell>
                      <TableCell>
                        <Badge variant={getSessionBadgeVariant(s.status)}>{s.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
            <DialogContent className="sm:max-w-[820px]">
              <DialogHeader>
                <DialogTitle>Schedule Session</DialogTitle>
                <DialogDescription>
                  Create a new dialysis schedule for today or another date (mock action).
                </DialogDescription>
              </DialogHeader>
              <Separator />
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Patient</Label>
                    <Select
                      value={form.patientNo}
                      onValueChange={(value) => setForm((f) => ({ ...f, patientNo: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patientOptions.map((p) => (
                          <SelectItem key={p.patientNo} value={p.patientNo}>
                            {p.patientNo} - {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Machine</Label>
                    <Select
                      value={form.machineNo}
                      onValueChange={(value) => setForm((f) => ({ ...f, machineNo: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select machine" />
                      </SelectTrigger>
                      <SelectContent>
                        {machineOptions.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.dateValue}
                      onChange={(e) => setForm((f) => ({ ...f, dateValue: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={form.timeValue}
                      onChange={(e) => setForm((f) => ({ ...f, timeValue: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      min={60}
                      step={15}
                      value={form.durationMinutes}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          durationMinutes: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Dialysis Type</Label>
                    <Select
                      value={form.dialysisType}
                      onValueChange={(value: DialysisType) => setForm((f) => ({ ...f, dialysisType: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dialysis type" />
                      </SelectTrigger>
                      <SelectContent>
                        {dialysisTypeOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Assigned Nurse</Label>
                    <Select value={form.nurse} onValueChange={(value) => setForm((f) => ({ ...f, nurse: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select nurse" />
                      </SelectTrigger>
                      <SelectContent>
                        {nurses.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Clinical notes or preparation instructions"
                    rows={4}
                  />
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Computed Session Window</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.timeValue} - {endTime}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleScheduleSubmit}>Schedule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="registry" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient Registry</CardTitle>
              <CardDescription>Renal unit patients with ongoing dialysis care</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead className="text-right">Sessions/Week</TableHead>
                    <TableHead>Last Session</TableHead>
                    <TableHead>BP</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((p) => (
                    <TableRow key={p.patientNo}>
                      <TableCell className="font-medium">{p.patientNo}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{p.age}</TableCell>
                      <TableCell>{p.diagnosis}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{p.sessionsPerWeek}</TableCell>
                      <TableCell>{p.lastSessionDisplay}</TableCell>
                      <TableCell>{p.bp}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatWeight(p.weightKg)}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "Active" ? "default" : p.status === "Stable" ? "secondary" : "outline"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="machines" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Machine Status</CardTitle>
              <CardDescription>Availability, utilization and maintenance checks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {machinesStatus.map((m) => (
                  <Card key={m.machineNo} className="border-muted/60">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{m.machineNo}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Last serviced: {m.lastServicedDisplay}</p>
                        </div>
                        <Badge variant={getMachineBadgeVariant(m.status)} className="shrink-0">
                          {m.status}
                        </Badge>
                      </div>
                      {m.currentPatientName ? (
                        <div className="mt-3 rounded-lg border bg-background p-3">
                          <p className="text-xs text-muted-foreground">Current Patient</p>
                          <p className="mt-1 text-sm font-medium">{m.currentPatientName}</p>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-lg border bg-background p-3">
                          <p className="text-xs text-muted-foreground">Current Patient</p>
                          <p className="mt-1 text-sm font-medium">—</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clinical Notes</CardTitle>
              <CardDescription>Recent nephrologist notes and session summaries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {clinicalNotes.map((note) => (
                  <div key={note.id} className="flex items-start justify-between gap-4 rounded-lg border bg-background p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium truncate">{note.patientName}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.dateDisplay} • {note.nephrologist}
                      </p>
                      <p className="mt-2 text-sm">{note.summary}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      Note
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

