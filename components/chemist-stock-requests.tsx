"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Package, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import { pharmacyApi, notificationApi } from "@/lib/api"
import { useAuth } from "@/lib/auth/auth-context"
import { useToast } from "@/hooks/use-toast"
import { ChemistPortalNav } from "@/components/chemist-portal-nav"

type RequestItem = {
  medicationId: string
  quantityRequested: string
  notes?: string
}

type ChemistRequest = {
  requestId: number
  requestNumber: string
  status: string
  sourceStoreName?: string
  sourceBranchName?: string
  requestDate?: string
  itemCount?: number
  notes?: string
  items?: any[]
}

const statusVariant = (status: string) => {
  switch (status) {
    case "received":
      return "default"
    case "dispatched":
      return "secondary"
    case "pending":
    case "approved":
      return "outline"
    case "cancelled":
    case "rejected":
      return "destructive"
    default:
      return "outline"
  }
}

export function ChemistStockRequests() {
  const { toast } = useToast()
  const { user, isLoading: authLoading } = useAuth()
  const [requests, setRequests] = useState<ChemistRequest[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [chemist, setChemist] = useState<any>(null)
  const [chemists, setChemists] = useState<any[]>([])
  const [selectedChemistId, setSelectedChemistId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<ChemistRequest | null>(null)
  const [sourceStoreId, setSourceStoreId] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<RequestItem[]>([{ medicationId: "", quantityRequested: "" }])
  const notificationsInitialized = useRef(false)

  const isCurrentUserChemist = useMemo(() => {
    const roleName = String(user?.role || (user as any)?.roleName || "").toLowerCase()
    return roleName === "chemist" || roleName.includes("external_pharmacy") || roleName.includes("chemist")
  }, [user])

  const chemistOptions = useMemo(
    () =>
      chemists.map((entry) => ({
        value: String(entry.chemistId),
        label: entry.chemistName || entry.chemistCode || `Chemist ${entry.chemistId}`,
      })),
    [chemists]
  )

  const medicationOptions = useMemo(
    () =>
      medications.map((med) => ({
        value: String(med.medicationId),
        label: med.name || med.medicationName,
      })),
    [medications]
  )

  const storeOptions = useMemo(
    () =>
      stores.map((store) => ({
        value: String(store.storeId),
        label: `${store.storeName}${store.branchName ? ` (${store.branchName})` : ""}`,
      })),
    [stores]
  )

  const loadData = useCallback(async () => {
    if (authLoading) return
    try {
      setLoading(true)

      if (isCurrentUserChemist) {
        try {
          const scope = await pharmacyApi.getCurrentChemist()
          setChemist(scope)
          setSelectedChemistId(String(scope.chemistId))
        } catch (err: any) {
          setChemist(null)
          setSelectedChemistId("")
          toast({
            title: "Chemist account not linked",
            description: err.message || "Your user is not assigned to an external chemist. Contact the hospital administrator.",
            variant: "destructive",
          })
        }
      } else if (chemists.length === 0) {
        const chemistData = await pharmacyApi.getExternalChemists(undefined, true)
        setChemists(chemistData || [])
        if (chemistData?.[0]?.chemistId && !selectedChemistId) {
          setSelectedChemistId(String(chemistData[0].chemistId))
        }
      }

      const [requestData, medicationData, storeData] = await Promise.all([
        pharmacyApi.getChemistStockRequests({
          search: search || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          limit: 100,
        }),
        pharmacyApi.getMedications(undefined, 1, 500),
        pharmacyApi.getDrugStores(undefined, undefined, "1"),
      ])
      setRequests(requestData || [])
      setMedications(medicationData || [])
      setStores(storeData || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load stock requests", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [authLoading, isCurrentUserChemist, chemists.length, search, statusFilter, selectedChemistId, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    let knownDispatchIds = new Set<number>()
    const pollNotifications = async () => {
      try {
        const notes = await notificationApi.getPharmacyNotifications({
          status: "pending",
          notificationType: "chemist_supply_dispatched",
          limit: 10,
        })
        if (!notificationsInitialized.current) {
          for (const note of notes || []) knownDispatchIds.add(note.notificationId)
          notificationsInitialized.current = true
          return
        }
        for (const note of notes || []) {
          if (knownDispatchIds.has(note.notificationId)) continue
          knownDispatchIds.add(note.notificationId)
          toast({
            title: note.title,
            description: note.message,
          })
        }
        await loadData()
      } catch {
        // ignore polling errors
      }
    }
    pollNotifications()
    const interval = setInterval(pollNotifications, 60000)
    return () => clearInterval(interval)
  }, [toast, loadData])

  const addItemRow = () => {
    setItems((current) => [...current, { medicationId: "", quantityRequested: "" }])
  }

  const removeItemRow = (index: number) => {
    setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  const updateItemRow = (index: number, field: keyof RequestItem, value: string) => {
    setItems((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    )
  }

  const handleCreateRequest = async (event: FormEvent) => {
    event.preventDefault()
    const payloadItems = items
      .filter((item) => item.medicationId && item.quantityRequested)
      .map((item) => ({
        medicationId: Number(item.medicationId),
        quantityRequested: Number(item.quantityRequested),
        notes: item.notes,
      }))

    if (!payloadItems.length) {
      toast({ title: "Validation", description: "Add at least one medication with quantity.", variant: "destructive" })
      return
    }

    const chemistId = selectedChemistId ? Number(selectedChemistId) : chemist?.chemistId
    if (!chemistId) {
      toast({
        title: "Chemist required",
        description: isCurrentUserChemist
          ? "Your login is not linked to an external chemist. Ask the hospital to assign you under External Chemists."
          : "Select which external chemist this order is for.",
        variant: "destructive",
      })
      return
    }

    try {
      setSaving(true)
      await pharmacyApi.createChemistStockRequest({
        chemistId,
        sourceStoreId: sourceStoreId ? Number(sourceStoreId) : undefined,
        notes: notes || undefined,
        items: payloadItems,
      })
      toast({ title: "Request submitted", description: "Your stock request has been sent to the hospital store." })
      setDialogOpen(false)
      setSourceStoreId("")
      setNotes("")
      setItems([{ medicationId: "", quantityRequested: "" }])
      await loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit request", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (request: ChemistRequest) => {
    try {
      const detail = await pharmacyApi.getChemistStockRequest(String(request.requestId))
      setSelectedRequest(detail)
      setDetailOpen(true)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load request details", variant: "destructive" })
    }
  }

  const updateStatus = async (requestId: number, status: string) => {
    try {
      setActionId(`${requestId}-${status}`)
      await pharmacyApi.updateChemistStockRequestStatus(String(requestId), { status })
      toast({ title: "Updated", description: `Request marked as ${status}.` })
      setDetailOpen(false)
      await loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update request", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="space-y-4">
      <ChemistPortalNav />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Stock requests
            </CardTitle>
            <CardDescription>Request drugs from the hospital main store and confirm receipt when dispatched.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => loadData()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New request
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search requests..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <SearchableSelect
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "dispatched", label: "Dispatched" },
                { value: "received", label: "Received" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              placeholder="Status"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request #</TableHead>
                  <TableHead>Source store</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No stock requests yet</TableCell></TableRow>
                ) : requests.map((request) => (
                  <TableRow key={request.requestId}>
                    <TableCell className="font-medium">{request.requestNumber}</TableCell>
                    <TableCell>{request.sourceStoreName}<div className="text-xs text-muted-foreground">{request.sourceBranchName}</div></TableCell>
                    <TableCell>{request.itemCount || 0}</TableCell>
                    <TableCell><Badge variant={statusVariant(request.status)}>{request.status}</Badge></TableCell>
                    <TableCell>{request.requestDate}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => openDetail(request)}>View</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Request stock from hospital</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateRequest} className="space-y-4">
            {isCurrentUserChemist ? (
              chemist ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Ordering as: </span>
                  <span className="font-medium">{chemist.chemistName || chemist.chemistCode}</span>
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Your user account is not linked to an external chemist. Contact the hospital administrator to assign you under Settings → External Chemists.
                </div>
              )
            ) : (
              <div className="space-y-2">
                <Label>External chemist</Label>
                <SearchableSelect
                  value={selectedChemistId}
                  onValueChange={setSelectedChemistId}
                  options={chemistOptions}
                  placeholder={chemistOptions.length ? "Select chemist" : "No active chemists found"}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Source store (optional)</Label>
              <SearchableSelect
                value={sourceStoreId}
                onValueChange={setSourceStoreId}
                options={storeOptions}
                placeholder="Default main store"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Requested items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add item
                </Button>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-7">
                    <SearchableSelect
                      value={item.medicationId}
                      onValueChange={(value) => updateItemRow(index, "medicationId", value)}
                      options={medicationOptions}
                      placeholder="Medication"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantityRequested}
                      onChange={(e) => updateItemRow(index, "quantityRequested", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItemRow(index)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving || (!selectedChemistId && !chemist?.chemistId)} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit request
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Request {selectedRequest?.requestNumber}</DialogTitle></DialogHeader>
          {selectedRequest ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Source store</span><div>{selectedRequest.sourceStoreName}</div></div>
                <div><span className="text-muted-foreground">Status</span><div><Badge variant={statusVariant(selectedRequest.status)}>{selectedRequest.status}</Badge></div></div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Drug</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Dispatched</TableHead>
                    <TableHead>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedRequest.items || []).map((item: any) => (
                    <TableRow key={item.requestItemId}>
                      <TableCell>{item.medicationName || item.catalogMedicationName}</TableCell>
                      <TableCell>{item.quantityRequested}</TableCell>
                      <TableCell>{item.quantityDispatched || 0}</TableCell>
                      <TableCell>{item.quantityReceived || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap gap-2">
                {selectedRequest.status === "pending" ? (
                  <Button size="sm" variant="outline" disabled={!!actionId} onClick={() => updateStatus(selectedRequest.requestId, "cancelled")}>Cancel request</Button>
                ) : null}
                {selectedRequest.status === "dispatched" ? (
                  <Button size="sm" disabled={!!actionId} onClick={() => updateStatus(selectedRequest.requestId, "received")}>Confirm receipt</Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
