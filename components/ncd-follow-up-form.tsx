"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Textarea } from "@/components/ui/textarea"
import { patientApi } from "@/lib/api"
import { NCD_CONDITION_TYPES, type NcdCondition } from "@/components/ncd-condition-form"

export type NcdFollowUp = {
  followUpId?: number
  ncdId: number
  followUpDate: string
  controlStatus?: string
  bpSystolic?: string
  bpDiastolic?: string
  weightKg?: string
  heightCm?: string
  bloodGlucose?: string
  hba1c?: string
  adherenceNotes?: string
  complications?: string
  planAdjustment?: string
  nextReviewDate?: string
  notes?: string
}

const CONTROL_STATUS_OPTIONS = [
  { value: "controlled", label: "Controlled" },
  { value: "uncontrolled", label: "Uncontrolled" },
  { value: "improved", label: "Improved" },
  { value: "stable", label: "Stable" },
  { value: "worsening", label: "Worsening" },
]

interface NcdFollowUpFormProps {
  patientId: string
  conditions: NcdCondition[]
  defaultNcdId?: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function conditionOptionLabel(c: NcdCondition) {
  if (c.conditionName) return c.conditionName
  const found = NCD_CONDITION_TYPES.find((t) => t.value === c.conditionType)
  return found?.label || c.conditionType
}

export function NcdFollowUpForm({
  patientId,
  conditions,
  defaultNcdId,
  open,
  onOpenChange,
  onSuccess,
}: NcdFollowUpFormProps) {
  const [formData, setFormData] = useState<NcdFollowUp>({
    ncdId: defaultNcdId || conditions[0]?.ncdId || 0,
    followUpDate: new Date().toISOString().slice(0, 10),
    controlStatus: "stable",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conditionOptions = useMemo(
    () =>
      conditions
        .filter((c) => c.ncdId != null)
        .map((c) => ({
          value: String(c.ncdId),
          label: conditionOptionLabel(c),
        })),
    [conditions]
  )

  useEffect(() => {
    if (!open) return
    setFormData({
      ncdId: defaultNcdId || conditions[0]?.ncdId || 0,
      followUpDate: new Date().toISOString().slice(0, 10),
      controlStatus: "stable",
      bpSystolic: "",
      bpDiastolic: "",
      weightKg: "",
      heightCm: "",
      bloodGlucose: "",
      hba1c: "",
      adherenceNotes: "",
      complications: "",
      planAdjustment: "",
      nextReviewDate: "",
      notes: "",
    })
    setError(null)
  }, [open, defaultNcdId, conditions])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.ncdId) {
      setError("Select an NCD condition")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await patientApi.createNcdFollowUp(patientId, {
        ...formData,
        bpSystolic: formData.bpSystolic ? Number(formData.bpSystolic) : undefined,
        bpDiastolic: formData.bpDiastolic ? Number(formData.bpDiastolic) : undefined,
        weightKg: formData.weightKg ? Number(formData.weightKg) : undefined,
        heightCm: formData.heightCm ? Number(formData.heightCm) : undefined,
        bloodGlucose: formData.bloodGlucose ? Number(formData.bloodGlucose) : undefined,
        hba1c: formData.hba1c ? Number(formData.hba1c) : undefined,
      })
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to save follow-up")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Record NCD Follow-up</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto px-6 py-2 space-y-4 flex-1">
            <div className="space-y-2">
              <Label>Condition</Label>
              <SearchableSelect
                modal
                value={formData.ncdId ? String(formData.ncdId) : ""}
                onValueChange={(v) => setFormData((c) => ({ ...c, ncdId: Number(v) }))}
                options={conditionOptions}
                placeholder="Select condition"
                emptyMessage="No NCD conditions enrolled"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Follow-up date</Label>
                <Input type="date" required value={formData.followUpDate} onChange={(e) => setFormData((c) => ({ ...c, followUpDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Control status</Label>
                <SearchableSelect
                  modal
                  value={formData.controlStatus || "stable"}
                  onValueChange={(v) => setFormData((c) => ({ ...c, controlStatus: v }))}
                  options={CONTROL_STATUS_OPTIONS}
                  placeholder="Select status"
                />
              </div>
              <div className="space-y-2">
                <Label>BP systolic</Label>
                <Input type="number" value={formData.bpSystolic || ""} onChange={(e) => setFormData((c) => ({ ...c, bpSystolic: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>BP diastolic</Label>
                <Input type="number" value={formData.bpDiastolic || ""} onChange={(e) => setFormData((c) => ({ ...c, bpDiastolic: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Weight (kg)</Label>
                <Input type="number" step="0.1" value={formData.weightKg || ""} onChange={(e) => setFormData((c) => ({ ...c, weightKg: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Height (cm)</Label>
                <Input type="number" step="0.1" value={formData.heightCm || ""} onChange={(e) => setFormData((c) => ({ ...c, heightCm: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Blood glucose</Label>
                <Input type="number" step="0.1" value={formData.bloodGlucose || ""} onChange={(e) => setFormData((c) => ({ ...c, bloodGlucose: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>HbA1c (%)</Label>
                <Input type="number" step="0.1" value={formData.hba1c || ""} onChange={(e) => setFormData((c) => ({ ...c, hba1c: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Next review date</Label>
                <Input type="date" value={formData.nextReviewDate || ""} onChange={(e) => setFormData((c) => ({ ...c, nextReviewDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Adherence notes</Label>
              <Textarea value={formData.adherenceNotes || ""} onChange={(e) => setFormData((c) => ({ ...c, adherenceNotes: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Complications</Label>
              <Textarea value={formData.complications || ""} onChange={(e) => setFormData((c) => ({ ...c, complications: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Plan adjustment</Label>
              <Textarea value={formData.planAdjustment || ""} onChange={(e) => setFormData((c) => ({ ...c, planAdjustment: e.target.value }))} rows={2} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="px-6 py-4 shrink-0 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save follow-up"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
