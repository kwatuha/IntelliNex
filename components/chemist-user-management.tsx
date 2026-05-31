"use client"

import { type FormEvent, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, UserCog } from "lucide-react"
import { pharmacyApi } from "@/lib/api"

const emptyForm = {
  username: "",
  password: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  canManageUsers: false,
}

export function ChemistUserManagement() {
  const [scope, setScope] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const [chemistScope, chemistUsers] = await Promise.all([
        pharmacyApi.getCurrentChemist(),
        pharmacyApi.getChemistUsers(),
      ])
      setScope(chemistScope)
      setUsers(chemistUsers)
    } catch (err: any) {
      setError(err.message || "Failed to load chemist users")
    } finally {
      setLoading(false)
    }
  }

  const canManageStaff = Boolean(scope?.isPrimary || scope?.canManageUsers)

  useEffect(() => {
    loadUsers()
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.username.trim() || !form.password.trim()) {
      setError("Username and password are required")
      return
    }

    try {
      setSaving(true)
      setError(null)
      await pharmacyApi.createChemistUser(form)
      setForm(emptyForm)
      setDialogOpen(false)
      await loadUsers()
    } catch (err: any) {
      setError(err.message || "Failed to create chemist user")
    } finally {
      setSaving(false)
    }
  }

  const updateUser = async (chemistUserId: number, patch: any) => {
    try {
      setError(null)
      await pharmacyApi.updateChemistUser(String(chemistUserId), patch)
      await loadUsers()
    } catch (err: any) {
      setError(err.message || "Failed to update chemist user")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chemist Users</h1>
          <p className="text-muted-foreground">
            {canManageStaff
              ? "Create staff accounts for dispensing and lab referral work under your chemist profile."
              : "View staff accounts attached to your external chemist profile."}
          </p>
        </div>
        {canManageStaff && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Staff User
          </Button>
        )}
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {!loading && !canManageStaff && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          You can view chemist staff accounts, but only the primary user or a staff manager can add users or change staff permissions.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Staff Accounts
          </CardTitle>
          <CardDescription>
            {canManageStaff
              ? "Primary users and staff managers can add, deactivate, or grant staff-management permissions."
              : "Read-only staff directory for your chemist."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.chemistUserId}>
                    <TableCell>
                      <div className="font-medium">{`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username}</div>
                      <div className="text-xs text-muted-foreground">@{user.username}</div>
                    </TableCell>
                    <TableCell>
                      <div>{user.phone || "-"}</div>
                      <div className="text-xs text-muted-foreground">{user.email || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {user.isPrimary ? <Badge>Primary</Badge> : <Badge variant="outline">Staff</Badge>}
                        {user.canManageUsers ? <Badge variant="secondary">Can manage users</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive === 0 || user.userIsActive === 0 ? "secondary" : "default"}>
                        {user.isActive === 0 || user.userIsActive === 0 ? "Inactive" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManageStaff && !user.isPrimary && (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateUser(user.chemistUserId, { canManageUsers: !user.canManageUsers })}
                          >
                            {user.canManageUsers ? "Remove manager" : "Make manager"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateUser(user.chemistUserId, { isActive: !(user.isActive !== 0) })}
                          >
                            {user.isActive !== 0 ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      )}
                      {!canManageStaff && <span className="text-xs text-muted-foreground">View only</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No chemist users found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Chemist Staff User</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>First name</Label>
                <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.canManageUsers}
                onChange={(event) => setForm({ ...form, canManageUsers: event.target.checked })}
              />
              Allow this user to manage chemist staff users
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
