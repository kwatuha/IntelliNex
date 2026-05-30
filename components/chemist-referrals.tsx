"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MapPin, RefreshCw } from "lucide-react"
import { pharmacyApi } from "@/lib/api"

type ChemistReferral = {
  referralId: number
  referralNumber: string
  status: string
  pickupCode?: string
  referralDate: string
  pickupDeadline?: string
  patientFirstName?: string
  patientLastName?: string
  patientNumber?: string
  patientPhone?: string
  prescriptionNumber: string
  doctorFirstName?: string
  doctorLastName?: string
  patientInstructions?: string
  items?: any[]
}

export function ChemistReferrals() {
  const [chemist, setChemist] = useState<any>(null)
  const [referrals, setReferrals] = useState<ChemistReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [savingItem, setSavingItem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [itemDrafts, setItemDrafts] = useState<Record<string, { status: string; quantityPicked: string; chemistNotes: string }>>({})

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [scope, referralData] = await Promise.all([
        pharmacyApi.getCurrentChemist(),
        pharmacyApi.getExternalReferrals(),
      ])
      setChemist(scope)
      setReferrals(referralData)
    } catch (err: any) {
      setError(err.message || "Failed to load chemist referrals")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const setDraft = (key: string, patch: Partial<{ status: string; quantityPicked: string; chemistNotes: string }>) => {
    setItemDrafts((current) => ({
      ...current,
      [key]: {
        status: current[key]?.status || "picked_up",
        quantityPicked: current[key]?.quantityPicked || "",
        chemistNotes: current[key]?.chemistNotes || "",
        ...patch,
      },
    }))
  }

  const updateItem = async (referralId: number, item: any) => {
    const key = String(item.referralItemId)
    const draft = itemDrafts[key] || {}
    try {
      setSavingItem(key)
      setError(null)
      await pharmacyApi.updateExternalReferralItem(String(referralId), key, {
        status: draft.status || "picked_up",
        quantityPicked: draft.quantityPicked || item.quantityReferred || 1,
        chemistNotes: draft.chemistNotes,
      })
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to update pickup")
    } finally {
      setSavingItem(null)
    }
  }

  const acknowledgeReferral = async (referral: ChemistReferral) => {
    try {
      setError(null)
      await pharmacyApi.updateExternalReferralStatus(String(referral.referralId), { status: "acknowledged" })
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to acknowledge referral")
    }
  }

  const patientName = (referral: ChemistReferral) =>
    `${referral.patientFirstName || ""} ${referral.patientLastName || ""}`.trim() || "Unknown patient"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chemist Referrals</h1>
          <p className="text-muted-foreground">View referred patients and record medication pickup.</p>
        </div>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {chemist && (
        <Card>
          <CardHeader>
            <CardTitle>{chemist.chemistName}</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {chemist.chemistCode || "External chemist"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {referrals.map((referral) => (
            <Card key={referral.referralId}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{referral.referralNumber}</CardTitle>
                    <CardDescription>
                      {patientName(referral)} ({referral.patientNumber || "No patient number"}) - Pickup code {referral.pickupCode || "-"}
                    </CardDescription>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Patient phone: {referral.patientPhone || "-"} | Prescription: {referral.prescriptionNumber}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{referral.status.replaceAll("_", " ")}</Badge>
                    {referral.status === "referred" && (
                      <Button size="sm" variant="outline" onClick={() => acknowledgeReferral(referral)}>Acknowledge</Button>
                    )}
                  </div>
                </div>
                {referral.patientInstructions && (
                  <div className="rounded-md bg-muted p-3 text-sm">{referral.patientInstructions}</div>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medication</TableHead>
                      <TableHead>Instructions</TableHead>
                      <TableHead>Pickup</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(referral.items || []).map((item) => {
                      const key = String(item.referralItemId)
                      const draft = itemDrafts[key] || {}
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <div className="font-medium">{item.medicationName}</div>
                            <div className="text-xs text-muted-foreground">
                              Qty referred {item.quantityReferred || 1} | Current: {item.status.replaceAll("_", " ")}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.dosage || "-"} - {item.frequency || "-"} - {item.duration || "-"}
                            {item.instructions ? <div>{item.instructions}</div> : null}
                          </TableCell>
                          <TableCell>
                            <div className="grid gap-2">
                              <select
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value={draft.status || item.status || "picked_up"}
                                onChange={(event) => setDraft(key, { status: event.target.value })}
                              >
                                <option value="ready_for_pickup">Ready for pickup</option>
                                <option value="picked_up">Picked up</option>
                                <option value="partially_picked">Partially picked</option>
                                <option value="not_available">Not available</option>
                                <option value="not_picked">Not picked</option>
                              </select>
                              <div className="space-y-1">
                                <Label className="text-xs">Qty picked</Label>
                                <Input
                                  className="h-9"
                                  type="number"
                                  min="0"
                                  value={draft.quantityPicked ?? item.quantityPicked ?? ""}
                                  onChange={(event) => setDraft(key, { quantityPicked: event.target.value })}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Textarea
                              className="min-h-16"
                              value={draft.chemistNotes ?? item.chemistNotes ?? ""}
                              onChange={(event) => setDraft(key, { chemistNotes: event.target.value })}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" onClick={() => updateItem(referral.referralId, item)} disabled={savingItem === key}>
                              {savingItem === key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Save
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {referrals.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">No referrals assigned to this chemist yet.</CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
