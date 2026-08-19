"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Globe, Loader2 } from "lucide-react"
import { publicBookingsApi } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PatientCombobox } from "@/components/patient-combobox"
import {
  loadPublicBookings,
  mapApiBooking,
  updatePublicBookingStatus,
  type PublicBooking,
} from "@/lib/public-bookings"

function matchLabel(reason: string) {
  if (reason === "national_id") return "National ID"
  if (reason === "phone") return "Phone"
  if (reason === "name") return "Name"
  return reason
}

export function PublicBookingsInbox({ onAccepted }: { onAccepted?: () => void }) {
  const [bookings, setBookings] = useState<PublicBooking[]>([])
  const [source, setSource] = useState<"api" | "local">("local")
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [linking, setLinking] = useState<PublicBooking | null>(null)
  const [selectedPatientId, setSelectedPatientId] = useState("")
  const [createNew, setCreateNew] = useState(false)

  const refresh = async () => {
    try {
      const rows = await publicBookingsApi.list()
      setBookings((rows || []).map(mapApiBooking))
      setSource("api")
    } catch {
      setBookings(loadPublicBookings())
      setSource("local")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const pending = bookings.filter((b) => b.status === "pending")

  const openAccept = (booking: PublicBooking) => {
    const top = booking.matches?.[0]
    setLinking(booking)
    setSelectedPatientId(top ? String(top.patientId) : "")
    setCreateNew(!top)
  }

  const confirmAccept = async () => {
    if (!linking?.requestId) return
    setBusyId(linking.id)
    try {
      const patientId = createNew || !selectedPatientId ? undefined : Number(selectedPatientId)
      const result = await publicBookingsApi.accept(linking.requestId, patientId ? { patientId } : {})
      setLinking(null)
      await refresh()
      onAccepted?.()
      toast({
        title: result?.linkedExisting ? "Linked to existing patient" : "Appointment created",
        description: result?.linkedExisting
          ? `${linking.code} was attached to the selected patient file.`
          : `${linking.code} is now a confirmed appointment. ${result?.smsSent ? "SMS sent." : ""}`,
      })
    } catch (error: any) {
      toast({
        title: "Could not accept booking",
        description: error?.message || "Try signing in again.",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  const setStatus = async (booking: PublicBooking, status: PublicBooking["status"]) => {
    if (status === "accepted") {
      openAccept(booking)
      return
    }
    setBusyId(booking.id)
    try {
      if (source === "api" && booking.requestId) {
        const result = await publicBookingsApi.decline(booking.requestId)
        await refresh()
        toast({
          title: "Request declined",
          description: `${booking.code} was declined.${result?.smsSent ? " The patient was notified by SMS." : ""}`,
        })
      } else {
        setBookings(updatePublicBookingStatus(booking.id, status))
        toast({
          title: "Booking declined",
          description: "The request was marked declined.",
        })
      }
    } catch (error: any) {
      toast({
        title: "Could not update booking",
        description: error?.message || "Try signing in again.",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  const resendSms = async (booking: PublicBooking) => {
    if (!booking.requestId) return
    setBusyId(booking.id)
    try {
      const result = await publicBookingsApi.resendSms(booking.requestId)
      toast({
        title: "SMS sent",
        description: result?.smsTo
          ? `Confirmation sent to ${result.smsTo}${result.smsSender ? ` from ${result.smsSender}` : ""}.`
          : `Confirmation SMS sent for ${booking.code}.`,
      })
    } catch (error: any) {
      toast({
        title: "Could not send SMS",
        description: error?.message || "Check Advanta SMS configuration.",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Online bookings
          </CardTitle>
          <CardDescription>
            Public requests from{" "}
            <Link className="underline" href="/book" target="_blank">
              /book
            </Link>
            {source === "api"
              ? ". Accept lets you link an existing patient or create a new file."
              : " (browser fallback)."}
          </CardDescription>
        </div>
        <Badge variant={pending.length ? "default" : "secondary"}>{pending.length} new</Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading requests…
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Clinic</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Insurance</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No online requests yet.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">{booking.code}</TableCell>
                  <TableCell>
                    {booking.firstName} {booking.lastName}
                    <div className="text-xs text-muted-foreground">{booking.phone}</div>
                    {booking.nationalId ? (
                      <div className="text-xs text-muted-foreground">ID {booking.nationalId}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{booking.clinic}</TableCell>
                  <TableCell>
                    {booking.preferredDate} {booking.preferredTime}
                  </TableCell>
                  <TableCell>{booking.insurance}</TableCell>
                  <TableCell>
                    {booking.status === "pending" && booking.matches?.length ? (
                      <Badge variant="secondary">{booking.matches.length} possible</Badge>
                    ) : booking.patientId ? (
                      <Link className="text-xs underline" href={`/patients/${booking.patientId}`}>
                        #{booking.patientId}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{booking.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {booking.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === booking.id || source !== "api"}
                          onClick={() => setStatus(booking, "accepted")}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === booking.id}
                          onClick={() => setStatus(booking, "declined")}
                        >
                          Decline
                        </Button>
                        {source === "api" && booking.requestId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === booking.id}
                            onClick={() => resendSms(booking)}
                          >
                            Resend SMS
                          </Button>
                        ) : null}
                      </div>
                    ) : booking.appointmentId ? (
                      <div className="flex justify-end gap-2">
                        <span className="text-xs text-muted-foreground">#{booking.appointmentId}</span>
                        {source === "api" && booking.requestId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === booking.id}
                            onClick={() => resendSms(booking)}
                          >
                            Resend SMS
                          </Button>
                        ) : null}
                      </div>
                    ) : source === "api" && booking.requestId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === booking.id}
                        onClick={() => resendSms(booking)}
                      >
                        Resend SMS
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        )}
      </CardContent>

      <Dialog open={!!linking} onOpenChange={(open) => !open && setLinking(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link {linking?.code} to a patient</DialogTitle>
            <DialogDescription>
              {linking
                ? `${linking.firstName} ${linking.lastName} · ${linking.phone}${
                    linking.nationalId ? ` · ID ${linking.nationalId}` : ""
                  }. Choose an existing file or create a new one.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {linking?.matches?.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Possible matches</p>
                <ul className="divide-y rounded-md border">
                  {linking.matches.map((m) => (
                    <li key={m.patientId}>
                      <button
                        type="button"
                        className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                          !createNew && selectedPatientId === String(m.patientId) ? "bg-muted" : ""
                        }`}
                        onClick={() => {
                          setCreateNew(false)
                          setSelectedPatientId(String(m.patientId))
                        }}
                      >
                        <span>
                          <span className="font-medium">
                            {m.firstName} {m.lastName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {m.patientNumber || `#${m.patientId}`}
                            {m.phone ? ` · ${m.phone}` : ""}
                            {m.idNumber ? ` · ID ${m.idNumber}` : ""}
                          </span>
                        </span>
                        <Badge variant="outline">{matchLabel(m.match)}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No automatic match on national ID, phone, or name. Search the register or create a new file.
              </p>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium">Search existing patients</p>
              <PatientCombobox
                value={createNew ? "" : selectedPatientId}
                onValueChange={(value) => {
                  setCreateNew(false)
                  setSelectedPatientId(value)
                }}
                placeholder="Search by name, number, or ID…"
              />
            </div>
            <Button
              type="button"
              variant={createNew ? "default" : "outline"}
              className="w-full"
              onClick={() => {
                setCreateNew(true)
                setSelectedPatientId("")
              }}
            >
              Create a new patient file
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinking(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busyId === linking?.id || (!createNew && !selectedPatientId)}
              onClick={() => void confirmAccept()}
            >
              {busyId === linking?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
