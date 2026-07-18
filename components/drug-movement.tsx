"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Package, Plus, RefreshCw, Search, Truck } from "lucide-react"
import { pharmacyApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { StoreReorderLevels } from "@/components/store-reorder-levels"

type StoreTransfer = {
  transferId: number
  transferNumber: string
  status: string
  medicationName?: string
  quantity: number
  batchNumber?: string
  fromStoreName?: string
  toStoreName?: string
  fromBranchName?: string
  toBranchName?: string
  fromStoreId?: number
  medicationId?: number
  drugInventoryId?: number
  transferDate?: string
  notes?: string
}

type ChemistRequest = {
  requestId: number
  requestNumber: string
  status: string
  chemistName?: string
  sourceStoreName?: string
  sourceBranchName?: string
  requestDate?: string
  itemCount?: number
  notes?: string
  sourceStoreId?: number
  items?: any[]
}

const transferStatusVariant = (status: string) => {
  switch (status) {
    case "completed":
    case "received":
      return "default"
    case "in_transit":
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

export function DrugMovement() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("store-transfers")

  const [stores, setStores] = useState<any[]>([])
  const [medications, setMedications] = useState<any[]>([])
  const [transfers, setTransfers] = useState<StoreTransfer[]>([])
  const [chemistRequests, setChemistRequests] = useState<ChemistRequest[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(true)
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [transferSearch, setTransferSearch] = useState("")
  const [requestSearch, setRequestSearch] = useState("")
  const [transferStatusFilter, setTransferStatusFilter] = useState("all")
  const [requestStatusFilter, setRequestStatusFilter] = useState("all")
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [requestDetailOpen, setRequestDetailOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<StoreTransfer | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<ChemistRequest | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  const [fromStoreId, setFromStoreId] = useState("")
  const [toStoreId, setToStoreId] = useState("")
  const [medicationId, setMedicationId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false)
  const [dispatchMode, setDispatchMode] = useState<"transfer" | "chemist" | null>(null)
  const [dispatchTransfer, setDispatchTransfer] = useState<StoreTransfer | null>(null)
  const [dispatchRequest, setDispatchRequest] = useState<ChemistRequest | null>(null)
  const [dispatchBatchId, setDispatchBatchId] = useState("")
  const [dispatchBatches, setDispatchBatches] = useState<any[]>([])
  const [batchesByMedication, setBatchesByMedication] = useState<Record<number, any[]>>({})
  const [dispatchBatchesLoading, setDispatchBatchesLoading] = useState(false)
  const [chemistDispatchItems, setChemistDispatchItems] = useState<
    Record<number, { quantityDispatched: string; batchLines: Array<{ drugInventoryId: string; quantity: string }> }>
  >({})

  const formatBatchLabel = (batch: any) => {
    const storeLabel = batch.storeName || batch.location || "Unassigned store"
    return `${storeLabel} · ${batch.batchNumber} — ${batch.quantity} avail.${batch.expiryDate ? ` (exp: ${batch.expiryDate})` : ""}`
  }

  const getBatchOptions = (medicationId: number) =>
    (batchesByMedication[medicationId] || []).map((batch) => ({
      value: String(batch.drugInventoryId),
      label: formatBatchLabel(batch),
    }))

  const getTotalAvailable = (medicationId: number) =>
    (batchesByMedication[medicationId] || []).reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0)

  const storeOptions = useMemo(
    () =>
      stores.map((store) => ({
        value: String(store.storeId),
        label: `${store.storeName}${store.branchName ? ` (${store.branchName})` : ""}`,
      })),
    [stores]
  )

  const medicationOptions = useMemo(
    () =>
      medications.map((med) => ({
        value: String(med.medicationId),
        label: med.name || med.medicationName,
      })),
    [medications]
  )

  const loadBaseData = useCallback(async () => {
    try {
      const [storeData, medicationData] = await Promise.all([
        pharmacyApi.getDrugStores(undefined, undefined, "true"),
        pharmacyApi.getMedications(undefined, 1, 500),
      ])
      setStores(storeData || [])
      setMedications(medicationData || [])
      if (!(storeData || []).length) {
        toast({
          title: "No stores found",
          description: "Add drug stores under Settings → Drug Stores before creating transfers.",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load stores and medications",
        variant: "destructive",
      })
    }
  }, [toast])

  const loadTransfers = useCallback(async () => {
    try {
      setLoadingTransfers(true)
      const data = await pharmacyApi.getStockTransfers({
        search: transferSearch || undefined,
        status: transferStatusFilter !== "all" ? transferStatusFilter : undefined,
        limit: 100,
      })
      setTransfers(data || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load store transfers", variant: "destructive" })
    } finally {
      setLoadingTransfers(false)
    }
  }, [transferSearch, transferStatusFilter, toast])

  const loadChemistRequests = useCallback(async () => {
    try {
      setLoadingRequests(true)
      const data = await pharmacyApi.getChemistStockRequests({
        search: requestSearch || undefined,
        status: requestStatusFilter !== "all" ? requestStatusFilter : undefined,
        limit: 100,
      })
      setChemistRequests(data || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load chemist supply requests", variant: "destructive" })
    } finally {
      setLoadingRequests(false)
    }
  }, [requestSearch, requestStatusFilter, toast])

  useEffect(() => {
    loadBaseData().catch(() => {})
  }, [loadBaseData])

  useEffect(() => {
    if (activeTab === "store-transfers") loadTransfers()
    else loadChemistRequests()
  }, [activeTab, loadTransfers, loadChemistRequests])

  const handleCreateTransfer = async (event: FormEvent) => {
    event.preventDefault()
    if (!fromStoreId || !toStoreId || !medicationId || !quantity) return
    try {
      setSaving(true)
      await pharmacyApi.createStockTransfer({
        fromStoreId: Number(fromStoreId),
        toStoreId: Number(toStoreId),
        medicationId: Number(medicationId),
        quantity: Number(quantity),
        notes: notes || undefined,
      })
      toast({ title: "Transfer requested", description: "Store transfer request created." })
      setTransferDialogOpen(false)
      setFromStoreId("")
      setToStoreId("")
      setMedicationId("")
      setQuantity("")
      setNotes("")
      await loadTransfers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create transfer", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const updateTransferStatus = async (transferId: number, status: string, extra?: { drugInventoryId?: number }) => {
    try {
      setActionId(`transfer-${transferId}-${status}`)
      await pharmacyApi.updateStockTransferStatus(String(transferId), { status, drugInventoryId: extra?.drugInventoryId })
      toast({ title: "Updated", description: `Transfer marked as ${status.replace("_", " ")}.` })
      setDetailDialogOpen(false)
      setDispatchDialogOpen(false)
      await loadTransfers()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update transfer", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  const updateRequestStatus = async (
    requestId: number,
    status: string,
    extra?: {
      items?: Array<{
        requestItemId: number
        drugInventoryId?: number
        quantityDispatched?: number
        batches?: Array<{ drugInventoryId: number; quantity: number }>
      }>
    }
  ) => {
    try {
      setActionId(`request-${requestId}-${status}`)
      await pharmacyApi.updateChemistStockRequestStatus(String(requestId), { status, items: extra?.items })
      toast({ title: "Updated", description: `Request marked as ${status}.` })
      setRequestDetailOpen(false)
      setDispatchDialogOpen(false)
      await loadChemistRequests()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update request", variant: "destructive" })
    } finally {
      setActionId(null)
    }
  }

  const loadBatchesForMedication = async (medicationId: number, storeId: number) => {
    setDispatchBatchesLoading(true)
    try {
      const batches = await pharmacyApi.getAvailableDrugInventory(String(medicationId), String(storeId))
      setDispatchBatches(batches || [])
      setBatchesByMedication((current) => ({ ...current, [medicationId]: batches || [] }))
      return batches || []
    } catch {
      setDispatchBatches([])
      return []
    } finally {
      setDispatchBatchesLoading(false)
    }
  }

  const openTransferDispatch = async (transfer: StoreTransfer) => {
    const detail = await pharmacyApi.getStockTransfer(String(transfer.transferId))
    setDispatchMode("transfer")
    setDispatchTransfer(detail)
    setDispatchRequest(null)
    setDispatchBatchId(detail.drugInventoryId ? String(detail.drugInventoryId) : "")
    setDispatchDialogOpen(true)
    if (detail.medicationId && detail.fromStoreId) {
      const batches = await loadBatchesForMedication(Number(detail.medicationId), Number(detail.fromStoreId))
      if (!detail.drugInventoryId && batches[0]) {
        setDispatchBatchId(String(batches[0].drugInventoryId))
      }
    }
  }

  const openChemistDispatch = async (request: ChemistRequest) => {
    const detail = await pharmacyApi.getChemistStockRequest(String(request.requestId))
    setDispatchMode("chemist")
    setDispatchRequest(detail)
    setDispatchTransfer(null)
    setRequestDetailOpen(false)
    const initialItems: Record<number, { quantityDispatched: string; batchLines: Array<{ drugInventoryId: string; quantity: string }> }> = {}
    const medicationIds = new Set<number>()
    for (const item of detail.items || []) {
      initialItems[item.requestItemId] = {
        quantityDispatched: String(item.quantityRequested || ""),
        batchLines: [{ drugInventoryId: item.drugInventoryId ? String(item.drugInventoryId) : "", quantity: String(item.quantityRequested || "") }],
      }
      if (item.medicationId) medicationIds.add(Number(item.medicationId))
    }
    setChemistDispatchItems(initialItems)
    setBatchesByMedication({})
    setDispatchDialogOpen(true)
    if (detail.sourceStoreId) {
      setDispatchBatchesLoading(true)
      try {
        const map: Record<number, any[]> = {}
        for (const medId of medicationIds) {
          map[medId] = await pharmacyApi.getAvailableDrugInventory(String(medId), String(detail.sourceStoreId))
        }
        setBatchesByMedication(map)
        setChemistDispatchItems((current) => {
          const next = { ...current }
          for (const item of detail.items || []) {
            const medId = Number(item.medicationId)
            const batches = map[medId] || []
            const requestedQty = String(item.quantityRequested || "")
            const firstBatch = batches[0]
            next[item.requestItemId] = {
              quantityDispatched: requestedQty,
              batchLines: [{
                drugInventoryId: firstBatch ? String(firstBatch.drugInventoryId) : "",
                quantity: requestedQty,
              }],
            }
          }
          return next
        })
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to load available batches", variant: "destructive" })
      } finally {
        setDispatchBatchesLoading(false)
      }
    }
  }

  const confirmDispatch = async () => {
    if (dispatchMode === "transfer" && dispatchTransfer) {
      await updateTransferStatus(dispatchTransfer.transferId, "in_transit", {
        drugInventoryId: dispatchBatchId ? Number(dispatchBatchId) : undefined,
      })
      return
    }
    if (dispatchMode === "chemist" && dispatchRequest) {
      const items = (dispatchRequest.items || []).map((item: any) => {
        const line = chemistDispatchItems[item.requestItemId]
        const quantityDispatched = line?.quantityDispatched
          ? Number(line.quantityDispatched)
          : item.quantityRequested
        const batchLines = (line?.batchLines || [])
          .filter((batch) => batch.drugInventoryId && Number(batch.quantity) > 0)
          .map((batch) => ({
            drugInventoryId: Number(batch.drugInventoryId),
            quantity: Number(batch.quantity),
          }))
        return {
          requestItemId: item.requestItemId,
          quantityDispatched,
          drugInventoryId: batchLines[0]?.drugInventoryId,
          batches: batchLines.length > 1 || batchLines.length === 1 ? batchLines : undefined,
        }
      })
      await updateRequestStatus(dispatchRequest.requestId, "dispatched", { items })
    }
  }

  const openTransferDetail = async (transfer: StoreTransfer) => {
    try {
      const detail = await pharmacyApi.getStockTransfer(String(transfer.transferId))
      setSelectedTransfer(detail)
      setDetailDialogOpen(true)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load transfer details", variant: "destructive" })
    }
  }

  const openRequestDetail = async (request: ChemistRequest) => {
    try {
      const detail = await pharmacyApi.getChemistStockRequest(String(request.requestId))
      setSelectedRequest(detail)
      setRequestDetailOpen(true)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load request details", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="store-transfers">Store Transfers</TabsTrigger>
          <TabsTrigger value="chemist-supply">Chemist Supply</TabsTrigger>
          <TabsTrigger value="reorder-levels">Low Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="store-transfers" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Inter-store transfers
                </CardTitle>
                <CardDescription>Move drugs between hospital stores and branches.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadTransfers()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setTransferDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New transfer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search transfers..." value={transferSearch} onChange={(e) => setTransferSearch(e.target.value)} />
                </div>
                <SearchableSelect
                  value={transferStatusFilter}
                  onValueChange={setTransferStatusFilter}
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "in_transit", label: "In transit" },
                    { value: "completed", label: "Completed" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                  placeholder="Status"
                />
              </div>

              {loadingTransfers ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transfer #</TableHead>
                      <TableHead>Drug</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No transfers found</TableCell></TableRow>
                    ) : transfers.map((transfer) => (
                      <TableRow key={transfer.transferId}>
                        <TableCell className="font-medium">{transfer.transferNumber}</TableCell>
                        <TableCell>{transfer.medicationName}</TableCell>
                        <TableCell>{transfer.fromStoreName}<div className="text-xs text-muted-foreground">{transfer.fromBranchName}</div></TableCell>
                        <TableCell>{transfer.toStoreName}<div className="text-xs text-muted-foreground">{transfer.toBranchName}</div></TableCell>
                        <TableCell>{transfer.quantity}</TableCell>
                        <TableCell><Badge variant={transferStatusVariant(transfer.status)}>{transfer.status.replace("_", " ")}</Badge></TableCell>
                        <TableCell>{transfer.transferDate}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openTransferDetail(transfer)}>View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chemist-supply" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Chemist supply requests
                </CardTitle>
                <CardDescription>Process drug requests from external chemists and dispatch from the main store.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => loadChemistRequests()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search requests..." value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} />
                </div>
                <SearchableSelect
                  value={requestStatusFilter}
                  onValueChange={setRequestStatusFilter}
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "dispatched", label: "Dispatched" },
                    { value: "received", label: "Received" },
                    { value: "rejected", label: "Rejected" },
                  ]}
                  placeholder="Status"
                />
              </div>

              {loadingRequests ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request #</TableHead>
                      <TableHead>Chemist</TableHead>
                      <TableHead>Source store</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chemistRequests.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No supply requests found</TableCell></TableRow>
                    ) : chemistRequests.map((request) => (
                      <TableRow key={request.requestId}>
                        <TableCell className="font-medium">{request.requestNumber}</TableCell>
                        <TableCell>{request.chemistName}</TableCell>
                        <TableCell>{request.sourceStoreName}<div className="text-xs text-muted-foreground">{request.sourceBranchName}</div></TableCell>
                        <TableCell>{request.itemCount || 0}</TableCell>
                        <TableCell><Badge variant={transferStatusVariant(request.status)}>{request.status}</Badge></TableCell>
                        <TableCell>{request.requestDate}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openRequestDetail(request)}>View</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reorder-levels" className="space-y-4 mt-4">
          <StoreReorderLevels stores={stores} medications={medications} />
        </TabsContent>
      </Tabs>

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request store transfer</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateTransfer} className="space-y-4">
            <div className="space-y-2">
              <Label>From store</Label>
              <SearchableSelect value={fromStoreId} onValueChange={setFromStoreId} options={storeOptions} placeholder="Select source store" />
            </div>
            <div className="space-y-2">
              <Label>To store</Label>
              <SearchableSelect value={toStoreId} onValueChange={setToStoreId} options={storeOptions} placeholder="Select destination store" />
            </div>
            <div className="space-y-2">
              <Label>Medication</Label>
              <SearchableSelect value={medicationId} onValueChange={setMedicationId} options={medicationOptions} placeholder="Select medication" />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create transfer request
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Transfer {selectedTransfer?.transferNumber}</DialogTitle></DialogHeader>
          {selectedTransfer ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Drug</span><div>{selectedTransfer.medicationName}</div></div>
                <div><span className="text-muted-foreground">Quantity</span><div>{selectedTransfer.quantity}</div></div>
                <div><span className="text-muted-foreground">From</span><div>{selectedTransfer.fromStoreName}</div></div>
                <div><span className="text-muted-foreground">To</span><div>{selectedTransfer.toStoreName}</div></div>
                <div><span className="text-muted-foreground">Batch</span><div>{selectedTransfer.batchNumber || "—"}</div></div>
                <div><span className="text-muted-foreground">Status</span><div><Badge variant={transferStatusVariant(selectedTransfer.status)}>{selectedTransfer.status}</Badge></div></div>
              </div>
              {selectedTransfer.notes ? <p className="text-sm text-muted-foreground">{selectedTransfer.notes}</p> : null}
              <div className="flex flex-wrap gap-2">
                {selectedTransfer.status === "pending" ? (
                  <>
                    <Button size="sm" disabled={!!actionId} onClick={() => openTransferDispatch(selectedTransfer)}>Dispatch</Button>
                    <Button size="sm" variant="outline" disabled={!!actionId} onClick={() => updateTransferStatus(selectedTransfer.transferId, "cancelled")}>Cancel</Button>
                  </>
                ) : null}
                {selectedTransfer.status === "in_transit" ? (
                  <Button size="sm" disabled={!!actionId} onClick={() => updateTransferStatus(selectedTransfer.transferId, "completed")}>Mark received</Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={requestDetailOpen} onOpenChange={setRequestDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Supply request {selectedRequest?.requestNumber}</DialogTitle></DialogHeader>
          {selectedRequest ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Chemist</span><div>{selectedRequest.chemistName}</div></div>
                <div><span className="text-muted-foreground">Source store</span><div>{selectedRequest.sourceStoreName}</div></div>
                <div><span className="text-muted-foreground">Status</span><div><Badge variant={transferStatusVariant(selectedRequest.status)}>{selectedRequest.status}</Badge></div></div>
                <div><span className="text-muted-foreground">Date</span><div>{selectedRequest.requestDate}</div></div>
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
                  <>
                    <Button size="sm" disabled={!!actionId} onClick={() => updateRequestStatus(selectedRequest.requestId, "approved")}>Approve</Button>
                    <Button size="sm" disabled={!!actionId} onClick={() => openChemistDispatch(selectedRequest)}>Dispatch</Button>
                    <Button size="sm" variant="destructive" disabled={!!actionId} onClick={() => updateRequestStatus(selectedRequest.requestId, "rejected")}>Reject</Button>
                  </>
                ) : null}
                {selectedRequest.status === "approved" ? (
                  <Button size="sm" disabled={!!actionId} onClick={() => openChemistDispatch(selectedRequest)}>Dispatch</Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dispatchDialogOpen} onOpenChange={setDispatchDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1.5 border-b px-6 py-4">
            <DialogTitle>
              {dispatchMode === "transfer" ? `Dispatch ${dispatchTransfer?.transferNumber}` : `Dispatch ${dispatchRequest?.requestNumber}`}
            </DialogTitle>
          </DialogHeader>
          {dispatchMode === "transfer" && dispatchTransfer ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Select the batch to dispatch from {dispatchTransfer.fromStoreName} ({dispatchTransfer.quantity} units of {dispatchTransfer.medicationName}).
                </div>
                {dispatchBatchesLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                  <SearchableSelect
                    value={dispatchBatchId}
                    onValueChange={setDispatchBatchId}
                    modal
                    options={dispatchBatches.map((batch) => ({
                      value: String(batch.drugInventoryId),
                      label: formatBatchLabel(batch),
                    }))}
                    placeholder="Select batch"
                    emptyMessage="No batches available in this store."
                  />
                )}
              </div>
              <div className="shrink-0 border-t bg-background px-6 py-4">
                <Button onClick={confirmDispatch} disabled={!!actionId || !dispatchBatchId} className="w-full">
                  Confirm dispatch
                </Button>
              </div>
            </>
          ) : null}
          {dispatchMode === "chemist" && dispatchRequest ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Choose the source batch for each line item. Batches are shown from all stores in the same branch as {dispatchRequest.sourceStoreName}. Stock is deducted when you confirm dispatch.
                  </div>
                  {dispatchBatchesLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : (
                    (dispatchRequest.items || []).map((item: any) => {
                      const medId = Number(item.medicationId)
                      const line = chemistDispatchItems[item.requestItemId]
                      const batchOptions = getBatchOptions(medId)
                      const totalAvailable = getTotalAvailable(medId)
                      const requestedQty = Number(line?.quantityDispatched || item.quantityRequested || 0)
                      const allocatedQty = (line?.batchLines || []).reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0)
                      const shortage = totalAvailable < requestedQty
                      return (
                        <div key={item.requestItemId} className="space-y-3 rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">{item.medicationName || item.catalogMedicationName}</div>
                            <div className="text-xs text-muted-foreground">
                              Requested: {requestedQty} · Store available: {totalAvailable}
                              {shortage ? <span className="text-destructive ml-2">Insufficient stock</span> : null}
                            </div>
                          </div>
                          <div className="grid grid-cols-12 items-end gap-2">
                            <div className="col-span-3">
                              <Label className="text-xs">Total qty to dispatch</Label>
                              <Input
                                type="number"
                                min="1"
                                value={line?.quantityDispatched || ""}
                                onChange={(e) =>
                                  setChemistDispatchItems((current) => ({
                                    ...current,
                                    [item.requestItemId]: {
                                      ...current[item.requestItemId],
                                      quantityDispatched: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                          </div>
                          {(line?.batchLines || []).map((batchLine, batchIndex) => (
                            <div key={`${item.requestItemId}-${batchIndex}`} className="grid grid-cols-12 items-end gap-2">
                              <div className="col-span-7">
                                <Label className="text-xs">Batch {batchIndex + 1}</Label>
                                <SearchableSelect
                                  value={batchLine.drugInventoryId || ""}
                                  onValueChange={(value) =>
                                    setChemistDispatchItems((current) => {
                                      const nextLines = [...(current[item.requestItemId]?.batchLines || [])]
                                      nextLines[batchIndex] = { ...nextLines[batchIndex], drugInventoryId: value }
                                      return {
                                        ...current,
                                        [item.requestItemId]: {
                                          ...current[item.requestItemId],
                                          batchLines: nextLines,
                                        },
                                      }
                                    })
                                  }
                                  modal
                                  options={batchOptions}
                                  placeholder={batchOptions.length ? "Select batch" : "No batches in store"}
                                  emptyMessage="No batches available in this store."
                                />
                              </div>
                              <div className="col-span-3">
                                <Label className="text-xs">Qty from batch</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={batchLine.quantity || ""}
                                  onChange={(e) =>
                                    setChemistDispatchItems((current) => {
                                      const nextLines = [...(current[item.requestItemId]?.batchLines || [])]
                                      nextLines[batchIndex] = { ...nextLines[batchIndex], quantity: e.target.value }
                                      return {
                                        ...current,
                                        [item.requestItemId]: {
                                          ...current[item.requestItemId],
                                          batchLines: nextLines,
                                        },
                                      }
                                    })
                                  }
                                />
                              </div>
                              <div className="col-span-2">
                                {(line?.batchLines || []).length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setChemistDispatchItems((current) => ({
                                        ...current,
                                        [item.requestItemId]: {
                                          ...current[item.requestItemId],
                                          batchLines: (current[item.requestItemId]?.batchLines || []).filter((_, idx) => idx !== batchIndex),
                                        },
                                      }))
                                    }
                                  >
                                    Remove
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!batchOptions.length}
                              onClick={() =>
                                setChemistDispatchItems((current) => ({
                                  ...current,
                                  [item.requestItemId]: {
                                    ...current[item.requestItemId],
                                    batchLines: [
                                      ...(current[item.requestItemId]?.batchLines || []),
                                      { drugInventoryId: "", quantity: "" },
                                    ],
                                  },
                                }))
                              }
                            >
                              Add another batch
                            </Button>
                            <div className={`text-xs ${allocatedQty !== requestedQty ? "text-destructive" : "text-muted-foreground"}`}>
                              Allocated: {allocatedQty} / {requestedQty}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              <div className="shrink-0 border-t bg-background px-6 py-4">
                <Button
                  onClick={confirmDispatch}
                  disabled={
                    !!actionId ||
                    dispatchBatchesLoading ||
                    (dispatchRequest.items || []).some((item: any) => {
                      const line = chemistDispatchItems[item.requestItemId]
                      const requestedQty = Number(line?.quantityDispatched || item.quantityRequested || 0)
                      const allocatedQty = (line?.batchLines || []).reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0)
                      const hasBatch = (line?.batchLines || []).every((batch) => batch.drugInventoryId && Number(batch.quantity) > 0)
                      return !hasBatch || allocatedQty !== requestedQty
                    })
                  }
                  className="w-full"
                >
                  Confirm dispatch
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
