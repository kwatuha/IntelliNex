"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Download, FileSpreadsheet, FlaskConical, Loader2, PackageCheck, Pill, Plus, Search, Trash2, Upload } from "lucide-react"
import Link from "next/link"
import { pharmacyApi } from "@/lib/api"

type ChemistDrug = {
  chemistDrugId: number
  chemistId: number
  medicationId?: number
  medicationName: string
  brandName?: string
  genericName?: string
  strength?: string
  dosageForm?: string
  packSize?: string
  quantityAvailable?: number
  minimumStockLevel?: number
  availabilityStatus: string
  unitPrice?: number
  expiryDate?: string
  restockEta?: string
  supplierName?: string
  lastConfirmedAt?: string
  lastImportedAt?: string
  notes?: string
}

const emptyForm = {
  medicationId: "",
  medicationName: "",
  brandName: "",
  genericName: "",
  strength: "",
  dosageForm: "",
  packSize: "",
  quantityAvailable: "0",
  minimumStockLevel: "0",
  availabilityStatus: "unknown",
  unitPrice: "",
  expiryDate: "",
  restockEta: "",
  supplierName: "",
  notes: "",
}

export function ChemistDrugAvailability() {
  const [chemist, setChemist] = useState<any>(null)
  const [chemists, setChemists] = useState<any[]>([])
  const [selectedChemistId, setSelectedChemistId] = useState("")
  const [availabilityMode, setAvailabilityMode] = useState<"unknown" | "chemist" | "directory">("unknown")
  const [canEditAvailability, setCanEditAvailability] = useState(true)
  const [drugs, setDrugs] = useState<ChemistDrug[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChemistDrug | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      let scope = chemist
      let targetChemistId = selectedChemistId
      let mode = availabilityMode

      if (mode === "unknown") {
        try {
          scope = await pharmacyApi.getCurrentChemist()
          setChemist(scope)
          setAvailabilityMode("chemist")
          mode = "chemist"
          targetChemistId = String(scope.chemistId)
          setSelectedChemistId(targetChemistId)
        } catch {
          setAvailabilityMode("directory")
          mode = "directory"
        }
      }

      if (mode === "directory") {
        setCanEditAvailability(false)
        const chemistData = await pharmacyApi.getExternalChemists(undefined, true)
        setChemists(chemistData)
        targetChemistId = targetChemistId || (chemistData[0]?.chemistId ? String(chemistData[0].chemistId) : "")
        if (targetChemistId && targetChemistId !== selectedChemistId) setSelectedChemistId(targetChemistId)
      } else {
        if (!scope) {
          scope = await pharmacyApi.getCurrentChemist()
          setChemist(scope)
        }
        setCanEditAvailability(true)
        targetChemistId = String(scope.chemistId)
        if (targetChemistId !== selectedChemistId) setSelectedChemistId(targetChemistId)
      }

      if (!targetChemistId) {
        setDrugs([])
        setMedications([])
        return
      }

      const [drugData, medicationData] = await Promise.all([
        pharmacyApi.getExternalChemistDrugs(targetChemistId, {
          search: search || undefined,
          status: statusFilter || undefined,
        }),
        mode === "chemist" ? pharmacyApi.getMedications(undefined, 1, 300) : Promise.resolve([]),
      ])
      setDrugs(drugData)
      setMedications(medicationData)
    } catch (err: any) {
      setError(err.message || "Failed to load drug availability")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(loadData, 250)
    return () => clearTimeout(handle)
  }, [search, statusFilter, selectedChemistId, availabilityMode])

  const summary = useMemo(() => ({
    available: drugs.filter((drug) => drug.availabilityStatus === "available").length,
    lowStock: drugs.filter((drug) => drug.availabilityStatus === "low_stock").length,
    outOfStock: drugs.filter((drug) => drug.availabilityStatus === "out_of_stock").length,
    total: drugs.length,
  }), [drugs])
  const canManageAvailability = canEditAvailability && Boolean(chemist?.chemistId)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (drug: ChemistDrug) => {
    setEditing(drug)
    setForm({
      medicationId: drug.medicationId ? String(drug.medicationId) : "",
      medicationName: drug.medicationName || "",
      brandName: drug.brandName || "",
      genericName: drug.genericName || "",
      strength: drug.strength || "",
      dosageForm: drug.dosageForm || "",
      packSize: drug.packSize || "",
      quantityAvailable: String(drug.quantityAvailable ?? 0),
      minimumStockLevel: String(drug.minimumStockLevel ?? 0),
      availabilityStatus: drug.availabilityStatus || "unknown",
      unitPrice: drug.unitPrice ? String(drug.unitPrice) : "",
      expiryDate: drug.expiryDate ? drug.expiryDate.slice(0, 10) : "",
      restockEta: drug.restockEta ? drug.restockEta.slice(0, 10) : "",
      supplierName: drug.supplierName || "",
      notes: drug.notes || "",
    })
    setDialogOpen(true)
  }

  const handleMedicationSelect = (medicationId: string) => {
    const selected = medications.find((medication) => String(medication.medicationId) === medicationId)
    setForm({
      ...form,
      medicationId,
      medicationName: selected?.name || selected?.medicationName || form.medicationName,
      genericName: selected?.genericName || form.genericName,
      strength: selected?.strength || form.strength,
      dosageForm: selected?.dosageForm || form.dosageForm,
    })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canEditAvailability || !chemist?.chemistId || !form.medicationName.trim()) {
      setError("Medication name is required")
      return
    }

    const payload = {
      ...form,
      medicationId: form.medicationId || null,
      quantityAvailable: Number(form.quantityAvailable || 0),
      minimumStockLevel: Number(form.minimumStockLevel || 0),
      unitPrice: form.unitPrice || null,
      expiryDate: form.expiryDate || null,
      restockEta: form.restockEta || null,
    }

    try {
      setSaving(true)
      setError(null)
      if (editing) {
        await pharmacyApi.updateExternalChemistDrug(String(chemist.chemistId), String(editing.chemistDrugId), payload)
      } else {
        await pharmacyApi.createExternalChemistDrug(String(chemist.chemistId), payload)
      }
      setDialogOpen(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to save drug availability")
    } finally {
      setSaving(false)
    }
  }

  const removeDrug = async (drug: ChemistDrug) => {
    if (!canEditAvailability || !chemist?.chemistId) return
    try {
      setError(null)
      await pharmacyApi.deleteExternalChemistDrug(String(chemist.chemistId), String(drug.chemistDrugId))
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to remove drug")
    }
  }

  const statusBadge = (status: string) => {
    if (status === "available") return <Badge>Available</Badge>
    if (status === "low_stock") return <Badge variant="secondary">Low stock</Badge>
    if (status === "out_of_stock") return <Badge variant="destructive">Out of stock</Badge>
    return <Badge variant="outline">Unknown</Badge>
  }

  const stale = (value?: string) => {
    if (!value) return true
    const date = new Date(value)
    return Number.isNaN(date.getTime()) || (Date.now() - date.getTime()) > 7 * 24 * 60 * 60 * 1000
  }

  const normalizeStatus = (value: any) => {
    const status = String(value || "unknown").trim().toLowerCase().replace(/\s+/g, "_")
    return ["available", "low_stock", "out_of_stock", "unknown"].includes(status) ? status : "unknown"
  }

  const dateCell = (value: any) => {
    if (!value) return null
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
    return String(value).slice(0, 10)
  }

  const hasImportDetails = (row: any) => {
    const value = (field: string) => String(row[field] ?? "").trim()
    const status = value("Status") || value("Availability Status") || value("availabilityStatus")
    const notes = value("Notes") || value("notes")
    return Boolean(
      value("Brand Name") ||
      value("brandName") ||
      value("Pack Size") ||
      value("packSize") ||
      value("Quantity") ||
      value("Quantity Available") ||
      value("quantityAvailable") ||
      value("Minimum Stock Level") ||
      value("minimumStockLevel") ||
      value("Unit Price") ||
      value("unitPrice") ||
      value("Expiry Date") ||
      value("expiryDate") ||
      value("Restock ETA") ||
      value("restockEta") ||
      value("Supplier") ||
      value("supplierName") ||
      (status && normalizeStatus(status) !== "unknown") ||
      (notes && !notes.toLowerCase().startsWith("priority drug:"))
    )
  }

  const parseImportRows = (rows: any[]) => {
    const parsed: any[] = []
    const errors: string[] = []
    rows.forEach((row, index) => {
      const medicationName = row["Medication Name"] || row["Drug Name"] || row.medicationName || row.Name
      if (!hasImportDetails(row)) return
      if (!medicationName) {
        if (Object.values(row).some(Boolean)) errors.push(`Row ${row.__rowNumber || index + 2}: medication name is required`)
        return
      }
      parsed.push({
        medicationId: row["Medication ID"] || row.medicationId || null,
        medicationName: String(medicationName).trim(),
        brandName: row["Brand Name"] || row.brandName || "",
        genericName: row["Generic Name"] || row.genericName || "",
        strength: row.Strength || row.strength || "",
        dosageForm: row["Dosage Form"] || row.dosageForm || "",
        packSize: row["Pack Size"] || row.packSize || "",
        availabilityStatus: normalizeStatus(row.Status || row["Availability Status"] || row.availabilityStatus),
        quantityAvailable: Number(row.Quantity || row["Quantity Available"] || row.quantityAvailable || 0),
        minimumStockLevel: Number(row["Minimum Stock Level"] || row.minimumStockLevel || 0),
        unitPrice: row["Unit Price"] || row.unitPrice || null,
        expiryDate: dateCell(row["Expiry Date"] || row.expiryDate),
        restockEta: dateCell(row["Restock ETA"] || row.restockEta),
        supplierName: row["Supplier"] || row.supplierName || "",
        notes: row.Notes || row.notes || "",
      })
    })
    const byDrug = new Map<string, any>()
    parsed.forEach((row) => {
      const key = row.medicationId ? `id:${row.medicationId}` : `name:${row.medicationName.toLowerCase()}`
      byDrug.set(key, row)
    })
    return { parsed: Array.from(byDrug.values()), errors }
  }

  const downloadTemplate = async () => {
    if (!canEditAvailability || !chemist?.chemistId || typeof window === "undefined") return
    try {
      setError(null)
      const xlsxModule = await import("xlsx")
      const XLSX = (xlsxModule as any).default || xlsxModule
      const priority = await pharmacyApi.getExternalChemistPriorityDrugs(String(chemist.chemistId), 100)
      const wb = XLSX.utils.book_new()
      const templateColumns = (row: any = {}) => ({
        "Medication ID": row.medicationId || "",
        "Medication Name": row.medicationName || row.name || row.medicationNameFromCatalog || "",
        "Brand Name": "",
        "Generic Name": row.genericName || "",
        "Strength": row.strength || "",
        "Dosage Form": row.dosageForm || "",
        "Pack Size": "",
        "Status": row.availabilityStatus || "unknown",
        "Quantity": row.quantityAvailable || "",
        "Minimum Stock Level": "",
        "Unit Price": "",
        "Expiry Date": "",
        "Restock ETA": "",
        "Supplier": "",
        "Notes": row.referralCount ? `Priority drug: ${row.referralCount} referrals` : "",
      })

      const priorityRows = (priority.length ? priority : medications.slice(0, 100)).map(templateColumns)
      const catalogRows = medications.map((medication) => templateColumns({
        medicationId: medication.medicationId,
        medicationName: medication.name || medication.medicationName,
        genericName: medication.genericName,
        strength: medication.strength,
        dosageForm: medication.dosageForm,
      }))
      const instructions = [
        { Field: "Status", Instruction: "Use one of: available, low_stock, out_of_stock, unknown" },
        { Field: "Quantity", Instruction: "Number currently available for sale or dispensing" },
        { Field: "Minimum Stock Level", Instruction: "Optional reorder threshold for low-stock monitoring" },
        { Field: "Expiry Date / Restock ETA", Instruction: "Use YYYY-MM-DD format" },
        { Field: "Priority Drugs", Instruction: "These are the drugs most commonly referred or prescribed; fill these first." },
      ]

      const prioritySheet = XLSX.utils.json_to_sheet(priorityRows)
      prioritySheet["!cols"] = Array(15).fill({ wch: 20 })
      XLSX.utils.book_append_sheet(wb, prioritySheet, "Priority Drugs")
      const catalogSheet = XLSX.utils.json_to_sheet(catalogRows)
      catalogSheet["!cols"] = Array(15).fill({ wch: 20 })
      XLSX.utils.book_append_sheet(wb, catalogSheet, "Full Catalog")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instructions), "Instructions")
      XLSX.writeFile(wb, `${chemist.chemistCode || "chemist"}_drug_availability_template.xlsx`)
    } catch (err: any) {
      setError(err.message || "Failed to download stock template")
    }
  }

  const handleImportFile = async (file?: File | null) => {
    if (!file) return
    try {
      setError(null)
      const xlsxModule = await import("xlsx")
      const XLSX = (xlsxModule as any).default || xlsxModule
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
      const rows = workbook.SheetNames
        .filter((name: string) => name !== "Instructions")
        .flatMap((name: string) =>
          XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "" }).map((row: any, index: number) => ({
            ...row,
            __sheetName: name,
            __rowNumber: index + 2,
          }))
        )
      const { parsed, errors } = parseImportRows(rows)
      setImportPreview(parsed)
      setImportErrors(errors)
      setImportOpen(true)
    } catch (err: any) {
      setError(err.message || "Failed to read uploaded template")
    }
  }

  const confirmImport = async () => {
    if (!canEditAvailability || !chemist?.chemistId || importPreview.length === 0) return
    try {
      setImporting(true)
      setError(null)
      const result = await pharmacyApi.bulkImportExternalChemistDrugs(String(chemist.chemistId), importPreview)
      setImportErrors((result.errors || []).map((err: any) => `Row ${err.row}: ${err.message}`))
      setImportPreview([])
      await loadData()
      if (!result.errors?.length) setImportOpen(false)
    } catch (err: any) {
      setError(err.message || "Failed to import stock template")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Drug Availability</h1>
          <p className="text-muted-foreground">
            {canManageAvailability
              ? "Keep your current medicines updated so patients are referred to chemists with stock."
              : "Review medicine availability listed by external chemists."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/chemist/labs">
              <FlaskConical className="mr-2 h-4 w-4" />
              View Available Lab Tests
            </Link>
          </Button>
          {!canManageAvailability && (
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
          {canManageAvailability && (
            <>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => handleImportFile(event.target.files?.[0])}
            />
            <Button type="button" variant="outline" asChild>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                Upload Template
              </span>
            </Button>
          </label>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Drug
          </Button>
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Listed</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Available</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.available}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Low Stock</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.lowStock}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Out of Stock</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.outOfStock}</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            {chemist?.chemistName || chemists.find((item) => String(item.chemistId) === selectedChemistId)?.chemistName || "Chemist"} Stock List
          </CardTitle>
          <CardDescription>Update this list at least daily. Records older than 7 days are treated as stale by referral staff.</CardDescription>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search medicine..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="available">Available</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drug</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Confirmed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drugs.map((drug) => (
                  <TableRow key={drug.chemistDrugId}>
                    <TableCell>
                      <div className="font-medium">{drug.medicationName}</div>
                      <div className="text-xs text-muted-foreground">{drug.genericName || "-"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[drug.brandName, drug.strength, drug.dosageForm, drug.packSize].filter(Boolean).join(" | ") || "-"}
                      {drug.unitPrice ? <div>KES {Number(drug.unitPrice).toLocaleString()}</div> : null}
                    </TableCell>
                    <TableCell>
                      <div>{drug.quantityAvailable ?? 0}</div>
                      {Number(drug.minimumStockLevel || 0) > 0 && (
                        <div className="text-xs text-muted-foreground">Min {drug.minimumStockLevel}</div>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(drug.availabilityStatus)}</TableCell>
                    <TableCell>
                      <div>{drug.lastConfirmedAt ? new Date(drug.lastConfirmedAt).toLocaleString() : "-"}</div>
                      {stale(drug.lastConfirmedAt) && <div className="text-xs text-amber-600">Needs confirmation</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canManageAvailability ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(drug)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => removeDrug(drug)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {drugs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No drugs listed yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Update Drug Availability" : "Add Drug Availability"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>Link to hospital catalog</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.medicationId} onChange={(event) => handleMedicationSelect(event.target.value)}>
                <option value="">Free text / not linked</option>
                {medications.map((medication) => (
                  <option key={medication.medicationId} value={medication.medicationId}>
                    {medication.name || medication.medicationName} {medication.strength ? `- ${medication.strength}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Drug name</Label>
                <Input value={form.medicationName} onChange={(event) => setForm({ ...form, medicationName: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Brand name</Label>
                <Input value={form.brandName} onChange={(event) => setForm({ ...form, brandName: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Generic name</Label>
                <Input value={form.genericName} onChange={(event) => setForm({ ...form, genericName: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Strength</Label>
                <Input value={form.strength} onChange={(event) => setForm({ ...form, strength: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Dosage form</Label>
                <Input value={form.dosageForm} onChange={(event) => setForm({ ...form, dosageForm: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Pack size</Label>
                <Input value={form.packSize} onChange={(event) => setForm({ ...form, packSize: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Quantity available</Label>
                <Input type="number" min="0" value={form.quantityAvailable} onChange={(event) => setForm({ ...form, quantityAvailable: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Minimum stock level</Label>
                <Input type="number" min="0" value={form.minimumStockLevel} onChange={(event) => setForm({ ...form, minimumStockLevel: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.availabilityStatus} onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value })}>
                  <option value="available">Available</option>
                  <option value="low_stock">Low stock</option>
                  <option value="out_of_stock">Out of stock</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Unit price</Label>
                <Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nearest expiry</Label>
                <Input type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Restock ETA</Label>
                <Input type="date" value={form.restockEta} onChange={(event) => setForm({ ...form, restockEta: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input value={form.supplierName} onChange={(event) => setForm({ ...form, supplierName: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pill className="mr-2 h-4 w-4" />}
                Save Drug
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Preview Stock Import</DialogTitle>
          </DialogHeader>
          {importErrors.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {importErrors.slice(0, 6).map((err) => <div key={err}>{err}</div>)}
              {importErrors.length > 6 && <div>...and {importErrors.length - 6} more</div>}
            </div>
          )}
          <div className="text-sm text-muted-foreground">{importPreview.length} valid row(s) ready to import.</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importPreview.slice(0, 20).map((row, index) => (
                <TableRow key={`${row.medicationName}-${index}`}>
                  <TableCell>
                    <div className="font-medium">{row.medicationName}</div>
                    <div className="text-xs text-muted-foreground">{[row.strength, row.dosageForm].filter(Boolean).join(" | ")}</div>
                  </TableCell>
                  <TableCell>{statusBadge(row.availabilityStatus)}</TableCell>
                  <TableCell>{row.quantityAvailable}</TableCell>
                  <TableCell>{row.unitPrice || "-"}</TableCell>
                  <TableCell>{row.expiryDate || "-"}</TableCell>
                </TableRow>
              ))}
              {importPreview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No valid import rows found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={confirmImport} disabled={importing || importPreview.length === 0}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Confirm Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
