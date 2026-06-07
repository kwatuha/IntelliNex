"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, CheckCircle2, Clock, Copy, FlaskConical, Loader2, MapPin, Package, PackageCheck, RefreshCw, Search, Store, Users } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/lib/auth/auth-context"
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
  prescriptionNumber?: string
  referralType?: "drug" | "lab"
  labOrderNumber?: string
  doctorFirstName?: string
  doctorLastName?: string
  patientInstructions?: string
  originBranchName?: string
  originBranchCode?: string
  originStoreName?: string
  originStoreLocation?: string
  originLocationLabel?: string
  items?: any[]
}

type ItemDraft = {
  status?: string
  quantityPicked?: string
  chemistNotes?: string
  externalResultSummary?: string
}

export function ChemistReferrals() {
  const { user, isLoading: authLoading } = useAuth()
  const [chemist, setChemist] = useState<any>(null)
  const [chemists, setChemists] = useState<any[]>([])
  const [selectedChemistId, setSelectedChemistId] = useState("")
  const [referralMode, setReferralMode] = useState<"unknown" | "chemist" | "directory">("unknown")
  const [referrals, setReferrals] = useState<ChemistReferral[]>([])
  const [drugs, setDrugs] = useState<any[]>([])
  const [labs, setLabs] = useState<any[]>([])
  const [stockAlerts, setStockAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingItem, setSavingItem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("active")
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({})
  const [resultDialog, setResultDialog] = useState<{ referral: ChemistReferral; item: any } | null>(null)
  const [resultCopied, setResultCopied] = useState(false)
  const isCurrentUserChemist = useMemo(() => {
    const roleName = String(user?.role || (user as any)?.roleName || "").toLowerCase()
    return roleName === "chemist" || roleName.includes("external_pharmacy")
  }, [user])

  const loadData = async () => {
    if (authLoading) return
    try {
      setLoading(true)
      setError(null)
      let scope = chemist
      let targetChemistId = selectedChemistId
      let mode = referralMode

      if (mode === "unknown") {
        if (isCurrentUserChemist) {
          try {
            scope = await pharmacyApi.getCurrentChemist()
            setChemist(scope)
            setReferralMode("chemist")
            mode = "chemist"
            targetChemistId = String(scope.chemistId)
            setSelectedChemistId(targetChemistId)
          } catch {
            setReferralMode("directory")
            mode = "directory"
          }
        } else {
          setReferralMode("directory")
          mode = "directory"
        }
      }

      if (mode === "directory") {
        const chemistData = await pharmacyApi.getExternalChemists(undefined, true)
        setChemists(chemistData)
        targetChemistId = targetChemistId || (chemistData[0]?.chemistId ? String(chemistData[0].chemistId) : "")
        if (targetChemistId && targetChemistId !== selectedChemistId) setSelectedChemistId(targetChemistId)
      } else {
        if (!scope) {
          scope = await pharmacyApi.getCurrentChemist()
          setChemist(scope)
        }
        targetChemistId = String(scope.chemistId)
        if (targetChemistId !== selectedChemistId) setSelectedChemistId(targetChemistId)
      }

      if (!targetChemistId) {
        setReferrals([])
        setDrugs([])
        setLabs([])
        setStockAlerts([])
        return
      }

      const [referralData, drugData, labData, alertData] = await Promise.all([
        pharmacyApi.getExternalReferrals(mode === "directory" ? { chemistId: targetChemistId } : undefined),
        pharmacyApi.getExternalChemistDrugs(targetChemistId),
        pharmacyApi.getExternalChemistLabs(targetChemistId),
        mode === "chemist" ? pharmacyApi.getChemistStockAlerts("open") : Promise.resolve([]),
      ])
      setReferrals(referralData)
      setDrugs(drugData)
      setLabs(labData)
      setStockAlerts(alertData)
    } catch (err: any) {
      setError(err.message || "Failed to load chemist referrals")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(loadData, 250)
    return () => clearTimeout(handle)
  }, [selectedChemistId, referralMode, authLoading, isCurrentUserChemist])

  const setDraft = (key: string, patch: Partial<{ status: string; quantityPicked: string; chemistNotes: string; externalResultSummary: string }>) => {
    setItemDrafts((current) => ({
      ...current,
      [key]: {
        status: current[key]?.status || "picked_up",
        quantityPicked: current[key]?.quantityPicked || "",
        chemistNotes: current[key]?.chemistNotes || "",
        externalResultSummary: current[key]?.externalResultSummary || "",
        ...patch,
      },
    }))
  }

  const updateItem = async (referralId: number, item: any) => {
    const key = String(item.referralItemId)
    const draft = itemDrafts[key] || {}
    const status = draft.status || "picked_up"
    const pickedNow = draft.quantityPicked
    const remaining = remainingQuantity(item)
    try {
      setSavingItem(key)
      setError(null)
      if (isDrugPickupStatus(item, status)) {
        const pickedNumber = Number(pickedNow)
        if (!Number.isInteger(pickedNumber) || pickedNumber <= 0) {
          setError("Enter the quantity being picked now.")
          return
        }
        if (pickedNumber > remaining) {
          setError(`Picked quantity cannot exceed the remaining balance of ${remaining}.`)
          return
        }
      }
      await pharmacyApi.updateExternalReferralItem(String(referralId), key, {
        itemType: item.itemType || "drug",
        status,
        quantityPicked: pickedNow,
        chemistNotes: draft.chemistNotes,
        externalResultSummary: draft.externalResultSummary,
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

  const statusLabel = (status?: string) => (status || "pending").replaceAll("_", " ")

  const itemLabel = (item: any) => item.testName || item.medicationName || item.displayName || "Item"

  const previewText = (value?: string) => {
    const text = String(value || "").trim()
    if (!text) return "-"
    return text.length > 140 ? `${text.slice(0, 140)}...` : text
  }

  const formatDateTime = (value?: string) => {
    if (!value) return "-"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString()
  }

  const actorName = (item: any) =>
    `${item.dispensedByFirstName || item.completedByFirstName || ""} ${item.dispensedByLastName || item.completedByLastName || ""}`.trim() ||
    item.dispensedByUsername ||
    item.completedByUsername ||
    ""

  const referralSourceNumber = (referral: ChemistReferral) =>
    referral.referralType === "lab" ? referral.labOrderNumber || "-" : referral.prescriptionNumber || "-"

  const originLabel = (referral: ChemistReferral) =>
    referral.originLocationLabel ||
    [
      referral.originBranchName,
      referral.originStoreName || referral.originStoreLocation,
    ].filter(Boolean).join(" - ") ||
    "-"

  const isCompletedStatus = (status: string) =>
    ["picked_up", "completed", "not_picked", "cancelled"].includes(status)

  const statusVariant = (status: string) => {
    if (status === "picked_up") return "default"
    if (status === "cancelled" || status === "not_picked") return "destructive"
    return "secondary"
  }

  const remainingQuantity = (item: any) => {
    const referred = Number(item.quantityReferred || 0)
    const picked = Number(item.quantityPicked || 0)
    const balance = item.quantityBalance !== undefined && item.quantityBalance !== null
      ? Number(item.quantityBalance)
      : referred - picked
    return Math.max(Number.isFinite(balance) ? balance : 0, 0)
  }

  const isDrugPickupStatus = (item: any, status?: string) =>
    item.itemType !== "lab" && ["picked_up", "partially_picked"].includes(status || "")

  const filteredReferrals = useMemo(() => {
    const q = search.trim().toLowerCase()
    return referrals.filter((referral) => {
      const searchable = [
        referral.referralNumber,
        referral.pickupCode,
        referralSourceNumber(referral),
        referral.patientNumber,
        referral.patientPhone,
        originLabel(referral),
        patientName(referral),
        ...(referral.items || []).map((item) => itemLabel(item)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      const matchesSearch = !q || searchable.includes(q)
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !isCompletedStatus(referral.status)) ||
        referral.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [referrals, search, statusFilter])

  const summary = useMemo(() => {
    const active = referrals.filter((referral) => !isCompletedStatus(referral.status)).length
    return {
      newReferrals: referrals.filter((referral) => referral.status === "referred").length,
      ready: referrals.filter((referral) => referral.status === "ready_for_pickup").length,
      active,
      completed: referrals.filter((referral) => ["picked_up", "completed"].includes(referral.status)).length,
      listedDrugs: drugs.length,
      availableDrugs: drugs.filter((drug) => drug.availabilityStatus === "available").length,
      stockIssues: drugs.filter((drug) => ["low_stock", "out_of_stock", "unknown"].includes(drug.availabilityStatus)).length,
      listedLabs: labs.length,
      availableLabs: labs.filter((lab) => lab.availabilityStatus === "available").length,
      openAlerts: stockAlerts.length,
    }
  }, [referrals, drugs, labs, stockAlerts])

  const setItemStatus = async (referralId: number, item: any, status: string, quantityPicked?: number) => {
    const key = String(item.referralItemId)
    const draft = itemDrafts[key] || {}
    const pickedNow = quantityPicked ?? (draft.quantityPicked ? Number(draft.quantityPicked) : undefined)
    const remaining = remainingQuantity(item)
    try {
      setSavingItem(`${key}:${status}`)
      setError(null)
      if (isDrugPickupStatus(item, status)) {
        const pickedNumber = pickedNow ?? remaining
        if (!Number.isInteger(pickedNumber) || pickedNumber <= 0) {
          setError("Enter the quantity being picked now.")
          return
        }
        if (pickedNumber > remaining) {
          setError(`Picked quantity cannot exceed the remaining balance of ${remaining}.`)
          return
        }
      }
      await pharmacyApi.updateExternalReferralItem(String(referralId), key, {
        itemType: item.itemType || "drug",
        status,
        quantityPicked: isDrugPickupStatus(item, status) ? (pickedNow ?? remaining) : (pickedNow ?? 0),
        chemistNotes: draft.chemistNotes ?? item.chemistNotes ?? "",
        externalResultSummary: draft.externalResultSummary ?? item.externalResultSummary ?? "",
      })
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to update pickup")
    } finally {
      setSavingItem(null)
    }
  }

  const openLabResultDialog = (referral: ChemistReferral, item: any) => {
    const key = String(item.referralItemId)
    setResultCopied(false)
    setItemDrafts((current) => ({
      ...current,
      [key]: {
        status: current[key]?.status || item.status || "in_progress",
        quantityPicked: current[key]?.quantityPicked || String(item.quantityPicked ?? ""),
        chemistNotes: current[key]?.chemistNotes ?? item.chemistNotes ?? "",
        externalResultSummary: current[key]?.externalResultSummary ?? item.externalResultSummary ?? "",
      },
    }))
    setResultDialog({ referral, item })
  }

  const copyLabResult = async () => {
    if (!resultDialog || typeof navigator === "undefined") return
    const resultSummary = String(resultDraft.externalResultSummary ?? resultDialog.item.externalResultSummary ?? "").trim()
    const notes = String(resultDraft.chemistNotes ?? resultDialog.item.chemistNotes ?? "").trim()
    const lines = [
      `Patient: ${patientName(resultDialog.referral)} (${resultDialog.referral.patientNumber || "No patient number"})`,
      `Referral: ${resultDialog.referral.referralNumber}`,
      `Lab order: ${resultDialog.referral.labOrderNumber || "-"}`,
      `Test: ${itemLabel(resultDialog.item)}`,
      `Status: ${statusLabel(resultDraft.status || resultDialog.item.status)}`,
      "",
      "Result summary:",
      resultSummary || "-",
      "",
      "Chemist notes:",
      notes || "-",
    ]
    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setResultCopied(true)
      window.setTimeout(() => setResultCopied(false), 2000)
    } catch (err: any) {
      setError(err.message || "Failed to copy lab result")
    }
  }

  const saveLabResult = async (statusOverride?: string) => {
    if (!resultDialog || !canManageReferrals) return
    const { referral, item } = resultDialog
    const key = String(item.referralItemId)
    const draft = itemDrafts[key] || {}
    const status = statusOverride || draft.status || item.status || "in_progress"
    try {
      setSavingItem(`${key}:result`)
      setError(null)
      await pharmacyApi.updateExternalReferralItem(String(referral.referralId), key, {
        itemType: "lab",
        status,
        quantityPicked: status === "completed" ? 1 : (item.quantityPicked ?? 0),
        chemistNotes: draft.chemistNotes ?? item.chemistNotes ?? "",
        externalResultSummary: draft.externalResultSummary ?? item.externalResultSummary ?? "",
      })
      setResultDialog(null)
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to save lab result")
    } finally {
      setSavingItem(null)
    }
  }

  const canManageReferrals = referralMode === "chemist" && Boolean(chemist?.chemistId)
  const selectedChemist = chemist || chemists.find((item) => String(item.chemistId) === selectedChemistId)
  const resultDialogKey = resultDialog ? String(resultDialog.item.referralItemId) : ""
  const resultDraft: ItemDraft = resultDialogKey ? itemDrafts[resultDialogKey] || {} : {}
  const resultSummaryValue = resultDialog ? String(resultDraft.externalResultSummary ?? resultDialog.item.externalResultSummary ?? "") : ""
  const resultNotesValue = resultDialog ? String(resultDraft.chemistNotes ?? resultDialog.item.chemistNotes ?? "") : ""
  const resultHasSummary = Boolean(resultSummaryValue.trim())
  const resultHasCopyableText = Boolean(resultSummaryValue.trim() || resultNotesValue.trim())

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chemist Referrals</h1>
          <p className="text-muted-foreground">
            {canManageReferrals
              ? "View referred patients and record medication pickup."
              : "Review external chemist referrals by chemist."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!canManageReferrals && (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedChemistId}
              onChange={(event) => setSelectedChemistId(event.target.value)}
            >
              {chemists.map((item) => (
                <option key={item.chemistId} value={String(item.chemistId)}>{item.chemistName}</option>
              ))}
            </select>
          )}
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {selectedChemist && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  {selectedChemist.chemistName}
                </CardTitle>
                <CardDescription className="mt-1 flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {selectedChemist.chemistCode || "External chemist"}
                </CardDescription>
              </div>
              <Badge variant="secondary">{canManageReferrals ? "Chemist workbench" : "Referral directory"}</Badge>
            </div>
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
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New Referrals</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.newReferrals}</div>
                <p className="text-xs text-muted-foreground">Awaiting acknowledgement</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ready</CardTitle>
                <PackageCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.ready}</div>
                <p className="text-xs text-muted-foreground">Ready for patient pickup</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.active}</div>
                <p className="text-xs text-muted-foreground">Still being processed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.completed}</div>
                <p className="text-xs text-muted-foreground">Picked up or completed</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Availability Health
                </CardTitle>
                <CardDescription>Keep availability current so hospital staff can refer patients with confidence.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-5">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Listed drugs</div>
                    <div className="text-2xl font-bold">{summary.listedDrugs}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Available now</div>
                    <div className="text-2xl font-bold">{summary.availableDrugs}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Need attention</div>
                    <div className="text-2xl font-bold">{summary.stockIssues}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Listed labs</div>
                    <div className="text-2xl font-bold">{summary.listedLabs}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Available labs</div>
                    <div className="text-2xl font-bold">{summary.availableLabs}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/chemist/drugs">{canManageReferrals ? "Update" : "View"} Drug Availability</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/chemist/labs">{canManageReferrals ? "Update" : "View"} Available Labs</Link>
                  </Button>
                  {canManageReferrals && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/chemist/history">View Pickup History</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {canManageReferrals ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Demand Alerts
                  </CardTitle>
                  <CardDescription>{summary.openAlerts} open stock request(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stockAlerts.slice(0, 4).map((alert) => (
                    <div key={alert.alertId} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{alert.medicationName}</div>
                        <Badge variant={alert.alertType === "out_of_stock" ? "destructive" : "secondary"}>
                          {statusLabel(alert.alertType)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Requested {alert.requestCount || 1} time(s), last {alert.lastRequestedAt ? new Date(alert.lastRequestedAt).toLocaleDateString() : "-"}
                      </div>
                    </div>
                  ))}
                  {stockAlerts.length === 0 && (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No open stock alerts.</div>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/chemist/drugs">Resolve in stock list</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Chemist Referral View
                  </CardTitle>
                  <CardDescription>Read-only hospital view of referred patients, items, and pickup or test completion status.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>Use the chemist selector above to review referrals for a specific external chemist.</div>
                  <div>Actions remain available only to external chemist users.</div>
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Assigned Patients</CardTitle>
              <CardDescription>Search by patient, prescription, pickup code, or medicine.</CardDescription>
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search referrals..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="active">Active referrals</option>
                  <option value="all">All referrals</option>
                  <option value="referred">New referrals</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="ready_for_pickup">Ready for pickup</option>
                  <option value="sample_collected">Sample collected</option>
                  <option value="in_progress">In progress</option>
                  <option value="partially_picked">Partially picked</option>
                  <option value="picked_up">Picked up</option>
                  <option value="completed">Completed</option>
                  <option value="not_available">Not available</option>
                  <option value="not_picked">Not picked</option>
                </select>
              </div>
            </CardHeader>
          </Card>

          {filteredReferrals.map((referral) => (
            <Card key={referral.referralId}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{patientName(referral)}</CardTitle>
                    <CardDescription>
                      {referral.referralNumber} - {referral.patientNumber || "No patient number"} - Code {referral.pickupCode || "-"}
                    </CardDescription>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Patient phone: {referral.patientPhone || "-"} | {referral.referralType === "lab" ? "Lab order" : "Prescription"}: {referralSourceNumber(referral)}
                      {" | "}Referred from: {originLabel(referral)}
                      {referral.pickupDeadline ? ` | Deadline: ${new Date(referral.pickupDeadline).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      {referral.referralType === "lab" ? <FlaskConical className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                      {referral.referralType === "lab" ? "Lab" : "Drug"}
                    </Badge>
                    <Badge variant={statusVariant(referral.status) as any}>{statusLabel(referral.status)}</Badge>
                    {canManageReferrals && referral.status === "referred" && (
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
                      <TableHead>{referral.referralType === "lab" ? "Lab Test" : "Medication"}</TableHead>
                      <TableHead>Instructions</TableHead>
                      <TableHead>{canManageReferrals ? "Pickup" : "Status"}</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">{canManageReferrals ? "Action" : "Mode"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(referral.items || []).map((item) => {
                      const key = String(item.referralItemId)
                      const draft = itemDrafts[key] || {}
                      const hasLabResult = Boolean(String(draft.externalResultSummary ?? item.externalResultSummary ?? "").trim())
                      const balance = remainingQuantity(item)
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <div className="font-medium">{itemLabel(item)}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.itemType === "lab" ? "Lab referral" : `Qty referred ${item.quantityReferred || 1}, balance ${balance}`} | Current: {statusLabel(item.status)}
                            </div>
                            {actorName(item) && (
                              <div className="text-xs text-muted-foreground">
                                {item.itemType === "lab" ? "Completed by" : "Dispensed by"} {actorName(item)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.dosage || "-"} - {item.frequency || "-"}{item.duration ? ` - ${item.duration}` : ""}
                            {item.instructions ? <div>{item.instructions}</div> : null}
                          </TableCell>
                          <TableCell>
                            {canManageReferrals ? (
                              <div className="grid gap-2">
                                <select
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  value={draft.status || item.status || "picked_up"}
                                  onChange={(event) => setDraft(key, { status: event.target.value })}
                                >
                                  <option value="pending">Pending</option>
                                  {item.itemType === "lab" ? (
                                    <>
                                      <option value="sample_collected">Sample collected</option>
                                      <option value="in_progress">In progress</option>
                                      <option value="completed">Completed</option>
                                      <option value="not_available">Not available</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="ready_for_pickup">Ready for pickup</option>
                                      <option value="picked_up">Picked up</option>
                                      <option value="partially_picked">Partially picked</option>
                                      <option value="not_available">Not available</option>
                                      <option value="not_picked">Not picked</option>
                                    </>
                                  )}
                                </select>
                                {item.itemType !== "lab" && (
                                  <div className="space-y-1">
                                    <Label className="text-xs">Qty picked now</Label>
                                    <Input
                                      className="h-9"
                                      type="number"
                                      min="1"
                                      max={balance || undefined}
                                      placeholder={balance ? `Remaining ${balance}` : "Fully picked"}
                                      value={draft.quantityPicked ?? ""}
                                      onChange={(event) => setDraft(key, { quantityPicked: event.target.value })}
                                      disabled={balance <= 0}
                                    />
                                    <div className="text-[11px] text-muted-foreground">
                                      Already picked {item.quantityPicked ?? 0}; remaining {balance}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Badge variant="secondary">{statusLabel(item.status)}</Badge>
                                {item.itemType !== "lab" && (
                                  <div className="text-xs text-muted-foreground">
                                    Picked {item.quantityPicked ?? 0} of {item.quantityReferred || 1}; balance {balance}
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.itemType === "lab" && (
                              <div className="mb-2 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs">Result summary</Label>
                                  <Badge variant={hasLabResult ? "default" : "outline"} className="text-[10px]">
                                    {hasLabResult ? "Result recorded" : "No result yet"}
                                  </Badge>
                                </div>
                                <div className="rounded-md border bg-muted/40 p-2 text-sm text-muted-foreground">
                                  {previewText(draft.externalResultSummary ?? item.externalResultSummary)}
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => openLabResultDialog(referral, item)}>
                                  {canManageReferrals ? (hasLabResult ? "Edit Results" : "Enter Results") : "View Results"}
                                </Button>
                              </div>
                            )}
                            {canManageReferrals ? (
                              item.itemType === "lab" ? (
                                <div className="rounded-md border bg-muted/40 p-2 text-sm text-muted-foreground">
                                  {previewText(draft.chemistNotes ?? item.chemistNotes)}
                                </div>
                              ) : (
                                <Textarea
                                  className="min-h-16"
                                  placeholder="Dispensing notes..."
                                  value={draft.chemistNotes ?? item.chemistNotes ?? ""}
                                  onChange={(event) => setDraft(key, { chemistNotes: event.target.value })}
                                />
                              )
                            ) : (
                              <div className="rounded-md border bg-muted/40 p-2 text-sm text-muted-foreground">
                                {item.chemistNotes || "-"}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageReferrals ? (
                              <div className="flex flex-col gap-2 sm:items-end">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {item.itemType === "lab" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setItemStatus(referral.referralId, item, "completed", 1)}
                                      disabled={savingItem === `${key}:completed`}
                                    >
                                      Complete
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setItemStatus(referral.referralId, item, "ready_for_pickup", item.quantityPicked || 0)}
                                      disabled={savingItem === `${key}:ready_for_pickup`}
                                    >
                                      Ready
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => setItemStatus(referral.referralId, item, item.itemType === "lab" ? "in_progress" : "picked_up", item.itemType === "lab" ? 0 : balance)}
                                    disabled={savingItem === `${key}:${item.itemType === "lab" ? "in_progress" : "picked_up"}` || (item.itemType !== "lab" && balance <= 0)}
                                  >
                                    {item.itemType === "lab" ? "In progress" : "Picked"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setItemStatus(referral.referralId, item, "not_available", item.quantityPicked || 0)}
                                    disabled={savingItem === `${key}:not_available`}
                                  >
                                    Not available
                                  </Button>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => updateItem(referral.referralId, item)} disabled={savingItem === key}>
                                  {savingItem === key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Save custom
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">View only</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
          {filteredReferrals.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {referrals.length === 0 ? "No referrals assigned to this chemist yet." : "No referrals match the current filters."}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={Boolean(resultDialog)} onOpenChange={(open) => !open && setResultDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{canManageReferrals ? "Enter Lab Results" : "View Lab Results"}</DialogTitle>
            <DialogDescription>
              {resultDialog
                ? `${patientName(resultDialog.referral)} - ${resultDialog.referral.referralNumber} - ${itemLabel(resultDialog.item)}`
                : "External lab referral result details"}
            </DialogDescription>
          </DialogHeader>

          {resultDialog && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm md:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Patient</div>
                  <div className="font-medium">{patientName(resultDialog.referral)}</div>
                  <div className="text-xs text-muted-foreground">{resultDialog.referral.patientNumber || "No patient number"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Lab Order</div>
                  <div className="font-medium">{resultDialog.referral.labOrderNumber || "-"}</div>
                  <div className="text-xs text-muted-foreground">Referral {resultDialog.referral.referralNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Test</div>
                  <div className="font-medium">{itemLabel(resultDialog.item)}</div>
                  <div className="text-xs text-muted-foreground">
                    {[resultDialog.item.dosage, resultDialog.item.frequency].filter(Boolean).join(" | ") || "No specimen details"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current Status</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge variant="secondary">{statusLabel(resultDraft.status || resultDialog.item.status)}</Badge>
                    <Badge variant={resultHasSummary ? "default" : "outline"}>
                      {resultHasSummary ? "Result recorded" : "No result yet"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Handled By</div>
                  <div className="font-medium">{actorName(resultDialog.item) || "-"}</div>
                  <div className="text-xs text-muted-foreground">
                    Completed {formatDateTime(resultDialog.item.completedAt)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last Updated</div>
                  <div className="font-medium">{formatDateTime(resultDialog.item.updatedAt)}</div>
                </div>
              </div>

              {resultDialog.item.instructions && (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-1 font-medium">Instructions</div>
                  <div className="text-muted-foreground">{resultDialog.item.instructions}</div>
                </div>
              )}

              {canManageReferrals && (
                <div className="space-y-2">
                  <Label>Result status</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={resultDraft.status || resultDialog.item.status || "in_progress"}
                    onChange={(event) => setDraft(resultDialogKey, { status: event.target.value })}
                  >
                    <option value="pending">Pending</option>
                    <option value="sample_collected">Sample collected</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="not_available">Not available</option>
                  </select>
                </div>
              )}

              {canManageReferrals && !resultHasSummary && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Add a result summary before completing the test so clinicians have enough context when reviewing the referral.
                </div>
              )}

              <div className="space-y-2">
                <Label>Result summary</Label>
                {canManageReferrals ? (
                  <Textarea
                    className="min-h-56"
                    placeholder="Enter summarized external lab result, key values, interpretation, or any clinically relevant comments..."
                    value={resultDraft.externalResultSummary ?? resultDialog.item.externalResultSummary ?? ""}
                    onChange={(event) => setDraft(resultDialogKey, { externalResultSummary: event.target.value })}
                  />
                ) : (
                  <div className="min-h-40 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                    {resultDialog.item.externalResultSummary || "-"}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Chemist notes</Label>
                {canManageReferrals ? (
                  <Textarea
                    className="min-h-28"
                    placeholder="Add notes about sample handling, limitations, or patient communication..."
                    value={resultDraft.chemistNotes ?? resultDialog.item.chemistNotes ?? ""}
                    onChange={(event) => setDraft(resultDialogKey, { chemistNotes: event.target.value })}
                  />
                ) : (
                  <div className="min-h-24 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                    {resultDialog.item.chemistNotes || "-"}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setResultDialog(null)}>Close</Button>
            {resultDialog && resultHasCopyableText && (
              <Button type="button" variant="outline" onClick={copyLabResult}>
                {resultCopied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {resultCopied ? "Copied" : "Copy Result"}
              </Button>
            )}
            {canManageReferrals && resultDialog && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveLabResult()}
                  disabled={savingItem === `${resultDialogKey}:result`}
                >
                  Save Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveLabResult("sample_collected")}
                  disabled={savingItem === `${resultDialogKey}:result`}
                >
                  Sample Collected
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveLabResult("in_progress")}
                  disabled={savingItem === `${resultDialogKey}:result`}
                >
                  Mark In Progress
                </Button>
                <Button
                  type="button"
                  onClick={() => saveLabResult("completed")}
                  disabled={savingItem === `${resultDialogKey}:result`}
                >
                  {savingItem === `${resultDialogKey}:result` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete Test
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
