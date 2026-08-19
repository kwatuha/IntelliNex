"use client"

import React from "react"
import Link from "next/link"
import { Boxes, ClipboardList, Truck, Store } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type LucideIcon = React.ComponentType<{ className?: string }>

interface StatCardData {
  title: string
  value: number
  description: string
  icon: LucideIcon
}

interface QuickLinkData {
  title: string
  description: string
  href: string
  icon: LucideIcon
}

type PurchaseOrderStatus = "Pending" | "Approved" | "Delivered"

interface RecentPurchaseOrderData {
  id: string
  poNumber: string
  vendor: string
  items: number
  valueKes: number
  date: string
  status: PurchaseOrderStatus
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-KE").format(value)
const formatKES = (value: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value)

const getPoStatusBadgeVariant = (status: PurchaseOrderStatus) => {
  switch (status) {
    case "Approved":
      return "default"
    case "Delivered":
      return "secondary"
    case "Pending":
      return "outline"
    default:
      return "secondary"
  }
}

export default function ProcurementDashboardPage() {
  const statCards: StatCardData[] = [
    {
      title: "Active Purchase Orders",
      value: 18,
      description: "Across departments",
      icon: ClipboardList,
    },
    {
      title: "Pending Approvals",
      value: 6,
      description: "Awaiting sign-off",
      icon: Store,
    },
    {
      title: "Vendors",
      value: 42,
      description: "Approved suppliers",
      icon: Truck,
    },
    {
      title: "Items Low Stock",
      value: 28,
      description: "Reorder recommendations",
      icon: Boxes,
    },
  ]

  const quickLinks: QuickLinkData[] = [
    {
      title: "Vendor Management",
      description: "Onboarding, contracts & ratings",
      href: "/procurement/vendors",
      icon: Store,
    },
    {
      title: "Purchase Orders",
      description: "Create, approve & track POs",
      href: "/procurement/orders",
      icon: ClipboardList,
    },
    {
      title: "Inventory",
      description: "Stock levels and adjustments",
      href: "/inventory",
      icon: Boxes,
    },
    {
      title: "Drug Notifications",
      description: "Alerts for medicines and supplies",
      href: "/procurement/notifications",
      icon: Truck,
    },
  ]

  const recentPurchaseOrders: RecentPurchaseOrderData[] = [
    {
      id: "po-1",
      poNumber: "PO-1342",
      vendor: "MedTrade Kenya Ltd",
      items: 24,
      valueKes: 3_920_000,
      date: "2026-08-18",
      status: "Pending",
    },
    {
      id: "po-2",
      poNumber: "PO-1339",
      vendor: "DialyTech Supplies",
      items: 14,
      valueKes: 2_460_750,
      date: "2026-08-16",
      status: "Approved",
    },
    {
      id: "po-3",
      poNumber: "PO-1336",
      vendor: "MediCare Wholesalers",
      items: 37,
      valueKes: 5_180_900,
      date: "2026-08-14",
      status: "Delivered",
    },
    {
      id: "po-4",
      poNumber: "PO-1331",
      vendor: "WardEquip Distributors",
      items: 9,
      valueKes: 1_125_000,
      date: "2026-08-12",
      status: "Pending",
    },
    {
      id: "po-5",
      poNumber: "PO-1328",
      vendor: "SurgiPro Supplies",
      items: 18,
      valueKes: 2_340_450,
      date: "2026-08-09",
      status: "Approved",
    },
  ]

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Procurement & Supply Chain</h1>
          <p className="text-muted-foreground">
            Manage vendors, purchase orders, inventory alerts and low-stock replenishment.
          </p>
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
          <CardTitle>Quick Links</CardTitle>
          <CardDescription>Jump to core procurement modules</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link key={link.href} href={link.href} className="group">
                  <Card className="h-full transition-colors bg-background group-hover:bg-muted/50 border-muted/60">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{link.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
                        </div>
                        <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Purchase Orders</CardTitle>
          <CardDescription>Track PO value, fulfillment and approval status.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Value KES</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPurchaseOrders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-medium">{po.poNumber}</TableCell>
                  <TableCell className="whitespace-nowrap">{po.vendor}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{po.items}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatKES(po.valueKes)}</TableCell>
                  <TableCell className="whitespace-nowrap">{po.date}</TableCell>
                  <TableCell>
                    <Badge variant={getPoStatusBadgeVariant(po.status)}>{po.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

