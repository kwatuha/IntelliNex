"use client"

import React from "react"
import Link from "next/link"
import { Briefcase, Calendar, Users, UserCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"

type LucideIcon = React.ComponentType<{ className?: string }>

interface StatCardData {
  title: string
  value: number
  description: string
  icon: LucideIcon
}

interface QuickActionData {
  title: string
  description: string
  href?: string
  icon: LucideIcon
  badgeText?: string
}

interface RecentActivityData {
  id: string
  title: string
  detail: string
  when: string
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-KE").format(value)

export default function HrDashboardPage() {
  const statCards: StatCardData[] = [
    { title: "Total Employees", value: 246, description: "Across all departments", icon: Users },
    { title: "Active Staff", value: 198, description: "Currently on duty", icon: UserCheck },
    { title: "On Leave", value: 22, description: "Annual & medical leave", icon: Calendar },
    { title: "Open Vacancies", value: 12, description: "Pending recruitment", icon: Briefcase },
  ]

  const quickActions: QuickActionData[] = [
    {
      title: "Employee Management",
      description: "Directory, onboarding & profiles",
      href: "/hr/employees",
      icon: Users,
    },
    {
      title: "Payroll",
      description: "Salaries, allowances & deductions",
      icon: Calendar,
      badgeText: "Coming soon",
    },
    {
      title: "Leave Management",
      description: "Approvals, balances & reports",
      icon: UserCheck,
      badgeText: "Coming soon",
    },
    {
      title: "Recruitment",
      description: "Vacancies, applicants & offers",
      icon: Briefcase,
      badgeText: "Coming soon",
    },
  ]

  const recentActivities: RecentActivityData[] = [
    {
      id: "ra-1",
      title: "New employee onboarded - Dr. James Odhiambo",
      detail: "Assigned to Internal Medicine",
      when: "Today, 09:14",
    },
    {
      id: "ra-2",
      title: "Leave approved - Nurse Akinyi",
      detail: "Approved for 5 working days",
      when: "Yesterday, 16:42",
    },
    {
      id: "ra-3",
      title: "Attendance check completed",
      detail: "Updated shifts for Ward A",
      when: "Yesterday, 10:05",
    },
    {
      id: "ra-4",
      title: "Promotion request submitted - Michael Ochieng",
      detail: "Review in progress",
      when: "Mon, 13:30",
    },
  ]

  const handleComingSoonClick = () => {
    toast({
      title: "Coming soon",
      description: "This HR module will be available in a future update.",
    })
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Human Resources</h1>
          <p className="text-muted-foreground">Manage staff, leave approvals, recruitment and payroll readiness.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription className="text-xs">{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(card.value)}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common HR workflows for your day-to-day operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon
              const content = (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
                </div>
              )

              return (
                <Card key={action.title} className="border-muted/60">
                  <CardContent className="p-4">
                    {action.href ? (
                      <Button asChild variant="outline" className="h-auto w-full justify-start bg-background">
                        <Link href={action.href} className="flex w-full flex-col items-start gap-2">
                          {action.badgeText ? <Badge variant="secondary">{action.badgeText}</Badge> : null}
                          {content}
                        </Link>
                      </Button>
                    ) : (
                      <div className="flex w-full flex-col items-start gap-2">
                        {action.badgeText ? <Badge variant="secondary">{action.badgeText}</Badge> : null}
                        <Button
                          variant="outline"
                          className="h-auto w-full justify-start bg-background"
                          onClick={handleComingSoonClick}
                        >
                          {content}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest HR events across Intellinex Hospital</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start justify-between gap-4 rounded-lg border bg-background p-4">
                <div>
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activity.detail}</p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {activity.when}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

