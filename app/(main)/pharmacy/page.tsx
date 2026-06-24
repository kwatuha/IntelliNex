"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TabsContent } from "@/components/ui/tabs"
import { RoleFilteredTabs } from "@/components/role-filtered-tabs"
import { Badge } from "@/components/ui/badge"
import { Search, FileText, Package, Plus, Edit, Loader2, MoreVertical, Eye, CheckCircle, XCircle, Trash2, History, ArrowRight, Sliders, Download, Printer, Pill, AlertCircle, Calendar, Users, List, FileSpreadsheet } from "lucide-react"
import Link from "next/link"
import { AddPrescriptionForm } from "@/components/add-prescription-form"
import { MedicationForm } from "@/components/medication-form"
import { DrugInventoryForm } from "@/components/drug-inventory-form"
import { BatchTraceability } from "@/components/batch-traceability"
import { DrugInventoryHistoryDialog } from "@/components/drug-inventory-history-dialog"
import { StockAdjustmentForm } from "@/components/stock-adjustment-form"
import { DispenseMedicationDialog } from "@/components/dispense-medication-dialog"
import { NursePickup } from "@/components/nurse-pickup"
import { ExternalReferrals } from "@/components/external-referrals"
import { DrugMovement } from "@/components/drug-movement"
import { pharmacyApi } from "@/lib/api"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface Medication {
  medicationId: number
  medicationCode?: string
  medicationName?: string
  name?: string
  genericName?: string
  dosageForm?: string
  strength?: string
  unit?: string
  category?: string
  manufacturer?: string
  description?: string
}

interface Prescription {
  prescriptionId: number
  prescriptionNumber: string
  patientId: number
  firstName?: string
  lastName?: string
  patientNumber?: string
  doctorFirstName?: string
  doctorLastName?: string
  prescriptionDate: string
  status: string
}

interface DrugInventoryItem {
  drugInventoryId: number
  medicationId: number
  batchNumber: string
  quantity: number
  unitPrice: number
  manufactureDate?: string
  expiryDate: string
  minPrice?: number
  sellPrice: number
  location?: string
  notes?: string
  medicationName?: string
  medicationCode?: string
  genericName?: string
  dosageForm?: string
  strength?: string
}

interface InventoryValueByLocationRow {
  location: string
  medicationId: number
  medicationCode?: string
  medicationName?: string
  genericName?: string
  dosageForm?: string
  strength?: string
  quantity: number
  amountValue: number
  batchCount?: number
  earliestExpiryDate?: string
  latestExpiryDate?: string
}

