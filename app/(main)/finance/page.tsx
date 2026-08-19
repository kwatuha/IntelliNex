"use client"

import React from "react"
import Link from "next/link"
import {
  BookOpen,
  Building2,
  ClipboardList,
  DollarSign,
  FileText,
  Receipt,
  Wallet,
  TrendingUp,
} from "lucide-react"

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

interface QuickNavLinkData {
  title: string
  description: string
  href: string
  icon: LucideIcon
}

type TransactionType = "Income" | "Expense"
type TransactionStatus = "Settled" | "Pending" | "Overdue" | "Reconciled"

interface RecentTransactionData {
  id: string
  date: string
  description: string
  type: TransactionType
  amountKes: number
  status: TransactionStatus
}

const formatKES = (value: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(value)

const getStatusBadgeVariant = (status: TransactionStatus) => {
  switch (status) {
    case "Settled":
      return "default"
    case "Reconciled":
      return "secondary"
    case "Pending":
      return "outline"
    case "Overdue":
      return "destructive"
    default:
      return "secondary"
  }
}

export default function FinanceDashboardPage() {
  const statCards: StatCardData[] = [
    {
      title: "Total Revenue",
      value: 128_450_000,
      description: "Collected this month",
      icon: TrendingUp,
    },
    {
      title: "Outstanding Invoices",
      value: 34_750_000,
      description: "Pending settlement",
      icon: ClipboardList,
    },
    {
      title: "Expenses This Month",
      value: 22_600_000,
      description: "Operational & supplies",
      icon: DollarSign,
    },
    {
      title: "Net Position",
      value: 105_850_000,
      description: "Revenue minus expenses",
      icon: Wallet,
    },
  ]

  const quickLinks: QuickNavLinkData[] = [
    {
      title: "General Ledger",
      description: "Journal & account summaries",
      href: "/finance/ledger",
      icon: BookOpen,
    },
    {
      title: "Accounts Payable",
      description: "Supplier obligations",
      href: "/finance/payable",
      icon: Receipt,
    },
    {
      title: "Accounts Receivable",
      description: "Patient & insurer receivables",
      href: "/finance/receivable",
      icon: FileText,
    },
    {
      title: "Cash Management",
      description: "Cashbooks & reconciliations",
      href: "/finance/cash",
      icon: Wallet,
    },
    {
      title: "Budgeting",
      description: "Budgets & variance review",
      href: "/finance/budgeting",
      icon: ClipboardList,
    },
    {
      title: "Financial Statements",
      description: "Income, balance & reports",
      href: "/finance/statements",
      icon: Building2,
    },
    {
      title: "Hospital Charges",
      description: "Pricing & charge codes",
      href: "/finance/charges",
      icon: DollarSign,
    },
    {
      title: "Billing",
      description: "Invoices, receipts & payments",
      href: "/billing",
      icon: FileText,
    },
  ]

  const recentTransactions: RecentTransactionData[] = [
    {
      id: "rt-1",
      date: "2026-08-18",
      description: "OPD revenue settlement - MPESA",
      type: "Income",
      amountKes: 2_650_000,
      status: "Settled",
    },
    {
      id: "rt-2",
      date: "2026-08-16",
      description: "Laboratory supplies (Cytology consumables)",
      type: "Expense",
      amountKes: 485_200,
      status: "Reconciled",
    },
    {
      id: "rt-3",
      date: "2026-08-14",
      description: "Insurance claim - Jubilee Health",
      type: "Income",
      amountKes: 5_320_450,
      status: "Pending",
    },
    {
      id: "rt-4",
      date: "2026-08-11",
      description: "Vendor payment - Hemodialysis consumables",
      type: "Expense",
      amountKes: 1_214_900,
      status: "Settled",
    },
    {
      id: "rt-5",
      date: "2026-08-08",
      description: "Accounts receivable - Outstanding patient balance",
      type: "Income",
      amountKes: 980_000,
      status: "Overdue",
    },
  ]

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Management</h1>
          <p className="text-muted-foreground">Track revenue, invoices, expenses and key accounting workflows.</p>
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
                <div className="text-2xl font-bold">{formatKES(card.value)}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Quick Navigation</CardTitle>
          <CardDescription>Jump to finance sub-modules</CardDescription>
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
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Latest income and expense movements across the hospital</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount KES</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="whitespace-nowrap">{tx.date}</TableCell>
                  <TableCell className="font-medium">{tx.description}</TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "Income" ? "default" : "secondary"}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatKES(tx.amountKes)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(tx.status)}>{tx.status}</Badge>
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

