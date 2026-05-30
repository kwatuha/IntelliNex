"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, MapPin, Pencil, Plus, Search } from "lucide-react"
import { pharmacyApi } from "@/lib/api"

type Chemist = {
  chemistId: number
  chemistCode?: string
  chemistName: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  county?: string
  subcounty?: string
  ward?: string
  latitude?: string
  longitude?: string
  licenseNumber?: string
  notes?: string
  isActive?: boolean | number
}

const emptyForm = {
  chemistCode: "",
  chemistName: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  county: "",
  subcounty: "",
  ward: "",
  latitude: "",
  longitude: "",
  licenseNumber: "",
  notes: "",
  userId: "",
  username: "",
  password: "",
  isActive: true,
}

export function ExternalChemistManagement() {
  const [chemists, setChemists] = useState<Chemist[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Chemist | null>(null)
  const [form, setForm] = useState(emptyForm)

  const filteredChemists = useMemo(() => chemists, [chemists])

  const loadChemists = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await pharmacyApi.getExternalChemists(search || undefined)
      setChemists(data)
    } catch (err: any) {
      setError(err.message || "Failed to load external chemists")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(loadChemists, 250)
    return () => clearTimeout(handle)
  }, [search])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (chemist: Chemist) => {
    setEditing(chemist)
    setForm({
      chemistCode: chemist.chemistCode || "",
      chemistName: chemist.chemistName || "",
      contactPerson: chemist.contactPerson || "",
      phone: chemist.phone || "",
      email: chemist.email || "",
      address: chemist.address || "",
      county: chemist.county || "",
      subcounty: chemist.subcounty || "",
      ward: chemist.ward || "",
      latitude: chemist.latitude ? String(chemist.latitude) : "",
      longitude: chemist.longitude ? String(chemist.longitude) : "",
      licenseNumber: chemist.licenseNumber || "",
      notes: chemist.notes || "",
      userId: "",
      username: "",
      password: "",
      isActive: chemist.isActive !== 0 && chemist.isActive !== false,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.chemistName.trim()) {
      setError("Chemist name is required")
      return
    }

    const payload = {
      ...form,
      chemistCode: form.chemistCode || undefined,
      latitude: form.latitude || null,
      longitude: form.longitude || null,
      userId: form.userId || undefined,
    }

    try {
      setSaving(true)
      setError(null)
      if (editing) {
        await pharmacyApi.updateExternalChemist(String(editing.chemistId), payload)
      } else {
        await pharmacyApi.createExternalChemist(payload)
      }
      setDialogOpen(false)
      await loadChemists()
    } catch (err: any) {
      setError(err.message || "Failed to save chemist")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">External Chemists</h1>
          <p className="text-muted-foreground">Register partner chemists and their patient pickup locations.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Register Chemist
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Chemist Directory</CardTitle>
          <CardDescription>Use latitude and longitude to help patients locate the chemist.</CardDescription>
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by name, code, county, phone..." value={search} onChange={(event) => setSearch(event.target.value)} />
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
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChemists.map((chemist) => (
                  <TableRow key={chemist.chemistId}>
                    <TableCell>
                      <div className="font-medium">{chemist.chemistName}</div>
                      <div className="text-xs text-muted-foreground">{chemist.chemistCode || "Auto code"} {chemist.licenseNumber ? `- Lic. ${chemist.licenseNumber}` : ""}</div>
                    </TableCell>
                    <TableCell>
                      <div>{chemist.contactPerson || "-"}</div>
                      <div className="text-xs text-muted-foreground">{chemist.phone || chemist.email || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div>{[chemist.county, chemist.subcounty, chemist.ward].filter(Boolean).join(", ") || "-"}</div>
                      {(chemist.latitude || chemist.longitude) && (
                        <div className="mt-1 flex items-center text-xs text-muted-foreground">
                          <MapPin className="mr-1 h-3 w-3" />
                          {chemist.latitude}, {chemist.longitude}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={chemist.isActive === 0 || chemist.isActive === false ? "secondary" : "default"}>
                        {chemist.isActive === 0 || chemist.isActive === false ? "Inactive" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(chemist)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredChemists.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No external chemists found</TableCell>
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
            <DialogTitle>{editing ? "Edit Chemist" : "Register External Chemist"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Chemist name</Label>
                <Input value={form.chemistName} onChange={(event) => setForm({ ...form, chemistName: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input placeholder="Auto-generated if blank" value={form.chemistCode} onChange={(event) => setForm({ ...form, chemistCode: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contact person</Label>
                <Input value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>License number</Label>
                <Input value={form.licenseNumber} onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>County</Label>
                <Input value={form.county} onChange={(event) => setForm({ ...form, county: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Subcounty</Label>
                <Input value={form.subcounty} onChange={(event) => setForm({ ...form, subcounty: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ward</Label>
                <Input value={form.ward} onChange={(event) => setForm({ ...form, ward: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Linked chemist user ID</Label>
                <Input placeholder="Optional existing userId" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Login username</Label>
                <Input placeholder="Optional new chemist login" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Login password</Label>
                <Input type="password" placeholder={editing ? "Only set when creating a new linked user" : "Optional"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Chemist
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
