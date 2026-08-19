"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { userApi, pharmacyApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

const formSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  roleId: z.string().min(1, "Role is required"),
  department: z.string().optional(),
  // Optional in schema — we fill from the main facility before submit if empty
  branchId: z.string().optional(),
  canAccessAllBranches: z.boolean(),
  isActive: z.boolean(),
}).refine((data) => {
  // If password is provided, it must be at least 6 characters
  if (data.password && data.password.length > 0 && data.password.length < 6) {
    return false;
  }
  return true;
}, {
  message: "Password must be at least 6 characters",
  path: ["password"],
}).refine((data) => {
  // If password is provided, confirmPassword must match
  if (data.password && data.password.length > 0) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
})

type FormValues = z.infer<typeof formSchema>

interface UserFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  user?: any
  roles: any[]
}

export function UserForm({ open, onOpenChange, onSuccess, user, roles }: UserFormProps) {
  const [loading, setLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [branches, setBranches] = useState<any[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const isEditing = !!user

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "reset123",
      confirmPassword: "reset123",
      firstName: "",
      lastName: "",
      phone: "",
      roleId: "",
      department: "",
      branchId: "",
      canAccessAllBranches: false,
      isActive: true,
    },
  })

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!open || !isMounted) return
    let cancelled = false
    const loadBranches = async () => {
      try {
        setBranchesLoading(true)
        const data = await pharmacyApi.getBranches(undefined, "true")
        if (!cancelled) setBranches(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error("Error loading facilities:", err)
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load facilities.",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setBranchesLoading(false)
      }
    }
    loadBranches()
    return () => {
      cancelled = true
    }
  }, [open, isMounted])

  useEffect(() => {
    if (!open || !isMounted) return
    if (user) {
      form.reset({
        username: user.username ?? "",
        email: user.email ?? "",
        password: "",
        confirmPassword: "",
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        roleId: user.roleId?.toString() || "",
        department: user.department ?? "",
        branchId: user.branchId?.toString() || "",
        canAccessAllBranches: Boolean(user.canAccessAllBranches),
        isActive: user.isActive ?? true,
      })
      return
    }
    const main = branches.find((b) => b.isMainBranch) || branches[0]
    form.reset({
      username: "",
      email: "",
      password: "reset123",
      confirmPassword: "reset123",
      firstName: "",
      lastName: "",
      phone: "",
      roleId: "",
      department: "",
      branchId: main?.branchId?.toString() || "",
      canAccessAllBranches: false,
      isActive: true,
    })
  }, [user, open, isMounted, form])

  // When facilities finish loading for a new user, default home facility if still empty
  useEffect(() => {
    if (!open || user || !branches.length) return
    const current = form.getValues("branchId")
    if (current) return
    const main = branches.find((b) => b.isMainBranch) || branches[0]
    if (main?.branchId) {
      form.setValue("branchId", String(main.branchId))
    }
  }, [branches, open, user, form])

  const onSubmit = async (data: FormValues) => {
    try {
      setLoading(true)
      
      // Validate password requirements
      if (!isEditing) {
        // For new users, password and confirmation are required
        if (!data.password || data.password.trim().length === 0) {
          toast({
            title: "Error",
            description: "Password is required for new users.",
            variant: "destructive",
          })
          setLoading(false)
          return
        }
        if (!data.confirmPassword || data.confirmPassword.trim().length === 0) {
          toast({
            title: "Error",
            description: "Please confirm your password.",
            variant: "destructive",
          })
          setLoading(false)
          return
        }
        if (data.password !== data.confirmPassword) {
          toast({
            title: "Error",
            description: "Passwords do not match.",
            variant: "destructive",
          })
          setLoading(false)
          return
        }
      } else {
        // For editing, if password is provided, confirmation is required
        if (data.password && data.password.trim().length > 0) {
          if (!data.confirmPassword || data.confirmPassword.trim().length === 0) {
            toast({
              title: "Error",
              description: "Please confirm your password.",
              variant: "destructive",
            })
            setLoading(false)
            return
          }
          if (data.password !== data.confirmPassword) {
            toast({
              title: "Error",
              description: "Passwords do not match.",
              variant: "destructive",
            })
            setLoading(false)
            return
          }
        }
      }

      const mainBranch = branches.find((b) => b.isMainBranch) || branches[0]
      const resolvedBranchId =
        (data.branchId && String(data.branchId).trim()) ||
        (mainBranch?.branchId != null ? String(mainBranch.branchId) : "")

      if (!resolvedBranchId || !Number.isFinite(parseInt(resolvedBranchId, 10))) {
        toast({
          title: "Home facility required",
          description: "Select a home facility, or wait for facilities to finish loading.",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      const payload: any = {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        roleId: parseInt(data.roleId, 10),
        department: data.department || null,
        branchId: parseInt(resolvedBranchId, 10),
        canAccessAllBranches: Boolean(data.canAccessAllBranches),
        isActive: data.isActive !== false,
      }

      // Only include password if provided
      if (data.password && data.password.trim().length > 0) {
        payload.password = data.password
      }

      if (isEditing) {
        await userApi.update(user.userId.toString(), payload)
        toast({
          title: "Success",
          description: "User updated successfully.",
        })
      } else {
        await userApi.create(payload)
        toast({
          title: "Success",
          description: "User created successfully.",
        })
      }
      
      form.reset()
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (error: any) {
      console.error("Error saving user:", error)
      const description =
        error?.message ||
        error?.response?.error ||
        error?.response?.message ||
        "Failed to save user."
      toast({
        title: "Could not save user",
        description,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const onInvalid = (errors: Record<string, { message?: string } | undefined>) => {
    const first = Object.values(errors).find((e) => e?.message)?.message
    toast({
      title: "Check the form",
      description: first || "Please fill in all required fields.",
      variant: "destructive",
    })
  }

  if (!isMounted) {
    return null
  }

  const activeRoles = roles.filter(
    (role) => role.isActive === true || role.isActive === 1 || role.isActive == null,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        <DialogHeader className="flex-shrink-0 space-y-1.5 border-b px-6 py-4 pr-12 text-left">
          <DialogTitle>{isEditing ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update user information and facility assignment." : "Create a new system user and assign a home facility."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username *</FormLabel>
                      <FormControl>
                        <Input placeholder="johndoe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Password {isEditing ? "(leave blank to keep current)" : "*"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={isEditing ? "Leave blank to keep current" : "reset123"}
                          {...field}
                        />
                      </FormControl>
                      {!isEditing && (
                        <p className="text-xs text-muted-foreground">
                          Default password: reset123 (user should change on first login)
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Confirm Password {isEditing ? "(required if changing password)" : "*"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={isEditing ? "Required if changing password" : "reset123"}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+254 712 345 678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="roleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeRoles.map((role) => (
                              <SelectItem key={role.roleId} value={role.roleId.toString()}>
                                {role.roleName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="branchId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Home facility *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={branchesLoading || branches.length === 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  branchesLoading ? "Loading facilities…" : "Select facility"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {branches.map((branch) => (
                              <SelectItem
                                key={branch.branchId}
                                value={branch.branchId.toString()}
                              >
                                {branch.branchName}
                                {branch.isMainBranch ? " (main)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Administration" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="canAccessAllBranches"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Access all facilities</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Allow switching across every active facility (typical for admins)
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active Status</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Enable or disable user access
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 gap-2 border-t bg-background px-6 py-4 sm:space-x-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Update" : "Create"} User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

