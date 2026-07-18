"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Trash2, ClipboardList } from "lucide-react"
import { patientApi } from "@/lib/api"
import { NcdConditionForm, NCD_CONDITION_TYPES, type NcdCondition } from "@/components/ncd-condition-form"
import { NcdFollowUpForm, type NcdFollowUp } from "@/components/ncd-follow-up-form"
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

function formatLabel(value: string) {
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function conditionLabel(c: NcdCondition) {
  if (c.conditionName) return c.conditionName
  const found = NCD_CONDITION_TYPES.find((t) => t.value === c.conditionType)
  return found?.label || formatLabel(c.conditionType)
}

function statusVariant(status?: string) {
  switch (status) {
    case "controlled":
    case "stable":
      return "default"
    case "uncontrolled":
    case "worsening":
      return "destructive"
    default:
      return "outline"
  }
}

export function PatientNcd({ patientId }: { patientId: string }) {
  const [conditions, setConditions] = useState<NcdCondition[]>([])
  const [followUps, setFollowUps] = useState<NcdFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conditionFormOpen, setConditionFormOpen] = useState(false)
  const [followUpFormOpen, setFollowUpFormOpen] = useState(false)
  const [editingCondition, setEditingCondition] = useState<NcdCondition | null>(null)
  const [deletingCondition, setDeletingCondition] = useState<NcdCondition | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [followUpNcdId, setFollowUpNcdId] = useState<number | undefined>()

  useEffect(() => {
    loadNcd()
  }, [patientId])

  const loadNcd = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await patientApi.getNcd(patientId)
      setConditions(data.conditions || [])
      setFollowUps(data.followUps || [])
    } catch (err: any) {
      setError(err.message || "Failed to load NCD care data")
    } finally {
      setLoading(false)
    }
  }

  const handleEnroll = () => {
    setEditingCondition(null)
    setConditionFormOpen(true)
  }

  const handleEdit = (condition: NcdCondition) => {
    setEditingCondition(condition)
    setConditionFormOpen(true)
  }

  const handleRecordFollowUp = (ncdId?: number) => {
    setFollowUpNcdId(ncdId)
    setFollowUpFormOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingCondition?.ncdId) return
    setDeleteLoading(true)
    try {
      await patientApi.deleteNcdCondition(patientId, String(deletingCondition.ncdId))
      setDeletingCondition(null)
      loadNcd()
    } catch (err: any) {
      setError(err.message || "Failed to remove NCD condition")
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-center py-4 text-muted-foreground">Loading NCD care...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">NCD Conditions</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleRecordFollowUp()} disabled={!conditions.length}>
                  <ClipboardList className="h-4 w-4 mr-1" />
                  Record follow-up
                </Button>
                <Button size="sm" onClick={handleEnroll}>
                  <Plus className="h-4 w-4 mr-1" />
                  Enroll condition
                </Button>
              </div>
            </div>

            {error ? (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md mb-4">{error}</div>
            ) : null}

            {conditions.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Targets</TableHead>
                      <TableHead>Next review</TableHead>
                      <TableHead>Enrolled</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conditions.map((c) => (
                      <TableRow key={c.ncdId}>
                        <TableCell>
                          <div className="font-medium">{conditionLabel(c)}</div>
                          {c.icd10Code ? <div className="text-xs text-muted-foreground">{c.icd10Code}</div> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(c.status)}>{c.status ? formatLabel(c.status) : "Active"}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[c.targetBp && `BP ${c.targetBp}`, c.targetGlucose && `Glucose ${c.targetGlucose}`]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          {c.nextReviewDate ? new Date(c.nextReviewDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          {c.enrolledDate ? new Date(c.enrolledDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleRecordFollowUp(c.ncdId)}>
                              <ClipboardList className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(c)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingCondition(c)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No NCD conditions enrolled. Enroll the patient to track chronic disease care and follow-ups.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-4">Follow-up visits</h3>
            {followUps.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Control</TableHead>
                      <TableHead>Vitals / labs</TableHead>
                      <TableHead>Next review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followUps.map((f) => (
                      <TableRow key={f.followUpId}>
                        <TableCell>{new Date(f.followUpDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {(f as any).conditionName || formatLabel((f as any).conditionType || "")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(f.controlStatus)}>
                            {f.controlStatus ? formatLabel(f.controlStatus) : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[
                            f.bpSystolic && f.bpDiastolic && `BP ${f.bpSystolic}/${f.bpDiastolic}`,
                            f.bloodGlucose && `Glucose ${f.bloodGlucose}`,
                            f.hba1c && `HbA1c ${f.hba1c}%`,
                            f.weightKg && `${f.weightKg} kg`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                        <TableCell>
                          {f.nextReviewDate ? new Date(f.nextReviewDate).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No follow-ups recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <NcdConditionForm
        patientId={patientId}
        condition={editingCondition}
        open={conditionFormOpen}
        onOpenChange={setConditionFormOpen}
        onSuccess={loadNcd}
      />

      <NcdFollowUpForm
        patientId={patientId}
        conditions={conditions}
        defaultNcdId={followUpNcdId}
        open={followUpFormOpen}
        onOpenChange={setFollowUpFormOpen}
        onSuccess={loadNcd}
      />

      <AlertDialog open={!!deletingCondition} onOpenChange={(open) => !open && setDeletingCondition(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove NCD condition?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deletingCondition ? conditionLabel(deletingCondition) : "this condition"} from active NCD care. Follow-up history is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteLoading ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
