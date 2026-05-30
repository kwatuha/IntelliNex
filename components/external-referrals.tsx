"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, RefreshCw, Search, Send } from "lucide-react"
import { pharmacyApi } from "@/lib/api"

type Prescription = {
  prescriptionId: number
  prescriptionNumber: string
  patientId: number
  firstName?: string
  lastName?: string
  patientNumber?: string
  status?: string
  items?: any[]
}

type Chemist = {
  chemistId: number
  chemistName: string
  chemistCode?: string
}

type ExternalReferral = {
  referralId: number
  referralNumber: string
  status: string
  referralDate: string
  chemistName: string
  prescriptionNumber: string
  patientFirstName?: string
  patientLastName?: string
  patientNumber?: string
  pickupCode?: string
  items?: any[]
}

export function ExternalReferrals({ prescriptions }: { prescriptions: Prescription[] }) {
  const [referrals, setReferrals] = useState<ExternalReferral[]>([])
  const [chemists, setChemists] = useState<Chemist[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("")
  const [selectedChemistId, setSelectedChemistId] = useState("")
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [pickupDeadline, setPickupDeadline] = useState("")
  const [patientInstructions, setPatientInstructions] = useState("")
  const [notes, setNotes] = useState("")

  const selectedPrescription = useMemo(
    () => prescriptions.find((prescription) => String(prescription.prescriptionId) === selectedPrescriptionId),
    [prescriptions, selectedPrescriptionId]
  )

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [referralData, chemistData] = await Promise.all([
        pharmacyApi.getExternalReferrals({ search: search || undefined }),
        pharmacyApi.getExternalChemists(undefined, true),
      ])
      setReferrals(referralData)
      setChemists(chemistData)
    } catch (err: any) {
      setError(err.message || "Failed to load external referrals")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(loadData, 250)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    if (selectedPrescription?.items?.length) {
      setSelectedItems(new Set(selectedPrescription.items.map((item) => Number(item.itemId)).filter(Boolean)))
    } else {
      setSelectedItems(new Set())
    }
  }, [selectedPrescriptionId, selectedPrescription])

  const resetForm = () => {
    setSelectedPrescriptionId("")
    setSelectedChemistId("")
    setSelectedItems(new Set())
    setPickupDeadline("")
    setPatientInstructions("")
    setNotes("")
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPrescriptionId || !selectedChemistId) {
      setError("Select both a prescription and chemist")
      return
    }

    try {
      setSaving(true)
      setError(null)
      await pharmacyApi.createExternalReferral({
        prescriptionId: selectedPrescriptionId,
        chemistId: selectedChemistId,
        itemIds: Array.from(selectedItems),
        pickupDeadline: pickupDeadline || undefined,
        patientInstructions,
        notes,
      })
      setDialogOpen(false)
      resetForm()
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to create external referral")
    } finally {
      setSaving(false)
    }
  }

  const updateReferralStatus = async (referral: ExternalReferral, status: string) => {
    try {
      setError(null)
      await pharmacyApi.updateExternalReferralStatus(String(referral.referralId), { status })
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to update referral")
    }
  }

  const patientName = (referral: ExternalReferral) =>
    `${referral.patientFirstName || ""} ${referral.patientLastName || ""}`.trim() || "Unknown patient"

  const statusVariant = (status: string) => {
    if (status === "picked_up") return "default"
    if (status === "cancelled" || status === "not_picked") return "destructive"
    return "secondary"
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>External Chemist Referrals</CardTitle>
              <CardDescription>Refer prescriptions to partner chemists and track pickup status.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadData}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Referral
              </Button>
            </div>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search referral, patient, chemist..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referral</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Chemist</TableHead>
                  <TableHead>Medication Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => (
                  <TableRow key={referral.referralId}>
                    <TableCell>
                      <div className="font-medium">{referral.referralNumber}</div>
                      <div className="text-xs text-muted-foreground">{referral.prescriptionNumber} - pickup {referral.pickupCode || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{patientName(referral)}</div>
                      <div className="text-xs text-muted-foreground">{referral.patientNumber || "-"}</div>
                    </TableCell>
                    <TableCell>{referral.chemistName}</TableCell>
                    <TableCell>
                      <div className="text-sm">{referral.items?.length || 0} item(s)</div>
                      <div className="text-xs text-muted-foreground">
                        {(referral.items || []).slice(0, 2).map((item) => item.medicationName).join(", ")}
                        {(referral.items?.length || 0) > 2 ? "..." : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(referral.status) as any}>{referral.status.replaceAll("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {referral.status !== "cancelled" && referral.status !== "picked_up" && (
                        <Button variant="ghost" size="sm" onClick={() => updateReferralStatus(referral, "cancelled")}>
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {referrals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No external referrals found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Refer Prescription to Chemist</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Prescription</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedPrescriptionId}
                  onChange={(event) => setSelectedPrescriptionId(event.target.value)}
                  required
                >
                  <option value="">Select prescription</option>
                  {prescriptions.map((prescription) => (
                    <option key={prescription.prescriptionId} value={prescription.prescriptionId}>
                      {prescription.prescriptionNumber} - {`${prescription.firstName || ""} ${prescription.lastName || ""}`.trim() || "Unknown patient"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Chemist</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedChemistId}
                  onChange={(event) => setSelectedChemistId(event.target.value)}
                  required
                >
                  <option value="">Select chemist</option>
                  {chemists.map((chemist) => (
                    <option key={chemist.chemistId} value={chemist.chemistId}>{chemist.chemistName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Pickup deadline</Label>
                <Input type="date" value={pickupDeadline} onChange={(event) => setPickupDeadline(event.target.value)} />
              </div>
            </div>

            {selectedPrescription && (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Medication items to refer</div>
                <div className="space-y-3">
                  {(selectedPrescription.items || []).map((item) => {
                    const itemId = Number(item.itemId)
                    return (
                      <label key={itemId} className="flex items-start gap-3 rounded-md border p-3">
                        <Checkbox
                          checked={selectedItems.has(itemId)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedItems)
                            if (checked) next.add(itemId)
                            else next.delete(itemId)
                            setSelectedItems(next)
                          }}
                        />
                        <div className="text-sm">
                          <div className="font-medium">{item.medicationName || item.medicationNameFromCatalog || "Medication"}</div>
                          <div className="text-muted-foreground">
                            {item.dosage || "-"} - {item.frequency || "-"} - {item.duration || "-"} - Qty {item.quantity || 1}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                  {(selectedPrescription.items || []).length === 0 && (
                    <div className="text-sm text-muted-foreground">This prescription has no items loaded.</div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Patient instructions</Label>
              <Textarea value={patientInstructions} onChange={(event) => setPatientInstructions(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Internal notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || selectedItems.size === 0}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Create Referral
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
