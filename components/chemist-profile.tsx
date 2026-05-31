"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Mail, MapPin, Phone, Store } from "lucide-react"
import { pharmacyApi } from "@/lib/api"

export function ChemistProfile() {
  const [chemist, setChemist] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        setError(null)
        setChemist(await pharmacyApi.getCurrentChemist())
      } catch (err: any) {
        setError(err.message || "Failed to load chemist profile")
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
  }

  const location = [chemist?.ward, chemist?.subcounty, chemist?.county].filter(Boolean).join(", ")
  const hasCoordinates = chemist?.latitude && chemist?.longitude
  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${chemist.latitude},${chemist.longitude}`
    : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chemist Profile</h1>
        <p className="text-muted-foreground">Contact and location details patients use for medication pickup.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                {chemist?.chemistName || "External chemist"}
              </CardTitle>
              <CardDescription>{chemist?.chemistCode || "No chemist code"} {chemist?.licenseNumber ? `| License ${chemist.licenseNumber}` : ""}</CardDescription>
            </div>
            <Badge variant={chemist?.isActive === 0 ? "secondary" : "default"}>
              {chemist?.isActive === 0 ? "Inactive" : "Active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-4">
            <div className="mb-2 text-sm font-medium">Contact</div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>{chemist?.contactPerson || "No contact person recorded"}</div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {chemist?.phone || "-"}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {chemist?.email || "-"}
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="mb-2 text-sm font-medium">Patient Pickup Location</div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4" />
                <span>{chemist?.address || location || "No location recorded"}</span>
              </div>
              {location && <div>{location}</div>}
              {hasCoordinates && (
                <a className="text-primary underline" href={mapUrl || "#"} target="_blank" rel="noreferrer">
                  Open location in Google Maps
                </a>
              )}
            </div>
          </div>

          <div className="rounded-md border p-4 md:col-span-2">
            <div className="mb-2 text-sm font-medium">Notes</div>
            <p className="text-sm text-muted-foreground">{chemist?.notes || "No notes recorded."}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
