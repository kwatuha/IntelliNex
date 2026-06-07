"use client"

import { useState, useEffect } from "react"
import { pharmacyApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"

interface DrugInventoryItem {
  drugInventoryId?: number
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
}

interface Medication {
  medicationId: number
  name?: string
  medicationName?: string
  medicationCode?: string
  genericName?: string
}

interface DrugInventoryFormProps {
  item?: DrugInventoryItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  medications: Medication[]
}

export function DrugInventoryForm({ item, open, onOpenChange, onSuccess, medications }: DrugInventoryFormProps) {
  const [formData, setFormData] = useState<DrugInventoryItem>({
    medicationId: 0,
    batchNumber: '',
    quantity: 0,
    unitPrice: 0,
    manufactureDate: '',
    expiryDate: '',
    minPrice: 0,
    sellPrice: 0,
    location: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stores, setStores] = useState<any[]>([])
  const [loadingStores, setLoadingStores] = useState(false)

  useEffect(() => {
    const loadStores = async () => {
      try {
        setLoadingStores(true)
        const data = await pharmacyApi.getDrugStores(undefined, undefined, 'true')
        setStores(data)
      } catch (error: any) {
        console.error('Error loading stores:', error)
        // Don't show error toast, just log it - stores are optional
        setStores([])
      } finally {
        setLoadingStores(false)
      }
    }

    if (open) {
      loadStores()
    }

    if (item) {
      setFormData({
        medicationId: item.medicationId || 0,
        batchNumber: item.batchNumber || '',
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        manufactureDate: item.manufactureDate ? item.manufactureDate.split('T')[0] : '',
        expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
        minPrice: item.minPrice || 0,
        sellPrice: item.sellPrice || 0,
        location: item.location || '',
        notes: item.notes || '',
      })
    } else {
      setFormData({
        medicationId: 0,
        batchNumber: '',
        quantity: 0,
        unitPrice: 0,
        manufactureDate: '',
        expiryDate: '',
        minPrice: 0,
        sellPrice: 0,
        location: '',
        notes: '',
      })
    }
    setError(null)
  }, [item, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.medicationId || formData.medicationId === 0) {
      setError('Please select a medication')
      setLoading(false)
      return
    }

    if (!formData.batchNumber || !formData.expiryDate || !formData.sellPrice || !formData.location?.trim()) {
      setError('Batch number, expiry date, sell price, and location are required')
      setLoading(false)
      return
    }

    try {
      const { pharmacyApi } = await import('@/lib/api')
      
      const apiData: any = {
        medicationId: formData.medicationId,
        batchNumber: formData.batchNumber,
        quantity: formData.quantity || 0,
        unitPrice: formData.unitPrice || 0,
        manufactureDate: formData.manufactureDate || null,
        expiryDate: formData.expiryDate,
        minPrice: formData.minPrice || null,
        sellPrice: formData.sellPrice,
        location: formData.location || null,
        notes: formData.notes || null,
      }

      if (item?.drugInventoryId) {
        await pharmacyApi.updateDrugInventoryItem(item.drugInventoryId.toString(), apiData)
      } else {
        await pharmacyApi.createDrugInventoryItem(apiData)
      }
      
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save drug inventory item')
    } finally {
      setLoading(false)
    }
  }

  const getMedicationName = (medication: Medication) => {
    return medication.name || medication.medicationName || `Medication ${medication.medicationId}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Drug Inventory Item' : 'Add Drug Inventory Item'}</DialogTitle>
          <DialogDescription>
            {item ? 'Update drug inventory information' : 'Enter drug inventory details with batch information'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="medicationId">Medication *</Label>
            <Select
              value={formData.medicationId?.toString() || ''}
              onValueChange={(value) => setFormData({ ...formData, medicationId: parseInt(value) })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select medication" />
              </SelectTrigger>
              <SelectContent>
                {medications.map((medication) => (
                  <SelectItem key={medication.medicationId} value={medication.medicationId.toString()}>
                    {getMedicationName(medication)} {medication.medicationCode && `(${medication.medicationCode})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="batchNumber">Batch Number *</Label>
              <Input
                id="batchNumber"
                value={formData.batchNumber}
                onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                required
                placeholder="BATCH-001"
              />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="unitPrice">Unit Price (Cost)</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="sellPrice">Sell Price *</Label>
              <Input
                id="sellPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.sellPrice}
                onChange={(e) => setFormData({ ...formData, sellPrice: parseFloat(e.target.value) || 0 })}
                required
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="minPrice">Minimum Price</Label>
            <Input
              id="minPrice"
              type="number"
              step="0.01"
              min="0"
              value={formData.minPrice}
              onChange={(e) => setFormData({ ...formData, minPrice: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="manufactureDate">Manufacture Date</Label>
              <Input
                id="manufactureDate"
                type="date"
                value={formData.manufactureDate}
                onChange={(e) => setFormData({ ...formData, manufactureDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="expiryDate">Expiry Date *</Label>
              <Input
                id="expiryDate"
                type="date"
                value={formData.expiryDate}
                onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="location">Location *</Label>
            {loadingStores ? (
              <div className="flex items-center justify-center h-10 border rounded-md">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : stores.length > 0 ? (
              <Select
                value={formData.location || undefined}
                onValueChange={(value) => setFormData({ ...formData, location: value })}
              >
                <SelectTrigger id="location">
                  <SelectValue placeholder="Select a store location" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.storeId} value={store.storeName}>
                      {store.storeName}
                      {store.branchName && ` (${store.branchName})`}
                      {store.isDispensingStore && ' - Dispensing'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Storage location (no stores configured)"
                required
              />
            )}
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : item ? 'Update Item' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

