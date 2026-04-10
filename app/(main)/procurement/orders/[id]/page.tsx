"use client"

import { useState, useEffect } from "react"
import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Printer, Download, Edit, ArrowLeft, CheckCircle, XCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { BreadcrumbsEnhanced } from "@/components/breadcrumbs-enhanced"
import { purchaseOrderApi } from "@/lib/api"

export default function ProcurementOrderDetailPage() {
  const orderId = useResolvedRouteParam("id", StaticRouteRegex.procurementOrderId)
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadOrder = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await purchaseOrderApi.getById(orderId)
        setOrder(data)
      } catch (err: any) {
        console.error('Error loading purchase order:', err)
        setError(err.message || 'Failed to load purchase order')
      } finally {
        setLoading(false)
      }
    }

    if (orderId) {
      loadOrder()
    }
  }, [orderId])

  // Function to render status badge with appropriate color
  const renderStatusBadge = (status: string) => {
    const statusMap: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" }
    > = {
      draft: { label: "Draft", variant: "outline" },
      sent: { label: "Sent", variant: "secondary" },
      partial_received: { label: "Partial Received", variant: "secondary" },
      received: { label: "Received", variant: "default" },
      cancelled: { label: "Cancelled", variant: "destructive" },
    }

    const { label, variant } = statusMap[status] || { label: status, variant: "outline" }

    return <Badge variant={variant}>{label}</Badge>
  }

  // Function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Loading purchase order details...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h1 className="text-2xl font-bold">Purchase Order Not Found</h1>
        <p className="text-muted-foreground">
          {error || `The purchase order with ID ${orderId} could not be found.`}
        </p>
        <Link href="/procurement/orders" className="mt-4">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Orders
          </Button>
        </Link>
      </div>
    )
  }

  // Transform API data to match component expectations
  const transformedOrder = {
    id: order.poNumber || order.purchaseOrderId?.toString(),
    vendorId: order.vendorId,
    vendorName: order.vendorName || "Unknown Vendor",
    vendorAddress: order.address || "",
    vendorContact: order.phone || "",
    dateCreated: order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : "",
    dateRequired: order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toISOString().split('T')[0] : "",
    status: order.status || "draft",
    approvedBy: order.approvedBy || null,
    approvedDate: order.approvedDate || null,
    totalAmount: parseFloat(order.subtotal || order.totalAmount || 0),
    tax: parseFloat(order.tax || 0),
    grandTotal: parseFloat(order.totalAmount || 0),
    notes: order.notes || "",
    items: (order.items || []).map((item: any, index: number) => ({
      id: item.itemId || index + 1,
      productId: item.inventoryItemCode || item.itemDescription?.substring(0, 10) || `ITEM-${index + 1}`,
      description: item.itemDescription || "Item",
      quantity: parseInt(item.quantity || 0),
      unitPrice: parseFloat(item.unitPrice || 0),
      total: parseFloat(item.totalPrice || 0),
    })),
  }

  return (
    <div className="space-y-4">
      <BreadcrumbsEnhanced />

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Link href="/procurement/orders">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Order: {transformedOrder.id}</h1>
          {renderStatusBadge(transformedOrder.status)}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Order Details</CardTitle>
            <CardDescription>Purchase order information and line items</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Order Header Information */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Vendor</h3>
                <div className="font-medium">{transformedOrder.vendorName}</div>
                <div className="text-sm">{transformedOrder.vendorAddress || "-"}</div>
                <div className="text-sm">{transformedOrder.vendorContact || "-"}</div>
              </div>
              <div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Order Date</h3>
                    <div>{transformedOrder.dateCreated}</div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Required By</h3>
                    <div>{transformedOrder.dateRequired}</div>
                  </div>
                </div>
                {transformedOrder.approvedBy && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Approved By</h3>
                    <div>
                      {transformedOrder.approvedBy} {transformedOrder.approvedDate && `on ${transformedOrder.approvedDate}`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Order Items */}
            <div>
              <h3 className="text-lg font-medium mb-3">Order Items</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transformedOrder.items && transformedOrder.items.length > 0 ? (
                      transformedOrder.items.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.productId}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                          No items found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end mt-4">
                <div className="w-[250px] space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(transformedOrder.totalAmount)}</span>
                  </div>
                  {transformedOrder.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Tax:</span>
                      <span>{formatCurrency(transformedOrder.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium text-base">
                    <span>Total:</span>
                    <span>{formatCurrency(transformedOrder.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {transformedOrder.notes && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Notes</h3>
                <div className="text-sm p-3 bg-muted rounded-md">{transformedOrder.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Order Status</CardTitle>
            <CardDescription>Track the current status of this order</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <div className="font-medium">Created</div>
                  <div className="text-sm text-muted-foreground">{transformedOrder.dateCreated}</div>
                  <div className="text-sm">Order created by {order.createdByFirstName || "System"} {order.createdByLastName || "Administrator"}</div>
                </div>
              </div>

              {transformedOrder.status === "sent" || transformedOrder.status === "partial_received" || transformedOrder.status === "received" ? (
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">Sent to Vendor</div>
                    <div className="text-sm text-muted-foreground">{transformedOrder.dateCreated}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full border-2 border-muted mt-0.5" />
                  <div>
                    <div className="font-medium">Sent to Vendor</div>
                    <div className="text-sm text-muted-foreground">Pending</div>
                  </div>
                </div>
              )}

              {transformedOrder.status === "received" ? (
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">Received</div>
                    <div className="text-sm text-muted-foreground">{transformedOrder.dateRequired}</div>
                  </div>
                </div>
              ) : transformedOrder.status === "partial_received" ? (
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div>
                    <div className="font-medium">Partially Received</div>
                    <div className="text-sm text-muted-foreground">In Progress</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full border-2 border-muted mt-0.5" />
                  <div>
                    <div className="font-medium">Received</div>
                    <div className="text-sm text-muted-foreground">Pending</div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <div className="w-full space-y-2">
              {transformedOrder.status === "draft" && (
                <Button className="w-full">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Send to Vendor
                </Button>
              )}
              {transformedOrder.status === "sent" && (
                <Button className="w-full">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark as Received
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
