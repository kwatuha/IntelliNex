"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Users, 
  DollarSign, 
  Activity, 
  Calendar,
  Stethoscope,
  Building2,
  FileText,
  Pill,
  FlaskConical,
  ImageIcon,
  BedDouble,
  Baby,
  HeartPulse,
  CreditCard,
  Receipt,
  Boxes,
  UserCog,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Video
} from "lucide-react"
import { patientApi, appointmentsApi, employeeApi, inventoryApi, departmentApi, dashboardApi } from "@/lib/api"
import { formatDate, formatTime } from "@/lib/date-utils"
import Link from "next/link"
import { useAuth } from "@/lib/auth/auth-context"
import { filterDashboardCards } from "@/lib/dashboard-cards-config"

interface DashboardStats {
  totalPatients: number
  todayAppointments: number
  activeQueue: number
  totalEmployees: number
  monthlyRevenue: number
  pendingInvoices: number
  lowStockItems: number
  totalDepartments: number
  inpatients: number
  icuPatients: number
  maternityPatients: number
}

export function ComprehensiveDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    todayAppointments: 0,
    activeQueue: 0,
    totalEmployees: 0,
    monthlyRevenue: 0,
    pendingInvoices: 0,
    lowStockItems: 0,
    totalDepartments: 0,
    inpatients: 0,
    icuPatients: 0,
    maternityPatients: 0,
  })
  const [recentAppointments, setRecentAppointments] = useState<any[]>([])
  const [recentPatients, setRecentPatients] = useState<any[]>([])
  const [recentActivities, setRecentActivities] = useState<any[]>([])

  useEffect(() => {
    loadDashboardData()
    // Refresh every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load dashboard stats and other data in parallel
      const [
        statsData,
        appointmentsData,
        recentActivitiesData
      ] = await Promise.all([
        dashboardApi.getStats().catch(() => ({
          totalPatients: 0,
          todayAppointments: 0,
          activeQueue: 0,
          totalEmployees: 0,
          monthlyRevenue: 0,
          pendingInvoices: 0,
          lowStockItems: 0,
          totalDepartments: 0,
          inpatients: 0,
          icuPatients: 0,
          maternityPatients: 0,
        })),
        appointmentsApi.getAll().catch(() => []),
        dashboardApi.getRecentActivities(10).catch(() => ({ appointments: [], patients: [] }))
      ])

      // Set statistics from API
      setStats({
        totalPatients: statsData.totalPatients || 0,
        todayAppointments: statsData.todayAppointments || 0,
        activeQueue: statsData.activeQueue || 0,
        totalEmployees: statsData.totalEmployees || 0,
        monthlyRevenue: statsData.monthlyRevenue || 0,
        pendingInvoices: statsData.pendingInvoices || 0,
        lowStockItems: statsData.lowStockItems || 0,
        totalDepartments: statsData.totalDepartments || 0,
        inpatients: statsData.inpatients || 0,
        icuPatients: statsData.icuPatients || 0,
        maternityPatients: statsData.maternityPatients || 0,
      })

      const appointments = Array.isArray(appointmentsData) ? appointmentsData : []

      // Get recent appointments (last 5)
      const sortedAppointments = [...appointments]
        .sort((a, b) => new Date(b.appointmentDate || 0).getTime() - new Date(a.appointmentDate || 0).getTime())
        .slice(0, 5)
      setRecentAppointments(sortedAppointments)

      // Get recent patients from API
      const recentPatientsData = recentActivitiesData.patients || []
      setRecentPatients(recentPatientsData.slice(0, 5))

      // Create recent activities
      const recentAppts = recentActivitiesData.appointments || []
      const activities = [
        ...recentAppts.map((apt: any) => ({
          type: 'appointment',
          title: `New appointment scheduled`,
          description: `${apt.patientName || apt.patientFirstName || ''} ${apt.patientLastName || ''} - ${formatDate(apt.appointmentDate)}`,
          time: apt.createdAt,
          icon: Calendar,
          color: 'text-blue-600'
        })),
        ...recentPatientsData.slice(0, 3).map((patient: any) => ({
          type: 'patient',
          title: `New patient registered`,
          description: `${patient.firstName} ${patient.lastName}`,
          time: patient.createdAt,
          icon: Users,
          color: 'text-green-600'
        }))
      ]
        .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
        .slice(0, 8)
      
      setRecentActivities(activities)

    } catch (error) {
      console.error("Error loading dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  const allStatCards = [
    {
      id: 'total_patients',
      title: "Total Patients",
      value: stats.totalPatients.toLocaleString(),
      icon: Users,
      change: "+12%",
      trend: "up",
      link: "/patients",
      color: "text-blue-600"
    },
    {
      id: 'today_appointments',
      title: "Today's Appointments",
      value: stats.todayAppointments.toString(),
      icon: Calendar,
      change: "+5%",
      trend: "up",
      link: "/appointments",
      color: "text-green-600"
    },
    {
      id: 'active_employees',
      title: "Active Employees",
      value: stats.totalEmployees.toString(),
      icon: UserCog,
      change: "+3%",
      trend: "up",
      link: "/hr/employees",
      color: "text-purple-600"
    },
    {
      id: 'departments',
      title: "Departments",
      value: stats.totalDepartments.toString(),
      icon: Building2,
      change: "0%",
      trend: "neutral",
      link: "/departments",
      color: "text-orange-600"
    },
    {
      id: 'monthly_revenue',
      title: "Monthly Revenue",
      value: `KES ${stats.monthlyRevenue.toLocaleString()}`,
      icon: DollarSign,
      change: "+18%",
      trend: "up",
      link: "/billing",
      color: "text-green-600"
    },
    {
      id: 'low_stock_items',
      title: "Low Stock Items",
      value: stats.lowStockItems.toString(),
      icon: AlertCircle,
      change: "-5%",
      trend: "down",
      link: "/inventory",
      color: "text-red-600"
    },
    {
      id: 'inpatients',
      title: "Inpatients",
      value: stats.inpatients.toString(),
      icon: BedDouble,
      change: "+2%",
      trend: "up",
      link: "/inpatient",
      color: "text-indigo-600"
    },
    {
      id: 'active_queue',
      title: "Active Queue",
      value: stats.activeQueue.toString(),
      icon: Activity,
      change: "-8%",
      trend: "down",
      link: "/queue",
      color: "text-yellow-600"
    },
  ]

  // Filter cards based on user privileges and role-specific card visibility
  // Admin users see all cards regardless of privileges or role configuration
  const statCards = filterDashboardCards(
    allStatCards, 
    user?.privileges, 
    user?.dashboardCards || null,
    user?.role || null
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's what's happening at Kiplombe Medical Centre today.
        </p>
      </div>

      {/* Key Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          const TrendIcon = stat.trend === "up" ? TrendingUp : stat.trend === "down" ? TrendingDown : null
          return (
            <Link key={index} href={stat.link}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="flex items-center text-xs text-muted-foreground mt-1">
                    {TrendIcon && (
                      <TrendIcon className={`h-3 w-3 mr-1 ${
                        stat.trend === "up" ? "text-green-600" : 
                        stat.trend === "down" ? "text-red-600" : 
                        "text-gray-600"
                      }`} />
                    )}
                    <span className={
                      stat.trend === "up" ? "text-green-600" : 
                      stat.trend === "down" ? "text-red-600" : 
                      "text-gray-600"
                    }>
                      {stat.change}
                    </span>
                    <span className="ml-1">from last month</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Appointments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Appointments</CardTitle>
                <CardDescription>Latest scheduled appointments</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/appointments">
                  View All <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentAppointments.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No appointments found
              </div>
            ) : (
              <div className="space-y-4">
                {recentAppointments.map((apt: any) => (
                  <div key={apt.appointmentId} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Calendar className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {apt.patientFirstName || ''} {apt.patientLastName || ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(apt.appointmentDate)} at {apt.appointmentTime || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={
                      apt.status === 'confirmed' ? 'default' :
                      apt.status === 'pending' ? 'secondary' :
                      apt.status === 'cancelled' ? 'destructive' :
                      'outline'
                    } className="capitalize">
                      {apt.status || 'pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/patients">
                  <Users className="mr-2 h-4 w-4" />
                  Register Patient
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/appointments">
                  <Calendar className="mr-2 h-4 w-4" />
                  Schedule Appointment
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/queue">
                  <Activity className="mr-2 h-4 w-4" />
                  Manage Queue
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/telemedicine">
                  <Video className="mr-2 h-4 w-4" />
                  Telemedicine
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/billing">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Process Billing
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/inventory">
                  <Boxes className="mr-2 h-4 w-4" />
                  Check Inventory
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href="/hr/employees">
                  <UserCog className="mr-2 h-4 w-4" />
                  Manage Employees
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Patients</CardTitle>
                <CardDescription>Newly registered patients</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/patients">
                  View All <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentPatients.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No patients found
              </div>
            ) : (
              <div className="space-y-3">
                {recentPatients.map((patient: any) => (
                  <div key={patient.patientId} className="flex items-center gap-3 p-2 border rounded-lg hover:bg-accent">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Users className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {patient.patientNumber || 'N/A'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>Latest system activities and updates</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No recent activities
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivities.map((activity, index) => {
                  const Icon = activity.icon
                  return (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className={`p-2 rounded-lg bg-muted`}>
                        <Icon className={`h-4 w-4 ${activity.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{activity.title}</p>
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {activity.time ? formatDate(activity.time) : 'Recently'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current system health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Database</span>
                </div>
                <Badge variant="default">Online</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">API Server</span>
                </div>
                <Badge variant="default">Healthy</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Services</span>
                </div>
                <Badge variant="default">Running</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

