"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Download, Eye, AlertCircle, MoreHorizontal } from "lucide-react"
import { billingApi } from "@/lib/api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { InvoiceDetailsDialog } from "@/components/invoice-details-dialog"
import { PaymentReceiptDialog } from "@/components/payment-receipt-dialog"
import { GroupedPaymentReceiptDialog } from "@/components/grouped-payment-receipt-dialog"

type Invoice = {
  id: string
  invoiceId?: number // Store invoiceId for lookup
  date: string
  amount: number
  status: string
  dueDate: string
  items: InvoiceItem[]
  paymentMethod: string
  paymentDate: string | null
  insuranceCoverage: number
  patientResponsibility: number
}

type InvoiceItem = {
  description: string
  quantity: number
  unitPrice: number
  total: number
  category: string
}

const VISIBLE_INVOICE_ITEMS = 2

function InvoiceItemsPreview({ items }: { items: InvoiceItem[] }) {
  if (!items?.length) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  const visible = items.slice(0, VISIBLE_INVOICE_ITEMS)
  const remaining = items.slice(VISIBLE_INVOICE_ITEMS)

  return (
    <div className="flex max-w-[280px] flex-wrap items-center gap-1">
      {visible.map((item, index) => (
        <span
          key={`${item.description}-${index}`}
          className="inline-flex max-w-[160px] truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
          title={`${item.description}${item.quantity > 1 ? ` ×${item.quantity}` : ""} · KES ${item.total.toLocaleString()}`}
        >
          {item.description}
          {item.quantity > 1 ? ` ×${item.quantity}` : ""}
        </span>
      ))}
      {remaining.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-0.5 px-1.5 text-muted-foreground"
              title={`${remaining.length} more item${remaining.length === 1 ? "" : "s"}`}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="text-xs">+{remaining.length}</span>
              <span className="sr-only">Show {remaining.length} more items</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 w-72 overflow-y-auto">
            <DropdownMenuLabel>All line items ({items.length})</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {items.map((item, index) => (
              <DropdownMenuItem
                key={`${item.description}-all-${index}`}
                className="flex cursor-default flex-col items-start gap-0.5 focus:bg-accent"
                onSelect={(event) => event.preventDefault()}
              >
                <span className="line-clamp-2 text-sm font-medium">{item.description}</span>
                <span className="text-xs text-muted-foreground">
                  Qty {item.quantity} · KES {item.total.toLocaleString()}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function PatientBilling({ patientId }: { patientId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesData, setInvoicesData] = useState<any[]>([]) // Store raw invoice data with IDs
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [payments, setPayments] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [selectedBatchReceiptNumber, setSelectedBatchReceiptNumber] = useState<string | null>(null)
  const [groupedReceiptOpen, setGroupedReceiptOpen] = useState(false)

  useEffect(() => {
    loadBilling()
    loadPayments()
  }, [patientId])

  const loadBilling = async () => {
    try {
      setLoading(true)
      setError(null)

      const invoicesData = await billingApi.getInvoices(patientId)
      setInvoicesData(invoicesData) // Store for invoice ID lookup

      const bills: Invoice[] = await Promise.all(invoicesData.map(async (inv: any) => {
        // Get invoice details including items
        let items: InvoiceItem[] = []
        try {
          const invoiceDetails = await billingApi.getInvoiceById(inv.invoiceId.toString())
          if (invoiceDetails.items && invoiceDetails.items.length > 0) {
            items = invoiceDetails.items.map((item: any) => {
              // For prescription items, use medicationName if available
              let description = item.chargeName || item.description || item.itemDescription || item.serviceName || 'Service';
              if (description.includes('Prescription Item:') && item.medicationName) {
                description = `Prescription Item: ${item.medicationName}`;
              } else if (description.includes('Prescription Item: Unknown') && item.medicationName) {
                description = `Prescription Item: ${item.medicationName}`;
              }
              return {
                description: description,
                quantity: item.quantity || 1,
                unitPrice: parseFloat(item.unitPrice || item.price || 0),
                total: parseFloat(item.total || item.totalAmount || 0),
                category: item.category || item.serviceCategory || 'General'
              };
            })
          }
        } catch (err) {
          console.error(`Error loading invoice ${inv.invoiceId} details:`, err)
        }

        const totalAmount = parseFloat(inv.totalAmount || 0)
        const paidAmount = parseFloat(inv.paidAmount || 0)
        const invoiceDate = new Date(inv.invoiceDate || inv.date || new Date())
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days default

        // Determine status: check for waived status first, then paid, then pending
        let status = 'Pending'
        if (inv.status === 'waived') {
          status = 'Waived'
        } else if (paidAmount >= totalAmount || inv.status === 'paid') {
          status = 'Paid'
        } else if (inv.status === 'partial') {
          status = 'Partial'
        }

        return {
          id: inv.invoiceNumber || `INV-${inv.invoiceId}`,
          invoiceId: inv.invoiceId, // Store invoiceId for dialog
          date: invoiceDate.toISOString().split('T')[0],
          amount: totalAmount,
          status: status,
          dueDate: dueDate.toISOString().split('T')[0],
          items: items,
          paymentMethod: inv.paymentMethod || 'N/A',
          paymentDate: inv.paymentDate ? new Date(inv.paymentDate).toISOString().split('T')[0] : null,
          insuranceCoverage: parseFloat(inv.insuranceCoverage || inv.insuranceAmount || 0),
          patientResponsibility: totalAmount - parseFloat(inv.insuranceCoverage || inv.insuranceAmount || 0)
        }
      }))

      // Sort by date descending
      bills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setInvoices(bills)
    } catch (err: any) {
      console.error("Error loading billing:", err)
      setError(err.message || "Failed to load billing information")
    } finally {
      setLoading(false)
    }
  }

  const loadPayments = async () => {
    try {
      setLoadingPayments(true)
      console.log('Loading payments for patientId:', patientId)
      const paymentsData = await billingApi.getPatientPayments(patientId)
      console.log('Payments data received:', paymentsData)
      setPayments(paymentsData || [])
    } catch (err: any) {
      console.error("Error loading payments:", err)
      setPayments([]) // Set empty array on error
    } finally {
      setLoadingPayments(false)
    }
  }

  const paidInvoices = invoices.filter((bill) => bill.status === "Paid")
  const pendingInvoices = invoices.filter((bill) => bill.status === "Pending" || bill.status === "Partial")
  const waivedInvoices = invoices.filter((bill) => bill.status === "Waived")

  // Calculate totals
  const totalBilled = invoices.reduce((sum, bill) => sum + bill.amount, 0)
  const totalPaid = paidInvoices.reduce((sum, bill) => sum + bill.amount, 0)
  const totalPending = pendingInvoices.reduce((sum, bill) => sum + bill.amount, 0)
  const totalInsuranceCoverage = invoices.reduce((sum, bill) => sum + bill.insuranceCoverage, 0)
  const totalPatientResponsibility = invoices.reduce((sum, bill) => sum + bill.patientResponsibility, 0)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing & Payments</CardTitle>
          <CardDescription>Invoice history and payment information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing & Payments</CardTitle>
          <CardDescription>Invoice history and payment information</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing & Payments</CardTitle>
        <CardDescription>Invoice history and payment information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Total Billed</div>
              <div className="text-2xl font-bold">KES {totalBilled.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Insurance Coverage</div>
              <div className="text-2xl font-bold">KES {totalInsuranceCoverage.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Patient Responsibility</div>
              <div className="text-2xl font-bold">KES {totalPatientResponsibility.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">All Invoices</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="waived">Waived</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {invoices.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Insurance</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">{bill.id}</TableCell>
                        <TableCell>{bill.date}</TableCell>
                        <TableCell>
                          <InvoiceItemsPreview items={bill.items} />
                        </TableCell>
                        <TableCell>KES {bill.amount.toLocaleString()}</TableCell>
                        <TableCell>KES {bill.insuranceCoverage.toLocaleString()}</TableCell>
                        <TableCell>KES {bill.patientResponsibility.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              bill.status === "Paid" ? "default" :
                              bill.status === "Waived" ? "outline" :
                              "secondary"
                            }
                          >
                            {bill.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="View invoice details"
                              onClick={() => {
                                if (bill.invoiceId) {
                                  setSelectedInvoiceId(bill.invoiceId.toString())
                                  setInvoiceDialogOpen(true)
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" title="Download PDF">
                              <Download className="h-4 w-4" />
                              <span className="sr-only">PDF</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No invoices found</div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingInvoices.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Insurance</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvoices.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">{bill.id}</TableCell>
                        <TableCell>{bill.date}</TableCell>
                        <TableCell>{bill.dueDate}</TableCell>
                        <TableCell>
                          <InvoiceItemsPreview items={bill.items} />
                        </TableCell>
                        <TableCell>KES {bill.amount.toLocaleString()}</TableCell>
                        <TableCell>KES {bill.insuranceCoverage.toLocaleString()}</TableCell>
                        <TableCell>KES {bill.patientResponsibility.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm">Pay Now</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No pending invoices found</div>
            )}
          </TabsContent>

          <TabsContent value="paid" className="space-y-4">
            {paidInvoices.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidInvoices.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">{bill.id}</TableCell>
                        <TableCell>{bill.date}</TableCell>
                        <TableCell>
                          <InvoiceItemsPreview items={bill.items} />
                        </TableCell>
                        <TableCell>KES {bill.amount.toLocaleString()}</TableCell>
                        <TableCell>{bill.paymentMethod}</TableCell>
                        <TableCell>{bill.paymentDate || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="View invoice details"
                              onClick={() => {
                                if (bill.invoiceId) {
                                  setSelectedInvoiceId(bill.invoiceId.toString())
                                  setInvoiceDialogOpen(true)
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (bill.invoiceId) {
                                  setSelectedInvoiceId(bill.invoiceId.toString())
                                  setReceiptDialogOpen(true)
                                }
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Receipt
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No paid invoices found</div>
            )}
          </TabsContent>

          <TabsContent value="waived" className="space-y-4">
            {waivedInvoices.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Insurance</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {waivedInvoices.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-medium">{bill.id}</TableCell>
                        <TableCell>{bill.date}</TableCell>
                        <TableCell>
                          <InvoiceItemsPreview items={bill.items} />
                        </TableCell>
                        <TableCell>KES {bill.amount.toLocaleString()}</TableCell>
                        <TableCell>KES {bill.insuranceCoverage.toLocaleString()}</TableCell>
                        <TableCell>KES {bill.patientResponsibility.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">Waived</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="View invoice details"
                              onClick={() => {
                                if (bill.invoiceId) {
                                  setSelectedInvoiceId(bill.invoiceId.toString())
                                  setInvoiceDialogOpen(true)
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" title="Download PDF">
                              <Download className="h-4 w-4" />
                              <span className="sr-only">PDF</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No waived invoices found</div>
            )}
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            {loadingPayments ? (
              <div className="text-center py-4">
                <Skeleton className="h-[200px] w-full" />
              </div>
            ) : payments.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Invoices</TableHead>
                      <TableHead className="text-right">Amount Paid</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment, index) => (
                      <TableRow
                        key={payment.batchReceiptNumber || `single-${index}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          if (payment.batchReceiptNumber) {
                            setSelectedBatchReceiptNumber(payment.batchReceiptNumber)
                            setGroupedReceiptOpen(true)
                          } else if (payment.invoices.length === 1) {
                            // Single invoice payment - show individual receipt
                            setSelectedInvoiceId(payment.invoices[0].invoiceId.toString())
                            setReceiptDialogOpen(true)
                          }
                        }}
                      >
                        <TableCell className="font-medium">
                          {payment.batchReceiptNumber || payment.invoices[0]?.invoiceNumber || 'N/A'}
                        </TableCell>
                        <TableCell>{payment.paymentDate}</TableCell>
                        <TableCell>{payment.paymentMethod || 'Cash'}</TableCell>
                        <TableCell>
                          {payment.invoices.length > 1 ? (
                            <Badge variant="secondary">{payment.invoices.length} invoices</Badge>
                          ) : (
                            <span>{payment.invoices[0]?.invoiceNumber || 'N/A'}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          KES {payment.totalAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (payment.batchReceiptNumber) {
                                setSelectedBatchReceiptNumber(payment.batchReceiptNumber)
                                setGroupedReceiptOpen(true)
                              } else if (payment.invoices.length === 1) {
                                setSelectedInvoiceId(payment.invoices[0].invoiceId.toString())
                                setReceiptDialogOpen(true)
                              }
                            }}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Receipt
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">No payments found</div>
            )}
          </TabsContent>
        </Tabs>

        <InvoiceDetailsDialog
          invoiceId={selectedInvoiceId}
          open={invoiceDialogOpen}
          onOpenChange={setInvoiceDialogOpen}
          onUpdate={loadBilling}
        />

        <PaymentReceiptDialog
          invoiceId={selectedInvoiceId}
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
        />

        <GroupedPaymentReceiptDialog
          batchReceiptNumber={selectedBatchReceiptNumber}
          patientId={patientId}
          open={groupedReceiptOpen}
          onOpenChange={setGroupedReceiptOpen}
        />
      </CardContent>
    </Card>
  )
}
