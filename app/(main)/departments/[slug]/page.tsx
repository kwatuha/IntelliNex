"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  Building2, 
  Users, 
  Briefcase, 
  MapPin, 
  User, 
  Calendar, 
  DollarSign,
  ArrowLeft,
  Edit,
  Loader2,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BreadcrumbsEnhanced } from "@/components/breadcrumbs-enhanced"
import { departmentApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { formatDate } from "@/lib/date-utils"
import { DepartmentForm } from "@/components/department-form"
import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"

export default function DepartmentDetailPage() {
  const router = useRouter()
  const slug = useResolvedRouteParam("slug", StaticRouteRegex.departmentSlug)

  const [department, setDepartment] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    if (slug) {
      loadDepartmentData()
    }
  }, [slug])

  const loadDepartmentData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load department, employees, and positions in parallel
      const [deptData, employeesData, positionsData] = await Promise.all([
        departmentApi.getById(slug).catch((err) => {
          console.error("Error fetching department:", err)
          return null
        }),
        departmentApi.getEmployees(slug).catch((err) => {
          console.error("Error fetching employees:", err)
          return []
        }),
        departmentApi.getPositions(slug).catch((err) => {
          console.error("Error fetching positions:", err)
          return []
        })
      ])

      // Debug logging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log("Department data loaded:", {
          department: deptData?.departmentName,
          departmentId: deptData?.departmentId,
          employeesCount: Array.isArray(employeesData) ? employeesData.length : 0,
          positionsCount: Array.isArray(positionsData) ? positionsData.length : 0
        })
      }

      if (!deptData) {
        setError("Department not found")
        return
      }

      setDepartment(deptData)
      setEmployees(Array.isArray(employeesData) ? employeesData : [])
      setPositions(Array.isArray(positionsData) ? positionsData : [])
    } catch (err: any) {
      setError(err.message || "Failed to load department data")
      console.error("Error loading department:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    setFormOpen(true)
  }

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <BreadcrumbsEnhanced 
          segments={[
            { title: "Departments", href: "/departments" },
            { title: "Loading...", href: "#" }
          ]} 
          className="mb-4" 
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error || !department) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <BreadcrumbsEnhanced 
          segments={[
            { title: "Departments", href: "/departments" },
            { title: "Error", href: "#" }
          ]} 
          className="mb-4" 
        />
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Department Not Found</h3>
              <p className="text-muted-foreground mb-4">
                {error || "The department you're looking for doesn't exist."}
              </p>
              <Button asChild>
                <Link href="/departments">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Departments
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <BreadcrumbsEnhanced 
        segments={[
          { title: "Departments", href: "/departments" },
          { title: department.departmentName, href: `#` }
        ]} 
        className="mb-4" 
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/departments">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              {department.departmentName}
            </h1>
            {department.departmentCode && (
              <p className="text-muted-foreground mt-1">Code: {department.departmentCode}</p>
            )}
          </div>
        </div>
        <Button onClick={handleEdit}>
          <Edit className="mr-2 h-4 w-4" />
          Edit Department
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">Active staff members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Positions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{positions.length}</div>
            <p className="text-xs text-muted-foreground">Job positions available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={department.isActive ? "default" : "secondary"} className="text-sm">
              {department.isActive ? "Active" : "Inactive"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">Department status</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Head of Department</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {department.headOfDepartmentName || "Not assigned"}
            </div>
            <p className="text-xs text-muted-foreground">Department head</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employees">Employees ({employees.length})</TabsTrigger>
          <TabsTrigger value="positions">Positions ({positions.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Department Information</CardTitle>
                <CardDescription>Basic department details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {department.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{department.description}</p>
                  </div>
                )}
                {department.location && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Location
                    </p>
                    <p className="text-sm">{department.location}</p>
                  </div>
                )}
                {department.headOfDepartmentName && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Head of Department
                    </p>
                    <p className="text-sm">{department.headOfDepartmentName}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Created
                  </p>
                  <p className="text-sm">{formatDate(department.createdAt)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>Department statistics at a glance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Employees</span>
                  <span className="text-sm font-semibold">{employees.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Available Positions</span>
                  <span className="text-sm font-semibold">{positions.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Department Status</span>
                  <Badge variant={department.isActive ? "default" : "secondary"}>
                    {department.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Employees Tab */}
        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Employees</CardTitle>
              <CardDescription>All active employees in this department</CardDescription>
            </CardHeader>
            <CardContent>
              {employees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No employees found in this department.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Employee Number</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Employment Type</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow key={employee.employeeId}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {employee.firstName} {employee.lastName}
                            </div>
                            {employee.email && (
                              <div className="text-sm text-muted-foreground">{employee.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{employee.employeeNumber}</TableCell>
                        <TableCell>
                          {employee.positionTitle || "Not assigned"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {employee.employmentType?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(employee.hireDate)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              employee.status === 'active' ? 'default' : 
                              employee.status === 'on_leave' ? 'secondary' : 
                              'destructive'
                            }
                          >
                            {employee.status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Positions</CardTitle>
              <CardDescription>Job positions available in this department</CardDescription>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No positions found in this department.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {positions.map((position) => (
                    <Card key={position.positionId}>
                      <CardHeader>
                        <CardTitle className="text-lg">{position.positionTitle}</CardTitle>
                        {position.positionCode && (
                          <CardDescription>Code: {position.positionCode}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        {position.jobDescription && (
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                            {position.jobDescription}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Employees</span>
                          <Badge variant="outline">{position.employeeCount || 0}</Badge>
                        </div>
                        {position.salaryScaleMin && position.salaryScaleMax && (
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Salary Range</span>
                            <span className="text-sm font-semibold">
                              ${position.salaryScaleMin.toLocaleString()} - ${position.salaryScaleMax.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Form */}
      <DepartmentForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            loadDepartmentData()
          }
        }}
        onSuccess={() => {
          loadDepartmentData()
        }}
        department={department}
      />
    </div>
  )
}

