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
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { pharmacyApi } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

type StoreReorderLevelsProps = {
  stores: Array<{ storeId: number; storeName: string; branchName?: string }>
  medications: Array<{ medicationId: number; name?: string; medicationName?: string }>
}

export function StoreReorderLevels({ stores, medications }: StoreReorderLevelsProps) {
  const { toast } = useToast()
  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [levels, setLevels] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [medicationId, setMedicationId] = useState("")
  const [reorderLevel, setReorderLevel] = useState("")
  const [reorderQuantity, setReorderQuantity] = useState("")

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
        label: med.name || med.medicationName || `Medication ${med.medicationId}`,
      })),
    [medications]
  )

  const loadData = useCallback(async () => {
    if (!selectedStoreId) {
      setLevels([])
      setAlerts([])
      return
    }
    try {
      setLoading(true)
      const [levelData, alertData] = await Promise.all([
        pharmacyApi.getStoreReorderLevels(selectedStoreId),
        pharmacyApi.getReorderAlerts(selectedStoreId),
      ])
      setLevels(levelData || [])
      setAlerts(alertData || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load reorder data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [selectedStoreId, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const runCheck = async () => {
    try {
      setChecking(true)
      await pharmacyApi.checkReorderAlerts(selectedStoreId ? { storeId: Number(selectedStoreId) } : undefined)
      await loadData()
      toast({ title: "Reorder check complete", description: "Low-stock notifications were refreshed." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to check reorder levels", variant: "destructive" })
    } finally {
      setChecking(false)
    }
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedStoreId || !medicationId || !reorderLevel) return
    try {
      setSaving(true)
      await pharmacyApi.createStoreReorderLevel(selectedStoreId, {
        medicationId: Number(medicationId),
        reorderLevel: Number(reorderLevel),
        reorderQuantity: Number(reorderQuantity || 0),
      })
      toast({ title: "Reorder level saved" })
      setDialogOpen(false)
      setMedicationId("")
      setReorderLevel("")
      setReorderQuantity("")
      await loadData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save reorder level", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (reorderLevelId: number) => {
    try {
      await pharmacyApi.deleteReorderLevel(String(reorderLevelId))
      await loadData()
      toast({ title: "Reorder level removed" })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete reorder level", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Reorder levels & low stock
            </CardTitle>
            <CardDescription>Set per-store minimums and monitor items that need replenishment.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Check levels
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!selectedStoreId}>
              <Plus className="h-4 w-4 mr-2" />
              Add level
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Label>Store</Label>
            <SearchableSelect
              value={selectedStoreId}
              onValueChange={setSelectedStoreId}
              options={storeOptions}
              placeholder="Select store"
            />
          </div>

          {alerts.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <div className="font-medium mb-2">{alerts.length} item(s) at or below reorder level</div>
              <div className="space-y-1 text-muted-foreground">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={`${alert.storeId}-${alert.medicationId}`}>
                    {alert.medicationName}: {alert.currentQuantity} left (reorder at {alert.reorderLevel})
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medication</TableHead>
                  <TableHead>Current qty</TableHead>
                  <TableHead>Reorder at</TableHead>
                  <TableHead>Reorder qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedStoreId ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Select a store to manage reorder levels</TableCell></TableRow>
                ) : levels.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No reorder levels configured</TableCell></TableRow>
                ) : levels.map((level) => {
                  const isLow = Number(level.currentQuantity) <= Number(level.reorderLevel)
                  return (
                    <TableRow key={level.reorderLevelId}>
                      <TableCell>{level.medicationName}</TableCell>
                      <TableCell>{level.currentQuantity}</TableCell>
                      <TableCell>{level.reorderLevel}</TableCell>
                      <TableCell>{level.reorderQuantity}</TableCell>
                      <TableCell>
                        <Badge variant={isLow ? "destructive" : "outline"}>
                          {isLow ? "Low stock" : "OK"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(level.reorderLevelId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add reorder level</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Medication</Label>
              <SearchableSelect value={medicationId} onValueChange={setMedicationId} options={medicationOptions} placeholder="Select medication" />
            </div>
            <div className="space-y-2">
              <Label>Reorder when quantity falls to</Label>
              <Input type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Suggested reorder quantity</Label>
              <Input type="number" min="0" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save reorder level
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
