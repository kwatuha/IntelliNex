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
  loadPublicBookings,
  mapApiBooking,
  updatePublicBookingStatus,
  type PublicBooking,
} from "@/lib/public-bookings"

export function PublicBookingsInbox({ onAccepted }: { onAccepted?: () => void }) {
  const [bookings, setBookings] = useState<PublicBooking[]>([])
  const [source, setSource] = useState<"api" | "local">("local")
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const setStatus = async (booking: PublicBooking, status: PublicBooking["status"]) => {
    setBusyId(booking.id)
    try {
      if (source === "api" && booking.requestId) {
        if (status === "accepted") {
          await publicBookingsApi.accept(booking.requestId)
        } else {
          await publicBookingsApi.decline(booking.requestId)
        }
        await refresh()
        onAccepted?.()
        toast({
          title: status === "accepted" ? "Appointment created" : "Request declined",
          description:
            status === "accepted"
              ? `${booking.code} is now a confirmed appointment. An SMS was queued if messaging is configured.`
              : `${booking.code} was declined and the patient will be notified if SMS is configured.`,
        })
      } else {
        setBookings(updatePublicBookingStatus(booking.id, status))
        toast({
          title: status === "accepted" ? "Booking accepted (local only)" : "Booking declined",
          description:
            status === "accepted"
              ? "API was unavailable, so this was stored in the browser only."
              : "The request was marked declined.",
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
            {source === "api" ? " (live API). Accept creates a real appointment and sends SMS." : " (browser fallback)."}
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
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
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
                  </TableCell>
                  <TableCell>{booking.clinic}</TableCell>
                  <TableCell>
                    {booking.preferredDate} {booking.preferredTime}
                  </TableCell>
                  <TableCell>{booking.insurance}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{booking.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {booking.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={busyId === booking.id}
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
                      </div>
                    ) : booking.appointmentId ? (
                      <span className="text-xs text-muted-foreground">#{booking.appointmentId}</span>
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
    </Card>
  )
}
