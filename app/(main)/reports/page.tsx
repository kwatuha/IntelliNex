"use client"

import React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BreadcrumbsEnhanced } from "@/components/breadcrumbs-enhanced"
import { MOH717Report } from "@/app/components/moh-717-report"
import { MOH731PlusReport } from "@/app/components/moh-731-plus-report"
import { MOH705Report } from "@/app/components/moh-705-report"
import { MOH711Report } from "@/app/components/moh-711-report"
import { MOH708Report } from "@/app/components/moh-708-report"
import { MOH730Report } from "@/app/components/moh-730-report"

type SatisfactionScore = "Excellent" | "Good" | "Fair"

interface OverviewStatCardData {
  title: string
  value: string
  description: string
}

interface DepartmentPerformanceRow {
  department: string
  patientsSeen: number
  revenueKes: number
  avgWaitMinutes: number
  satisfaction: SatisfactionScore
}

interface MonthlyTrendPoint {
  month: string
  visits: number
}

interface RevenueExpenseTrendPoint {
  month: string
  revenueKes: number
  expensesKes: number
}

interface PieSplitPoint {
  label: string
  valueKes: number
}

interface OutstandingBillRow {
  ref: string
  party: string
  amountKes: number
  dueDisplay: string
  status: "Open" | "Overdue" | "Partially Paid"
}

interface TopDiagnosisRow {
  diagnosis: string
  count: number
}

interface AvgLosByDepartmentRow {
  department: string
  avgLosDays: number
}