export default function PharmacyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab") || "prescriptions"
  const setPharmacyTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`/pharmacy?${params.toString()}`)
  }
  const [addPrescriptionOpen, setAddPrescriptionOpen] = useState(false)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [medications, setMedications] = useState<Medication[]>([])
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(true)
  const [loadingMedications, setLoadingMedications] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prescriptionStatusFilter, setPrescriptionStatusFilter] = useState<string>("")
  const [prescriptionSearch, setPrescriptionSearch] = useState("")
  const [medicationSearch, setMedicationSearch] = useState("")
  const [prescriptionDateFilter, setPrescriptionDateFilter] = useState<string>("")
  const [prescriptionPatientFilter, setPrescriptionPatientFilter] = useState<string>("")
  const [groupByPatient, setGroupByPatient] = useState(true) // Group by patient by default
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())

  // Medication form state
  const [isAddMedicationOpen, setIsAddMedicationOpen] = useState(false)
  const [isEditMedicationOpen, setIsEditMedicationOpen] = useState(false)
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null)
  const [isDeleteMedicationDialogOpen, setIsDeleteMedicationDialogOpen] = useState(false)
  const [medicationToDelete, setMedicationToDelete] = useState<Medication | null>(null)
  const [isDeletingMedication, setIsDeletingMedication] = useState(false)
  const [deleteMedicationError, setDeleteMedicationError] = useState<string | null>(null)

  // Prescription actions state
  const [viewPrescriptionOpen, setViewPrescriptionOpen] = useState(false)
  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null)
  const [loadingPrescriptionDetails, setLoadingPrescriptionDetails] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [dispenseDialogOpen, setDispenseDialogOpen] = useState(false)
  const [selectedPatientForDispense, setSelectedPatientForDispense] = useState<{patientId: number, patientName: string} | null>(null)

  // Drug Inventory state
  const [drugInventory, setDrugInventory] = useState<DrugInventoryItem[]>([])
  const [drugStores, setDrugStores] = useState<any[]>([])
  const [loadingDrugInventory, setLoadingDrugInventory] = useState(true)
  const [drugInventorySearch, setDrugInventorySearch] = useState("")
  const [drugInventoryLocationFilter, setDrugInventoryLocationFilter] = useState("all")
  const [isAddDrugInventoryOpen, setIsAddDrugInventoryOpen] = useState(false)
  const [isEditDrugInventoryOpen, setIsEditDrugInventoryOpen] = useState(false)
  const [selectedDrugInventoryItem, setSelectedDrugInventoryItem] = useState<DrugInventoryItem | null>(null)
  const [isDeleteDrugInventoryDialogOpen, setIsDeleteDrugInventoryDialogOpen] = useState(false)
  const [drugInventoryToDelete, setDrugInventoryToDelete] = useState<DrugInventoryItem | null>(null)
  const [isDeletingDrugInventory, setIsDeletingDrugInventory] = useState(false)
  const [deleteDrugInventoryError, setDeleteDrugInventoryError] = useState<string | null>(null)
  const [isDrugInventoryHistoryOpen, setIsDrugInventoryHistoryOpen] = useState(false)
  const [selectedDrugInventoryForHistory, setSelectedDrugInventoryForHistory] = useState<DrugInventoryItem | null>(null)
  const [isStockAdjustmentOpen, setIsStockAdjustmentOpen] = useState(false)
  const [selectedDrugInventoryForAdjustment, setSelectedDrugInventoryForAdjustment] = useState<DrugInventoryItem | null>(null)

  // Drug Inventory Summary state
  const [drugInventorySummary, setDrugInventorySummary] = useState<any[]>([])
  const [loadingDrugInventorySummary, setLoadingDrugInventorySummary] = useState(true)
  const [drugInventorySummarySearch, setDrugInventorySummarySearch] = useState("")
  const [inventoryValueRows, setInventoryValueRows] = useState<InventoryValueByLocationRow[]>([])
  const [inventoryValueTotals, setInventoryValueTotals] = useState({ quantity: 0, amountValue: 0 })
  const [loadingInventoryValue, setLoadingInventoryValue] = useState(true)
  const [inventoryValueLocationFilter, setInventoryValueLocationFilter] = useState("all")
  const [inventoryValueDrugSearch, setInventoryValueDrugSearch] = useState("")
  const [inventoryValueDateFrom, setInventoryValueDateFrom] = useState("")
  const [inventoryValueDateTo, setInventoryValueDateTo] = useState("")
  const [inventoryValueExporting, setInventoryValueExporting] = useState<"excel" | "pdf" | null>(null)

  const drugInventoryLocationOptions = useMemo(() => [
    { value: "all", label: "All locations" },
    ...drugStores.map((store) => ({
      value: store.storeName,
      label: [store.storeName, store.branchName, store.isDispensingStore ? "Dispensing" : ""].filter(Boolean).join(" - "),
    })),
  ], [drugStores])

  const loadPrescriptions = async () => {
    try {
      setLoadingPrescriptions(true)
      setError(null)
      const data = await pharmacyApi.getPrescriptions(undefined, prescriptionStatusFilter || undefined)
      setPrescriptions(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load prescriptions')
      console.error('Error loading prescriptions:', err)
    } finally {
      setLoadingPrescriptions(false)
    }
  }

  const loadMedications = async () => {
    try {
      setLoadingMedications(true)
      setError(null)
      const data = await pharmacyApi.getMedications(medicationSearch || undefined)
      setMedications(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load medications')
      console.error('Error loading medications:', err)
    } finally {
      setLoadingMedications(false)
    }
  }

  useEffect(() => {
    loadPrescriptions()
  }, [prescriptionStatusFilter])

  useEffect(() => {
    loadMedications()
  }, [medicationSearch])

  const loadDrugInventory = async () => {
    try {
      setLoadingDrugInventory(true)
      setError(null)
      const data = await pharmacyApi.getDrugInventory(
        undefined,
        drugInventorySearch || undefined,
        1,
        50,
        drugInventoryLocationFilter === "all" ? undefined : drugInventoryLocationFilter
      )
      setDrugInventory(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load drug inventory')
      console.error('Error loading drug inventory:', err)
    } finally {
      setLoadingDrugInventory(false)
    }
  }

  useEffect(() => {
    loadDrugInventory()
  }, [drugInventorySearch, drugInventoryLocationFilter])

  useEffect(() => {
    const loadDrugStores = async () => {
      try {
        const stores = await pharmacyApi.getDrugStores(undefined, undefined, 'true')
        setDrugStores(stores)
      } catch (err) {
        console.error('Error loading drug stores:', err)
        setDrugStores([])
      }
    }
    loadDrugStores()
  }, [])

  const loadDrugInventorySummary = async () => {
    try {
      setLoadingDrugInventorySummary(true)
      setError(null)
      const response = await pharmacyApi.getDrugInventorySummary(drugInventorySummarySearch || undefined)
      setDrugInventorySummary(response.data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load drug inventory summary')
      console.error('Error loading drug inventory summary:', err)
    } finally {
      setLoadingDrugInventorySummary(false)
    }
  }

  useEffect(() => {
    loadDrugInventorySummary()
  }, [drugInventorySummarySearch])

  const loadInventoryValueByLocation = async () => {
    try {
      setLoadingInventoryValue(true)
      setError(null)
      const response = await pharmacyApi.getInventoryValueByLocation({
        location: inventoryValueLocationFilter,
        search: inventoryValueDrugSearch || undefined,
        dateFrom: inventoryValueDateFrom || undefined,
        dateTo: inventoryValueDateTo || undefined,
      })
      setInventoryValueRows(response.data || [])
      setInventoryValueTotals(response.totals || { quantity: 0, amountValue: 0 })
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory value by location')
      console.error('Error loading inventory value by location:', err)
    } finally {
      setLoadingInventoryValue(false)
    }
  }

  useEffect(() => {
    loadInventoryValueByLocation()
  }, [inventoryValueLocationFilter, inventoryValueDrugSearch, inventoryValueDateFrom, inventoryValueDateTo])

  const formatMoney = (value: any) =>
    `KES ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatReportDate = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const inventoryValuePeriodLabel = () => {
    if (inventoryValueDateFrom && inventoryValueDateTo) return `${inventoryValueDateFrom} to ${inventoryValueDateTo}`
    if (inventoryValueDateFrom) return `From ${inventoryValueDateFrom}`
    if (inventoryValueDateTo) return `Up to ${inventoryValueDateTo}`
    return 'All periods'
  }

  const inventoryValueExportRows = () =>
    inventoryValueRows.map((row, index) => ({
      "#": index + 1,
      Location: row.location || 'Unassigned',
      Drug: row.medicationName || '-',
      "Drug Code": row.medicationCode || '-',
      "Generic Name": row.genericName || '-',
      "Dosage Form": row.dosageForm || '-',
      Strength: row.strength || '-',
      Quantity: Number(row.quantity || 0),
      "Amount/Value": Number(row.amountValue || 0),
      "Batch Count": Number(row.batchCount || 0),
      "Earliest Expiry": formatReportDate(row.earliestExpiryDate),
      "Latest Expiry": formatReportDate(row.latestExpiryDate),
    }))

  const exportInventoryValueExcel = async () => {
    if (typeof window === 'undefined') return
    try {
      setInventoryValueExporting("excel")
      const xlsxModule = await import("xlsx")
      const XLSX = (xlsxModule as any).default || xlsxModule
      const wb = XLSX.utils.book_new()
      const summaryRows = [
        { Metric: "Generated", Value: new Date().toLocaleString() },
        { Metric: "Period", Value: inventoryValuePeriodLabel() },
        { Metric: "Location", Value: inventoryValueLocationFilter === "all" ? "All locations" : inventoryValueLocationFilter },
        { Metric: "Drug filter", Value: inventoryValueDrugSearch || "All drugs" },
        { Metric: "Total quantity", Value: inventoryValueTotals.quantity },
        { Metric: "Total amount/value", Value: inventoryValueTotals.amountValue },
      ]
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
      summarySheet["!cols"] = [{ wch: 24 }, { wch: 36 }]
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

      const rows = inventoryValueExportRows().map((row) => ({
        ...row,
        "Amount/Value": Number(row["Amount/Value"] || 0),
      }))
      const sheet = XLSX.utils.json_to_sheet(rows)
      sheet["!cols"] = [
        { wch: 6 }, { wch: 28 }, { wch: 36 }, { wch: 16 }, { wch: 28 }, { wch: 16 },
        { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
      ]
      XLSX.utils.book_append_sheet(wb, sheet, "Inventory Value")
      XLSX.writeFile(wb, `Inventory_Value_By_Location_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (err: any) {
      setError(err.message || "Failed to export inventory value report")
    } finally {
      setInventoryValueExporting(null)
    }
  }

  const exportInventoryValuePdf = async () => {
    if (typeof window === 'undefined') return
    try {
      setInventoryValueExporting("pdf")
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
      pdf.setFontSize(16)
      pdf.text("Inventory Value by Location", 14, 11)
      pdf.setFontSize(9)
      pdf.text(`Period: ${inventoryValuePeriodLabel()} | Location: ${inventoryValueLocationFilter === "all" ? "All locations" : inventoryValueLocationFilter} | Generated: ${new Date().toLocaleString()}`, 14, 19)
      pdf.setTextColor(0, 0, 0)

      autoTable(pdf, {
        head: [["Location", "Drug", "Quantity", "Amount/Value", "Batches", "Earliest Expiry", "Latest Expiry"]],
        body: inventoryValueRows.map((row) => [
          row.location || "Unassigned",
          row.medicationName || "-",
          String(Number(row.quantity || 0)),
          formatMoney(row.amountValue),
          String(Number(row.batchCount || 0)),
          formatReportDate(row.earliestExpiryDate),
          formatReportDate(row.latestExpiryDate),
        ]),
        foot: [["Total", "", String(inventoryValueTotals.quantity || 0), formatMoney(inventoryValueTotals.amountValue), "", "", ""]],
        startY: 34,
        theme: "striped",
        headStyles: { fillColor: [15, 76, 117], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [229, 241, 248], textColor: 20, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 250] },
        styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak", valign: "top" },
        columnStyles: {
          0: { cellWidth: 42 },
          1: { cellWidth: 76 },
          2: { cellWidth: 24, halign: "right" },
          3: { cellWidth: 34, halign: "right" },
          4: { cellWidth: 20, halign: "right" },
          5: { cellWidth: 32 },
          6: { cellWidth: 32 },
        },
      })

      const pageCount = (pdf as any).internal.getNumberOfPages()
      for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page)
        pdf.setFontSize(8)
        pdf.setTextColor(120, 120, 120)
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 28, pdf.internal.pageSize.getHeight() - 8)
      }
      pdf.save(`Inventory_Value_By_Location_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err: any) {
      setError(err.message || "Failed to export inventory value PDF")
    } finally {
      setInventoryValueExporting(null)
    }
  }

  const handleExportSummary = () => {
    // Create CSV content
    const headers = ['Medication Code', 'Medication Name', 'Generic Name', 'Dosage Form', 'Strength', 'Location', 'Total Quantity', 'Batch Count', 'Earliest Expiry', 'Latest Expiry', 'Average Unit Price', 'Average Sell Price', 'Status']
    const rows = drugInventorySummary.map((item) => [
      item.medicationCode || '',
      item.medicationName || '',
      item.genericName || '',
      item.dosageForm || '',
      item.strength || '',
      item.location || '',
      item.totalQuantity || 0,
      item.batchCount || 0,
      item.earliestExpiryDate ? new Date(item.earliestExpiryDate).toLocaleDateString() : '',
      item.latestExpiryDate ? new Date(item.latestExpiryDate).toLocaleDateString() : '',
      item.averageUnitPrice ? parseFloat(item.averageUnitPrice).toFixed(2) : '',
      item.averageSellPrice ? parseFloat(item.averageSellPrice).toFixed(2) : '',
      item.status || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `drug-inventory-summary-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handlePrintSummary = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Drug Inventory Summary</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px; }
            .header img { max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto; }
            h1 { text-align: center; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .date { text-align: right; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${window.location.origin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div style="display: none;">
              <h1 style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 2px;">KIPLOMBE</h1>
              <h2 style="margin: 5px 0; font-size: 18px; color: #333;">Medical Centre</h2>
            </div>
          </div>
          <h1>Drug Inventory Summary</h1>
          <div class="date">Generated: ${new Date().toLocaleString()}</div>
          <table>
            <thead>
              <tr>
                <th>Medication Code</th>
                <th>Medication Name</th>
                <th>Generic Name</th>
                <th>Dosage Form</th>
                <th>Strength</th>
                <th>Location</th>
                <th>Total Quantity</th>
                <th>Batch Count</th>
                <th>Earliest Expiry</th>
                <th>Latest Expiry</th>
                <th>Avg Unit Price</th>
                <th>Avg Sell Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${drugInventorySummary.map((item) => `
                <tr>
                  <td>${item.medicationCode || ''}</td>
                  <td>${item.medicationName || ''}</td>
                  <td>${item.genericName || ''}</td>
                  <td>${item.dosageForm || ''}</td>
                  <td>${item.strength || ''}</td>
                  <td>${item.location || ''}</td>
                  <td>${item.totalQuantity || 0}</td>
                  <td>${item.batchCount || 0}</td>
                  <td>${item.earliestExpiryDate ? new Date(item.earliestExpiryDate).toLocaleDateString() : ''}</td>
                  <td>${item.latestExpiryDate ? new Date(item.latestExpiryDate).toLocaleDateString() : ''}</td>
                  <td>${item.averageUnitPrice ? parseFloat(item.averageUnitPrice).toFixed(2) : ''}</td>
                  <td>${item.averageSellPrice ? parseFloat(item.averageSellPrice).toFixed(2) : ''}</td>
                  <td>${item.status || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `

    printWindow.document.write(htmlContent)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }

  const handleAddMedicationSuccess = () => {
    loadMedications()
  }

  const handleEditMedicationClick = (medication: Medication) => {
    setSelectedMedication(medication)
    setIsEditMedicationOpen(true)
  }

  const handleEditMedicationSuccess = () => {
    loadMedications()
    setIsEditMedicationOpen(false)
    setSelectedMedication(null)
  }

  const handleDeleteMedicationClick = (medication: Medication) => {
    setMedicationToDelete(medication)
    setDeleteMedicationError(null)
    setIsDeleteMedicationDialogOpen(true)
  }

  const handleDeleteMedicationConfirm = async () => {
    if (!medicationToDelete || !medicationToDelete.medicationId) return

    try {
      setIsDeletingMedication(true)
      setDeleteMedicationError(null)
      await pharmacyApi.deleteMedication(medicationToDelete.medicationId.toString())
      setIsDeleteMedicationDialogOpen(false)
      setMedicationToDelete(null)
      loadMedications()
    } catch (err: any) {
      setDeleteMedicationError(err.message || 'Failed to delete medication')
      console.error('Error deleting medication:', err)
    } finally {
      setIsDeletingMedication(false)
    }
  }

  const handleViewPrescription = async (prescription: Prescription) => {
    setSelectedPrescription(prescription)
    setViewPrescriptionOpen(true)
    setLoadingPrescriptionDetails(true)
    try {
      const details = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
      setSelectedPrescription(details)
    } catch (err: any) {
      setError(err.message || 'Failed to load prescription details')
      console.error('Error loading prescription details:', err)
    } finally {
      setLoadingPrescriptionDetails(false)
    }
  }

  const handleUpdatePrescriptionStatus = async (prescriptionId: number, status: string) => {
    setUpdatingStatus(prescriptionId.toString())
    try {
      await pharmacyApi.updatePrescription(prescriptionId.toString(), { status })
      await loadPrescriptions()
      // If viewing this prescription, update it
      if (selectedPrescription?.prescriptionId === prescriptionId) {
        const details = await pharmacyApi.getPrescription(prescriptionId.toString())
        setSelectedPrescription(details)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update prescription status')
      console.error('Error updating prescription status:', err)
    } finally {
      setUpdatingStatus(null)
    }
  }

  const getPatientName = (prescription: Prescription) => {
    if (prescription.firstName && prescription.lastName) {
      return `${prescription.firstName} ${prescription.lastName}`
    }
    return prescription.patientNumber || `Patient ${prescription.patientId}`
  }

  const getDoctorName = (prescription: Prescription) => {
    if (prescription.doctorFirstName && prescription.doctorLastName) {
      return `Dr. ${prescription.doctorFirstName} ${prescription.doctorLastName}`
    }
    return "Unknown"
  }

  const getMedicationName = (medication: Medication) => {
    return medication.medicationName || medication.name || "Unknown"
  }

  const handleAddDrugInventorySuccess = () => {
    loadDrugInventory()
  }

  const handleEditDrugInventoryClick = (item: DrugInventoryItem) => {
    setSelectedDrugInventoryItem(item)
    setIsEditDrugInventoryOpen(true)
  }

  const handleEditDrugInventorySuccess = () => {
    loadDrugInventory()
    setIsEditDrugInventoryOpen(false)
    setSelectedDrugInventoryItem(null)
  }

  const handleViewDrugInventoryHistory = (item: DrugInventoryItem) => {
    setSelectedDrugInventoryForHistory(item)
    setIsDrugInventoryHistoryOpen(true)
  }

  const handleStockAdjustment = (item: DrugInventoryItem) => {
    setSelectedDrugInventoryForAdjustment(item)
    setIsStockAdjustmentOpen(true)
  }

  const handleStockAdjustmentSuccess = () => {
    loadDrugInventory()
    setIsStockAdjustmentOpen(false)
    setSelectedDrugInventoryForAdjustment(null)
  }

  const handleDeleteDrugInventoryClick = (item: DrugInventoryItem) => {
    setDrugInventoryToDelete(item)
    setDeleteDrugInventoryError(null)
    setIsDeleteDrugInventoryDialogOpen(true)
  }

  const handleDeleteDrugInventoryConfirm = async () => {
    if (!drugInventoryToDelete || !drugInventoryToDelete.drugInventoryId) return

    try {
      setIsDeletingDrugInventory(true)
      setDeleteDrugInventoryError(null)
      await pharmacyApi.deleteDrugInventoryItem(drugInventoryToDelete.drugInventoryId.toString())
      setIsDeleteDrugInventoryDialogOpen(false)
      setDrugInventoryToDelete(null)
      loadDrugInventory()
    } catch (err: any) {
      setDeleteDrugInventoryError(err.message || 'Failed to delete drug inventory item')
      console.error('Error deleting drug inventory item:', err)
    } finally {
      setIsDeletingDrugInventory(false)
    }
  }

  const getDrugInventoryItemName = (item: DrugInventoryItem) => {
    return item.medicationName || `Medication ${item.medicationId}`
  }

  const filteredPrescriptions = prescriptions.filter((prescription) => {
    // Status filter
    if (prescriptionStatusFilter && prescription.status !== prescriptionStatusFilter) {
      return false
    }

    // Date filter
    if (prescriptionDateFilter) {
      const prescriptionDate = prescription.prescriptionDate ? new Date(prescription.prescriptionDate).toISOString().split('T')[0] : ''
      if (prescriptionDate !== prescriptionDateFilter) {
        return false
      }
    }

    // Patient filter
    if (prescriptionPatientFilter) {
      const patientName = getPatientName(prescription).toLowerCase()
      const patientNumber = prescription.patientNumber?.toLowerCase() || ''
      const patientId = prescription.patientId?.toString() || ''
      const filterLower = prescriptionPatientFilter.toLowerCase()
      if (!patientName.includes(filterLower) && !patientNumber.includes(filterLower) && !patientId.includes(filterLower)) {
        return false
      }
    }

    // Search filter
    if (prescriptionSearch) {
      const searchLower = prescriptionSearch.toLowerCase()
      const patientName = getPatientName(prescription).toLowerCase()
      const doctorName = getDoctorName(prescription).toLowerCase()
      const prescriptionNumber = prescription.prescriptionNumber?.toLowerCase() || ""
      return patientName.includes(searchLower) || doctorName.includes(searchLower) || prescriptionNumber.includes(searchLower)
    }
    return true
  })

  // Group prescriptions by patient
  const groupedPrescriptions = React.useMemo(() => {
    if (!groupByPatient) {
      return null
    }

    const grouped: Record<string, Prescription[]> = {}

    filteredPrescriptions.forEach((prescription) => {
      const patientKey = `${prescription.patientId}_${getPatientName(prescription)}`
      if (!grouped[patientKey]) {
        grouped[patientKey] = []
      }
      grouped[patientKey].push(prescription)
    })

    // Convert to array and sort by patient name
    return Object.entries(grouped)
      .map(([key, prescriptions]) => ({
        patientKey: key,
        patientId: prescriptions[0].patientId,
        patientName: getPatientName(prescriptions[0]),
        patientNumber: prescriptions[0].patientNumber,
        prescriptions: prescriptions.sort((a, b) => {
          const dateA = a.prescriptionDate ? new Date(a.prescriptionDate).getTime() : 0
          const dateB = b.prescriptionDate ? new Date(b.prescriptionDate).getTime() : 0
          return dateB - dateA // Most recent first
        })
      }))
      .sort((a, b) => a.patientName.localeCompare(b.patientName))
  }, [filteredPrescriptions, groupByPatient])

  // Generate prescription HTML for printing/PDF
  const generatePrescriptionHTML = (prescription: any): string => {
    const patientName = getPatientName(prescription)
    const doctorName = getDoctorName(prescription)
    const prescriptionDate = prescription.prescriptionDate
      ? new Date(prescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A'

    const items = prescription.items || []
    const totalCost = items.reduce((sum: number, item: any) => {
      const qty = item.quantity ? parseInt(item.quantity) : 0
      const price = item.sellPrice ? parseFloat(item.sellPrice) : 0
      return sum + (qty * price)
    }, 0)

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Prescription ${prescription.prescriptionNumber || ''}</title>
          <style>
            @media print {
              @page { margin: 15mm; }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              font-size: 12px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
            }
            .header img {
              max-width: 250px;
              height: auto;
              margin-bottom: 15px;
              display: block;
              margin-left: auto;
              margin-right: auto;
            }
            h1 {
              text-align: center;
              margin-bottom: 30px;
              font-size: 24px;
            }
            .prescription-info {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 30px;
            }
            .info-section {
              border: 1px solid #ddd;
              padding: 15px;
              border-radius: 5px;
            }
            .info-section h3 {
              margin: 0 0 10px 0;
              font-size: 14px;
              color: #666;
              border-bottom: 1px solid #eee;
              padding-bottom: 5px;
            }
            .info-section p {
              margin: 5px 0;
              font-size: 13px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
              font-weight: bold;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .total-section {
              margin-top: 20px;
              text-align: right;
              border-top: 2px solid #000;
              padding-top: 10px;
            }
            .total-section p {
              margin: 5px 0;
            }
            .total-amount {
              font-size: 18px;
              font-weight: bold;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              text-align: center;
              font-size: 10px;
              color: #666;
            }
            .notes {
              margin-top: 20px;
              padding: 15px;
              background-color: #f9f9f9;
              border-radius: 5px;
            }
            .notes h3 {
              margin: 0 0 10px 0;
              font-size: 14px;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .status-pending { background-color: #fef3c7; color: #92400e; }
            .status-dispensed { background-color: #d1fae5; color: #065f46; }
            .status-completed { background-color: #dbeafe; color: #1e40af; }
            .status-cancelled { background-color: #fee2e2; color: #991b1b; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${window.location.origin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none';" />
            <h1 style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 2px;">PRESCRIPTION</h1>
          </div>

          <div class="prescription-info">
            <div class="info-section">
              <h3>Patient Information</h3>
              <p><strong>Name:</strong> ${patientName}</p>
              ${prescription.patientNumber ? `<p><strong>Patient ID:</strong> ${prescription.patientNumber}</p>` : ''}
              ${prescription.patientId ? `<p><strong>Patient Number:</strong> ${prescription.patientId}</p>` : ''}
            </div>
            <div class="info-section">
              <h3>Prescription Details</h3>
              <p><strong>Prescription #:</strong> ${prescription.prescriptionNumber || 'N/A'}</p>
              <p><strong>Date:</strong> ${prescriptionDate}</p>
              <p><strong>Doctor:</strong> ${doctorName}</p>
              <p><strong>Status:</strong> <span class="status-badge status-${prescription.status || 'pending'}">${(prescription.status || 'pending').charAt(0).toUpperCase() + (prescription.status || 'pending').slice(1)}</span></p>
            </div>
          </div>

          ${items.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medication</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  ${items.some((item: any) => item.quantity) ? '<th>Quantity</th>' : ''}
                  ${items.some((item: any) => item.sellPrice) ? '<th>Unit Price</th>' : ''}
                  ${items.some((item: any) => item.sellPrice && item.quantity) ? '<th>Total</th>' : ''}
                  <th>Instructions</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any, index: number) => {
                  const quantity = item.quantity ? parseInt(item.quantity) : null
                  const unitPrice = item.sellPrice ? parseFloat(item.sellPrice) : null
                  const itemTotal = quantity && unitPrice ? quantity * unitPrice : null

                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td><strong>${item.medicationName || 'Unknown Medication'}</strong>${item.medicationCode ? ` (${item.medicationCode})` : ''}</td>
                      <td>${item.dosage || '-'}</td>
                      <td>${item.frequency || '-'}</td>
                      <td>${item.duration || '-'}</td>
                      ${items.some((i: any) => i.quantity) ? `<td>${quantity || '-'}</td>` : ''}
                      ${items.some((i: any) => i.sellPrice) ? `<td>${unitPrice ? `KES ${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>` : ''}
                      ${items.some((i: any) => i.sellPrice && i.quantity) ? `<td>${itemTotal ? `KES ${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>` : ''}
                      <td>${item.instructions || '-'}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>

            ${totalCost > 0 ? `
              <div class="total-section">
                <p><strong>Total Cost: <span class="total-amount">KES ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></strong></p>
              </div>
            ` : ''}
          ` : '<p>No medications prescribed.</p>'}

          ${prescription.notes ? `
            <div class="notes">
              <h3>Notes</h3>
              <p>${prescription.notes}</p>
            </div>
          ` : ''}

          <div class="footer">
            <p>Generated on ${new Date().toLocaleString()}</p>
            <p>This is a computer-generated prescription. Please verify all information before dispensing.</p>
          </div>
        </body>
      </html>
    `
  }

  // Print single prescription
  const handlePrintPrescription = async (prescription: any) => {
    try {
      // If prescription doesn't have items, fetch full details
      let fullPrescription = prescription
      if (!prescription.items || prescription.items.length === 0) {
        const details = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
        fullPrescription = details
      }

      const htmlContent = generatePrescriptionHTML(fullPrescription)
      const printWindow = window.open('', '_blank')
      if (!printWindow) return

      printWindow.document.write(htmlContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    } catch (error: any) {
      console.error('Error printing prescription:', error)
      alert('Failed to print prescription. Please try again.')
    }
  }

  // Download single prescription as PDF
  const handleDownloadPrescriptionPDF = async (prescription: any) => {
    try {
      // If prescription doesn't have items, fetch full details
      let fullPrescription = prescription
      if (!prescription.items || prescription.items.length === 0) {
        const details = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
        fullPrescription = details
      }

      const htmlContent = generatePrescriptionHTML(fullPrescription)
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank')

      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print()
            // After printing, user can save as PDF from print dialog
          }, 250)
        }
      } else {
        // Fallback: create download link
        const link = document.createElement('a')
        link.href = url
        link.download = `Prescription_${fullPrescription.prescriptionNumber || fullPrescription.prescriptionId}_${new Date().toISOString().split('T')[0]}.html`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 100)
      }
    } catch (error: any) {
      console.error('Error downloading prescription PDF:', error)
      alert('Failed to download prescription PDF. Please try again.')
    }
  }

  // Print all filtered prescriptions
  const handlePrintAllPrescriptions = async () => {
    if (filteredPrescriptions.length === 0) {
      alert('No prescriptions to print.')
      return
    }

    try {
      // Fetch full details for all prescriptions
      const prescriptionsWithDetails = await Promise.all(
        filteredPrescriptions.map(async (prescription) => {
          try {
            const details = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
            return details
          } catch (error) {
            console.error(`Error fetching prescription ${prescription.prescriptionId}:`, error)
            return prescription
          }
        })
      )

      // Generate filter description
      let filterDescription = 'All Prescriptions'
      if (prescriptionDateFilter) {
        filterDescription = `Prescriptions for ${new Date(prescriptionDateFilter).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
      }
      if (prescriptionPatientFilter) {
        filterDescription = `Prescriptions for Patient: ${prescriptionPatientFilter}`
      }
      if (prescriptionStatusFilter) {
        filterDescription += ` (Status: ${prescriptionStatusFilter})`
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Prescriptions Report</title>
            <style>
              @media print {
                @page { margin: 15mm; }
              }
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
                font-size: 11px;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #000;
                padding-bottom: 15px;
              }
              .header img {
                max-width: 150px;
                height: auto;
                margin-bottom: 10px;
              }
              h1 {
                text-align: center;
                margin-bottom: 10px;
                font-size: 22px;
              }
              .filter-info {
                text-align: center;
                margin-bottom: 20px;
                color: #666;
                font-size: 12px;
              }
              .prescription-section {
                page-break-after: always;
                margin-bottom: 40px;
                border: 1px solid #ddd;
                padding: 20px;
                border-radius: 5px;
              }
              .prescription-section:last-child {
                page-break-after: auto;
              }
              .prescription-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
              }
              .info-section {
                border: 1px solid #ddd;
                padding: 10px;
                border-radius: 5px;
                font-size: 10px;
              }
              .info-section h3 {
                margin: 0 0 8px 0;
                font-size: 12px;
                color: #666;
                border-bottom: 1px solid #eee;
                padding-bottom: 3px;
              }
              .info-section p {
                margin: 3px 0;
                font-size: 10px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
                font-size: 9px;
              }
              th, td {
                border: 1px solid #ddd;
                padding: 6px;
                text-align: left;
              }
              th {
                background-color: #f2f2f2;
                font-weight: bold;
              }
              .footer {
                margin-top: 20px;
                padding-top: 10px;
                border-top: 1px solid #ddd;
                text-align: center;
                font-size: 9px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <img src="${window.location.origin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none';" />
              <h1>PRESCRIPTIONS REPORT</h1>
              <div class="filter-info">
                ${filterDescription} | Total: ${prescriptionsWithDetails.length} prescription(s) | Generated: ${new Date().toLocaleString()}
              </div>
            </div>

            ${prescriptionsWithDetails.map((prescription, index) => {
              const patientName = getPatientName(prescription)
              const doctorName = getDoctorName(prescription)
              const prescriptionDate = prescription.prescriptionDate
                ? new Date(prescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'N/A'
              const items = prescription.items || []

              return `
                <div class="prescription-section">
                  <div class="prescription-info">
                    <div class="info-section">
                      <h3>Patient Information</h3>
                      <p><strong>Name:</strong> ${patientName}</p>
                      ${prescription.patientNumber ? `<p><strong>Patient ID:</strong> ${prescription.patientNumber}</p>` : ''}
                    </div>
                    <div class="info-section">
                      <h3>Prescription Details</h3>
                      <p><strong>Prescription #:</strong> ${prescription.prescriptionNumber || 'N/A'}</p>
                      <p><strong>Date:</strong> ${prescriptionDate}</p>
                      <p><strong>Doctor:</strong> ${doctorName}</p>
                      <p><strong>Status:</strong> ${(prescription.status || 'pending').charAt(0).toUpperCase() + (prescription.status || 'pending').slice(1)}</p>
                    </div>
                  </div>

                  ${items.length > 0 ? `
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Medication</th>
                          <th>Dosage</th>
                          <th>Frequency</th>
                          <th>Duration</th>
                          <th>Instructions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${items.map((item: any, itemIndex: number) => `
                          <tr>
                            <td>${itemIndex + 1}</td>
                            <td><strong>${item.medicationName || 'Unknown'}</strong></td>
                            <td>${item.dosage || '-'}</td>
                            <td>${item.frequency || '-'}</td>
                            <td>${item.duration || '-'}</td>
                            <td>${item.instructions || '-'}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : '<p>No medications prescribed.</p>'}

                  ${prescription.notes ? `
                    <div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;">
                      <strong>Notes:</strong> ${prescription.notes}
                    </div>
                  ` : ''}
                </div>
              `
            }).join('')}

            <div class="footer">
              <p>End of Report | Generated on ${new Date().toLocaleString()}</p>
            </div>
          </body>
        </html>
      `

      const printWindow = window.open('', '_blank')
      if (!printWindow) return

      printWindow.document.write(htmlContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    } catch (error: any) {
      console.error('Error printing prescriptions:', error)
      alert('Failed to print prescriptions. Please try again.')
    }
  }

  // Print all prescriptions for a specific patient
  const handlePrintAllPrescriptionsForPatient = async (patientPrescriptions: Prescription[]) => {
    if (patientPrescriptions.length === 0) {
      alert('No prescriptions to print.')
      return
    }

    try {
      const prescriptionsWithDetails = await Promise.all(
        patientPrescriptions.map(async (prescription) => {
          try {
            const details = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
            return details
          } catch (error) {
            console.error(`Error fetching prescription ${prescription.prescriptionId}:`, error)
            return prescription
          }
        })
      )

      const patientName = getPatientName(patientPrescriptions[0])
      const patientNumber = patientPrescriptions[0].patientNumber

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Prescriptions for ${patientName}</title>
            <style>
              @media print { @page { margin: 15mm; } }
              body { font-family: Arial, sans-serif; margin: 20px; font-size: 11px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px; }
              .header img { max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto; }
              h1 { text-align: center; margin-bottom: 10px; font-size: 22px; }
              .patient-info { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #ddd; }
              .patient-info h2 { margin: 0 0 10px 0; font-size: 18px; }
              .prescription-section { page-break-after: always; margin-bottom: 40px; border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
              .prescription-section:last-child { page-break-after: auto; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 9px; }
              th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
              th { background-color: #f2f2f2; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <img src="${window.location.origin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none';" />
              <h1>PRESCRIPTIONS REPORT</h1>
            </div>
            <div class="patient-info">
              <h2>Patient: ${patientName}</h2>
              ${patientNumber ? `<p><strong>Patient ID:</strong> ${patientNumber}</p>` : ''}
              <p><strong>Total Prescriptions:</strong> ${prescriptionsWithDetails.length}</p>
            </div>
            ${prescriptionsWithDetails.map((prescription) => {
              const doctorName = getDoctorName(prescription)
              const prescriptionDate = prescription.prescriptionDate ? new Date(prescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'
              const items = prescription.items || []
              return `
                <div class="prescription-section">
                  <h3>Prescription #${prescription.prescriptionNumber || 'N/A'} - ${prescriptionDate}</h3>
                  <p><strong>Doctor:</strong> ${doctorName}</p>
                  ${items.length > 0 ? `
                    <table>
                      <thead><tr><th>#</th><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead>
                      <tbody>
                        ${items.map((item: any, idx: number) => `
                          <tr>
                            <td>${idx + 1}</td>
                            <td><strong>${item.medicationName || 'Unknown'}</strong></td>
                            <td>${item.dosage || '-'}</td>
                            <td>${item.frequency || '-'}</td>
                            <td>${item.duration || '-'}</td>
                            <td>${item.instructions || '-'}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : '<p>No medications prescribed.</p>'}
                </div>
              `
            }).join('')}
          </body>
        </html>
      `

      const printWindow = window.open('', '_blank')
      if (!printWindow) return
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => printWindow.print(), 250)
    } catch (error: any) {
      console.error('Error printing patient prescriptions:', error)
      alert('Failed to print prescriptions. Please try again.')
    }
  }

  // Download all prescriptions for a specific patient as PDF
  const handleDownloadAllPrescriptionsPDFForPatient = async (patientPrescriptions: Prescription[]) => {
    // Reuse the print function which opens print dialog (user can save as PDF)
    await handlePrintAllPrescriptionsForPatient(patientPrescriptions)
  }

  // Download all filtered prescriptions as PDF
  const handleDownloadAllPrescriptionsPDF = async () => {
    if (filteredPrescriptions.length === 0) {
      alert('No prescriptions to download.')
      return
    }

    try {
      // Fetch full details for all prescriptions
      const prescriptionsWithDetails = await Promise.all(
        filteredPrescriptions.map(async (prescription) => {
          try {
            const details = await pharmacyApi.getPrescription(prescription.prescriptionId.toString())
            return details
          } catch (error) {
            console.error(`Error fetching prescription ${prescription.prescriptionId}:`, error)
            return prescription
          }
        })
      )

      // Generate filter description
      let filterDescription = 'All Prescriptions'
      let filename = 'Prescriptions'
      if (prescriptionDateFilter) {
        filterDescription = `Prescriptions for ${new Date(prescriptionDateFilter).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
        filename = `Prescriptions_${prescriptionDateFilter}`
      }
      if (prescriptionPatientFilter) {
        filterDescription = `Prescriptions for Patient: ${prescriptionPatientFilter}`
        filename = `Prescriptions_${prescriptionPatientFilter.replace(/\s+/g, '_')}`
      }
      if (prescriptionStatusFilter) {
        filterDescription += ` (Status: ${prescriptionStatusFilter})`
        filename += `_${prescriptionStatusFilter}`
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Prescriptions Report</title>
            <style>
              @media print {
                @page { margin: 15mm; }
              }
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
                font-size: 11px;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #000;
                padding-bottom: 15px;
              }
              .header img {
                max-width: 150px;
                height: auto;
                margin-bottom: 10px;
              }
              h1 {
                text-align: center;
                margin-bottom: 10px;
                font-size: 22px;
              }
              .filter-info {
                text-align: center;
                margin-bottom: 20px;
                color: #666;
                font-size: 12px;
              }
              .prescription-section {
                page-break-after: always;
                margin-bottom: 40px;
                border: 1px solid #ddd;
                padding: 20px;
                border-radius: 5px;
              }
              .prescription-section:last-child {
                page-break-after: auto;
              }
              .prescription-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
              }
              .info-section {
                border: 1px solid #ddd;
                padding: 10px;
                border-radius: 5px;
                font-size: 10px;
              }
              .info-section h3 {
                margin: 0 0 8px 0;
                font-size: 12px;
                color: #666;
                border-bottom: 1px solid #eee;
                padding-bottom: 3px;
              }
              .info-section p {
                margin: 3px 0;
                font-size: 10px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
                font-size: 9px;
              }
              th, td {
                border: 1px solid #ddd;
                padding: 6px;
                text-align: left;
              }
              th {
                background-color: #f2f2f2;
                font-weight: bold;
              }
              .footer {
                margin-top: 20px;
                padding-top: 10px;
                border-top: 1px solid #ddd;
                text-align: center;
                font-size: 9px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <img src="${window.location.origin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none';" />
              <h1>PRESCRIPTIONS REPORT</h1>
              <div class="filter-info">
                ${filterDescription} | Total: ${prescriptionsWithDetails.length} prescription(s) | Generated: ${new Date().toLocaleString()}
              </div>
            </div>

            ${(function () {
              return prescriptionsWithDetails.map((prescription) => {
                const patientName = getPatientName(prescription)
                const doctorName = getDoctorName(prescription)
                const prescriptionDate = prescription.prescriptionDate
                  ? new Date(prescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                  : 'N/A'
                const items = prescription.items || []
                const itemsRows = items.map((item: any, itemIndex: number) =>
                  '<tr><td>' + (itemIndex + 1) + '</td><td><strong>' + (item.medicationName || 'Unknown') + '</strong></td><td>' + (item.dosage || '-') + '</td><td>' + (item.frequency || '-') + '</td><td>' + (item.duration || '-') + '</td><td>' + (item.instructions || '-') + '</td></tr>'
                ).join('')
                const notesHtml = prescription.notes
                  ? '<div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-radius: 5px;"><strong>Notes:</strong> ' + prescription.notes + '</div>'
                  : ''
                const tableHtml = items.length > 0
                  ? '<table><thead><tr><th>#</th><th>Medication</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>' + itemsRows + '</tbody></table>'
                  : '<p>No medications prescribed.</p>'
                return '<div class="prescription-section"><div class="prescription-info"><div class="info-section"><h3>Patient Information</h3><p><strong>Name:</strong> ' + patientName + '</p>' + (prescription.patientNumber ? '<p><strong>Patient ID:</strong> ' + prescription.patientNumber + '</p>' : '') + '</div><div class="info-section"><h3>Prescription Details</h3><p><strong>Prescription #:</strong> ' + (prescription.prescriptionNumber || 'N/A') + '</p><p><strong>Date:</strong> ' + prescriptionDate + '</p><p><strong>Doctor:</strong> ' + doctorName + '</p><p><strong>Status:</strong> ' + (prescription.status || 'pending').charAt(0).toUpperCase() + (prescription.status || 'pending').slice(1) + '</p></div></div>' + tableHtml + notesHtml + '</div>'
              }).join('')
            })()}

            <div class="footer">
              <p>End of Report | Generated on ${new Date().toLocaleString()}</p>
            </div>
          </body>
        </html>
      `

      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank')

      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print()
            // After printing, user can save as PDF from print dialog
          }, 250)
        }
      } else {
        // Fallback: create download link
        const link = document.createElement('a')
        link.href = url
        link.download = `${filename}_${new Date().toISOString().split('T')[0]}.html`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 100)
      }
    } catch (error: any) {
      console.error('Error downloading prescriptions PDF:', error)
      alert('Failed to download prescriptions PDF. Please try again.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pharmacy</h1>
          <p className="text-muted-foreground">Manage prescriptions and medication inventory</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddPrescriptionOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />
            New Prescription
          </Button>
        </div>
      </div>

      <RoleFilteredTabs
        tabs={[
          { value: "prescriptions", label: "Prescriptions" },
          { value: "medications", label: "Medications" },
          { value: "drug-inventory", label: "Drug Inventory" },
          { value: "drug-inventory-summary", label: "Inventory Summary" },
          { value: "inventory-value", label: "Inventory Value" },
          { value: "batch-trace", label: "Batch Trace" },
          { value: "drug-history", label: "Drug History" },
          { value: "nurse-pickup", label: "Nurse Pickup" },
          { value: "drug-movement", label: "Drug Movement" },
          { value: "external-referrals", label: "External Referrals" },
        ]}
        pagePath="/pharmacy"
        value={currentTab}
        onValueChange={setPharmacyTab}
        className="w-full"
      >
        <TabsContent value="prescriptions" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Prescription Management</CardTitle>
              <CardDescription>View and manage patient prescriptions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  <Button
                    variant={prescriptionStatusFilter === "" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrescriptionStatusFilter("")}
                  >
                    All
                  </Button>
                  <Button
                    variant={prescriptionStatusFilter === "pending" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrescriptionStatusFilter("pending")}
                  >
                    Pending
                  </Button>
                  <Button
                    variant={prescriptionStatusFilter === "dispensed" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrescriptionStatusFilter("dispensed")}
                  >
                    Dispensed
                  </Button>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="relative w-48">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      placeholder="Filter by date..."
                      className="w-full pl-8"
                      value={prescriptionDateFilter}
                      onChange={(e) => setPrescriptionDateFilter(e.target.value)}
                    />
                  </div>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Filter by patient..."
                      className="w-full pl-8"
                      value={prescriptionPatientFilter}
                      onChange={(e) => setPrescriptionPatientFilter(e.target.value)}
                    />
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search prescriptions..."
                      className="w-full pl-8"
                      value={prescriptionSearch}
                      onChange={(e) => setPrescriptionSearch(e.target.value)}
                    />
                  </div>
                  <Button
                    variant={groupByPatient ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupByPatient(!groupByPatient)}
                    title={groupByPatient ? "Switch to individual view" : "Switch to grouped by patient view"}
                  >
                    {groupByPatient ? (
                      <>
                        <Users className="mr-2 h-4 w-4" />
                        Grouped
                      </>
                    ) : (
                      <>
                        <List className="mr-2 h-4 w-4" />
                        Individual
                      </>
                    )}
                  </Button>
                  {filteredPrescriptions.length > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrintAllPrescriptions}
                        title="Print all filtered prescriptions"
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadAllPrescriptionsPDF}
                        title="Download all filtered prescriptions as PDF"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {loadingPrescriptions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prescription #</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupByPatient && groupedPrescriptions ? (
                        groupedPrescriptions.length > 0 ? (
                          groupedPrescriptions.map((group) => (
                            <React.Fragment key={group.patientKey}>
                              <TableRow className="bg-muted/50">
                                <TableCell colSpan={6} className="p-0">
                                  <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value={group.patientKey} className="border-0">
                                      <AccordionTrigger className="px-4 py-2 hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-4">
                                          <div className="flex items-center gap-3">
                                            <div>
                                              <div className="font-semibold">{group.patientName}</div>
                                              {group.patientNumber && (
                                                <div className="text-xs text-muted-foreground">{group.patientNumber}</div>
                                              )}
                                            </div>
                                            <Badge variant="outline" className="ml-2">
                                              {group.prescriptions.length} prescription{group.prescriptions.length !== 1 ? 's' : ''}
                                            </Badge>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <div
                                              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 px-3"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handlePrintAllPrescriptionsForPatient(group.prescriptions)
                                              }}
                                              title="Print all prescriptions for this patient"
                                              role="button"
                                              tabIndex={0}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault()
                                                  e.stopPropagation()
                                                  handlePrintAllPrescriptionsForPatient(group.prescriptions)
                                                }
                                              }}
                                            >
                                              <Printer className="h-4 w-4" />
                                            </div>
                                            <div
                                              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 px-3"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleDownloadAllPrescriptionsPDFForPatient(group.prescriptions)
                                              }}
                                              title="Download all prescriptions for this patient as PDF"
                                              role="button"
                                              tabIndex={0}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                  e.preventDefault()
                                                  e.stopPropagation()
                                                  handleDownloadAllPrescriptionsPDFForPatient(group.prescriptions)
                                                }
                                              }}
                                            >
                                              <Download className="h-4 w-4" />
                                            </div>
                                          </div>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        <div className="px-4 pb-2">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Prescription #</TableHead>
                                                <TableHead>Doctor</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Actions</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {group.prescriptions.map((prescription) => (
                                                <TableRow key={prescription.prescriptionId}>
                                                  <TableCell className="font-medium">{prescription.prescriptionNumber}</TableCell>
                                                  <TableCell>{getDoctorName(prescription)}</TableCell>
                                                  <TableCell>
                                                    {prescription.prescriptionDate
                                                      ? new Date(prescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                                      : '-'}
                                                  </TableCell>
                                                  <TableCell>
                                                    <Badge variant={prescription.status === "pending" ? "secondary" : "default"}>
                                                      {prescription.status.charAt(0).toUpperCase() + prescription.status.slice(1)}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell>
                                                    <DropdownMenu>
                                                      <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="sm">
                                                          <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                      </DropdownMenuTrigger>
                                                      <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleViewPrescription(prescription)}>
                                                          <Eye className="mr-2 h-4 w-4" />
                                                          View Details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => handlePrintPrescription(prescription)}>
                                                          <Printer className="mr-2 h-4 w-4" />
                                                          Print
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDownloadPrescriptionPDF(prescription)}>
                                                          <Download className="mr-2 h-4 w-4" />
                                                          Download PDF
                                                        </DropdownMenuItem>
                                                        {prescription.status === 'pending' && (
                                                          <>
                                                            <DropdownMenuSeparator />
                                                            {prescription.invoiceStatus === 'paid' ? (
                                                              <DropdownMenuItem
                                                                onClick={() => {
                                                                  const patientName = prescription.firstName && prescription.lastName
                                                                    ? `${prescription.firstName} ${prescription.lastName}`
                                                                    : prescription.patientNumber || 'Unknown Patient'
                                                                  setSelectedPatientForDispense({
                                                                    patientId: prescription.patientId,
                                                                    patientName: patientName
                                                                  })
                                                                  setDispenseDialogOpen(true)
                                                                }}
                                                              >
                                                                <Pill className="mr-2 h-4 w-4" />
                                                                Dispense Medication
                                                              </DropdownMenuItem>
                                                            ) : (
                                                              <DropdownMenuItem disabled title="Invoice must be paid before dispensing">
                                                                <AlertCircle className="mr-2 h-4 w-4" />
                                                                Invoice Not Paid
                                                              </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem
                                                              onClick={() => handleUpdatePrescriptionStatus(prescription.prescriptionId, 'cancelled')}
                                                              disabled={updatingStatus === prescription.prescriptionId.toString()}
                                                            >
                                                              <XCircle className="mr-2 h-4 w-4" />
                                                              {updatingStatus === prescription.prescriptionId.toString() ? 'Cancelling...' : 'Cancel'}
                                                            </DropdownMenuItem>
                                                          </>
                                                        )}
                                                      </DropdownMenuContent>
                                                    </DropdownMenu>
                                                  </TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              No prescriptions found
                            </TableCell>
                          </TableRow>
                        )
                      ) : filteredPrescriptions.length > 0 ? (
                        filteredPrescriptions.map((prescription) => (
                          <TableRow key={prescription.prescriptionId}>
                            <TableCell className="font-medium">{prescription.prescriptionNumber}</TableCell>
                            <TableCell>
                              {getPatientName(prescription)}
                              {prescription.patientNumber && (
                                <div className="text-xs text-muted-foreground">{prescription.patientNumber}</div>
                              )}
                            </TableCell>
                            <TableCell>{getDoctorName(prescription)}</TableCell>
                            <TableCell>
                              {prescription.prescriptionDate
                                ? new Date(prescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={prescription.status === "pending" ? "secondary" : "default"}>
                                {prescription.status.charAt(0).toUpperCase() + prescription.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleViewPrescription(prescription)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handlePrintPrescription(prescription)}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Print
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDownloadPrescriptionPDF(prescription)}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download PDF
                                  </DropdownMenuItem>
                                  {prescription.status === 'pending' && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {prescription.invoiceStatus === 'paid' ? (
                                        <DropdownMenuItem
                                          onClick={() => {
                                            const patientName = prescription.firstName && prescription.lastName
                                              ? `${prescription.firstName} ${prescription.lastName}`
                                              : prescription.patientNumber || 'Unknown Patient'
                                            setSelectedPatientForDispense({
                                              patientId: prescription.patientId,
                                              patientName: patientName
                                            })
                                            setDispenseDialogOpen(true)
                                          }}
                                        >
                                          <Pill className="mr-2 h-4 w-4" />
                                          Dispense Medication
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem disabled title="Invoice must be paid before dispensing">
                                          <AlertCircle className="mr-2 h-4 w-4" />
                                          Invoice Not Paid
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => handleUpdatePrescriptionStatus(prescription.prescriptionId, 'cancelled')}
                                        disabled={updatingStatus === prescription.prescriptionId.toString()}
                                      >
                                        <XCircle className="mr-2 h-4 w-4" />
                                        {updatingStatus === prescription.prescriptionId.toString() ? 'Cancelling...' : 'Cancel'}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No prescriptions found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medications" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Medication Catalog</CardTitle>
                  <CardDescription>Manage medication catalog and inventory</CardDescription>
                </div>
                <Button onClick={() => setIsAddMedicationOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Medication
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search medications..."
                    className="w-full pl-8"
                    value={medicationSearch}
                    onChange={(e) => setMedicationSearch(e.target.value)}
                  />
                </div>
              </div>

              {loadingMedications ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Generic Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Dosage Form</TableHead>
                        <TableHead>Strength</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medications.length > 0 ? (
                        medications.map((medication) => (
                          <TableRow key={medication.medicationId}>
                            <TableCell className="font-medium">{medication.medicationCode || "-"}</TableCell>
                            <TableCell>{getMedicationName(medication)}</TableCell>
                            <TableCell>{medication.genericName || "-"}</TableCell>
                            <TableCell>{medication.category || "-"}</TableCell>
                            <TableCell>{medication.dosageForm || "-"}</TableCell>
                            <TableCell>{medication.strength || "-"}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditMedicationClick(medication)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteMedicationClick(medication)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No medications found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drug-inventory" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Drug Inventory</CardTitle>
                  <CardDescription>Manage drug inventory with batch numbers, pricing, and expiry dates</CardDescription>
                </div>
                <Button onClick={() => setIsAddDrugInventoryOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Drug Inventory
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search drug inventory..."
                    className="w-full pl-8"
                    value={drugInventorySearch}
                    onChange={(e) => setDrugInventorySearch(e.target.value)}
                  />
                </div>
                <div className="w-full md:w-72">
                  <SearchableSelect
                    value={drugInventoryLocationFilter}
                    onValueChange={setDrugInventoryLocationFilter}
                    options={drugInventoryLocationOptions}
                    placeholder="Filter by location..."
                    emptyMessage="No location found."
                  />
                </div>
              </div>

              {loadingDrugInventory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medication</TableHead>
                        <TableHead>Batch Number</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Sell Price</TableHead>
                        <TableHead>Min Price</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drugInventory.length > 0 ? (
                        drugInventory.map((item) => (
                          <TableRow key={item.drugInventoryId}>
                            <TableCell className="font-medium">{getDrugInventoryItemName(item)}</TableCell>
                            <TableCell>{item.batchNumber}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>KES {item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell>KES {item.sellPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell>{item.minPrice ? `KES ${item.minPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</TableCell>
                            <TableCell>
                              {item.expiryDate
                                ? new Date(item.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                : '-'}
                            </TableCell>
                            <TableCell>{item.location || '-'}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleViewDrugInventoryHistory(item)}>
                                    <History className="h-4 w-4 mr-2" />
                                    View History
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleStockAdjustment(item)}>
                                    <Sliders className="h-4 w-4 mr-2" />
                                    Stock Adjustment
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEditDrugInventoryClick(item)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteDrugInventoryClick(item)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No drug inventory items found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drug-inventory-summary" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Drug Inventory Summary</CardTitle>
                  <CardDescription>Aggregated drug inventory quantities per medication (total across all batches)</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportSummary}>
                    <Download className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                  <Button variant="outline" onClick={handlePrintSummary}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search medications..."
                    className="w-full pl-8"
                    value={drugInventorySummarySearch}
                    onChange={(e) => setDrugInventorySummarySearch(e.target.value)}
                  />
                </div>
              </div>

              {loadingDrugInventorySummary ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medication Code</TableHead>
                        <TableHead>Medication Name</TableHead>
                        <TableHead>Generic Name</TableHead>
                        <TableHead>Dosage Form</TableHead>
                        <TableHead>Strength</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Total Quantity</TableHead>
                        <TableHead className="text-right">Batch Count</TableHead>
                        <TableHead>Earliest Expiry</TableHead>
                        <TableHead>Latest Expiry</TableHead>
                        <TableHead className="text-right">Avg Unit Price</TableHead>
                        <TableHead className="text-right">Avg Sell Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drugInventorySummary.length > 0 ? (
                        drugInventorySummary.map((item, index) => (
                          <TableRow key={item.medicationId || index}>
                            <TableCell className="font-medium">{item.medicationCode || '-'}</TableCell>
                            <TableCell className="font-medium">{item.medicationName || '-'}</TableCell>
                            <TableCell>{item.genericName || '-'}</TableCell>
                            <TableCell>{item.dosageForm || '-'}</TableCell>
                            <TableCell>{item.strength || '-'}</TableCell>
                            <TableCell>{item.location || '-'}</TableCell>
                            <TableCell className="text-right font-medium">{item.totalQuantity || 0}</TableCell>
                            <TableCell className="text-right">{item.batchCount || 0}</TableCell>
                            <TableCell>
                              {item.earliestExpiryDate
                                ? new Date(item.earliestExpiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                : '-'}
                            </TableCell>
                            <TableCell>
                              {item.latestExpiryDate
                                ? new Date(item.latestExpiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.averageUnitPrice
                                ? `KES ${parseFloat(item.averageUnitPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.averageSellPrice
                                ? `KES ${parseFloat(item.averageSellPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.status === 'out_of_stock' ? 'destructive' :
                                  item.status === 'low_stock' ? 'secondary' :
                                  'default'
                                }
                              >
                                {item.status === 'out_of_stock' ? 'Out of Stock' :
                                 item.status === 'low_stock' ? 'Low Stock' :
                                 'In Stock'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                            No drug inventory summary found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory-value" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Inventory Value by Location</CardTitle>
                  <CardDescription>Summary of current stock quantity and value grouped by location and drug.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={loadInventoryValueByLocation} disabled={loadingInventoryValue}>
                    {loadingInventoryValue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                  <Button variant="outline" onClick={exportInventoryValueExcel} disabled={inventoryValueExporting === "excel" || inventoryValueRows.length === 0}>
                    {inventoryValueExporting === "excel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                    Excel
                  </Button>
                  <Button onClick={exportInventoryValuePdf} disabled={inventoryValueExporting === "pdf" || inventoryValueRows.length === 0}>
                    {inventoryValueExporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location</label>
                  <SearchableSelect
                    value={inventoryValueLocationFilter}
                    onValueChange={setInventoryValueLocationFilter}
                    options={drugInventoryLocationOptions}
                    placeholder="Filter by location..."
                    emptyMessage="No location found."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Drug</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search drug..."
                      className="pl-8"
                      value={inventoryValueDrugSearch}
                      onChange={(event) => setInventoryValueDrugSearch(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">From</label>
                  <Input type="date" value={inventoryValueDateFrom} onChange={(event) => setInventoryValueDateFrom(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">To</label>
                  <Input type="date" value={inventoryValueDateTo} onChange={(event) => setInventoryValueDateTo(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Rows</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{inventoryValueRows.length}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Quantity</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{Number(inventoryValueTotals.quantity || 0).toLocaleString()}</CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Amount/Value</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{formatMoney(inventoryValueTotals.amountValue)}</CardContent>
                </Card>
              </div>

              {loadingInventoryValue ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead>Drug</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Amount/Value</TableHead>
                        <TableHead className="text-right">Batches</TableHead>
                        <TableHead>Earliest Expiry</TableHead>
                        <TableHead>Latest Expiry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryValueRows.length > 0 ? (
                        inventoryValueRows.map((row, index) => (
                          <TableRow key={`${row.location}-${row.medicationId}-${index}`}>
                            <TableCell className="font-medium">{row.location || "Unassigned"}</TableCell>
                            <TableCell>
                              <div className="font-medium">{row.medicationName || "-"}</div>
                              <div className="text-xs text-muted-foreground">
                                {[row.medicationCode, row.genericName, row.strength].filter(Boolean).join(" | ") || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{Number(row.quantity || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">{formatMoney(row.amountValue)}</TableCell>
                            <TableCell className="text-right">{Number(row.batchCount || 0).toLocaleString()}</TableCell>
                            <TableCell>{formatReportDate(row.earliestExpiryDate)}</TableCell>
                            <TableCell>{formatReportDate(row.latestExpiryDate)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                            No inventory value records match the current filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batch-trace" className="space-y-4 mt-4">
          <BatchTraceability />
        </TabsContent>

        <TabsContent value="drug-history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Drug History</CardTitle>
              <CardDescription>
                Complete history of all drug inventory movements with patient tracking and filters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <History className="h-16 w-16 text-muted-foreground" />
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">View Complete Drug History</h3>
                  <p className="text-sm text-muted-foreground">
                    Access the comprehensive drug history page with advanced filtering options
                  </p>
                </div>
                <Link href="/pharmacy/history">
                  <Button>
                    Open Drug History
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nurse-pickup" className="space-y-4 mt-4">
          <NursePickup />
        </TabsContent>

        <TabsContent value="drug-movement" className="space-y-4 mt-4">
          <DrugMovement />
        </TabsContent>

        <TabsContent value="external-referrals" className="space-y-4 mt-4">
          <ExternalReferrals prescriptions={prescriptions} />
        </TabsContent>
      </RoleFilteredTabs>

      <AddPrescriptionForm
        open={addPrescriptionOpen}
        onOpenChange={setAddPrescriptionOpen}
        onSuccess={loadPrescriptions}
      />

      {/* Add Medication Dialog */}
      <MedicationForm
        open={isAddMedicationOpen}
        onOpenChange={setIsAddMedicationOpen}
        onSuccess={handleAddMedicationSuccess}
      />

      {/* Edit Medication Dialog */}
      {selectedMedication && (
        <MedicationForm
          medication={selectedMedication}
          open={isEditMedicationOpen}
          onOpenChange={(open) => {
            setIsEditMedicationOpen(open)
            if (!open) setSelectedMedication(null)
          }}
          onSuccess={handleEditMedicationSuccess}
        />
      )}

      {/* View Prescription Dialog */}
      <Dialog open={viewPrescriptionOpen} onOpenChange={setViewPrescriptionOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
            <DialogDescription>
              Prescription {selectedPrescription?.prescriptionNumber || ''}
            </DialogDescription>
          </DialogHeader>
          {loadingPrescriptionDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedPrescription ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">
                    {selectedPrescription.firstName} {selectedPrescription.lastName}
                  </p>
                  {selectedPrescription.patientNumber && (
                    <p className="text-sm text-muted-foreground">{selectedPrescription.patientNumber}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Prescribing Doctor</p>
                  <p className="font-medium">
                    {selectedPrescription.doctorFirstName} {selectedPrescription.doctorLastName}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {selectedPrescription.prescriptionDate
                      ? new Date(selectedPrescription.prescriptionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={selectedPrescription.status === "pending" ? "secondary" : "default"}>
                    {selectedPrescription.status?.charAt(0).toUpperCase() + selectedPrescription.status?.slice(1)}
                  </Badge>
                </div>
              </div>

              {selectedPrescription.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedPrescription.notes}</p>
                </div>
              )}

              {selectedPrescription.items && selectedPrescription.items.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-3">Medications</p>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Medication</TableHead>
                          <TableHead>Dosage</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead>Instructions</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPrescription.items.map((item: any) => {
                          const quantity = item.quantity ? parseInt(item.quantity) : null
                          // Use sellPrice from drug_inventory (fetched by API)
                          const unitPrice = item.sellPrice ? parseFloat(item.sellPrice) : null
                          const totalCost = quantity && unitPrice ? quantity * unitPrice : null
                          const isInInventory = item.inInventory === true

                          return (
                            <TableRow key={item.itemId}>
                              <TableCell className="font-medium">{item.medicationName || 'Unknown'}</TableCell>
                              <TableCell>{item.dosage}</TableCell>
                              <TableCell>{item.frequency}</TableCell>
                              <TableCell>{item.duration}</TableCell>
                              <TableCell>
                                {isInInventory ? (quantity || '-') : '-'}
                              </TableCell>
                              <TableCell>
                                {isInInventory && unitPrice
                                  ? `KES ${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : (isInInventory === false ? 'Not in inventory' : 'N/A')}
                              </TableCell>
                              <TableCell>
                                {isInInventory && totalCost
                                  ? `KES ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : (isInInventory === false ? 'N/A' : 'N/A')}
                              </TableCell>
                              <TableCell>{item.instructions || '-'}</TableCell>
                              <TableCell>
                                <Badge variant={item.status === "pending" ? "secondary" : "default"}>
                                  {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    {selectedPrescription.items.some((item: any) => item.sellPrice && item.quantity) && (
                      <div className="border-t p-4 flex justify-end">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total Cost</p>
                          <p className="text-lg font-bold">
                            KES {selectedPrescription.items
                              .reduce((sum: number, item: any) => {
                                const qty = item.quantity ? parseInt(item.quantity) : 0
                                const price = item.sellPrice ? parseFloat(item.sellPrice) : 0
                                return sum + (qty * price)
                              }, 0)
                              .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handlePrintPrescription(selectedPrescription)}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownloadPrescriptionPDF(selectedPrescription)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                {selectedPrescription.status === 'pending' && (
                  <>
                    {selectedPrescription.invoiceStatus === 'paid' ? (
                      <Button
                        onClick={() => {
                          const patientName = selectedPrescription.firstName && selectedPrescription.lastName
                            ? `${selectedPrescription.firstName} ${selectedPrescription.lastName}`
                            : selectedPrescription.patientNumber || 'Unknown Patient'
                          setSelectedPatientForDispense({
                            patientId: selectedPrescription.patientId,
                            patientName: patientName
                          })
                          setDispenseDialogOpen(true)
                        }}
                        className="flex-1"
                      >
                        <Pill className="mr-2 h-4 w-4" />
                        Dispense Medication
                      </Button>
                    ) : (
                      <Button
                        disabled
                        variant="outline"
                        className="flex-1"
                        title="Invoice must be paid before dispensing"
                      >
                        <AlertCircle className="mr-2 h-4 w-4" />
                        Invoice Not Paid
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleUpdatePrescriptionStatus(selectedPrescription.prescriptionId, 'cancelled')
                      }}
                      disabled={updatingStatus === selectedPrescription.prescriptionId.toString()}
                      className="flex-1"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      {updatingStatus === selectedPrescription.prescriptionId.toString() ? 'Cancelling...' : 'Cancel Prescription'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Medication Confirmation Dialog */}
      <AlertDialog open={isDeleteMedicationDialogOpen} onOpenChange={(open) => {
        setIsDeleteMedicationDialogOpen(open)
        if (!open) {
          setMedicationToDelete(null)
          setDeleteMedicationError(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {medicationToDelete && getMedicationName(medicationToDelete)}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMedicationError && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {deleteMedicationError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMedication}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMedicationConfirm}
              disabled={isDeletingMedication}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMedication ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Drug Inventory Dialog */}
      <DrugInventoryForm
        open={isAddDrugInventoryOpen}
        onOpenChange={setIsAddDrugInventoryOpen}
        onSuccess={handleAddDrugInventorySuccess}
        medications={medications}
      />

      {/* Edit Drug Inventory Dialog */}
      {selectedDrugInventoryItem && (
        <DrugInventoryForm
          item={selectedDrugInventoryItem}
          open={isEditDrugInventoryOpen}
          onOpenChange={(open) => {
            setIsEditDrugInventoryOpen(open)
            if (!open) setSelectedDrugInventoryItem(null)
          }}
          onSuccess={handleEditDrugInventorySuccess}
          medications={medications}
        />
      )}

      {/* Delete Drug Inventory Confirmation Dialog */}
      <AlertDialog open={isDeleteDrugInventoryDialogOpen} onOpenChange={(open) => {
        setIsDeleteDrugInventoryDialogOpen(open)
        if (!open) {
          setDrugInventoryToDelete(null)
          setDeleteDrugInventoryError(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the drug inventory item for {drugInventoryToDelete && getDrugInventoryItemName(drugInventoryToDelete)}
              (Batch: {drugInventoryToDelete?.batchNumber}).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteDrugInventoryError && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {deleteDrugInventoryError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingDrugInventory}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDrugInventoryConfirm}
              disabled={isDeletingDrugInventory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingDrugInventory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drug Inventory History Dialog */}
      <DrugInventoryHistoryDialog
        open={isDrugInventoryHistoryOpen}
        onOpenChange={(open) => {
          setIsDrugInventoryHistoryOpen(open)
          if (!open) {
            setSelectedDrugInventoryForHistory(null)
          }
        }}
        drugInventoryId={selectedDrugInventoryForHistory?.drugInventoryId}
        batchNumber={selectedDrugInventoryForHistory?.batchNumber}
      />

      {/* Stock Adjustment Form */}
      <StockAdjustmentForm
        open={isStockAdjustmentOpen}
        onOpenChange={(open) => {
          setIsStockAdjustmentOpen(open)
          if (!open) {
            setSelectedDrugInventoryForAdjustment(null)
          }
        }}
        onSuccess={handleStockAdjustmentSuccess}
        drugInventoryId={selectedDrugInventoryForAdjustment?.drugInventoryId}
        medicationId={selectedDrugInventoryForAdjustment?.medicationId}
        initialLocation={selectedDrugInventoryForAdjustment?.location}
        initialMedicationName={selectedDrugInventoryForAdjustment?.medicationName}
      />

      {/* Dispense Medication Dialog */}
      {selectedPatientForDispense && (
        <DispenseMedicationDialog
          open={dispenseDialogOpen}
          onOpenChange={(open) => {
            setDispenseDialogOpen(open)
            if (!open) {
              setSelectedPatientForDispense(null)
            }
          }}
          patientId={selectedPatientForDispense.patientId}
          onDispensed={() => {
            loadPrescriptions()
            // If viewing this prescription, reload it
            if (selectedPrescription) {
              handleViewPrescription(selectedPrescription)
            }
          }}
        />
      )}
    </div>
  )
}
