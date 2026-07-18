"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { billingApi, ledgerApi, queueApi, patientApi } from "@/lib/api"
import { Loader2, Receipt, DollarSign, AlertCircle, Printer, Download, Smartphone } from "lucide-react"
import { formatDate } from "@/lib/date-utils"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import { format } from "date-fns"
import { PaymentReceiptDialog } from "@/components/payment-receipt-dialog"
import { GroupedPaymentReceiptDialog } from "@/components/grouped-payment-receipt-dialog"
import { pollMpesaStkStatus, startMpesaStkPayment } from "@/lib/mpesa-stk"

interface ViewBillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: number
  queueId?: number
  queueNotes?: string
  onQueueCompleted?: () => void
}

export function ViewBillDialog({ open, onOpenChange, patientId, queueId, queueNotes, onQueueCompleted }: ViewBillDialogProps) {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set())
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [processingPayment, setProcessingPayment] = useState(false)
  const [showPaymentSection, setShowPaymentSection] = useState(false)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [groupedReceiptOpen, setGroupedReceiptOpen] = useState(false)
  const [selectedInvoiceIdForReceipt, setSelectedInvoiceIdForReceipt] = useState<string | null>(null)
  const [selectedBatchReceiptNumber, setSelectedBatchReceiptNumber] = useState<string | null>(null)
  const [mpesaPhone, setMpesaPhone] = useState("")
  const [stkWaiting, setStkWaiting] = useState(false)
  const [stkMessage, setStkMessage] = useState<string | null>(null)
  const { user } = useAuth()

  const paymentMethods = [
    { id: "cash", name: "Cash" },
    { id: "mpesa", name: "M-Pesa" },
    { id: "card", name: "Credit Card" },
    { id: "insurance", name: "Insurance" },
    { id: "bank", name: "Bank Transfer" },
  ]

  // Helper function to calculate invoice balance
  const calculateInvoiceBalance = (invoice: any) => {
    const totalAmount = parseFloat(invoice.totalAmount || 0)
    const paidAmount = parseFloat(invoice.paidAmount || 0)
    // Always calculate balance as totalAmount - paidAmount to ensure accuracy
    // The balance field from API might be incorrect, so we recalculate it
    const calculatedBalance = Math.max(0, totalAmount - paidAmount)
    return calculatedBalance
  }

  useEffect(() => {
    if (open && patientId) {
      loadPendingInvoices()
      // Reset payment state when dialog opens (selection will be set after invoices load)
      setPaymentMethod("cash")
      setPaymentReference("")
      setShowPaymentSection(false)
      setStkWaiting(false)
      setStkMessage(null)
      void patientApi
        .getById(patientId.toString())
        .then((p) => {
          if (p?.phone) setMpesaPhone(String(p.phone))
        })
        .catch(() => {})
    }
  }, [open, patientId])

  const loadPendingInvoices = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await billingApi.getPendingInvoicesForPatient(patientId.toString())
      setInvoices(data || [])

      // Select all invoices by default and calculate payment amount
      if (data && data.length > 0) {
        const allInvoiceIds = new Set(data.map((inv: any) => inv.invoiceId))
        setSelectedInvoices(allInvoiceIds)

        // Calculate and set payment amount immediately
        const total = data.reduce((sum: number, inv: any) => {
          return sum + calculateInvoiceBalance(inv)
        }, 0)
        if (total > 0) {
          setPaymentAmount(total.toFixed(2))
        } else {
          setPaymentAmount("")
        }
      } else {
        setSelectedInvoices(new Set())
        setPaymentAmount("")
      }
    } catch (err: any) {
      console.error("Error loading pending invoices:", err)
      setError(err.message || "Failed to load bills")
      setInvoices([])
      setSelectedInvoices(new Set())
      setPaymentAmount("")
    } finally {
      setLoading(false)
    }
  }

  // Convert Set to array for dependency tracking (ensures useEffect runs when selection changes)
  const selectedInvoiceIds = useMemo(() => {
    return Array.from(selectedInvoices).sort().join(',')
  }, [selectedInvoices])

  // Calculate total for selected invoices
  const selectedInvoicesTotal = useMemo(() => {
    if (selectedInvoices.size === 0) return 0
    return invoices
      .filter((inv) => selectedInvoices.has(inv.invoiceId))
      .reduce((sum, inv) => sum + calculateInvoiceBalance(inv), 0)
  }, [invoices, selectedInvoiceIds])

  // Auto-populate payment amount when selection changes (but not on initial load if already set)
  useEffect(() => {
    // Only update if we have invoices loaded and selection has changed
    if (invoices.length > 0 && selectedInvoices.size > 0) {
      const total = selectedInvoicesTotal
      if (total > 0) {
        // Always prepopulate with the total of selected invoices
        setPaymentAmount(total.toFixed(2))
      }
    } else if (selectedInvoices.size === 0 && invoices.length > 0) {
      // Clear payment amount if nothing is selected
      setPaymentAmount("")
    }
  }, [selectedInvoiceIds, selectedInvoicesTotal, invoices.length])

  // Calculate payment distribution
  const paymentDistribution = useMemo(() => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) return {}

    const totalPayment = parseFloat(paymentAmount)
    const selected = invoices.filter((inv) => selectedInvoices.has(inv.invoiceId))

    if (selected.length === 0) return {}

    const distribution: Record<number, number> = {}
    let remainingPayment = totalPayment

    // Distribute payment proportionally or fully pay invoices in order
    for (const invoice of selected) {
      const balance = calculateInvoiceBalance(invoice)
      if (remainingPayment <= 0) break

      if (remainingPayment >= balance) {
        distribution[invoice.invoiceId] = balance
        remainingPayment -= balance
      } else {
        distribution[invoice.invoiceId] = remainingPayment
        remainingPayment = 0
      }
    }

    return distribution
  }, [paymentAmount, invoices, selectedInvoices])

  const handleToggleInvoice = (invoiceId: number) => {
    const newSelected = new Set(selectedInvoices)
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId)
    } else {
      newSelected.add(invoiceId)
    }
    setSelectedInvoices(newSelected)
    // Payment amount will be auto-populated by useEffect
  }

  const handleSelectAll = () => {
    if (selectedInvoices.size === invoices.length) {
      setSelectedInvoices(new Set())
      // Payment amount will be cleared by useEffect
    } else {
      const allIds = new Set(invoices.map((inv) => inv.invoiceId))
      setSelectedInvoices(allIds)
      // Payment amount will be auto-populated by useEffect
    }
  }

  const handleProcessPayment = async () => {
    if (selectedInvoices.size === 0) {
      toast({
        title: "No invoices selected",
        description: "Please select at least one invoice to pay",
        variant: "destructive",
      })
      return
    }

    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({
        title: "Invalid payment amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      })
      return
    }

    const totalPayment = parseFloat(paymentAmount)
    const selected = invoices.filter((inv) => selectedInvoices.has(inv.invoiceId))
    const totalSelected = selected.reduce((sum, inv) => sum + calculateInvoiceBalance(inv), 0)

    if (totalPayment > totalSelected) {
      toast({
        title: "Payment amount too high",
        description: `Payment amount (${formatCurrency(totalPayment)}) exceeds selected invoices total (${formatCurrency(totalSelected)})`,
        variant: "destructive",
      })
      return
    }

    // M-Pesa STK: send prompt, wait for callback, invoices update automatically
    if (paymentMethod === "mpesa") {
      if (!mpesaPhone.trim()) {
        toast({
          title: "Phone required",
          description: "Enter the Safaricom number that will receive the M-Pesa prompt",
          variant: "destructive",
        })
        return
      }
      try {
        setProcessingPayment(true)
        setStkWaiting(true)
        setStkMessage("Sending M-Pesa prompt…")

        const batchReceiptNumber =
          selected.length > 1
            ? `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
            : null

        const allocations = selected
          .map((inv) => ({
            invoiceId: inv.invoiceId,
            amount: paymentDistribution[inv.invoiceId] || 0,
            invoiceNumber: inv.invoiceNumber,
          }))
          .filter((a) => a.amount > 0)

        const { checkoutRequestId, message } = await startMpesaStkPayment({
          amount: totalPayment,
          phone: mpesaPhone.trim(),
          patientId,
          allocations,
          batchReceiptNumber: batchReceiptNumber || undefined,
        })

        setStkMessage(message || "Prompt sent. Waiting for the customer to enter their M-Pesa PIN…")

        const result = await pollMpesaStkStatus(checkoutRequestId, {
          onTick: (s) => {
            if (s.status === "pending") {
              setStkMessage("Waiting for M-Pesa confirmation on the phone…")
            }
          },
        })

        if (result.status === "failed") {
          toast({
            title: "M-Pesa payment failed",
            description: result.resultDesc || "Customer cancelled or payment was not completed",
            variant: "destructive",
          })
          return
        }

        const receipt = result.mpesaReceiptNumber || paymentReference
        toast({
          title: "M-Pesa payment received",
          description: receipt
            ? `Receipt ${receipt}. Invoice(s) updated.`
            : "Payment confirmed and invoices updated.",
        })

        // Optional ledger entries (same as cash path)
        try {
          const accounts = await ledgerApi.getAccounts()
          const cashAccount = accounts.find(
            (acc: any) =>
              acc.accountType === "Asset" &&
              (acc.accountName.toLowerCase().includes("cash") ||
                acc.accountCode?.toLowerCase().includes("cash") ||
                acc.accountName.toLowerCase().includes("mpesa") ||
                acc.accountName.toLowerCase().includes("mobile"))
          )
          const receivableAccount = accounts.find(
            (acc: any) =>
              acc.accountType === "Asset" &&
              (acc.accountName.toLowerCase().includes("receivable") ||
                acc.accountCode?.toLowerCase().includes("receivable"))
          )
          if (cashAccount && receivableAccount) {
            for (const a of allocations) {
              await ledgerApi.createTransaction({
                transactionDate: format(new Date(), "yyyy-MM-dd"),
                description: `M-Pesa payment for Invoice ${a.invoiceNumber || a.invoiceId}`,
                referenceNumber: String(receipt || a.invoiceNumber || a.invoiceId),
                referenceType: "payment",
                debitAccountId: cashAccount.accountId,
                creditAccountId: receivableAccount.accountId,
                amount: a.amount,
                notes: `M-Pesa STK ${checkoutRequestId}`,
                postedBy: user?.id || undefined,
              }).catch(() => {})
            }
          }
        } catch {
          /* journal optional */
        }

        await loadPendingInvoices()
        if (batchReceiptNumber && selected.length > 1) {
          setSelectedBatchReceiptNumber(batchReceiptNumber)
          setGroupedReceiptOpen(true)
        } else if (allocations.length === 1) {
          setSelectedInvoiceIdForReceipt(String(allocations[0].invoiceId))
          setReceiptDialogOpen(true)
        }
        onQueueCompleted?.()
      } catch (err: any) {
        toast({
          title: "M-Pesa STK failed",
          description: err.message || "Could not complete M-Pesa payment",
          variant: "destructive",
        })
      } finally {
        setProcessingPayment(false)
        setStkWaiting(false)
        setStkMessage(null)
      }
      return
    }

    try {
      setProcessingPayment(true)

      // Generate a unique batch receipt number for grouped payments
      const batchReceiptNumber = selected.length > 1
        ? `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        : null

      // Process payment for each selected invoice
      const paymentResults = []
      for (const invoice of selected) {
        const amountToPay = paymentDistribution[invoice.invoiceId] || 0
        if (amountToPay <= 0) continue

        try {
          // Record payment
          const paymentDate = format(new Date(), "yyyy-MM-dd")
          const batchNote = batchReceiptNumber
            ? `Batch Receipt: ${batchReceiptNumber} | Batch Amount: ${amountToPay.toFixed(2)}`
            : ''
          await billingApi.recordPayment(invoice.invoiceId.toString(), {
            paymentAmount: amountToPay,
            paymentDate,
            paymentMethod,
            referenceNumber: batchReceiptNumber || paymentReference || undefined,
            notes: `Payment processed from cashier queue. ${selected.length > 1 ? `Part of batch payment. ${batchNote}` : ""}`,
            batchReceiptNumber: batchReceiptNumber || undefined,
          })

          paymentResults.push({
            invoiceId: invoice.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            amount: amountToPay,
            success: true,
          })
        } catch (err: any) {
          console.error(`Error processing payment for invoice ${invoice.invoiceId}:`, err)
          paymentResults.push({
            invoiceId: invoice.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            amount: amountToPay,
            success: false,
            error: err.message,
          })
        }
      }

      // Post journal entries for successful payments
      const successfulPayments = paymentResults.filter((r) => r.success)
      if (successfulPayments.length > 0) {
        try {
          // Get accounts - try to find Cash and Accounts Receivable accounts
          const accounts = await ledgerApi.getAccounts()
          const cashAccount = accounts.find(
            (acc: any) =>
              acc.accountType === "Asset" &&
              (acc.accountName.toLowerCase().includes("cash") ||
                acc.accountCode?.toLowerCase().includes("cash"))
          )
          const receivableAccount = accounts.find(
            (acc: any) =>
              acc.accountType === "Asset" &&
              (acc.accountName.toLowerCase().includes("receivable") ||
                acc.accountCode?.toLowerCase().includes("receivable"))
          )

          if (cashAccount && receivableAccount) {
            // Create journal entry for each payment
            for (const payment of successfulPayments) {
              try {
                await ledgerApi.createTransaction({
                  transactionDate: format(new Date(), "yyyy-MM-dd"),
                  description: `Payment received for Invoice ${payment.invoiceNumber}`,
                  referenceNumber: payment.invoiceNumber,
                  referenceType: "payment",
                  debitAccountId: cashAccount.accountId,
                  creditAccountId: receivableAccount.accountId,
                  amount: payment.amount,
                  notes: `Payment method: ${paymentMethod}${paymentReference ? `, Reference: ${paymentReference}` : ""}`,
                  postedBy: user?.id || undefined,
                })
              } catch (err: any) {
                console.error(`Error creating journal entry for payment ${payment.invoiceNumber}:`, err)
                // Continue even if journal entry fails - payment is already recorded
              }
            }
          } else {
            console.warn("Could not find Cash or Accounts Receivable accounts for journal entry")
            // Payment is still successful, just journal entry wasn't created
          }
        } catch (err: any) {
          console.error("Error posting journal entries:", err)
          // Payment is still successful, just journal entry wasn't created
        }
      }

      // Show results
      const successCount = successfulPayments.length
      const failCount = paymentResults.length - successCount

      if (successCount > 0) {
        toast({
          title: "Payment processed",
          description: `Successfully processed ${successCount} payment(s)${failCount > 0 ? `, ${failCount} failed` : ""}. ${batchReceiptNumber && selected.length > 1 ? `Receipt: ${batchReceiptNumber}` : ''}`,
        })

        // Open receipt dialog after successful payment
        if (batchReceiptNumber && selected.length > 1) {
          // Grouped payment - show grouped receipt
          setSelectedBatchReceiptNumber(batchReceiptNumber)
          setGroupedReceiptOpen(true)
        } else if (successfulPayments.length === 1) {
          // Single payment - show individual receipt
          setSelectedInvoiceIdForReceipt(successfulPayments[0].invoiceId.toString())
          setReceiptDialogOpen(true)
        }
      }

      if (failCount > 0) {
        toast({
          title: "Some payments failed",
          description: `${failCount} payment(s) could not be processed. Please check and retry.`,
          variant: "destructive",
        })
      }

      // Reload invoices and reset state
      await loadPendingInvoices()

      // Check if all invoices are now paid and complete the queue entry if applicable
      if (queueId && successfulPayments.length > 0) {
        try {
          // Check if patient has any remaining pending invoices
          const remainingInvoices = await billingApi.getPendingInvoicesForPatient(patientId.toString())
          const hasPendingInvoices = remainingInvoices && remainingInvoices.length > 0 &&
            remainingInvoices.some((inv: any) => {
              const balance = calculateInvoiceBalance(inv)
              return balance > 0
            })

          // If no pending invoices, complete and archive the queue entry
          if (!hasPendingInvoices) {
            try {
              // Update queue status to completed
              await queueApi.updateStatus(queueId.toString(), 'completed')

              // Archive the queue entry
              await queueApi.archive(queueId.toString())

              toast({
                title: "Queue entry completed",
                description: "All invoices are paid. Patient has been removed from the cashier queue.",
              })

              // Notify parent component to refresh queue
              if (onQueueCompleted) {
                onQueueCompleted()
              }
            } catch (err: any) {
              console.error("Error completing queue entry:", err)
              // Don't show error to user as payment was successful
            }
          }
        } catch (err: any) {
          console.error("Error checking remaining invoices:", err)
          // Continue even if check fails
        }
      }

      setSelectedInvoices(new Set())
      setPaymentAmount("")
      setPaymentReference("")
      setShowPaymentSection(false)
    } catch (err: any) {
      console.error("Error processing payment:", err)
      toast({
        title: "Error processing payment",
        description: err.message || "Failed to process payment",
        variant: "destructive",
      })
    } finally {
      setProcessingPayment(false)
    }
  }

  const formatCurrency = (amount: number | string | null) => {
    if (amount === null || amount === undefined) return "KES 0.00"
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return `KES ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handlePrintInvoice = async (invoice: any) => {
    try {
      // Fetch full invoice details with items
      const invoiceDetails = await billingApi.getInvoiceById(invoice.invoiceId.toString())
      const printWindow = window.open('', '_blank')
      if (!printWindow) return

      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invoice ${invoiceDetails.invoiceNumber}</title>
            <style>
              @media print {
                @page { margin: 20mm; }
                body { margin: 0; }
              }
              body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 20px;
                margin-bottom: 30px;
              }
              .header img {
                max-width: 250px;
                height: auto;
                margin-bottom: 15px;
                display: block;
                margin-left: auto;
                margin-right: auto;
              }
              .header h1 { margin: 0; font-size: 24px; }
              .header p { margin: 5px 0; color: #666; }
              .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 30px;
              }
              .info-section h3 {
                margin-top: 0;
                border-bottom: 1px solid #ddd;
                padding-bottom: 5px;
              }
              .info-row {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
              }
              .info-label { font-weight: bold; }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
              }
              th, td {
                border: 1px solid #ddd;
                padding: 10px;
                text-align: left;
              }
              th {
                background-color: #f5f5f5;
                font-weight: bold;
              }
              .text-right { text-align: right; }
              .total-row {
                font-weight: bold;
                background-color: #f9f9f9;
              }
              .summary {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 2px solid #000;
              }
              .summary-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 16px;
              }
              .summary-total {
                font-size: 20px;
                font-weight: bold;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 2px solid #000;
              }
              .footer {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #ddd;
                text-align: center;
                color: #666;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <img src="${window.location.origin}/logo.png" alt="Kiplombe Medical Centre" style="max-width: 250px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
              <div style="display: none;">
                <h1 style="margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 2px;">KIPLOMBE</h1>
                <h2 style="margin: 5px 0; font-size: 18px; color: #333;">Medical Centre</h2>
              </div>
              <h1 style="margin-top: 20px;">INVOICE</h1>
              <p>Invoice Number: ${invoiceDetails.invoiceNumber}</p>
              <p>Date: ${invoiceDetails.invoiceDate ? formatDate(invoiceDetails.invoiceDate) : 'N/A'}</p>
            </div>

            <div class="info-grid">
              <div class="info-section">
                <h3>Bill To:</h3>
                <div class="info-row">
                  <span class="info-label">Patient:</span>
                  <span>${invoiceDetails.patientFirstName || ''} ${invoiceDetails.patientLastName || ''}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Patient Number:</span>
                  <span>${invoiceDetails.patientNumber || 'N/A'}</span>
                </div>
              </div>
              <div class="info-section">
                <h3>Invoice Details:</h3>
                <div class="info-row">
                  <span class="info-label">Invoice Date:</span>
                  <span>${invoiceDetails.invoiceDate ? formatDate(invoiceDetails.invoiceDate) : 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Due Date:</span>
                  <span>${invoiceDetails.dueDate ? formatDate(invoiceDetails.dueDate) : 'N/A'}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Status:</span>
                  <span>${invoiceDetails.status?.toUpperCase() || 'PENDING'}</span>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceDetails.items && invoiceDetails.items.length > 0 ? invoiceDetails.items.map((item: any) => {
                  let displayName = item.chargeName || item.description || item.itemDescription || 'Service';
                  if (displayName.includes('Prescription Item:') && item.medicationName) {
                    if (displayName.includes('Unknown')) {
                      displayName = 'Prescription Item: ' + item.medicationName;
                    } else {
                      displayName = 'Prescription Item: ' + item.medicationName;
                    }
                  }
                  const unitPrice = formatCurrency(parseFloat(item.unitPrice || item.price || 0));
                  const totalPrice = formatCurrency(parseFloat(item.totalPrice || item.total || 0));
                  return '<tr>' +
                    '<td>' + displayName + '</td>' +
                    '<td class="text-right">' + (item.quantity || 1) + '</td>' +
                    '<td class="text-right">' + unitPrice + '</td>' +
                    '<td class="text-right">' + totalPrice + '</td>' +
                    '</tr>';
                }).join('') : '<tr><td colspan="4" style="text-align: center;">No items</td></tr>'}
                <tr class="total-row">
                  <td colspan="3" class="text-right"><strong>Total</strong></td>
                  <td class="text-right"><strong>${formatCurrency(parseFloat(invoiceDetails.totalAmount || 0))}</strong></td>
                </tr>
              </tbody>
            </table>

            <div class="summary">
              <div class="summary-row">
                <span>Subtotal:</span>
                <span>${formatCurrency(parseFloat(invoiceDetails.totalAmount || 0))}</span>
              </div>
              ${parseFloat(invoiceDetails.paidAmount || 0) > 0 ? `
                <div class="summary-row">
                  <span>Paid Amount:</span>
                  <span>${formatCurrency(parseFloat(invoiceDetails.paidAmount || 0))}</span>
                </div>
              ` : ''}
              ${parseFloat(invoiceDetails.balance || invoiceDetails.totalAmount || 0) > 0 ? `
                <div class="summary-row">
                  <span>Balance:</span>
                  <span>${formatCurrency(parseFloat(invoiceDetails.balance || invoiceDetails.totalAmount || 0))}</span>
                </div>
              ` : ''}
            </div>

            ${invoiceDetails.notes ? `
              <div style="margin-top: 30px;">
                <h3>Notes:</h3>
                <p>${invoiceDetails.notes}</p>
              </div>
            ` : ''}

            <div class="footer">
              <p>Generated on ${new Date().toLocaleString()}</p>
              <p>Thank you for your business!</p>
            </div>
          </body>
        </html>
      `

      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
        }, 250)
      }
    } catch (error: any) {
      console.error('Error printing invoice:', error)
      toast({
        title: "Error",
        description: "Failed to load invoice for printing",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return <Badge variant="default">Paid</Badge>
      case "partial":
        return <Badge variant="secondary">Partial</Badge>
      case "pending":
        return <Badge variant="outline">Pending</Badge>
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status || "Pending"}</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Patient Bills
          </DialogTitle>
          <DialogDescription>
            View and manage patient invoices and billing details
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading bills...</span>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              No pending bills found for this patient
            </p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-8 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No pending bills found for this patient</p>
            {queueNotes && (
              <p className="text-xs text-muted-foreground mt-2">
                Bill may need to be created based on: {queueNotes}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Payment Section */}
            {showPaymentSection && invoices.length > 0 && (
              <div className="border rounded-lg p-4 bg-muted/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Process Payment
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPaymentSection(false)}
                  >
                    Hide
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">Payment Amount *</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                    />
                    {selectedInvoices.size > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Selected invoices total: {formatCurrency(selectedInvoicesTotal)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger id="paymentMethod">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentReference">Reference Number (Optional)</Label>
                  <Input
                    id="paymentReference"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Receipt number, transaction ID, etc."
                    disabled={paymentMethod === "mpesa"}
                  />
                  {paymentMethod === "mpesa" && (
                    <p className="text-xs text-muted-foreground">
                      M-Pesa receipt is filled automatically after the customer pays.
                    </p>
                  )}
                </div>

                {paymentMethod === "mpesa" && (
                  <div className="space-y-2">
                    <Label htmlFor="mpesaPhone">M-Pesa phone number *</Label>
                    <Input
                      id="mpesaPhone"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="07XXXXXXXX or 2547XXXXXXXX"
                      disabled={processingPayment}
                    />
                    <p className="text-xs text-muted-foreground">
                      An STK prompt will be sent to this Safaricom number. Do not record the payment until the
                      customer completes the PIN prompt.
                    </p>
                    {stkMessage && (
                      <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md">
                        <Smartphone className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                        <p className="text-sm text-emerald-900 dark:text-emerald-100">{stkMessage}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedInvoices.size > 0 && Object.keys(paymentDistribution).length > 0 && (
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-sm font-medium">Payment Distribution:</p>
                    <div className="space-y-1">
                      {invoices
                        .filter((inv) => selectedInvoices.has(inv.invoiceId))
                        .map((inv) => {
                          const amount = paymentDistribution[inv.invoiceId] || 0
                          const balance = calculateInvoiceBalance(inv)
                          return (
                            <div
                              key={inv.invoiceId}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                Invoice {inv.invoiceNumber}:
                              </span>
                              <span className="font-medium">
                                {formatCurrency(amount)}
                                {amount < balance && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    (partial)
                                  </span>
                                )}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {paymentAmount && parseFloat(paymentAmount) > selectedInvoicesTotal && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Payment amount exceeds selected invoices total. Only selected invoices will be
                      paid.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPaymentSection(false)
                      setPaymentAmount("")
                      setPaymentReference("")
                    }}
                    disabled={processingPayment}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleProcessPayment}
                    disabled={
                      processingPayment ||
                      selectedInvoices.size === 0 ||
                      !paymentAmount ||
                      parseFloat(paymentAmount) <= 0 ||
                      (paymentMethod === "mpesa" && !mpesaPhone.trim())
                    }
                  >
                    {processingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {stkWaiting ? "Waiting for M-Pesa…" : "Processing..."}
                      </>
                    ) : paymentMethod === "mpesa" ? (
                      <>
                        <Smartphone className="mr-2 h-4 w-4" />
                        Send M-Pesa Prompt
                      </>
                    ) : (
                      <>
                        <DollarSign className="mr-2 h-4 w-4" />
                        Process Payment
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Invoices List */}
            <div className="space-y-4">
              {invoices.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedInvoices.size === invoices.length && invoices.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                    <Label className="text-sm font-medium">
                      Select All ({invoices.length} invoices)
                    </Label>
                  </div>
                  {!showPaymentSection && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowPaymentSection(true)}
                      disabled={selectedInvoices.size === 0}
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Pay Selected ({selectedInvoices.size})
                    </Button>
                  )}
                </div>
              )}

              {invoices.map((invoice) => {
                const isSelected = selectedInvoices.has(invoice.invoiceId)
                const balance = calculateInvoiceBalance(invoice)
                const distributionAmount = paymentDistribution[invoice.invoiceId] || 0

                return (
                  <div
                    key={invoice.invoiceId}
                    className={`border rounded-lg p-4 space-y-4 ${
                      isSelected ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleInvoice(invoice.invoiceId)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">Invoice #{invoice.invoiceNumber}</h3>
                          <p className="text-sm text-muted-foreground">
                            Date: {formatDate(invoice.invoiceDate)}
                            {invoice.dueDate && ` | Due: ${formatDate(invoice.dueDate)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrintInvoice(invoice)}
                        >
                          <Printer className="h-4 w-4 mr-1" />
                          Print
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrintInvoice(invoice)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(invoice.status)}
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground">Total Amount</p>
                          <p className="text-lg font-bold">{formatCurrency(invoice.totalAmount)}</p>
                          {invoice.paidAmount > 0 && (
                            <>
                              <p className="text-xs text-muted-foreground mt-1">
                                Paid: {formatCurrency(invoice.paidAmount)}
                              </p>
                              <p className="text-xs font-medium">
                                Balance: {formatCurrency(balance)}
                              </p>
                            </>
                          )}
                          {isSelected && distributionAmount > 0 && (
                            <p className="text-xs text-primary font-medium mt-1">
                              Will pay: {formatCurrency(distributionAmount)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                {invoice.items && invoice.items.length > 0 && (
                  <div className="border-t pt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoice.items.map((item: any) => {
                          // For prescription items, use medicationName if available
                          let displayName = item.chargeName || item.description || "Item";
                          if (displayName.includes('Prescription Item:') && item.medicationName) {
                            if (displayName.includes('Unknown')) {
                              displayName = `Prescription Item: ${item.medicationName}`;
                            } else {
                              displayName = `Prescription Item: ${item.medicationName}`;
                            }
                          }

                          return (
                            <TableRow key={item.itemId}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">
                                    {displayName}
                                  </div>
                                  {item.chargeCode && (
                                    <div className="text-xs text-muted-foreground">
                                      Code: {item.chargeCode}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            <TableCell className="text-right">{item.quantity || 1}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.unitPrice)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.totalPrice)}
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {invoice.notes && (
                  <div className="border-t pt-4">
                    <p className="text-sm">
                      <span className="font-medium">Notes: </span>
                      <span className="text-muted-foreground">{invoice.notes}</span>
                    </p>
                  </div>
                )}
                  </div>
                )
              })}
            </div>

            {invoices.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Pending Amount:</span>
                  <span className="text-xl font-bold">
                    {formatCurrency(
                      invoices.reduce((sum, inv) => sum + calculateInvoiceBalance(inv), 0)
                    )}
                  </span>
                </div>
                {selectedInvoices.size > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Selected Invoices Total:</span>
                    <span className="text-lg font-semibold text-primary">
                      {formatCurrency(selectedInvoicesTotal)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Receipt Dialogs */}
      <PaymentReceiptDialog
        invoiceId={selectedInvoiceIdForReceipt}
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
      />

      <GroupedPaymentReceiptDialog
        batchReceiptNumber={selectedBatchReceiptNumber}
        patientId={patientId.toString()}
        open={groupedReceiptOpen}
        onOpenChange={setGroupedReceiptOpen}
      />
    </Dialog>
  )
}


