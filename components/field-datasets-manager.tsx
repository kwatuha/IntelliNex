"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { dataCollectionApi } from "@/lib/api"
import { ClipboardList, Loader2, Plus, RefreshCw, Smartphone } from "lucide-react"
import Link from "next/link"

type Template = {
  templateId: number
  name: string
  description?: string | null
  templateCategory?: string
  structure?: { sections?: any[] }
  allowedSubjectTypes?: string[]
  isActive?: boolean
  updatedAt?: string
}

const DEFAULT_STRUCTURE = {
  sections: [
    {
      id: "main",
      title: "Main",
      items: [
        { id: "q1", label: "Question 1", type: "text", required: true },
        { id: "notes", label: "Notes", type: "textarea", required: false },
        { id: "site_gps", label: "GPS", type: "location", required: false, requireGps: true },
      ],
    },
  ],
}

export function FieldDatasetsManager() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<Template[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("surveillance")
  const [structureJson, setStructureJson] = useState(JSON.stringify(DEFAULT_STRUCTURE, null, 2))

  const load = useCallback(async () => {
    try {
      setLoading(true)
      // Load templates even if submissions fail (submissions are secondary)
      const tpl = await dataCollectionApi.listTemplates({ includeInactive: true })
      setTemplates(Array.isArray(tpl) ? tpl : [])
      try {
        const subs = await dataCollectionApi.listSubmissions({ limit: 30 })
        setSubmissions(Array.isArray(subs) ? subs : [])
      } catch {
        setSubmissions([])
      }
    } catch (e: any) {
      toast({
        title: "Could not load field datasets",
        description: e?.message || "API error",
        variant: "destructive",
      })
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setName("")
    setDescription("")
    setCategory("surveillance")
    setStructureJson(JSON.stringify(DEFAULT_STRUCTURE, null, 2))
    setEditorOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setName(t.name)
    setDescription(t.description || "")
    setCategory(t.templateCategory || "surveillance")
    setStructureJson(JSON.stringify(t.structure || DEFAULT_STRUCTURE, null, 2))
    setEditorOpen(true)
  }

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" })
      return
    }
    let structure: any
    try {
      structure = JSON.parse(structureJson)
    } catch {
      toast({ title: "Invalid structure JSON", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        templateCategory: category.trim() || "surveillance",
        structure,
        allowedSubjectTypes: ["standalone", "facility", "patient"],
        isActive: true,
      }
      if (editing) {
        await dataCollectionApi.updateTemplate(editing.templateId, payload)
      } else {
        await dataCollectionApi.createTemplate(payload)
      }
      setEditorOpen(false)
      toast({ title: editing ? "Template updated" : "Template created" })
      await load()
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message || "Could not save template",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (t: Template) => {
    try {
      await dataCollectionApi.updateTemplate(t.templateId, { isActive: false })
      toast({ title: "Template deactivated" })
      await load()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Field datasets</h1>
          <p className="text-muted-foreground">
            User-defined forms for health surveillance and special data capture. Templates sync to the{" "}
            <strong>IntelliNex Field</strong> mobile app for offline collection.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New dataset
          </Button>
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" />
            Mobile companion
          </CardTitle>
          <CardDescription>
            Staff and chemists install{" "}
            <Link href="/field-app" className="underline underline-offset-2 font-medium">
              IntelliNex Field
            </Link>{" "}
            from the Field app page. Chemists can dispense referrals offline; staff can verify critical assets and
            submit surveillance forms when connectivity returns.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Templates
          </CardTitle>
          <CardDescription>Active templates appear in the Field app Checklists tab after sync.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet. Create one or run migration 64 to seed a sample.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => {
                  const fieldCount =
                    t.structure?.sections?.reduce((n, s) => n + (s.items?.length || 0), 0) ?? 0
                  return (
                    <TableRow key={t.templateId}>
                      <TableCell>
                        <div className="font-medium">{t.name}</div>
                        {t.description ? (
                          <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{t.templateCategory || "—"}</TableCell>
                      <TableCell>{fieldCount}</TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? "default" : "secondary"}>
                          {t.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(t)}>
                          Edit
                        </Button>
                        {t.isActive ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => void deactivate(t)}>
                            Deactivate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
          <CardDescription>Latest synced field captures (including from the mobile app).</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.submissionId}>
                    <TableCell>{s.title || `Submission #${s.submissionId}`}</TableCell>
                    <TableCell>{s.templateName || s.templateId}</TableCell>
                    <TableCell>{s.visitDate || (s.createdAt ? String(s.createdAt).slice(0, 10) : "—")}</TableCell>
                    <TableCell>
                      {s.subjectType}
                      {s.subjectLabel ? ` · ${s.subjectLabel}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit dataset" : "New dataset"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cholera line list" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="surveillance" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Structure (JSON)</Label>
              <Textarea
                value={structureJson}
                onChange={(e) => setStructureJson(e.target.value)}
                rows={16}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Field types: yes_no, text, textarea, number, select, multi_select, photo, location. Optional showIf for
                conditional visibility.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
