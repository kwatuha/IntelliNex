"use client"

import { useEffect, useState } from "react"
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
import { DiagnosisCombobox } from "@/components/diagnosis-combobox"
import { patientApi } from "@/lib/api"

export const NCD_CONDITION_TYPES = [
  { value: "diabetes_type_1", label: "Diabetes Type 1" },
  { value: "diabetes_type_2", label: "Diabetes Type 2" },
  { value: "hypertension", label: "Hypertension" },
  { value: "cardiovascular", label: "Cardiovascular Disease" },
  { value: "asthma", label: "Asthma" },
  { value: "copd", label: "COPD" },
  { value: "cancer", label: "Cancer" },
  { value: "chronic_kidney_disease", label: "Chronic Kidney Disease" },
  { value: "sickle_cell", label: "Sickle Cell Disease" },
  { value: "mental_health", label: "Mental Health" },
  { value: "obesity", label: "Obesity" },
  { value: "other", label: "Other" },
] as const

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "controlled", label: "Controlled" },
  { value: "uncontrolled", label: "Uncontrolled" },
  { value: "stable", label: "Stable" },
  { value: "worsening", label: "Worsening" },
  { value: "resolved", label: "Resolved" },
]

const SMOKING_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "former", label: "Former" },
  { value: "current", label: "Current" },
  { value: "unknown", label: "Unknown" },
]

const ALCOHOL_OPTIONS = [
  { value: "none", label: "None" },
  { value: "occasional", label: "Occasional" },
  { value: "regular", label: "Regular" },
  { value: "heavy", label: "Heavy" },
  { value: "unknown", label: "Unknown" },
]

export type NcdCondition = {
  ncdId?: number
  conditionType: string
  conditionName?: string
  diagnosisDate?: string
  icd10Code?: string
  status?: string
  riskFactors?: string
  treatmentPlan?: string
  targetBp?: string
  targetGlucose?: string
  smokingStatus?: string
  alcoholUse?: string
  enrolledDate?: string
  nextReviewDate?: string
  notes?: string
}

interface NcdConditionFormProps {
  condition?: NcdCondition | null
  patientId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function NcdConditionForm({ condition, patientId, open, onOpenChange, onSuccess }: NcdConditionFormProps) {
  const empty: NcdCondition = {
    conditionType: "hypertension",
    conditionName: "",
    diagnosisDate: "",
    icd10Code: "",
    status: "active",
    riskFactors: "",
    treatmentPlan: "",
    targetBp: "",
    targetGlucose: "",
    smokingStatus: "unknown",
    alcoholUse: "unknown",
    enrolledDate: new Date().toISOString().slice(0, 10),
    nextReviewDate: "",
    notes: "",
  }
  const [formData, setFormData] = useState<NcdCondition>(empty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (condition) {
      setFormData({
        ...empty,
        ...condition,
        diagnosisDate: condition.diagnosisDate?.split("T")[0] || "",
        enrolledDate: condition.enrolledDate?.split("T")[0] || "",
        nextReviewDate: condition.nextReviewDate?.split("T")[0] || "",
      })
    } else {
      setFormData(empty)
    }
    setError(null)
  }, [condition, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (condition?.ncdId) {
        await patientApi.updateNcdCondition(patientId, String(condition.ncdId), formData)
      } else {
        await patientApi.createNcdCondition(patientId, formData)
      }
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to save NCD condition")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{condition?.ncdId ? "Edit NCD Condition" : "Enroll NCD Condition"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="overflow-y-auto px-6 py-2 space-y-4 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Condition type</Label>
                <SearchableSelect
                  modal
                  value={formData.conditionType}
                  onValueChange={(v) => setFormData((c) => ({ ...c, conditionType: v }))}
                  options={NCD_CONDITION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  placeholder="Select condition type"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Specific name (optional)</Label>
                <Input
                  value={formData.conditionName || ""}
                  onChange={(e) => setFormData((c) => ({ ...c, conditionName: e.target.value }))}
                  placeholder="e.g. Essential hypertension"
                />
              </div>
              <div className="space-y-2">
                <Label>Diagnosis date</Label>
                <Input type="date" value={formData.diagnosisDate || ""} onChange={(e) => setFormData((c) => ({ ...c, diagnosisDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <SearchableSelect
                  modal
                  value={formData.status || "active"}
                  onValueChange={(v) => setFormData((c) => ({ ...c, status: v }))}
                  options={STATUS_OPTIONS}
                  placeholder="Select status"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>ICD-10 code</Label>
                <DiagnosisCombobox
                  modal
                  value=""
                  onValueChange={(_id, diagnosis) => {
                    if (diagnosis?.icd10Code) {
                      setFormData((c) => ({ ...c, icd10Code: diagnosis.icd10Code }))
                    }
                  }}
                  placeholder={formData.icd10Code ? `Selected: ${formData.icd10Code}` : "Search ICD-10 diagnosis..."}
                />
                <div className="flex gap-2">
                  <Input
                    value={formData.icd10Code || ""}
                    onChange={(e) => setFormData((c) => ({ ...c, icd10Code: e.target.value }))}
                    placeholder="Or type code (e.g. I10)"
                    className="font-mono"
                  />
                  {formData.icd10Code ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setFormData((c) => ({ ...c, icd10Code: "" }))}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Next review</Label>
                <Input type="date" value={formData.nextReviewDate || ""} onChange={(e) => setFormData((c) => ({ ...c, nextReviewDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Target BP</Label>
                <Input value={formData.targetBp || ""} onChange={(e) => setFormData((c) => ({ ...c, targetBp: e.target.value }))} placeholder="e.g. <140/90" />
              </div>
              <div className="space-y-2">
                <Label>Target glucose</Label>
                <Input value={formData.targetGlucose || ""} onChange={(e) => setFormData((c) => ({ ...c, targetGlucose: e.target.value }))} placeholder="e.g. FBS 4-7" />
              </div>
              <div className="space-y-2">
                <Label>Smoking</Label>
                <SearchableSelect
                  modal
                  value={formData.smokingStatus || "unknown"}
                  onValueChange={(v) => setFormData((c) => ({ ...c, smokingStatus: v }))}
                  options={SMOKING_OPTIONS}
                  placeholder="Select smoking status"
                />
              </div>
              <div className="space-y-2">
                <Label>Alcohol use</Label>
                <SearchableSelect
                  modal
                  value={formData.alcoholUse || "unknown"}
                  onValueChange={(v) => setFormData((c) => ({ ...c, alcoholUse: v }))}
                  options={ALCOHOL_OPTIONS}
                  placeholder="Select alcohol use"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Risk factors</Label>
              <Textarea value={formData.riskFactors || ""} onChange={(e) => setFormData((c) => ({ ...c, riskFactors: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Treatment / care plan</Label>
              <Textarea value={formData.treatmentPlan || ""} onChange={(e) => setFormData((c) => ({ ...c, treatmentPlan: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes || ""} onChange={(e) => setFormData((c) => ({ ...c, notes: e.target.value }))} rows={2} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="px-6 py-4 shrink-0 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
