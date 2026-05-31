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
import { Download, FileSpreadsheet, Loader2, Plus, RefreshCw, Search, Send } from "lucide-react"
import { laboratoryApi, pharmacyApi } from "@/lib/api"

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
  pickupDeadline?: string
  chemistName: string
  chemistCode?: string
  chemistPhone?: string
  chemistEmail?: string
  prescriptionNumber: string
  referralType?: "drug" | "lab"
  labOrderId?: number
  labOrderNumber?: string
  labPriority?: string
  patientFirstName?: string
  patientLastName?: string
  patientNumber?: string
  patientPhone?: string
  pickupCode?: string
  referredByFirstName?: string
  referredByLastName?: string
  pickedUpAt?: string
  completedAt?: string
  patientInstructions?: string
  notes?: string
  items?: any[]
}

type ExternalReferralsProps = {
  prescriptions: Prescription[]
  defaultReferralType?: "drug" | "lab"
  allowedReferralTypes?: Array<"drug" | "lab">
}

export function ExternalReferrals({
  prescriptions,
  defaultReferralType = "drug",
  allowedReferralTypes = ["drug", "lab"],
}: ExternalReferralsProps) {
  const [referrals, setReferrals] = useState<ExternalReferral[]>([])
  const [chemists, setChemists] = useState<Chemist[]>([])
  const [labOrders, setLabOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [referralType, setReferralType] = useState<"drug" | "lab">(defaultReferralType)
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("")
  const [selectedLabOrderId, setSelectedLabOrderId] = useState("")
  const [selectedChemistId, setSelectedChemistId] = useState("")
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [availability, setAvailability] = useState<any | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [pickupDeadline, setPickupDeadline] = useState("")
  const [patientInstructions, setPatientInstructions] = useState("")
  const [notes, setNotes] = useState("")

  const selectedPrescription = useMemo(
    () => prescriptions.find((prescription) => String(prescription.prescriptionId) === selectedPrescriptionId),
    [prescriptions, selectedPrescriptionId]
  )
  const selectedLabOrder = useMemo(
    () => labOrders.find((order) => String(order.orderId) === selectedLabOrderId),
    [labOrders, selectedLabOrderId]
  )
  const selectedItemIdsKey = useMemo(() => Array.from(selectedItems).sort((a, b) => a - b).join(","), [selectedItems])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [referralData, chemistData, labOrderData] = await Promise.all([
        pharmacyApi.getExternalReferrals({
          search: search || undefined,
          referralType: allowedReferralTypes.length === 1 ? allowedReferralTypes[0] : undefined,
        }),
        pharmacyApi.getExternalChemists(undefined, true),
        laboratoryApi.getOrders(undefined, undefined, 1, 300),
      ])
      setReferrals(referralData)
      setChemists(chemistData)
      setLabOrders(labOrderData)
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
    if (referralType === "drug" && selectedPrescription?.items?.length) {
      setSelectedItems(new Set(selectedPrescription.items.map((item) => Number(item.itemId)).filter(Boolean)))
    } else if (referralType === "lab" && selectedLabOrder?.items?.length) {
      setSelectedItems(new Set(selectedLabOrder.items.map((item: any) => Number(item.itemId)).filter(Boolean)))
    } else {
      setSelectedItems(new Set())
    }
  }, [referralType, selectedPrescriptionId, selectedPrescription, selectedLabOrderId, selectedLabOrder])

  useEffect(() => {
    const loadAvailability = async () => {
      if (!selectedChemistId || selectedItems.size === 0 || (referralType === "drug" && !selectedPrescriptionId) || (referralType === "lab" && !selectedLabOrderId)) {
        setAvailability(null)
        return
      }
      try {
        setAvailabilityLoading(true)
        const data = referralType === "lab"
          ? await pharmacyApi.getExternalChemistLabAvailability({
              chemistId: selectedChemistId,
              labOrderId: selectedLabOrderId,
              itemIds: Array.from(selectedItems),
            })
          : await pharmacyApi.getExternalChemistPrescriptionAvailability({
              chemistId: selectedChemistId,
              prescriptionId: selectedPrescriptionId,
              itemIds: Array.from(selectedItems),
            })
        setAvailability(data)
      } catch (err: any) {
        setAvailability(null)
        setError(err.message || "Failed to check chemist availability")
      } finally {
        setAvailabilityLoading(false)
      }
    }
    loadAvailability()
  }, [referralType, selectedChemistId, selectedPrescriptionId, selectedLabOrderId, selectedItemIdsKey])

  useEffect(() => {
    const loadSelectedLabOrder = async () => {
      if (referralType !== "lab" || !selectedLabOrderId) return
      const existing = labOrders.find((order) => String(order.orderId) === selectedLabOrderId)
      if (existing?.items?.length) return
      try {
        const details = await laboratoryApi.getOrder(selectedLabOrderId)
        setLabOrders((current) => current.map((order) => String(order.orderId) === selectedLabOrderId ? { ...order, ...details } : order))
      } catch (err: any) {
        setError(err.message || "Failed to load lab order details")
      }
    }
    loadSelectedLabOrder()
  }, [referralType, selectedLabOrderId, labOrders])

  const resetForm = () => {
    setSelectedPrescriptionId("")
    setSelectedLabOrderId("")
    setSelectedChemistId("")
    setSelectedItems(new Set())
    setPickupDeadline("")
    setPatientInstructions("")
    setNotes("")
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if ((referralType === "drug" && !selectedPrescriptionId) || (referralType === "lab" && !selectedLabOrderId) || !selectedChemistId) {
      setError(referralType === "lab" ? "Select both a lab order and chemist" : "Select both a prescription and chemist")
      return
    }

    try {
      setSaving(true)
      setError(null)
      await pharmacyApi.createExternalReferral({
        referralType,
        prescriptionId: referralType === "drug" ? selectedPrescriptionId : undefined,
        labOrderId: referralType === "lab" ? selectedLabOrderId : undefined,
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

  const formatDate = (value?: string) => {
    if (!value) return "-"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
  }

  const formatDateTime = (value?: string) => {
    if (!value) return "-"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }

  const formatStatus = (status?: string) => (status || "pending").replaceAll("_", " ")

  const availabilityForItem = (itemId: number) =>
    availability?.items?.find((item: any) => Number(item.itemId) === Number(itemId))?.availability

  const itemLabel = (item: any) =>
    item.testName || item.medicationName || item.displayName || "Item"

  const itemActorName = (item: any) =>
    `${item.dispensedByFirstName || item.completedByFirstName || ""} ${item.dispensedByLastName || item.completedByLastName || ""}`.trim() ||
    item.dispensedByUsername ||
    item.completedByUsername ||
    "-"

  const sourceNumber = (referral: ExternalReferral) =>
    referral.referralType === "lab" ? referral.labOrderNumber || "-" : referral.prescriptionNumber || "-"

  const availabilityBadge = (availabilityInfo: any) => {
    if (!availabilityInfo) return <Badge variant="outline">Not checked</Badge>
    if (availabilityInfo.displayStatus === "stale") return <Badge variant="secondary">Stale update</Badge>
    if (availabilityInfo.availabilityStatus === "available") return <Badge>Available</Badge>
    if (availabilityInfo.availabilityStatus === "unavailable") return <Badge variant="destructive">Unavailable</Badge>
    if (availabilityInfo.availabilityStatus === "low_stock") return <Badge variant="secondary">Low stock</Badge>
    if (availabilityInfo.availabilityStatus === "out_of_stock") return <Badge variant="destructive">Out of stock</Badge>
    if (availabilityInfo.availabilityStatus === "not_listed") return <Badge variant="outline">Not listed</Badge>
    return <Badge variant="outline">Unknown</Badge>
  }

  const formatGeneratedDate = () => new Date().toISOString().split("T")[0]

  const medicinesSummary = (referral: ExternalReferral) => {
    const items = referral.items || []
    if (items.length === 0) return "-"
    return items
      .map((item) => {
        const qty = item.quantityReferred || item.quantity || 1
        const picked = item.quantityPicked ?? 0
        return `${itemLabel(item)} (${picked}/${qty}, ${formatStatus(item.status)})`
      })
      .join("; ")
  }

  const referralExportRows = () =>
    referrals.map((referral, index) => ({
      "#": index + 1,
      "Referral No.": referral.referralNumber,
      "Type": referral.referralType === "lab" ? "Lab" : "Drug",
      "Referral Date": formatDateTime(referral.referralDate),
      "Source No.": sourceNumber(referral),
      "Patient": patientName(referral),
      "Patient No.": referral.patientNumber || "-",
      "Patient Phone": referral.patientPhone || "-",
      "Chemist": referral.chemistName,
      "Chemist Code": referral.chemistCode || "-",
      "Chemist Phone": referral.chemistPhone || "-",
      "Pickup Code": referral.pickupCode || "-",
      "Pickup Deadline": formatDate(referral.pickupDeadline),
      "Status": formatStatus(referral.status),
      "Items": referral.items?.length || 0,
      "Item Details": medicinesSummary(referral),
      "Picked At": formatDateTime(referral.pickedUpAt),
      "Completed At": formatDateTime(referral.completedAt),
      "Referred By": `${referral.referredByFirstName || ""} ${referral.referredByLastName || ""}`.trim() || "-",
    }))

  const itemExportRows = () =>
    referrals.flatMap((referral) =>
      (referral.items || []).map((item: any) => ({
        "Referral No.": referral.referralNumber,
        "Patient": patientName(referral),
        "Patient No.": referral.patientNumber || "-",
        "Chemist": referral.chemistName,
        "Type": referral.referralType === "lab" ? "Lab" : "Drug",
        "Item": itemLabel(item),
        "Dosage": item.dosage || "-",
        "Frequency": item.frequency || "-",
        "Duration": item.duration || "-",
        "Quantity Referred": item.quantityReferred || item.quantity || 1,
        "Quantity Picked": item.quantityPicked ?? 0,
        "Item Status": formatStatus(item.status),
        "Handled By": itemActorName(item),
        "Chemist Notes": item.chemistNotes || "-",
        "Referral Status": formatStatus(referral.status),
        "Pickup Code": referral.pickupCode || "-",
      }))
    )

  const exportToExcel = async () => {
    if (typeof window === "undefined") return
    try {
      setExporting("excel")
      setError(null)
      const xlsxModule = await import("xlsx")
      const XLSX = xlsxModule.default || xlsxModule
      const wb = XLSX.utils.book_new()

      const summaryRows = [
        { Metric: "Generated", Value: new Date().toLocaleString() },
        { Metric: "Total referrals", Value: referrals.length },
        { Metric: "Referred", Value: referrals.filter((r) => r.status === "referred").length },
        { Metric: "Ready for pickup", Value: referrals.filter((r) => r.status === "ready_for_pickup").length },
        { Metric: "Partially picked", Value: referrals.filter((r) => r.status === "partially_picked").length },
        { Metric: "Picked up", Value: referrals.filter((r) => r.status === "picked_up").length },
        { Metric: "Not picked", Value: referrals.filter((r) => r.status === "not_picked").length },
        { Metric: "Cancelled", Value: referrals.filter((r) => r.status === "cancelled").length },
      ]

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
      summarySheet["!cols"] = [{ wch: 24 }, { wch: 24 }]
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

      const referralsSheet = XLSX.utils.json_to_sheet(referralExportRows())
      referralsSheet["!cols"] = [
        { wch: 6 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 16 },
        { wch: 16 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
        { wch: 18 }, { wch: 12 }, { wch: 55 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
      ]
      XLSX.utils.book_append_sheet(wb, referralsSheet, "Referrals")

      const itemsSheet = XLSX.utils.json_to_sheet(itemExportRows())
      itemsSheet["!cols"] = [
        { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 26 }, { wch: 28 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 35 },
        { wch: 18 }, { wch: 18 }, { wch: 14 },
      ]
      XLSX.utils.book_append_sheet(wb, itemsSheet, "Referral Items")

      XLSX.writeFile(wb, `External_Chemist_Referrals_${formatGeneratedDate()}.xlsx`)
    } catch (err: any) {
      console.error("External chemist Excel export failed:", err)
      setError(err.message || "Failed to export Excel report")
    } finally {
      setExporting(null)
    }
  }

  const exportToPdf = async () => {
    if (typeof window === "undefined") return
    try {
      setExporting("pdf")
      setError(null)
      const [{ default: jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
      const autoTable =
        (autoTableModule as any).default ||
        (autoTableModule as any).autoTable ||
        ((doc: any, options: any) => doc.autoTable(options))
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
      const pageWidth = pdf.internal.pageSize.getWidth()

      pdf.setFillColor(15, 76, 117)
      pdf.rect(0, 0, pageWidth, 26, "F")
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(17)
      pdf.text("External Chemist Referrals Report", 14, 12)
      pdf.setFontSize(9)
      pdf.text(`Generated: ${new Date().toLocaleString()} | Records: ${referrals.length}`, 14, 19)
      pdf.setTextColor(0, 0, 0)

      const statusCounts = [
        ["Referred", referrals.filter((r) => r.status === "referred").length],
        ["Ready", referrals.filter((r) => r.status === "ready_for_pickup").length],
        ["Partial", referrals.filter((r) => r.status === "partially_picked").length],
        ["Picked", referrals.filter((r) => r.status === "picked_up").length],
        ["Not picked", referrals.filter((r) => r.status === "not_picked").length],
        ["Cancelled", referrals.filter((r) => r.status === "cancelled").length],
      ]

      autoTable(pdf, {
        head: [["Status Summary", "Count"]],
        body: statusCounts,
        startY: 32,
        margin: { left: 14 },
        tableWidth: 82,
        theme: "grid",
        headStyles: { fillColor: [15, 76, 117], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2 },
      })

      const referralRows = referrals.map((referral) => [
        referral.referralNumber,
        patientName(referral),
        referral.patientNumber || "-",
        referral.chemistName,
        referral.pickupCode || "-",
        formatStatus(referral.status),
        String(referral.items?.length || 0),
        medicinesSummary(referral),
      ])

      autoTable(pdf, {
        head: [["Referral", "Patient", "Patient No.", "Chemist", "Code", "Status", "Items", "Details"]],
        body: referralRows,
        startY: 32,
        margin: { left: 104, right: 10 },
        tableWidth: pageWidth - 114,
        theme: "striped",
        headStyles: { fillColor: [15, 76, 117], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 250] },
        styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak", valign: "top" },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 31 },
          2: { cellWidth: 22 },
          3: { cellWidth: 34 },
          4: { cellWidth: 20 },
          5: { cellWidth: 24 },
          6: { cellWidth: 10, halign: "center" },
          7: { cellWidth: "auto" },
        },
      })

      pdf.addPage("a4", "landscape")
      pdf.setFillColor(15, 76, 117)
      pdf.rect(0, 0, pageWidth, 18, "F")
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(14)
      pdf.text("Referral Item Details", 14, 12)
      pdf.setTextColor(0, 0, 0)

      const itemRows = itemExportRows().map((item) => [
        item["Referral No."],
        item.Patient,
        item.Chemist,
        item.Item,
        item.Dosage,
        item.Frequency,
        String(item["Quantity Referred"]),
        String(item["Quantity Picked"]),
        item["Item Status"],
        item["Handled By"],
        item["Chemist Notes"],
      ])

      autoTable(pdf, {
        head: [["Referral", "Patient", "Chemist", "Item", "Details", "Frequency", "Qty", "Done", "Status", "Handled By", "Notes"]],
        body: itemRows,
        startY: 24,
        theme: "striped",
        headStyles: { fillColor: [15, 76, 117], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 250] },
        styles: { fontSize: 7, cellPadding: 1.7, overflow: "linebreak", valign: "top" },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 28 },
          2: { cellWidth: 31 },
          3: { cellWidth: 36 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 },
          6: { cellWidth: 12, halign: "center" },
          7: { cellWidth: 14, halign: "center" },
          8: { cellWidth: 24 },
          9: { cellWidth: 24 },
          10: { cellWidth: "auto" },
        },
      })

      const pageCount = (pdf as any).internal.getNumberOfPages()
      for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page)
        pdf.setFontSize(8)
        pdf.setTextColor(120, 120, 120)
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 28, pdf.internal.pageSize.getHeight() - 8)
      }

      pdf.save(`External_Chemist_Referrals_${formatGeneratedDate()}.pdf`)
    } catch (err: any) {
      console.error("External chemist PDF export failed:", err)
      setError(err.message || "Failed to export PDF report")
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>External Chemist Referrals</CardTitle>
              <CardDescription>Refer prescriptions or lab orders to partner chemists and track status.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToPdf} disabled={loading || exporting !== null || referrals.length === 0}>
                {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                PDF
              </Button>
              <Button variant="outline" onClick={exportToExcel} disabled={loading || exporting !== null || referrals.length === 0}>
                {exporting === "excel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                Excel
              </Button>
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
                  <TableHead>Referral Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => (
                  <TableRow key={referral.referralId}>
                    <TableCell>
                      <div className="font-medium">{referral.referralNumber}</div>
                      <div className="text-xs text-muted-foreground">{sourceNumber(referral)} - code {referral.pickupCode || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{patientName(referral)}</div>
                      <div className="text-xs text-muted-foreground">{referral.patientNumber || "-"}</div>
                    </TableCell>
                    <TableCell>{referral.chemistName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{referral.referralType === "lab" ? "Lab" : "Drug"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{referral.items?.length || 0} item(s)</div>
                      <div className="text-xs text-muted-foreground">
                        {(referral.items || []).slice(0, 2).map((item) => itemLabel(item)).join(", ")}
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
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No external referrals found</TableCell>
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
            <DialogTitle>Refer to Chemist</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Referral type</Label>
                {allowedReferralTypes.length === 1 ? (
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm">
                    {referralType === "lab" ? "Lab order referral" : "Drug / prescription referral"}
                  </div>
                ) : (
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={referralType}
                    onChange={(event) => {
                      setReferralType(event.target.value as "drug" | "lab")
                      setAvailability(null)
                    }}
                  >
                    {allowedReferralTypes.includes("drug") && <option value="drug">Drug / prescription referral</option>}
                    {allowedReferralTypes.includes("lab") && <option value="lab">Lab order referral</option>}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <Label>{referralType === "lab" ? "Lab order" : "Prescription"}</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={referralType === "lab" ? selectedLabOrderId : selectedPrescriptionId}
                  onChange={(event) => referralType === "lab" ? setSelectedLabOrderId(event.target.value) : setSelectedPrescriptionId(event.target.value)}
                  required
                >
                  <option value="">{referralType === "lab" ? "Select lab order" : "Select prescription"}</option>
                  {referralType === "lab"
                    ? labOrders.map((order) => (
                        <option key={order.orderId} value={order.orderId}>
                          {order.orderNumber} - {`${order.firstName || ""} ${order.lastName || ""}`.trim() || "Unknown patient"} - {order.testNames || "No tests listed"}
                        </option>
                      ))
                    : prescriptions.map((prescription) => (
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

            {referralType === "drug" && selectedPrescription && (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Medication items to refer</div>
                <div className="space-y-3">
                  {(selectedPrescription.items || []).map((item) => {
                    const itemId = Number(item.itemId)
                    const itemAvailability = availabilityForItem(itemId)
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
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span>{itemLabel(item)}</span>
                            {selectedChemistId && availabilityBadge(itemAvailability)}
                          </div>
                          <div className="text-muted-foreground">
                            {item.dosage || "-"} - {item.frequency || "-"} - {item.duration || "-"} - Qty {item.quantity || 1}
                          </div>
                          {itemAvailability?.matched && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Chemist listing: {itemAvailability.medicationName}
                              {itemAvailability.quantityAvailable !== undefined ? ` | Qty ${itemAvailability.quantityAvailable}` : ""}
                              {itemAvailability.lastConfirmedAt ? ` | Confirmed ${new Date(itemAvailability.lastConfirmedAt).toLocaleDateString()}` : ""}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                  {(selectedPrescription.items || []).length === 0 && (
                    <div className="text-sm text-muted-foreground">This prescription has no items loaded.</div>
                  )}
                </div>
                {selectedChemistId && (
                  <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                    {availabilityLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking selected chemist stock...
                      </div>
                    ) : availability ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-medium">Availability summary:</span>
                        <span>{availability.totals.available} available</span>
                        <span>{availability.totals.lowStock} low stock</span>
                        <span>{availability.totals.outOfStock} out of stock</span>
                        <span>{availability.totals.notListed} not listed</span>
                        <span>{availability.totals.stale} stale</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Select prescription items to check stock availability.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {referralType === "lab" && selectedLabOrder && (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Lab tests to refer</div>
                <div className="space-y-3">
                  {(selectedLabOrder.items || []).map((item: any) => {
                    const itemId = Number(item.itemId)
                    const itemAvailability = availabilityForItem(itemId)
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
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span>{item.testName || "Lab test"}</span>
                            {selectedChemistId && availabilityBadge(itemAvailability)}
                          </div>
                          <div className="text-muted-foreground">
                            {item.category || "-"} - {item.specimenType || "Specimen not specified"}
                          </div>
                          {itemAvailability?.matched && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Chemist listing: {itemAvailability.testName}
                              {itemAvailability.price !== undefined ? ` | KES ${Number(itemAvailability.price).toLocaleString()}` : ""}
                              {itemAvailability.lastConfirmedAt ? ` | Confirmed ${new Date(itemAvailability.lastConfirmedAt).toLocaleDateString()}` : ""}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                  {(selectedLabOrder.items || []).length === 0 && (
                    <div className="text-sm text-muted-foreground">This lab order has no items loaded.</div>
                  )}
                </div>
                {selectedChemistId && (
                  <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                    {availabilityLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking selected chemist lab availability...
                      </div>
                    ) : availability ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-medium">Availability summary:</span>
                        <span>{availability.totals.available} available</span>
                        <span>{availability.totals.unavailable} unavailable</span>
                        <span>{availability.totals.notListed} not listed</span>
                        <span>{availability.totals.stale} stale</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Select lab tests to check availability.</div>
                    )}
                  </div>
                )}
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
