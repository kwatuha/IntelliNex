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
import { FlaskConical, Loader2, Plus, Search, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { laboratoryApi, pharmacyApi } from "@/lib/api"

type ChemistLab = {
  chemistLabId: number
  chemistId: number
  testTypeId?: number
  testName: string
  category?: string
  specimenType?: string
  turnaroundTime?: string
  availabilityStatus: string
  price?: number
  lastConfirmedAt?: string
  notes?: string
}

const emptyForm = {
  testTypeId: "",
  testName: "",
  category: "",
  specimenType: "",
  turnaroundTime: "",
  availabilityStatus: "unknown",
  price: "",
  notes: "",
}

export function ChemistLabAvailability() {
  const { user, isLoading: authLoading } = useAuth()
  const [chemist, setChemist] = useState<any>(null)
  const [chemists, setChemists] = useState<any[]>([])
  const [selectedChemistId, setSelectedChemistId] = useState("")
  const [availabilityMode, setAvailabilityMode] = useState<"unknown" | "chemist" | "directory">("unknown")
  const [canEditAvailability, setCanEditAvailability] = useState(true)
  const [labs, setLabs] = useState<ChemistLab[]>([])
  const [testTypes, setTestTypes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ChemistLab | null>(null)
  const [form, setForm] = useState(emptyForm)
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
      let mode = availabilityMode

      if (mode === "unknown") {
        if (isCurrentUserChemist) {
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
        } else {
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
        setLabs([])
        setTestTypes([])
        return
      }

      const [labData, testData] = await Promise.all([
        pharmacyApi.getExternalChemistLabs(targetChemistId, {
          search: search || undefined,
          status: statusFilter || undefined,
        }),
        mode === "chemist" ? laboratoryApi.getTestTypes(undefined, undefined, 1, 500) : Promise.resolve([]),
      ])
      setLabs(labData)
      setTestTypes(testData)
    } catch (err: any) {
      setError(err.message || "Failed to load lab availability")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(loadData, 250)
    return () => clearTimeout(handle)
  }, [search, statusFilter, selectedChemistId, availabilityMode, authLoading, isCurrentUserChemist])

  const summary = useMemo(() => ({
    total: labs.length,
    available: labs.filter((lab) => lab.availabilityStatus === "available").length,
    unavailable: labs.filter((lab) => lab.availabilityStatus === "unavailable").length,
    unknown: labs.filter((lab) => lab.availabilityStatus === "unknown").length,
  }), [labs])
  const canManageAvailability = canEditAvailability && Boolean(chemist?.chemistId)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (lab: ChemistLab) => {
    setEditing(lab)
    setForm({
      testTypeId: lab.testTypeId ? String(lab.testTypeId) : "",
      testName: lab.testName || "",
      category: lab.category || "",
      specimenType: lab.specimenType || "",
      turnaroundTime: lab.turnaroundTime || "",
      availabilityStatus: lab.availabilityStatus || "unknown",
      price: lab.price ? String(lab.price) : "",
      notes: lab.notes || "",
    })
    setDialogOpen(true)
  }

  const handleTestSelect = (testTypeId: string) => {
    const selected = testTypes.find((test) => String(test.testTypeId) === testTypeId)
    setForm({
      ...form,
      testTypeId,
      testName: selected?.testName || form.testName,
      category: selected?.category || form.category,
      specimenType: selected?.specimenType || form.specimenType,
      turnaroundTime: selected?.turnaroundTime || form.turnaroundTime,
      price: selected?.cost ? String(selected.cost) : form.price,
    })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canEditAvailability || !chemist?.chemistId || !form.testName.trim()) {
      setError("Test name is required")
      return
    }

    const payload = {
      ...form,
      testTypeId: form.testTypeId || null,
      price: form.price || null,
    }

    try {
      setSaving(true)
      setError(null)
      if (editing) {
        await pharmacyApi.updateExternalChemistLab(String(chemist.chemistId), String(editing.chemistLabId), payload)
      } else {
        await pharmacyApi.createExternalChemistLab(String(chemist.chemistId), payload)
      }
      setDialogOpen(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to save lab availability")
    } finally {
      setSaving(false)
    }
  }

  const removeLab = async (lab: ChemistLab) => {
    if (!canEditAvailability || !chemist?.chemistId) return
    try {
      setError(null)
      await pharmacyApi.deleteExternalChemistLab(String(chemist.chemistId), String(lab.chemistLabId))
      await loadData()
    } catch (err: any) {
      setError(err.message || "Failed to remove lab test")
    }
  }

  const statusBadge = (status: string) => {
    if (status === "available") return <Badge>Available</Badge>
    if (status === "unavailable") return <Badge variant="destructive">Unavailable</Badge>
    return <Badge variant="outline">Unknown</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Available Labs</h1>
          <p className="text-muted-foreground">
            {canManageAvailability
              ? "List lab tests your chemist can perform so hospital staff can refer lab orders."
              : "Review lab tests available at external chemists."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Lab Test
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Listed</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.total}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Available</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.available}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Unavailable</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.unavailable}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Unknown</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{summary.unknown}</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            {chemist?.chemistName || chemists.find((item) => String(item.chemistId) === selectedChemistId)?.chemistName || "Chemist"} Lab Tests
          </CardTitle>
          <CardDescription>Update availability whenever tests, pricing, or turnaround times change.</CardDescription>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search lab tests..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
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
                  <TableHead>Test</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Confirmed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labs.map((lab) => (
                  <TableRow key={lab.chemistLabId}>
                    <TableCell>
                      <div className="font-medium">{lab.testName}</div>
                      <div className="text-xs text-muted-foreground">{lab.category || "-"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[lab.specimenType, lab.turnaroundTime].filter(Boolean).join(" | ") || "-"}
                      {lab.price ? <div>KES {Number(lab.price).toLocaleString()}</div> : null}
                    </TableCell>
                    <TableCell>{statusBadge(lab.availabilityStatus)}</TableCell>
                    <TableCell>{lab.lastConfirmedAt ? new Date(lab.lastConfirmedAt).toLocaleString() : "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canManageAvailability ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(lab)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => removeLab(lab)}>
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
                {labs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No lab tests listed yet.</TableCell>
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
            <DialogTitle>{editing ? "Update Lab Availability" : "Add Lab Availability"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>Link to hospital lab catalog</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.testTypeId} onChange={(event) => handleTestSelect(event.target.value)}>
                <option value="">Free text / not linked</option>
                {testTypes.map((test) => (
                  <option key={test.testTypeId} value={test.testTypeId}>
                    {test.testName} {test.category ? `- ${test.category}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Test name</Label>
                <Input value={form.testName} onChange={(event) => setForm({ ...form, testName: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Specimen type</Label>
                <Input value={form.specimenType} onChange={(event) => setForm({ ...form, specimenType: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Turnaround time</Label>
                <Input value={form.turnaroundTime} onChange={(event) => setForm({ ...form, turnaroundTime: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.availabilityStatus} onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value })}>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                Save Lab
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
