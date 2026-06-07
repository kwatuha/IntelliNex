"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarDays, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Search } from "lucide-react"
import { pharmacyApi } from "@/lib/api"
import { useAuth } from "@/lib/auth/auth-context"

type Referral = {
  referralId: number
  referralNumber: string
  prescriptionNumber: string
  referralDate?: string
  referralType?: "drug" | "lab"
  chemistName?: string
  chemistCode?: string
  status: string
  patientFirstName?: string
  patientLastName?: string
  patientNumber?: string
  patientPhone?: string
  doctorFirstName?: string
  doctorLastName?: string
  doctorUsername?: string
  pickupCode?: string
  pickedUpAt?: string
  completedAt?: string
  originBranchName?: string
  originBranchCode?: string
  originStoreName?: string
  originStoreLocation?: string
  originLocationLabel?: string
  items?: any[]
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10)

const initialDateRange = () => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: toDateInput(start), to: toDateInput(today) }
}

export function ChemistPickupHistory() {
  const { user, isLoading: authLoading } = useAuth()
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [chemists, setChemists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [drugFilter, setDrugFilter] = useState("")
  const [activeReportTab, setActiveReportTab] = useState<"by-drug" | "records">("by-drug")
  const [selectedChemistId, setSelectedChemistId] = useState("all")
  const [periodPreset, setPeriodPreset] = useState("this_month")
  const [dateFrom, setDateFrom] = useState(() => initialDateRange().from)
  const [dateTo, setDateTo] = useState(() => initialDateRange().to)

  const isCurrentUserChemist = useMemo(() => {
    const roleName = String(user?.role || (user as any)?.roleName || "").toLowerCase()
    return roleName === "chemist" || roleName.includes("external_pharmacy") || roleName.includes("chemist")
  }, [user])

  const loadHistory = async () => {
    if (authLoading) return
    try {
      setLoading(true)
      setError(null)
      const chemistId = !isCurrentUserChemist && selectedChemistId !== "all" ? selectedChemistId : undefined
      const [data, chemistData] = await Promise.all([
        pharmacyApi.getExternalReferrals(chemistId ? { chemistId } : undefined),
        isCurrentUserChemist ? Promise.resolve([]) : pharmacyApi.getExternalChemists(undefined, true),
      ])
      setReferrals(data)
      setChemists(chemistData)
    } catch (err: any) {
      setError(err.message || "Failed to load pickup history")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(loadHistory, 250)
    return () => clearTimeout(handle)
  }, [authLoading, isCurrentUserChemist, selectedChemistId])

  useEffect(() => {
    const today = new Date()
    if (periodPreset === "this_month") {
      setDateFrom(toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)))
      setDateTo(toDateInput(today))
    } else if (periodPreset === "last_month") {
      setDateFrom(toDateInput(new Date(today.getFullYear(), today.getMonth() - 1, 1)))
      setDateTo(toDateInput(new Date(today.getFullYear(), today.getMonth(), 0)))
    } else if (periodPreset === "last_30_days") {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      setDateFrom(toDateInput(start))
      setDateTo(toDateInput(today))
    } else if (periodPreset === "this_year") {
      setDateFrom(toDateInput(new Date(today.getFullYear(), 0, 1)))
      setDateTo(toDateInput(today))
    }
  }, [periodPreset])

  const patientName = (referral: Referral) =>
    `${referral.patientFirstName || ""} ${referral.patientLastName || ""}`.trim() || "Unknown patient"

  const medicineSummary = (items?: any[]) =>
    (items || [])
      .map((item) => `${item.medicationName} (${item.quantityPicked || 0}/${item.quantityReferred || 1})`)
      .join(", ")

  const prescribedBy = (referral: Referral) =>
    `${referral.doctorFirstName || ""} ${referral.doctorLastName || ""}`.trim() ||
    referral.doctorUsername ||
    "-"

  const dispensedBy = (items?: any[]) => {
    const names = Array.from(new Set(
      (items || [])
        .map((item) =>
          `${item.dispensedByFirstName || ""} ${item.dispensedByLastName || ""}`.trim() ||
          item.dispensedByUsername ||
          ""
        )
        .filter(Boolean)
    ))
    return names.length ? names.join(", ") : "-"
  }

  const formatStatus = (status?: string) => (status || "pending").replaceAll("_", " ")

  const formatDateTime = (value?: string) => {
    if (!value) return "-"
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString()
  }

  const reportDateValue = (referral: Referral) =>
    referral.completedAt || referral.pickedUpAt || referral.referralDate || ""

  const inSelectedPeriod = (referral: Referral) => {
    const value = reportDateValue(referral)
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`)
      if (date < from) return false
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59`)
      if (date > to) return false
    }
    return true
  }

  const itemQuantity = (item: any, key: "quantityReferred" | "quantityPicked" | "quantityBalance") => {
    if (key === "quantityBalance" && item.quantityBalance === undefined) {
      return Math.max(Number(item.quantityReferred || 0) - Number(item.quantityPicked || 0), 0)
    }
    return Number(item[key] ?? 0) || 0
  }

  const referralTotals = (referral: Referral) => {
    const items = referral.items || []
    const referred = items.reduce((total, item) => total + (itemQuantity(item, "quantityReferred") || Number(item.quantity || 1)), 0)
    const picked = items.reduce((total, item) => total + itemQuantity(item, "quantityPicked"), 0)
    const balance = items.reduce((total, item) => total + itemQuantity(item, "quantityBalance"), 0)
    return { referred, picked, balance }
  }

  const originLabel = (referral: Referral) =>
    referral.originLocationLabel ||
    [
      referral.originBranchName,
      referral.originStoreName || referral.originStoreLocation,
    ].filter(Boolean).join(" - ") ||
    "-"

  const completedReferrals = useMemo(() => {
    const completedStatuses = new Set(["picked_up", "partially_picked", "not_picked", "cancelled", "completed"])
    const q = search.trim().toLowerCase()
    return referrals.filter((referral) => {
      if (!completedStatuses.has(referral.status)) return false
      if (!inSelectedPeriod(referral)) return false
      const haystack = [
        referral.referralNumber,
        referral.prescriptionNumber,
        referral.patientNumber,
        referral.patientPhone,
        referral.pickupCode,
        referral.chemistName,
        originLabel(referral),
        prescribedBy(referral),
        dispensedBy(referral.items),
        patientName(referral),
        ...(referral.items || []).map((item) => item.medicationName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return !q || haystack.includes(q)
    })
  }, [referrals, search, dateFrom, dateTo])

  const reportItemRows = useMemo(() => (
    completedReferrals.flatMap((referral) =>
      (referral.items || [])
        .filter((item) => {
          const q = drugFilter.trim().toLowerCase()
          if (!q) return true
          return String(item.medicationName || item.displayName || "").toLowerCase().includes(q)
        })
        .map((item) => ({
          referral,
          item,
          quantityReferred: itemQuantity(item, "quantityReferred") || Number(item.quantity || 1),
          quantityPicked: itemQuantity(item, "quantityPicked"),
          quantityBalance: itemQuantity(item, "quantityBalance"),
        }))
    )
  ), [completedReferrals, drugFilter])

  const summary = useMemo(() => {
    const picked = reportItemRows.reduce((total, row) => total + row.quantityPicked, 0)
    const referred = reportItemRows.reduce((total, row) => total + row.quantityReferred, 0)
    const balance = reportItemRows.reduce((total, row) => total + row.quantityBalance, 0)
    return {
      referrals: completedReferrals.length,
      chemists: new Set(completedReferrals.map((referral) => referral.chemistName).filter(Boolean)).size,
      drugs: reportItemRows.length,
      referred,
      picked,
      balance,
      partial: completedReferrals.filter((referral) => referral.status === "partially_picked").length,
    }
  }, [completedReferrals, reportItemRows])

  const reportPeriodLabel = () => `${dateFrom || "Beginning"} to ${dateTo || "Today"}`

  const selectedChemistName = () => {
    if (isCurrentUserChemist) return "Current chemist"
    if (selectedChemistId === "all") return "All chemists"
    return chemists.find((chemist) => String(chemist.chemistId) === selectedChemistId)?.chemistName || "Selected chemist"
  }

  const pickupByDrugRows = useMemo(() => {
    const grouped = new Map<string, { chemist: string; drug: string; quantityPicked: number; outstandingBalance: number }>()
    for (const row of reportItemRows) {
      const chemist = row.referral.chemistName || "Unknown chemist"
      const drug = row.item.medicationName || row.item.displayName || "Unknown drug"
      const key = `${chemist.toLowerCase()}::${drug.toLowerCase()}`
      const current = grouped.get(key) || { chemist, drug, quantityPicked: 0, outstandingBalance: 0 }
      current.quantityPicked += row.quantityPicked
      current.outstandingBalance += row.quantityBalance
      grouped.set(key, current)
    }
    return Array.from(grouped.values()).sort((a, b) => a.chemist.localeCompare(b.chemist) || a.drug.localeCompare(b.drug))
  }, [reportItemRows])

  const referralExportRows = () =>
    completedReferrals.map((referral, index) => ({
      "#": index + 1,
      "Pickup Date": formatDateTime(reportDateValue(referral)),
      "Referral No.": referral.referralNumber,
      "Prescription No.": referral.prescriptionNumber || "-",
      "Patient": patientName(referral),
      "Patient No.": referral.patientNumber || "-",
      "Phone": referral.patientPhone || "-",
      "Chemist": referral.chemistName || "-",
      "Referred From": originLabel(referral),
      "Pickup Code": referral.pickupCode || "-",
      "Status": formatStatus(referral.status),
      "Prescribed By": prescribedBy(referral),
      "Dispensed By": dispensedBy(referral.items),
      "Medicines": medicineSummary(referral.items) || "-",
      "Qty Referred": referralTotals(referral).referred,
      "Qty Picked": referralTotals(referral).picked,
      "Balance": referralTotals(referral).balance,
    }))

  const itemExportRows = () =>
    reportItemRows.map(({ referral, item, quantityReferred, quantityPicked, quantityBalance }) => ({
      "Pickup Date": formatDateTime(reportDateValue(referral)),
      "Referral No.": referral.referralNumber,
      "Prescription No.": referral.prescriptionNumber || "-",
      "Patient": patientName(referral),
      "Patient No.": referral.patientNumber || "-",
      "Chemist": referral.chemistName || "-",
      "Referred From": originLabel(referral),
      "Medication": item.medicationName || item.displayName || "-",
      "Dosage": item.dosage || "-",
      "Frequency": item.frequency || "-",
      "Qty Referred": quantityReferred,
      "Qty Picked": quantityPicked,
      "Balance": quantityBalance,
      "Item Status": formatStatus(item.status),
      "Prescribed By": prescribedBy(referral),
      "Dispensed By": dispensedBy([item]),
      "Chemist Notes": item.chemistNotes || "-",
    }))

  const activeExportCount = activeReportTab === "by-drug" ? pickupByDrugRows.length : completedReferrals.length

  const exportToExcel = async () => {
    if (typeof window === "undefined") return
    try {
      setExporting("excel")
      setError(null)
      const xlsxModule = await import("xlsx")
      const XLSX = (xlsxModule as any).default || xlsxModule
      const wb = XLSX.utils.book_new()
      const summaryRows = [
        { Metric: "Generated", Value: new Date().toLocaleString() },
        { Metric: "Period", Value: reportPeriodLabel() },
        { Metric: "Chemist scope", Value: selectedChemistName() },
        { Metric: "Pickup records", Value: summary.referrals },
        { Metric: "Chemists represented", Value: summary.chemists },
        { Metric: "Drug rows", Value: summary.drugs },
        { Metric: "Quantity referred", Value: summary.referred },
        { Metric: "Quantity picked", Value: summary.picked },
        { Metric: "Outstanding balance", Value: summary.balance },
        { Metric: "Partial pickups", Value: summary.partial },
      ]

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
      summarySheet["!cols"] = [{ wch: 26 }, { wch: 34 }]
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

      if (activeReportTab === "by-drug") {
        const pickupByDrugSheet = XLSX.utils.json_to_sheet(
          pickupByDrugRows.map((row, index) => ({
            "#": index + 1,
            "Chemist": row.chemist,
            "Drug": row.drug,
            "Quantity Picked": row.quantityPicked,
            "Outstanding Balance": row.outstandingBalance,
          }))
        )
        pickupByDrugSheet["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 38 }, { wch: 18 }, { wch: 22 }]
        XLSX.utils.book_append_sheet(wb, pickupByDrugSheet, "Pickup By Drug")
      } else {
        const referralSheet = XLSX.utils.json_to_sheet(referralExportRows())
        referralSheet["!cols"] = [
          { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 28 },
          { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 55 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        ]
        XLSX.utils.book_append_sheet(wb, referralSheet, "Pickup Records")

        const itemSheet = XLSX.utils.json_to_sheet(itemExportRows())
        itemSheet["!cols"] = [
          { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 28 }, { wch: 32 }, { wch: 18 },
          { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 36 },
        ]
        XLSX.utils.book_append_sheet(wb, itemSheet, "Drug Balances")
      }
      XLSX.writeFile(wb, `${activeReportTab === "by-drug" ? "Pickup_By_Drug" : "Patient_Pickup_Records"}_${dateFrom || "all"}_${dateTo || "today"}.xlsx`)
    } catch (err: any) {
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

      pdf.setFillColor(12, 74, 110)
      pdf.rect(0, 0, pageWidth, 28, "F")
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(17)
      pdf.text(activeReportTab === "by-drug" ? "Pickup By Drug Report" : "Patient Pickup Records", 14, 12)
      pdf.setFontSize(9)
      pdf.text(`Period: ${reportPeriodLabel()} | Scope: ${selectedChemistName()} | Generated: ${new Date().toLocaleString()}`, 14, 20)

      if (activeReportTab !== "by-drug") {
        const cards = [
            ["Pickup records", summary.referrals],
            ["Drug rows", summary.drugs],
            ["Qty picked", summary.picked],
            ["Outstanding balance", summary.balance],
          ]
        cards.forEach(([label, value], index) => {
          const x = 14 + index * 68
          pdf.setFillColor(index === 0 ? 219 : index === 1 ? 220 : index === 2 ? 254 : 237, index === 0 ? 234 : index === 1 ? 252 : index === 2 ? 243 : 233, index === 0 ? 254 : index === 1 ? 231 : index === 2 ? 199 : 254)
          pdf.roundedRect(x, 36, 58, 20, 3, 3, "F")
          pdf.setTextColor(31, 41, 55)
          pdf.setFontSize(8)
          pdf.text(String(label), x + 4, 44)
          pdf.setFontSize(14)
          pdf.text(String(value), x + 4, 52)
        })
      }

      if (activeReportTab === "by-drug") {
        const groupedRows = pickupByDrugRows.map((row) => [
          row.chemist,
          row.drug,
          String(row.quantityPicked),
          String(row.outstandingBalance),
        ])

        autoTable(pdf, {
          head: [["Chemist", "Drug", "Quantity Picked", "Outstanding Balance"]],
          body: groupedRows,
          startY: 36,
          theme: "striped",
          headStyles: { fillColor: [12, 74, 110], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 248, 250] },
          styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak", valign: "top" },
          columnStyles: {
            0: { cellWidth: 58 },
            1: { cellWidth: 120 },
            2: { cellWidth: 35, halign: "center" },
            3: { cellWidth: 40, halign: "center" },
          },
        })
      } else {
        const referralRows = referralExportRows().map((row) => [
          row["Referral No."],
          row.Patient,
          row.Chemist,
          row["Referred From"],
          row["Pickup Code"],
          row.Status,
          row["Prescribed By"],
          row["Dispensed By"],
          `${row["Qty Picked"]}/${row["Qty Referred"]}`,
          String(row.Balance),
        ])

        autoTable(pdf, {
          head: [["Referral", "Patient", "Chemist", "Referred From", "Code", "Status", "Prescribed By", "Dispensed By", "Picked", "Balance"]],
          body: referralRows,
          startY: 64,
          theme: "striped",
          headStyles: { fillColor: [12, 74, 110], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 248, 250] },
          styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak", valign: "top" },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 30 },
            2: { cellWidth: 30 },
            3: { cellWidth: 30 },
            4: { cellWidth: 18 },
            5: { cellWidth: 20 },
            6: { cellWidth: 28 },
            7: { cellWidth: 28 },
            8: { cellWidth: 15, halign: "center" },
            9: { cellWidth: 15, halign: "center" },
          },
        })

        pdf.addPage("a4", "landscape")
        pdf.setFillColor(12, 74, 110)
        pdf.rect(0, 0, pageWidth, 18, "F")
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(14)
        pdf.text("Drug Pickup Balances", 14, 12)
        pdf.setTextColor(0, 0, 0)

        const itemRows = itemExportRows().map((row) => [
          row["Referral No."],
          row.Patient,
          row.Chemist,
          row["Referred From"],
          row.Medication,
          row.Dosage,
          row.Frequency,
          String(row["Qty Referred"]),
          String(row["Qty Picked"]),
          String(row.Balance),
          row["Dispensed By"],
        ])

        autoTable(pdf, {
          head: [["Referral", "Patient", "Chemist", "Referred From", "Medication", "Dosage", "Frequency", "Referred", "Picked", "Balance", "Dispensed By"]],
          body: itemRows,
          startY: 24,
          theme: "striped",
          headStyles: { fillColor: [12, 74, 110], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 248, 250] },
          styles: { fontSize: 7, cellPadding: 1.7, overflow: "linebreak", valign: "top" },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 28 },
            2: { cellWidth: 28 },
            3: { cellWidth: 28 },
            4: { cellWidth: 36 },
            5: { cellWidth: 18 },
            6: { cellWidth: 18 },
            7: { cellWidth: 14, halign: "center" },
            8: { cellWidth: 14, halign: "center" },
            9: { cellWidth: 14, halign: "center" },
            10: { cellWidth: "auto" },
          },
        })
      }

      const pageCount = (pdf as any).internal.getNumberOfPages()
      for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page)
        pdf.setFontSize(8)
        pdf.setTextColor(120, 120, 120)
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 28, pdf.internal.pageSize.getHeight() - 8)
      }

      pdf.save(`${activeReportTab === "by-drug" ? "Pickup_By_Drug" : "Patient_Pickup_Records"}_${dateFrom || "all"}_${dateTo || "today"}.pdf`)
    } catch (err: any) {
      setError(err.message || "Failed to export PDF report")
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pickup History</h1>
          <p className="text-muted-foreground">Periodic patient pickup records, chemist referrals, picked drugs, and balances.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadHistory}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportToExcel} disabled={exporting === "excel" || activeExportCount === 0}>
            {exporting === "excel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Excel
          </Button>
          <Button onClick={exportToPdf} disabled={exporting === "pdf" || activeExportCount === 0}>
            {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            PDF
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Report Filters
          </CardTitle>
          <CardDescription>Select a reporting period and export an administration-ready report.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-2">
              <Label>Period</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={periodPreset}
                onChange={(event) => setPeriodPreset(event.target.value)}
              >
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="this_year">This year</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={dateFrom} onChange={(event) => { setPeriodPreset("custom"); setDateFrom(event.target.value) }} />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={dateTo} onChange={(event) => { setPeriodPreset("custom"); setDateTo(event.target.value) }} />
            </div>
            {!isCurrentUserChemist && (
              <div className="space-y-2">
                <Label>Chemist</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedChemistId}
                  onChange={(event) => setSelectedChemistId(event.target.value)}
                >
                  <option value="all">All chemists</option>
                  {chemists.map((chemist) => (
                    <option key={chemist.chemistId} value={String(chemist.chemistId)}>{chemist.chemistName}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Drug</Label>
              <Input
                type="search"
                placeholder="Filter by drug..."
                value={drugFilter}
                onChange={(event) => setDrugFilter(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Patient, chemist, drug..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeReportTab} onValueChange={(value) => setActiveReportTab(value as "by-drug" | "records")} className="space-y-4">
        <TabsList>
          <TabsTrigger value="by-drug">Pickup By Drug</TabsTrigger>
          <TabsTrigger value="records">Patient Pickup Records</TabsTrigger>
        </TabsList>

        <TabsContent value="by-drug" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Pickup By Drug</CardTitle>
                </div>
                <Badge variant="secondary">{pickupByDrugRows.length} group(s)</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chemist</TableHead>
                      <TableHead>Drug</TableHead>
                      <TableHead className="text-right">Quantity Picked</TableHead>
                      <TableHead className="text-right">Outstanding Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pickupByDrugRows.map((row) => (
                      <TableRow key={`${row.chemist}-${row.drug}`}>
                        <TableCell className="font-medium">{row.chemist}</TableCell>
                        <TableCell>{row.drug}</TableCell>
                        <TableCell className="text-right">{row.quantityPicked}</TableCell>
                        <TableCell className="text-right">{row.outstandingBalance}</TableCell>
                      </TableRow>
                    ))}
                    {pickupByDrugRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No drug pickup summary records match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Patient Pickup Records
                  </CardTitle>
                  <CardDescription>
                    {reportPeriodLabel()} | {selectedChemistName()} | {summary.drugs} drug row(s)
                  </CardDescription>
                </div>
                <Badge variant="secondary">{completedReferrals.length} record(s)</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Referral</TableHead>
                      <TableHead>Medicines</TableHead>
                      <TableHead>Picked / Balance</TableHead>
                      <TableHead>Prescribed By</TableHead>
                      <TableHead>Dispensed By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedReferrals.map((referral) => {
                      const totals = referralTotals(referral)
                      return (
                        <TableRow key={referral.referralId}>
                          <TableCell>
                            <div className="font-medium">{patientName(referral)}</div>
                            <div className="text-xs text-muted-foreground">{referral.patientNumber || "-"} | {referral.patientPhone || "-"}</div>
                          </TableCell>
                          <TableCell>
                            <div>{referral.referralNumber}</div>
                            <div className="text-xs text-muted-foreground">{referral.prescriptionNumber} | {referral.pickupCode || "-"}</div>
                            <div className="text-xs text-muted-foreground">{referral.chemistName || "-"}{referral.chemistCode ? ` | ${referral.chemistCode}` : ""}</div>
                            <div className="text-xs text-muted-foreground">From: {originLabel(referral)}</div>
                          </TableCell>
                          <TableCell className="max-w-md text-sm text-muted-foreground">
                            {medicineSummary(referral.items) || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{totals.picked} / {totals.referred}</div>
                            <div className="text-xs text-muted-foreground">Balance {totals.balance}</div>
                          </TableCell>
                          <TableCell>{prescribedBy(referral)}</TableCell>
                          <TableCell>{dispensedBy(referral.items)}</TableCell>
                          <TableCell>
                            <Badge variant={referral.status === "picked_up" ? "default" : "secondary"}>
                              {referral.status.replaceAll("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {referral.completedAt || referral.pickedUpAt
                              ? new Date(referral.completedAt || referral.pickedUpAt || "").toLocaleString()
                              : "-"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {completedReferrals.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                          No completed pickup records match the current search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
