"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts"
import { useTheme } from "next-themes"
import { analyticsApi } from "@/lib/api"
import { Loader2, TrendingUp, DollarSign, Users, Calendar, Store, Package, Search } from "lucide-react"

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#FF6B6B", "#6B66FF"]

export default function AnalyticsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [loading, setLoading] = useState(true)
  const [patientData, setPatientData] = useState<any[]>([])
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [departmentData, setDepartmentData] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [months, setMonths] = useState(12)
  const [revenueBySource, setRevenueBySource] = useState<any[]>([])
  const [pharmacySales, setPharmacySales] = useState<any>(null)
  const [inventoryValue, setInventoryValue] = useState<any>(null)
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [revenueTrends, setRevenueTrends] = useState<any[]>([])
  const [weeklyRevenue, setWeeklyRevenue] = useState<any[]>([])
  const [inventoryValueDetail, setInventoryValueDetail] = useState<any[]>([])
  const [inventoryValueDetailTotals, setInventoryValueDetailTotals] = useState({ quantity: 0, amountValue: 0 })
  const [loadingInventoryDetail, setLoadingInventoryDetail] = useState(false)
  const [inventoryDetailLocation, setInventoryDetailLocation] = useState("all")
  const [inventoryDetailSearch, setInventoryDetailSearch] = useState("")
  const [inventoryDetailDateFrom, setInventoryDetailDateFrom] = useState("")
  const [inventoryDetailDateTo, setInventoryDetailDateTo] = useState("")

  useEffect(() => {
    loadAnalytics()
  }, [months])

  useEffect(() => {
    loadInventoryValueDetail()
  }, [inventoryDetailLocation, inventoryDetailSearch, inventoryDetailDateFrom, inventoryDetailDateTo])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const [
        patients,
        revenue,
        departments,
        summaryData,
        revenueBySourceData,
        pharmacySalesData,
        inventoryValueData,
        paymentMethodsData,
        revenueTrendsData,
        weeklyRevenueData
      ] = await Promise.all([
        analyticsApi.getPatients(months).catch(() => []),
        analyticsApi.getRevenue(months).catch(() => []),
        analyticsApi.getDepartments().catch(() => []),
        analyticsApi.getSummary().catch(() => null),
        analyticsApi.getRevenueBySource({ months }).catch(() => []),
        analyticsApi.getPharmacySales({ months, limit: 20 }).catch(() => null),
        analyticsApi.getInventoryValue().catch(() => null),
        analyticsApi.getPaymentMethods({ months }).catch(() => []),
        analyticsApi.getRevenueTrends({ months }).catch(() => []),
        analyticsApi.getRevenueWeekly({ weeks: Math.ceil(months * 4.33) }).catch(() => []),
      ])

      setPatientData(Array.isArray(patients) ? patients : [])
      // Ensure revenue data has proper numeric values
      const processedRevenue = Array.isArray(revenue) ? revenue.map(item => ({
        ...item,
        Revenue: typeof item.Revenue === 'string' ? parseFloat(item.Revenue) || 0 : (item.Revenue || 0),
        Expenses: typeof item.Expenses === 'string' ? parseFloat(item.Expenses) || 0 : (item.Expenses || 0),
      })) : []
      setRevenueData(processedRevenue)
      setDepartmentData(Array.isArray(departments) ? departments : [])
      setSummary(summaryData)
      setRevenueBySource(Array.isArray(revenueBySourceData) ? revenueBySourceData : [])
      setPharmacySales(pharmacySalesData)
      setInventoryValue(inventoryValueData)
      setPaymentMethods(Array.isArray(paymentMethodsData) ? paymentMethodsData : [])
      setRevenueTrends(Array.isArray(revenueTrendsData) ? revenueTrendsData : [])
      setWeeklyRevenue(Array.isArray(weeklyRevenueData) ? weeklyRevenueData : [])
    } catch (error) {
      console.error("Error loading analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadInventoryValueDetail = async () => {
    try {
      setLoadingInventoryDetail(true)
      const response = await analyticsApi.getInventoryValueByLocation({
        location: inventoryDetailLocation,
        search: inventoryDetailSearch || undefined,
        dateFrom: inventoryDetailDateFrom || undefined,
        dateTo: inventoryDetailDateTo || undefined,
      })
      setInventoryValueDetail(response.data || [])
      setInventoryValueDetailTotals(response.totals || { quantity: 0, amountValue: 0 })
    } catch (error) {
      console.error("Error loading inventory value detail:", error)
      setInventoryValueDetail([])
      setInventoryValueDetailTotals({ quantity: 0, amountValue: 0 })
    } finally {
      setLoadingInventoryDetail(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const inventoryLocationOptions = useMemo(() => {
    const names = new Set<string>()
    ;(inventoryValue?.byLocation || []).forEach((item: any) => {
      if (item.location) names.add(String(item.location))
    })
    inventoryValueDetail.forEach((item: any) => {
      if (item.location) names.add(String(item.location))
    })
    return Array.from(names).sort()
  }, [inventoryValue, inventoryValueDetail])

  const topInventoryLocations = useMemo(() => {
    const byLocation = new Map<string, { location: string; amountValue: number; quantity: number; drugCount: number }>()
    for (const row of inventoryValueDetail) {
      const location = row.location || "Unassigned"
      const current = byLocation.get(location) || { location, amountValue: 0, quantity: 0, drugCount: 0 }
      current.amountValue += Number(row.amountValue || 0)
      current.quantity += Number(row.quantity || 0)
      current.drugCount += 1
      byLocation.set(location, current)
    }
    return Array.from(byLocation.values()).sort((a, b) => b.amountValue - a.amountValue).slice(0, 10)
  }, [inventoryValueDetail])

  const inventoryDetailPeriodLabel = () => {
    if (inventoryDetailDateFrom && inventoryDetailDateTo) return `${inventoryDetailDateFrom} to ${inventoryDetailDateTo}`
    if (inventoryDetailDateFrom) return `From ${inventoryDetailDateFrom}`
    if (inventoryDetailDateTo) return `Up to ${inventoryDetailDateTo}`
    return "All periods"
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Hospital performance metrics and statistics</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Hospital performance metrics and statistics</p>
        </div>
        <Select value={months.toString()} onValueChange={(value) => setMonths(parseInt(value))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="24">Last 24 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalPatients || 0}</div>
              <p className="text-xs text-muted-foreground">All registered patients</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue || 0)}</div>
              <p className="text-xs text-muted-foreground">All-time revenue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.monthlyRevenue || 0)}</div>
              <p className="text-xs text-muted-foreground">Current month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Inpatients</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.activeInpatients || 0}</div>
              <p className="text-xs text-muted-foreground">Currently admitted</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="revenue-trends" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="revenue-trends">Revenue Trends</TabsTrigger>
          <TabsTrigger value="revenue-sources">Revenue Sources</TabsTrigger>
          <TabsTrigger value="pharmacy">Pharmacy Analytics</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Value</TabsTrigger>
          <TabsTrigger value="patients">Patient Statistics</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue-trends" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Revenue Comparison</CardTitle>
                <CardDescription>Revenue by month for the last {months} months</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueData.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p>No revenue data available</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                        <XAxis
                          dataKey="name"
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                        />
                        <YAxis
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                          tickFormatter={(value) => formatCurrency(value)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            color: isDark ? "#fff" : "#000",
                            border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                          }}
                          formatter={(value: any) => [formatCurrency(value), ""]}
                        />
                        <Legend />
                        <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                        <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Revenue Trend</CardTitle>
                <CardDescription>Revenue trend over time with expenses</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueData.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p>No revenue data available</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                        <XAxis
                          dataKey="name"
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                        />
                        <YAxis
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                          tickFormatter={(value) => formatCurrency(value)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            color: isDark ? "#fff" : "#000",
                            border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                          }}
                          formatter={(value) => [formatCurrency(value as number), ""]}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Weekly Revenue</CardTitle>
              <CardDescription>Revenue breakdown by week</CardDescription>
            </CardHeader>
            <CardContent>
              {weeklyRevenue.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No weekly revenue data available</p>
                    <p className="text-sm mt-2">Data will appear as invoices are created and paid</p>
                  </div>
                </div>
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyRevenue.slice(-12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                      <XAxis
                        dataKey="weekLabel"
                        stroke={isDark ? "#ffffff" : "#333"}
                        tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis
                        stroke={isDark ? "#ffffff" : "#333"}
                        tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                        formatter={(value: any) => [formatCurrency(value), "Revenue"]}
                        labelFormatter={(label) => `Week: ${label}`}
                      />
                      <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue Summary</CardTitle>
              <CardDescription>Detailed monthly revenue breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No revenue data available</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Expenses</TableHead>
                        <TableHead className="text-right">Net Profit</TableHead>
                        <TableHead className="text-right">Growth %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueData.map((item: any, index: number) => {
                        const revenue = typeof item.Revenue === 'string' ? parseFloat(item.Revenue) : (item.Revenue || 0)
                        const expenses = typeof item.Expenses === 'string' ? parseFloat(item.Expenses) : (item.Expenses || 0)
                        const netProfit = revenue - expenses
                        const prevRevenue = index > 0 ? (typeof revenueData[index - 1].Revenue === 'string' ? parseFloat(revenueData[index - 1].Revenue) : (revenueData[index - 1].Revenue || 0)) : revenue
                        const growth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0

                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right">{formatCurrency(revenue)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(expenses)}</TableCell>
                            <TableCell className={`text-right font-medium ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(netProfit)}
                            </TableCell>
                            <TableCell className={`text-right ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue-sources" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Source</CardTitle>
                <CardDescription>Breakdown of revenue by service category</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueBySource.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p>No revenue data available</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueBySource.map((item: any) => ({
                            name: item.source || item.name || 'Unknown',
                            revenue: typeof item.revenue === 'string' ? parseFloat(item.revenue) || 0 : (parseFloat(item.revenue) || 0),
                            value: typeof item.revenue === 'string' ? parseFloat(item.revenue) || 0 : (parseFloat(item.revenue) || 0),
                          }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={120}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {revenueBySource.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            color: isDark ? "#fff" : "#000",
                            border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                          }}
                          formatter={(value: any) => formatCurrency(typeof value === 'string' ? parseFloat(value) : value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue by Source (Table)</CardTitle>
                <CardDescription>Detailed revenue breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueBySource.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No data available</div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {revenueBySource.map((item: any, index: number) => {
                      const totalRevenue = revenueBySource.reduce((sum: number, r: any) => sum + parseFloat(r.revenue || 0), 0)
                      return (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <div>
                              <div className="font-medium">{item.source}</div>
                              <div className="text-sm text-muted-foreground">
                                {item.invoiceCount} invoices • {item.itemCount} items
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{formatCurrency(parseFloat(item.revenue) || 0)}</div>
                            <div className="text-xs text-muted-foreground">
                              {totalRevenue > 0 ? `${((parseFloat(item.revenue) / totalRevenue) * 100).toFixed(1)}%` : '0%'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>Revenue breakdown by payment method</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentMethods.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No payment method data available</p>
                  </div>
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paymentMethods}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                      <XAxis
                        dataKey="paymentMethod"
                        stroke={isDark ? "#ffffff" : "#333"}
                        tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                      />
                      <YAxis
                        stroke={isDark ? "#ffffff" : "#333"}
                        tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                        formatter={(value: any) => [formatCurrency(value), ""]}
                      />
                      <Bar dataKey="totalAmount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pharmacy" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Drugs (Revenue)</CardTitle>
                <CardDescription>Top {pharmacySales?.topDrugsByRevenue?.length || 0} drugs by revenue</CardDescription>
              </CardHeader>
              <CardContent>
                {!pharmacySales || pharmacySales.topDrugsByRevenue?.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p>No pharmacy sales data available</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pharmacySales.topDrugsByRevenue.slice(0, 10)}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                        <XAxis
                          type="number"
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                          tickFormatter={(value) => formatCurrency(value)}
                        />
                        <YAxis
                          type="category"
                          dataKey="drugName"
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 13, fontWeight: 500 }}
                          width={150}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            color: isDark ? "#fff" : "#000",
                            border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                          }}
                          formatter={(value: any) => formatCurrency(value)}
                        />
                        <Bar dataKey="totalRevenue" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Selling Drugs (Quantity)</CardTitle>
                <CardDescription>Top drugs by quantity sold</CardDescription>
              </CardHeader>
              <CardContent>
                {!pharmacySales || pharmacySales.topDrugsByRevenue?.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p>No pharmacy sales data available</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...pharmacySales.topDrugsByRevenue].sort((a: any, b: any) => b.totalQuantitySold - a.totalQuantitySold).slice(0, 10)}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                        <XAxis
                          type="number"
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333" }}
                        />
                        <YAxis
                          type="category"
                          dataKey="drugName"
                          stroke={isDark ? "#ffffff" : "#333"}
                          tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 13, fontWeight: 500 }}
                          width={150}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            color: isDark ? "#fff" : "#000",
                            border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                          }}
                        />
                        <Bar dataKey="totalQuantitySold" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pharmacy Sales Trend</CardTitle>
              <CardDescription>Monthly pharmacy revenue and quantity sold</CardDescription>
            </CardHeader>
            <CardContent>
              {!pharmacySales || pharmacySales.salesByMonth?.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No pharmacy sales trend data available</p>
                  </div>
                </div>
              ) : (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pharmacySales.salesByMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                      <XAxis dataKey="monthName" stroke={isDark ? "#888" : "#333"} tick={{ fill: isDark ? "#888" : "#333" }} />
                      <YAxis
                        yAxisId="left"
                        stroke={isDark ? "#888" : "#333"}
                        tick={{ fill: isDark ? "#888" : "#333" }}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke={isDark ? "#888" : "#333"}
                        tick={{ fill: isDark ? "#888" : "#333" }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                        formatter={(value: any, name: string) => {
                          if (name === 'revenue') return formatCurrency(value)
                          return value
                        }}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Revenue (KES)"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="quantitySold"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        name="Quantity Sold"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Drugs Details</CardTitle>
              <CardDescription>Detailed breakdown of top selling drugs</CardDescription>
            </CardHeader>
            <CardContent>
              {!pharmacySales || pharmacySales.topDrugsByRevenue?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No pharmacy sales data available</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Drug Name</TableHead>
                        <TableHead>Generic Name</TableHead>
                        <TableHead className="text-right">Quantity Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                        <TableHead className="text-right">Patients</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pharmacySales.topDrugsByRevenue.slice(0, 20).map((drug: any, index: number) => (
                        <TableRow key={drug.medicationId}>
                          <TableCell className="font-medium">#{index + 1}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{drug.drugName}</div>
                              {drug.medicationCode && (
                                <div className="text-xs text-muted-foreground">Code: {drug.medicationCode}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{drug.genericName || '-'}</TableCell>
                          <TableCell className="text-right">{drug.totalQuantitySold.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(parseFloat(drug.totalRevenue) || 0)}</TableCell>
                          <TableCell className="text-right">{drug.invoiceCount}</TableCell>
                          <TableCell className="text-right">{drug.patientCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {inventoryValue?.totals && (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(parseFloat(inventoryValue.totals.totalSellValue) || 0)}</div>
                    <p className="text-xs text-muted-foreground">At selling price</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Cost Value</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(parseFloat(inventoryValue.totals.totalCostValue) || 0)}</div>
                    <p className="text-xs text-muted-foreground">At purchase price</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Potential Profit</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(parseFloat(inventoryValue.totals.totalPotentialProfit) || 0)}</div>
                    <p className="text-xs text-muted-foreground">If all sold</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Value by Location</CardTitle>
              <CardDescription>Drug store inventory value breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {!inventoryValue || inventoryValue.byLocation?.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No inventory data available</p>
                  </div>
                </div>
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={inventoryValue.byLocation}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                      <XAxis dataKey="location" stroke={isDark ? "#888" : "#333"} tick={{ fill: isDark ? "#888" : "#333" }} />
                      <YAxis
                        stroke={isDark ? "#888" : "#333"}
                        tick={{ fill: isDark ? "#888" : "#333" }}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                        formatter={(value: any) => formatCurrency(value)}
                      />
                      <Legend />
                      <Bar dataKey="totalSellValue" fill="#10b981" radius={[4, 4, 0, 0]} name="Sell Value" />
                      <Bar dataKey="totalCostValue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cost Value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Store Details</CardTitle>
              <CardDescription>Detailed inventory breakdown by location</CardDescription>
            </CardHeader>
            <CardContent>
              {!inventoryValue || inventoryValue.byLocation?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No inventory data available</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location/Store</TableHead>
                        <TableHead className="text-right">Drug Count</TableHead>
                        <TableHead className="text-right">Total Quantity</TableHead>
                        <TableHead className="text-right">Cost Value</TableHead>
                        <TableHead className="text-right">Sell Value</TableHead>
                        <TableHead className="text-right">Potential Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryValue.byLocation.map((location: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-muted-foreground" />
                              {location.location}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{location.drugCount}</TableCell>
                          <TableCell className="text-right">{location.totalQuantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{formatCurrency(parseFloat(location.totalCostValue) || 0)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(parseFloat(location.totalSellValue) || 0)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(parseFloat(location.potentialProfit) || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location and Drug Value Concentration</CardTitle>
              <CardDescription>
                Drill down from store-level valuation into location, drug, quantity, and amount/value. Period filters use the stock entry date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location</label>
                  <Select value={inventoryDetailLocation} onValueChange={setInventoryDetailLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All locations</SelectItem>
                      {inventoryLocationOptions.map((location) => (
                        <SelectItem key={location} value={location}>{location}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Drug</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      type="search"
                      placeholder="Search drug..."
                      value={inventoryDetailSearch}
                      onChange={(event) => setInventoryDetailSearch(event.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">From</label>
                  <Input type="date" value={inventoryDetailDateFrom} onChange={(event) => setInventoryDetailDateFrom(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">To</label>
                  <Input type="date" value={inventoryDetailDateTo} onChange={(event) => setInventoryDetailDateTo(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Filtered Value</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(inventoryValueDetailTotals.amountValue || 0)}</div>
                    <p className="text-xs text-muted-foreground">{inventoryDetailPeriodLabel()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Filtered Quantity</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{Number(inventoryValueDetailTotals.quantity || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">{inventoryValueDetail.length} location-drug rows</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Locations Represented</CardTitle>
                    <Store className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{topInventoryLocations.length}</div>
                    <p className="text-xs text-muted-foreground">After current filters</p>
                  </CardContent>
                </Card>
              </div>

              {loadingInventoryDetail ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : inventoryValueDetail.length === 0 ? (
                <div className="rounded-md border py-10 text-center text-muted-foreground">
                  No inventory value detail matches the current filters.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Top Locations by Value</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[320px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topInventoryLocations} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                              <XAxis
                                type="number"
                                stroke={isDark ? "#ffffff" : "#333"}
                                tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                                tickFormatter={(value) => formatCurrency(value)}
                              />
                              <YAxis
                                type="category"
                                dataKey="location"
                                stroke={isDark ? "#ffffff" : "#333"}
                                tick={{ fill: isDark ? "#ffffff" : "#333", fontSize: 12 }}
                                width={130}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: isDark ? "#1f2937" : "#fff",
                                  color: isDark ? "#fff" : "#000",
                                  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                                }}
                                formatter={(value: any) => formatCurrency(Number(value || 0))}
                              />
                              <Bar dataKey="amountValue" fill="#10b981" radius={[0, 4, 4, 0]} name="Inventory value" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Value Share by Location</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {topInventoryLocations.map((location) => {
                            const share = inventoryValueDetailTotals.amountValue > 0
                              ? (location.amountValue / inventoryValueDetailTotals.amountValue) * 100
                              : 0
                            return (
                              <div key={location.location} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-medium">{location.location}</span>
                                  <span>{formatCurrency(location.amountValue)} ({share.toFixed(1)}%)</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted">
                                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(share, 100)}%` }} />
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {location.quantity.toLocaleString()} units across {location.drugCount} drug(s)
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead>Drug</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Amount/Value</TableHead>
                          <TableHead className="text-right">Batches</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryValueDetail.slice(0, 25).map((row: any, index: number) => (
                          <TableRow key={`${row.location}-${row.medicationId}-${index}`}>
                            <TableCell className="font-medium">{row.location || "Unassigned"}</TableCell>
                            <TableCell>
                              <div className="font-medium">{row.medicationName || "-"}</div>
                              <div className="text-xs text-muted-foreground">
                                {[row.medicationCode, row.genericName, row.strength].filter(Boolean).join(" | ") || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{Number(row.quantity || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(Number(row.amountValue || 0))}</TableCell>
                            <TableCell className="text-right">{Number(row.batchCount || 0).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {inventoryValueDetail.length > 25 && (
                    <p className="text-xs text-muted-foreground">
                      Showing top 25 of {inventoryValueDetail.length} matching rows. Use the Pharmacy Inventory Value report for full export.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patients" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Patient Admissions</CardTitle>
              <CardDescription>Monthly patient statistics by category</CardDescription>
            </CardHeader>
            <CardContent>
              {patientData.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No patient data available</p>
                    <p className="text-sm mt-2">Data will appear as patients are registered and admitted</p>
                  </div>
                </div>
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patientData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                      <XAxis dataKey="name" stroke={isDark ? "#888" : "#333"} tick={{ fill: isDark ? "#888" : "#333" }} />
                      <YAxis stroke={isDark ? "#888" : "#333"} tick={{ fill: isDark ? "#888" : "#333" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="Inpatients" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Outpatients" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Emergency" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Financial Performance</CardTitle>
              <CardDescription>Monthly revenue and expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueData.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No revenue data available</p>
                    <p className="text-sm mt-2">Data will appear as invoices are created and paid</p>
                  </div>
                </div>
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#333" : "#eee"} />
                      <XAxis dataKey="name" stroke={isDark ? "#888" : "#333"} tick={{ fill: isDark ? "#888" : "#333" }} />
                      <YAxis
                        stroke={isDark ? "#888" : "#333"}
                        tick={{ fill: isDark ? "#888" : "#333" }}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                        formatter={(value) => [formatCurrency(value as number), ""]}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Distribution</CardTitle>
              <CardDescription>Patient distribution by department</CardDescription>
            </CardHeader>
            <CardContent>
              {departmentData.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p>No department data available</p>
                    <p className="text-sm mt-2">Data will appear as appointments are scheduled</p>
                  </div>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={departmentData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={150}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {departmentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1f2937" : "#fff",
                          color: isDark ? "#fff" : "#000",
                          border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