export default function ReportsPage() {
  const formatKES = (value: number) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value)

  const overviewStats: OverviewStatCardData[] = [
    { title: "Total OPD Visits (month)", value: "86,420", description: "Walk-ins and referrals" },
    { title: "Admissions", value: "1,245", description: "Inpatient admissions" },
    { title: "Surgeries", value: "312", description: "Theatre procedures" },
    { title: "Revenue (KES)", value: formatKES(94_760_500), description: "Cash + insurance receipts" },
    { title: "Bed Occupancy %", value: "78.4%", description: "Current average occupancy" },
    { title: "Average LOS (days)", value: "4.2 days", description: "Mean length of stay" },
  ]

  const departmentPerformance: DepartmentPerformanceRow[] = [
    {
      department: "OPD & Triage",
      patientsSeen: 28_410,
      revenueKes: 16_840_000,
      avgWaitMinutes: 14,
      satisfaction: "Excellent",
    },
    {
      department: "Paediatrics",
      patientsSeen: 9_380,
      revenueKes: 5_620_500,
      avgWaitMinutes: 19,
      satisfaction: "Good",
    },
    {
      department: "Maternity",
      patientsSeen: 6_920,
      revenueKes: 6_410_000,
      avgWaitMinutes: 23,
      satisfaction: "Good",
    },
    {
      department: "Surgical Ward",
      patientsSeen: 4_510,
      revenueKes: 12_250_000,
      avgWaitMinutes: 18,
      satisfaction: "Excellent",
    },
    {
      department: "Internal Medicine",
      patientsSeen: 8_740,
      revenueKes: 9_380_000,
      avgWaitMinutes: 21,
      satisfaction: "Good",
    },
    {
      department: "Radiology",
      patientsSeen: 2_980,
      revenueKes: 4_050_000,
      avgWaitMinutes: 12,
      satisfaction: "Excellent",
    },
    {
      department: "Laboratory",
      patientsSeen: 10_220,
      revenueKes: 7_130_000,
      avgWaitMinutes: 16,
      satisfaction: "Good",
    },
    {
      department: "Pharmacy",
      patientsSeen: 11_060,
      revenueKes: 15_420_000,
      avgWaitMinutes: 10,
      satisfaction: "Excellent",
    },
    {
      department: "ICU",
      patientsSeen: 1_120,
      revenueKes: 8_870_000,
      avgWaitMinutes: 8,
      satisfaction: "Excellent",
    },
    {
      department: "Dental & ENT",
      patientsSeen: 2_760,
      revenueKes: 2_120_000,
      avgWaitMinutes: 24,
      satisfaction: "Fair",
    },
  ]

  const monthlyTrend: MonthlyTrendPoint[] = [
    { month: "Jan", visits: 73_200 },
    { month: "Feb", visits: 76_940 },
    { month: "Mar", visits: 81_120 },
    { month: "Apr", visits: 79_610 },
    { month: "May", visits: 84_340 },
    { month: "Jun", visits: 86_420 },
  ]

  const revenueExpenseTrend: RevenueExpenseTrendPoint[] = [
    { month: "Jan", revenueKes: 18_420_000, expensesKes: 13_780_000 },
    { month: "Feb", revenueKes: 19_540_000, expensesKes: 14_120_000 },
    { month: "Mar", revenueKes: 20_130_000, expensesKes: 14_650_000 },
    { month: "Apr", revenueKes: 19_850_000, expensesKes: 14_340_000 },
    { month: "May", revenueKes: 21_420_000, expensesKes: 15_020_000 },
    { month: "Jun", revenueKes: 22_170_000, expensesKes: 15_310_000 },
  ]

  const insuranceVsCashSplit: PieSplitPoint[] = [
    { label: "Insurance", valueKes: 38_540_000 },
    { label: "Cash", valueKes: 34_760_500 },
    { label: "Other", valueKes: 21_460_000 },
  ]

  const topRevenueDepartments = [
    { department: "OPD & Triage", revenueKes: 16_840_000, share: 18.8 },
    { department: "Pharmacy", revenueKes: 15_420_000, share: 17.2 },
    { department: "Surgical Ward", revenueKes: 12_250_000, share: 13.7 },
    { department: "Internal Medicine", revenueKes: 9_380_000, share: 10.5 },
    { department: "ICU", revenueKes: 8_870_000, share: 9.9 },
  ]

  const outstandingBills: OutstandingBillRow[] = [
    {
      ref: "INV-2026-0812-1042",
      party: "Jubilee Health (Insurance)",
      amountKes: 3_250_000,
      dueDisplay: "Due: 23 Aug 2026",
      status: "Open",
    },
    {
      ref: "INV-2026-0808-0911",
      party: "Achieng Elias (Patient)",
      amountKes: 980_000,
      dueDisplay: "Due: 10 Aug 2026",
      status: "Overdue",
    },
    {
      ref: "INV-2026-0814-1206",
      party: "NHIF Scheme",
      amountKes: 5_120_450,
      dueDisplay: "Due: 26 Aug 2026",
      status: "Partially Paid",
    },
    {
      ref: "INV-2026-0817-1420",
      party: "Kenya Re (Insurance)",
      amountKes: 2_410_000,
      dueDisplay: "Due: 25 Aug 2026",
      status: "Open",
    },
    {
      ref: "INV-2026-0810-1028",
      party: "Optimum Care (Insurance)",
      amountKes: 1_450_000,
      dueDisplay: "Due: 12 Aug 2026",
      status: "Overdue",
    },
  ]

  const topDiagnoses: TopDiagnosisRow[] = [
    { diagnosis: "Malaria (Uncomplicated)", count: 3_420 },
    { diagnosis: "Respiratory Tract Infection", count: 2_760 },
    { diagnosis: "Hypertension", count: 2_190 },
    { diagnosis: "Diabetes Mellitus", count: 1_940 },
    { diagnosis: "Diarrheal Disease (Acute)", count: 1_720 },
    { diagnosis: "Urinary Tract Infection", count: 1_480 },
    { diagnosis: "Sepsis (Suspected)", count: 1_260 },
    { diagnosis: "Peptic Ulcer Disease", count: 1_090 },
    { diagnosis: "CKD & Renal Disorders", count: 980 },
    { diagnosis: "Skin Infections", count: 860 },
  ]

  const avgLosByDepartment: AvgLosByDepartmentRow[] = [
    { department: "Surgical Ward", avgLosDays: 3.4 },
    { department: "Internal Medicine", avgLosDays: 5.6 },
    { department: "Maternity", avgLosDays: 2.1 },
    { department: "Paediatrics", avgLosDays: 4.9 },
    { department: "ICU", avgLosDays: 6.8 },
    { department: "Dialysis Unit", avgLosDays: 4.0 },
    { department: "Orthopedics", avgLosDays: 5.1 },
    { department: "ENT & Dental", avgLosDays: 2.7 },
  ]

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <BreadcrumbsEnhanced
        segments={[
          { title: "Reports", href: "/reports" },
        ]}
        className="mb-4"
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hospital Reports</h1>
          <p className="text-muted-foreground">
            Management dashboards and Ministry of Health (MOH) reports
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="clinical">Clinical</TabsTrigger>
          <TabsTrigger value="workload">MOH 717</TabsTrigger>
          <TabsTrigger value="keypopulations">MOH 731+</TabsTrigger>
          <TabsTrigger value="morbidity">MOH 705</TabsTrigger>
          <TabsTrigger value="immunization">MOH 711</TabsTrigger>
          <TabsTrigger value="mch">MOH 708</TabsTrigger>
          <TabsTrigger value="facility">MOH 730</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {overviewStats.map((s) => (
              <Card key={s.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
                  <CardDescription className="text-xs">{s.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Department Performance</CardTitle>
              <CardDescription>Patients seen, revenue, wait times and satisfaction (mock)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Patients Seen</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg Wait Time</TableHead>
                    <TableHead>Satisfaction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentPerformance.map((row) => (
                    <TableRow key={row.department}>
                      <TableCell className="font-medium">{row.department}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{new Intl.NumberFormat("en-KE").format(row.patientsSeen)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatKES(row.revenueKes)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{row.avgWaitMinutes} min</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.satisfaction === "Excellent" ? "default" : row.satisfaction === "Good" ? "secondary" : "outline"
                          }
                        >
                          {row.satisfaction}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Trend</CardTitle>
              <CardDescription>Patient visits for the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => `${new Intl.NumberFormat("en-KE").format(value)} visits`}
                    />
                    <Bar dataKey="visits" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue vs Expenses</CardTitle>
                <CardDescription>Last 6 months (mock)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueExpenseTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => formatKES(value)}
                      />
                      <Legend />
                      <Bar dataKey="revenueKes" name="Revenue" fill="#16a34a" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="expensesKes" name="Expenses" fill="#f97316" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Insurance vs Cash</CardTitle>
                <CardDescription>Mix of receipts and settlements (mock)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: number) => formatKES(value)} />
                      <Legend />
                      <Pie
                        data={insuranceVsCashSplit}
                        dataKey="valueKes"
                        nameKey="label"
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        <Cell fill="#2563eb" />
                        <Cell fill="#22c55e" />
                        <Cell fill="#f59e0b" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Revenue Departments</CardTitle>
              <CardDescription>Where revenue is concentrated (mock)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRevenueDepartments.map((d) => (
                    <TableRow key={d.department}>
                      <TableCell className="font-medium">{d.department}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatKES(d.revenueKes)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{d.share.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outstanding Bills Summary</CardTitle>
              <CardDescription>Open and overdue balances (mock)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill Reference</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead className="text-right">Amount KES</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingBills.map((b) => (
                    <TableRow key={b.ref}>
                      <TableCell className="font-medium">{b.ref}</TableCell>
                      <TableCell>{b.party}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatKES(b.amountKes)}</TableCell>
                      <TableCell className="whitespace-nowrap">{b.dueDisplay}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            b.status === "Overdue"
                              ? "destructive"
                              : b.status === "Partially Paid"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Surgical Procedures</CardTitle>
                <CardDescription>This month (mock)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">312</div>
                <p className="mt-1 text-xs text-muted-foreground">Major + minor procedures</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lab Test Volumes</CardTitle>
                <CardDescription>This month (mock)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">14,860</div>
                <p className="mt-1 text-xs text-muted-foreground">All categories combined</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Avg Length of Stay</CardTitle>
                <CardDescription>Across departments (mock)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">4.2 days</div>
                <p className="mt-1 text-xs text-muted-foreground">Mean LOS for inpatient cases</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top 10 Diagnoses</CardTitle>
              <CardDescription>Most frequent clinical diagnoses (mock)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDiagnoses.map((d) => (
                    <TableRow key={d.diagnosis}>
                      <TableCell className="font-medium">{d.diagnosis}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{new Intl.NumberFormat("en-KE").format(d.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Average LOS by Department</CardTitle>
              <CardDescription>Mean inpatient length of stay (mock)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Avg LOS (days)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {avgLosByDepartment.map((row) => (
                    <TableRow key={row.department}>
                      <TableCell className="font-medium">{row.department}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{row.avgLosDays.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <MOH717Report />
        </TabsContent>

        <TabsContent value="keypopulations" className="space-y-4">
          <MOH731PlusReport />
        </TabsContent>

        <TabsContent value="morbidity" className="space-y-4">
          <MOH705Report />
        </TabsContent>

        <TabsContent value="immunization" className="space-y-4">
          <MOH711Report />
        </TabsContent>

        <TabsContent value="mch" className="space-y-4">
          <MOH708Report />
        </TabsContent>

        <TabsContent value="facility" className="space-y-4">
          <MOH730Report />
        </TabsContent>
      </Tabs>
    </div>
  )
}

