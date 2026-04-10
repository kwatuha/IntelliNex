"use client"

import { useState, useEffect } from "react"
import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"
import { vendorApi, purchaseOrderApi } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileEdit, Mail, Phone, Printer, Download, Star, Calendar, FileText, AlertTriangle, Loader2, PlusCircle, Trash2, Eye } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { VendorRatingForm } from "@/components/vendor-rating-form"
import { VendorProductForm } from "@/components/vendor-product-form"
import { VendorContractForm } from "@/components/vendor-contract-form"
import { VendorDocumentForm } from "@/components/vendor-document-form"
import { VendorPurchaseOrderForm } from "@/components/vendor-purchase-order-form"
import { VendorIssueForm } from "@/components/vendor-issue-form"
import { toast } from "@/components/ui/use-toast"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Legacy sample data for sections that don't have API support yet
const sampleVendorData = {
  V001: {
    id: "V001",
    name: "MediSupply Co.",
    contact: "John Smith",
    email: "john@medisupply.com",
    phone: "+254 712 345 678",
    category: "Medical Supplies",
    status: "Active",
    address: "123 Kimathi Street, Nairobi",
    website: "www.medisupply.co.ke",
    taxId: "KRA-12345678",
    registrationDate: "2020-05-15",
    paymentTerms: "Net 30",
    bankAccount: "ACC-123456789",
    bankName: "Kenya Commercial Bank",
    notes: "Preferred supplier for surgical equipment and disposables.",
    rating: 4.8,
    onTimeDelivery: 95,
    qualityScore: 98,
    responseTime: 4.8,
    costSavings: 12,
    products: [
      { id: "P001", name: "Surgical Gloves", category: "Disposables", unitPrice: 500, unit: "Box" },
      { id: "P002", name: "Surgical Masks", category: "Disposables", unitPrice: 300, unit: "Box" },
      { id: "P003", name: "Stethoscope", category: "Equipment", unitPrice: 3500, unit: "Piece" },
      { id: "P004", name: "Blood Pressure Monitor", category: "Equipment", unitPrice: 8000, unit: "Piece" },
    ],
    orders: [
      { id: "PO001", date: "2023-05-15", amount: "KES 250,000", status: "Delivered" },
      { id: "PO005", date: "2023-04-10", amount: "KES 180,000", status: "Delivered" },
      { id: "PO010", date: "2023-03-05", amount: "KES 320,000", status: "Delivered" },
    ],
    contacts: [
      { name: "John Smith", position: "Sales Manager", phone: "+254 712 345 678", email: "john@medisupply.com" },
      { name: "Jane Doe", position: "Account Manager", phone: "+254 723 456 789", email: "jane@medisupply.com" },
    ],
    documents: [
      { id: "D001", name: "Registration Certificate", type: "PDF", date: "2020-05-15", size: "1.2 MB" },
      { id: "D002", name: "Tax Compliance Certificate", type: "PDF", date: "2023-01-10", size: "0.8 MB" },
      { id: "D003", name: "Product Catalog", type: "PDF", date: "2023-03-22", size: "4.5 MB" },
      { id: "D004", name: "ISO 9001 Certificate", type: "PDF", date: "2022-11-05", size: "1.5 MB" },
    ],
    ratings: [
      {
        id: "R001",
        user: "Dr. Sarah Kamau",
        department: "Surgery",
        date: "2023-04-15",
        overall: 4.8,
        quality: 5,
        delivery: 4.5,
        service: 5,
        pricing: 4.5,
        communication: 5,
        comment:
          "Excellent supplier with high-quality products. Delivery is usually on time, and their customer service is exceptional.",
      },
      {
        id: "R002",
        user: "James Omondi",
        department: "Procurement",
        date: "2023-02-20",
        overall: 4.6,
        quality: 5,
        delivery: 4,
        service: 5,
        pricing: 4,
        communication: 5,
        comment:
          "Very reliable vendor with competitive pricing. Occasionally delayed deliveries but always communicates proactively.",
      },
    ],
    issues: [
      {
        id: "I001",
        title: "Delayed Delivery",
        date: "2023-02-05",
        status: "Resolved",
        description: "Order PO007 was delivered 3 days late due to transportation issues.",
        resolution: "Vendor provided a 5% discount on the next order as compensation.",
      },
      {
        id: "I002",
        title: "Product Quality Issue",
        date: "2022-11-15",
        status: "Resolved",
        description: "Batch of surgical masks had defective ear loops.",
        resolution: "Vendor replaced the entire batch at no additional cost.",
      },
    ],
    contract: {
      id: "C001",
      startDate: "2022-06-01",
      endDate: "2024-05-31",
      status: "Active",
      value: "KES 5,000,000",
      type: "Annual Supply",
      renewalOption: "Yes",
      keyTerms: [
        "Delivery within 7 days of order",
        "Payment terms: Net 30",
        "Quality assurance guarantee",
        "Price lock for contract duration",
        "Quarterly performance review",
      ],
    },
  },
  V002: {
    id: "V002",
    name: "PharmaTech Ltd",
    contact: "Jane Doe",
    email: "jane@pharmatech.com",
    phone: "+254 723 456 789",
    category: "Pharmaceuticals",
    status: "Active",
    address: "456 Kenyatta Avenue, Nairobi",
    website: "www.pharmatech.co.ke",
    taxId: "KRA-23456789",
    registrationDate: "2019-08-20",
    paymentTerms: "Net 45",
    bankAccount: "ACC-234567890",
    bankName: "Equity Bank",
    notes: "Main supplier for antibiotics and specialized medications.",
    rating: 4.5,
    onTimeDelivery: 92,
    qualityScore: 95,
    responseTime: 4.5,
    costSavings: 8,
    products: [
      { id: "P005", name: "Amoxicillin", category: "Antibiotics", unitPrice: 1200, unit: "Pack" },
      { id: "P006", name: "Paracetamol", category: "Analgesics", unitPrice: 500, unit: "Pack" },
      { id: "P007", name: "Insulin", category: "Hormones", unitPrice: 3000, unit: "Vial" },
    ],
    orders: [
      { id: "PO002", date: "2023-05-20", amount: "KES 180,000", status: "Pending" },
      { id: "PO006", date: "2023-04-15", amount: "KES 220,000", status: "Delivered" },
      { id: "PO011", date: "2023-03-10", amount: "KES 150,000", status: "Delivered" },
    ],
    contacts: [
      { name: "Jane Doe", position: "Sales Director", phone: "+254 723 456 789", email: "jane@pharmatech.com" },
      {
        name: "Robert Johnson",
        position: "Technical Support",
        phone: "+254 734 567 890",
        email: "robert@pharmatech.com",
      },
    ],
    documents: [
      { id: "D001", name: "Registration Certificate", type: "PDF", date: "2019-08-20", size: "1.1 MB" },
      { id: "D002", name: "Tax Compliance Certificate", type: "PDF", date: "2023-02-15", size: "0.9 MB" },
      { id: "D003", name: "Product Catalog", type: "PDF", date: "2023-01-10", size: "5.2 MB" },
      { id: "D004", name: "GMP Certificate", type: "PDF", date: "2022-10-12", size: "1.3 MB" },
    ],
    ratings: [
      {
        id: "R001",
        user: "Dr. Michael Njoroge",
        department: "Pharmacy",
        date: "2023-03-25",
        overall: 4.5,
        quality: 5,
        delivery: 4,
        service: 4.5,
        pricing: 4,
        communication: 5,
        comment:
          "Reliable pharmaceutical supplier with excellent product quality. Occasionally delayed deliveries but good communication.",
      },
    ],
    issues: [
      {
        id: "I001",
        title: "Incorrect Order Quantity",
        date: "2023-01-12",
        status: "Resolved",
        description: "Received 50 packs of Paracetamol instead of the ordered 100 packs.",
        resolution: "Vendor delivered the remaining 50 packs the next day with an apology.",
      },
    ],
    contract: {
      id: "C002",
      startDate: "2022-09-15",
      endDate: "2024-09-14",
      status: "Active",
      value: "KES 3,500,000",
      type: "Exclusive Supply",
      renewalOption: "Yes",
      keyTerms: [
        "Exclusive supplier for listed medications",
        "Payment terms: Net 45",
        "Monthly inventory review",
        "Emergency delivery within 24 hours",
        "Annual price negotiation",
      ],
    },
  },
  V003: {
    id: "V003",
    name: "CleanPro Services",
    contact: "Michael Johnson",
    email: "michael@cleanpro.com",
    phone: "+254 734 567 890",
    category: "Cleaning Supplies",
    status: "Inactive",
    address: "789 Moi Avenue, Nairobi",
    website: "www.cleanpro.co.ke",
    taxId: "KRA-34567890",
    registrationDate: "2021-02-10",
    paymentTerms: "Net 15",
    bankAccount: "ACC-345678901",
    bankName: "Standard Chartered",
    notes: "Supplier for cleaning chemicals and janitorial equipment.",
    rating: 3.9,
    onTimeDelivery: 85,
    qualityScore: 88,
    responseTime: 3.9,
    costSavings: 5,
    products: [
      { id: "P008", name: "Disinfectant", category: "Chemicals", unitPrice: 800, unit: "Bottle" },
      { id: "P009", name: "Floor Cleaner", category: "Chemicals", unitPrice: 600, unit: "Bottle" },
      { id: "P010", name: "Mop", category: "Equipment", unitPrice: 1500, unit: "Piece" },
    ],
    orders: [
      { id: "PO003", date: "2023-05-22", amount: "KES 45,000", status: "Processing" },
      { id: "PO007", date: "2023-04-20", amount: "KES 60,000", status: "Delivered" },
    ],
    contacts: [
      { name: "Michael Johnson", position: "Owner", phone: "+254 734 567 890", email: "michael@cleanpro.com" },
    ],
    documents: [
      { id: "D001", name: "Registration Certificate", type: "PDF", date: "2021-02-10", size: "1.0 MB" },
      { id: "D002", name: "Tax Compliance Certificate", type: "PDF", date: "2022-12-05", size: "0.7 MB" },
      { id: "D003", name: "Product Catalog", type: "PDF", date: "2022-08-15", size: "3.1 MB" },
    ],
    ratings: [
      {
        id: "R001",
        user: "Elizabeth Wanjiku",
        department: "Housekeeping",
        date: "2022-11-10",
        overall: 3.8,
        quality: 4,
        delivery: 3.5,
        service: 3.5,
        pricing: 4,
        communication: 4,
        comment: "Products are good quality and reasonably priced, but delivery can be inconsistent.",
      },
    ],
    issues: [
      {
        id: "I001",
        title: "Product Quality Issue",
        date: "2022-09-18",
        status: "Resolved",
        description: "Disinfectant bottles were leaking upon delivery.",
        resolution: "Vendor replaced all affected products.",
      },
      {
        id: "I002",
        title: "Missed Delivery",
        date: "2022-07-05",
        status: "Resolved",
        description: "Scheduled delivery was completely missed without notice.",
        resolution: "Vendor apologized and offered a 10% discount on the order.",
      },
    ],
    contract: {
      id: "C003",
      startDate: "2021-03-01",
      endDate: "2023-02-28",
      status: "Expired",
      value: "KES 1,200,000",
      type: "Service",
      renewalOption: "No",
      keyTerms: [
        "Monthly supply of cleaning products",
        "Payment terms: Net 15",
        "Quarterly product training",
        "Emergency supply within 48 hours",
        "Price adjustment based on market conditions",
      ],
    },
  },
}

export default function VendorDetailPage() {
  const vendorId = useResolvedRouteParam("id", StaticRouteRegex.procurementVendorId)
  const [vendor, setVendor] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRatingDialogOpen, setIsRatingDialogOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Product dialog state
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [deletingProduct, setDeletingProduct] = useState<any>(null)
  const [isDeletingProduct, setIsDeletingProduct] = useState(false)
  
  // Order dialog state
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  
  // Contract dialog state
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<any>(null)
  const [deletingContract, setDeletingContract] = useState<any>(null)
  const [isDeletingContract, setIsDeletingContract] = useState(false)
  
  // Document dialog state
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<any>(null)
  const [deletingDocument, setDeletingDocument] = useState<any>(null)
  const [isDeletingDocument, setIsDeletingDocument] = useState(false)
  
  // Issue dialog state
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false)
  const [editingIssue, setEditingIssue] = useState<any>(null)
  const [deletingIssue, setDeletingIssue] = useState<any>(null)
  const [isDeletingIssue, setIsDeletingIssue] = useState(false)

  useEffect(() => {
    const loadVendor = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Load vendor data first (required), then load other data in parallel
        const vendorData = await vendorApi.getById(vendorId)
        
        // Load other data in parallel (all optional, so catch errors)
        const [
          ratingsData,
          productsData,
          ordersData,
          contractsData,
          documentsData,
          issuesData
        ] = await Promise.all([
          vendorApi.getRatings(vendorId).catch(() => []),
          vendorApi.getProducts(vendorId).catch(() => []),
          purchaseOrderApi.getByVendor(vendorId).catch(() => []),
          vendorApi.getContracts(vendorId).catch(() => []),
          vendorApi.getDocuments(vendorId).catch(() => []),
          vendorApi.getIssues(vendorId).catch(() => [])
        ])
        
        // Transform ratings to match expected format
        // Map database fields: onTimeDeliveryScore->delivery, qualityScore->quality, 
        // responseTimeScore->service, costScore->pricing
        const transformedRatings = ratingsData.map((rating: any) => ({
          id: rating.ratingId,
          user: rating.firstName && rating.lastName 
            ? `${rating.firstName} ${rating.lastName}` 
            : rating.department || "Anonymous",
          department: rating.department || "Unknown",
          date: rating.ratingDate || rating.createdAt,
          overall: parseFloat(rating.overallRating || 0),
          quality: parseInt(rating.qualityScore) || 0,
          delivery: parseInt(rating.onTimeDeliveryScore) || 0,
          service: parseInt(rating.responseTimeScore) || 0,
          pricing: parseInt(rating.costScore) || 0,
          communication: 0, // Not stored in DB, but included for display compatibility
          comment: rating.comments || ""
        }))
        
        // Calculate performance metrics from ratings
        const avgQuality = transformedRatings.length > 0
          ? transformedRatings.reduce((sum, r) => sum + r.quality, 0) / transformedRatings.length
          : 0
        const avgDelivery = transformedRatings.length > 0
          ? transformedRatings.reduce((sum, r) => sum + r.delivery, 0) / transformedRatings.length
          : 0
        const avgService = transformedRatings.length > 0
          ? transformedRatings.reduce((sum, r) => sum + r.service, 0) / transformedRatings.length
          : 0
        
        // Transform products data
        const transformedProducts = productsData.map((product: any) => ({
          id: product.productId?.toString() || product.productCode || `P${product.productId}`,
          name: product.productName,
          category: product.category || "Uncategorized",
          unitPrice: parseFloat(product.unitPrice || 0),
          unit: product.unit || "Unit"
        }))

        // Transform orders data
        const transformedOrders = ordersData.map((order: any) => ({
          id: order.poNumber || order.purchaseOrderId?.toString(),
          date: order.orderDate,
          amount: `KES ${parseFloat(order.totalAmount || 0).toLocaleString()}`,
          status: order.status?.charAt(0).toUpperCase() + order.status?.slice(1) || "Draft"
        }))

        // Transform contracts data (get the most recent active contract)
        const activeContract = contractsData.find((c: any) => c.status === 'active') || contractsData[0] || null
        const transformedContract = activeContract ? {
          id: activeContract.contractNumber || activeContract.contractId?.toString(),
          type: activeContract.contractType || "Standard",
          startDate: activeContract.startDate,
          endDate: activeContract.endDate,
          status: activeContract.status?.charAt(0).toUpperCase() + activeContract.status?.slice(1) || "Draft",
          value: `KES ${parseFloat(activeContract.contractValue || 0).toLocaleString()}`,
          renewalOption: activeContract.renewalOption ? "Yes" : "No",
          keyTerms: activeContract.keyTerms ? activeContract.keyTerms.split('\n').filter((t: string) => t.trim()) : []
        } : null

        // Transform documents data
        const transformedDocuments = documentsData.map((doc: any) => ({
          id: doc.documentId?.toString(),
          name: doc.documentName,
          type: doc.documentType || "Document",
          date: doc.uploadDate || doc.createdAt,
          size: doc.fileSize ? `${(doc.fileSize / 1024 / 1024).toFixed(2)} MB` : "Unknown"
        }))

        // Transform issues data
        const transformedIssues = issuesData.map((issue: any) => ({
          id: issue.issueId?.toString(),
          title: issue.issueTitle,
          date: issue.issueDate || issue.createdAt,
          status: issue.status?.charAt(0).toUpperCase() + issue.status?.slice(1) || "Open",
          description: issue.description,
          resolution: issue.resolution || null
        }))

        // Transform API response
        const transformedData = {
          ...vendorData,
          rating: vendorData.rating ? parseFloat(vendorData.rating) : 0,
          totalSpent: vendorData.totalSpent ? parseFloat(vendorData.totalSpent) : 0,
          totalOrders: vendorData.totalOrders ? parseInt(vendorData.totalOrders) : 0,
          // Real data from APIs
          products: transformedProducts,
          orders: transformedOrders,
          contracts: contractsData, // Keep full data for contracts tab
          contract: transformedContract, // Single active contract for display
          contacts: vendorData.contactPerson ? [{
            name: vendorData.contactPerson,
            position: "Primary Contact",
            phone: vendorData.phone || "",
            email: vendorData.email || ""
          }] : [],
          documents: transformedDocuments,
          ratings: transformedRatings,
          issues: transformedIssues,
          // Performance metrics calculated from ratings
          onTimeDelivery: Math.round((avgDelivery / 5) * 100), // Convert 1-5 scale to percentage
          qualityScore: Math.round((avgQuality / 5) * 100),
          responseTime: avgService,
          costSavings: 0,
        }
        setVendor(transformedData)
        setError(null) // Clear any previous errors
      } catch (err: any) {
        console.error('Error loading vendor:', err)
        // Check if it's a 404 or "not found" error
        if (err.status === 404 || err.message?.toLowerCase().includes('not found')) {
          setError(`Vendor with ID ${vendorId} not found`)
        } else {
          setError(err.message || 'Failed to load vendor')
        }
        setVendor(null) // Ensure vendor is null on error
      } finally {
        setLoading(false)
      }
    }

    if (vendorId) {
      loadVendor()
    }
  }, [vendorId, refreshKey])

  const handleRatingSuccess = () => {
    setIsRatingDialogOpen(false)
    setRefreshKey(prev => prev + 1) // Trigger reload
  }

  // Product handlers
  const handleAddProduct = () => {
    setEditingProduct(null)
    setIsProductDialogOpen(true)
  }

  const handleEditProduct = (product: any) => {
    setEditingProduct(product)
    setIsProductDialogOpen(true)
  }

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return
    try {
      setIsDeletingProduct(true)
      await vendorApi.deleteProduct(vendorId, deletingProduct.productId?.toString() || deletingProduct.id)
      toast({
        title: "Success",
        description: "Product deleted successfully",
      })
      setDeletingProduct(null)
      setRefreshKey(prev => prev + 1)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete product",
        variant: "destructive",
      })
    } finally {
      setIsDeletingProduct(false)
    }
  }

  const handleProductSuccess = () => {
    setIsProductDialogOpen(false)
    setEditingProduct(null)
    setRefreshKey(prev => prev + 1)
  }

  // Order handlers
  const handleAddOrder = () => {
    setEditingOrder(null)
    setIsOrderDialogOpen(true)
  }

  const handleEditOrder = (order: any) => {
    // Fetch full order details
    purchaseOrderApi.getById(order.id || order.purchaseOrderId?.toString()).then((orderData) => {
      setEditingOrder(orderData)
      setIsOrderDialogOpen(true)
    }).catch((err) => {
      toast({
        title: "Error",
        description: "Failed to load order details",
        variant: "destructive",
      })
    })
  }

  const handleOrderSuccess = () => {
    setIsOrderDialogOpen(false)
    setEditingOrder(null)
    setRefreshKey(prev => prev + 1)
  }

  // Contract handlers
  const handleAddContract = () => {
    setEditingContract(null)
    setIsContractDialogOpen(true)
  }

  const handleEditContract = (contract: any) => {
    setEditingContract(contract)
    setIsContractDialogOpen(true)
  }

  const handleDeleteContract = async () => {
    if (!deletingContract) return
    try {
      setIsDeletingContract(true)
      await vendorApi.deleteContract(vendorId, deletingContract.contractId.toString())
      toast({
        title: "Success",
        description: "Contract deleted successfully",
      })
      setDeletingContract(null)
      setRefreshKey(prev => prev + 1)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete contract",
        variant: "destructive",
      })
    } finally {
      setIsDeletingContract(false)
    }
  }

  const handleContractSuccess = () => {
    setIsContractDialogOpen(false)
    setEditingContract(null)
    setRefreshKey(prev => prev + 1)
  }

  // Document handlers
  const handleAddDocument = () => {
    setEditingDocument(null)
    setIsDocumentDialogOpen(true)
  }

  const handleEditDocument = (document: any) => {
    setEditingDocument(document)
    setIsDocumentDialogOpen(true)
  }

  const handleDeleteDocument = async () => {
    if (!deletingDocument) return
    try {
      setIsDeletingDocument(true)
      await vendorApi.deleteDocument(vendorId, deletingDocument.documentId?.toString() || deletingDocument.id)
      toast({
        title: "Success",
        description: "Document deleted successfully",
      })
      setDeletingDocument(null)
      setRefreshKey(prev => prev + 1)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete document",
        variant: "destructive",
      })
    } finally {
      setIsDeletingDocument(false)
    }
  }

  const handleDocumentSuccess = () => {
    setIsDocumentDialogOpen(false)
    setEditingDocument(null)
    setRefreshKey(prev => prev + 1)
  }

  const handleDownloadDocument = (document: any) => {
    const url = vendorApi.downloadDocument(vendorId, document.documentId?.toString() || document.id)
    window.open(url, '_blank')
  }

  // Issue handlers
  const handleAddIssue = () => {
    setEditingIssue(null)
    setIsIssueDialogOpen(true)
  }

  const handleEditIssue = (issue: any) => {
    setEditingIssue(issue)
    setIsIssueDialogOpen(true)
  }

  const handleDeleteIssue = async () => {
    if (!deletingIssue) return
    try {
      setIsDeletingIssue(true)
      await vendorApi.deleteIssue(vendorId, deletingIssue.issueId?.toString() || deletingIssue.id)
      toast({
        title: "Success",
        description: "Issue deleted successfully",
      })
      setDeletingIssue(null)
      setRefreshKey(prev => prev + 1)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete issue",
        variant: "destructive",
      })
    } finally {
      setIsDeletingIssue(false)
    }
  }

  const handleIssueSuccess = () => {
    setIsIssueDialogOpen(false)
    setEditingIssue(null)
    setRefreshKey(prev => prev + 1)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground mt-4">Loading vendor details...</p>
      </div>
    )
  }

  if (error || !vendor) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h1 className="text-2xl font-bold">Vendor Not Found</h1>
        <p className="text-muted-foreground">
          {error || `The vendor with ID ${vendorId} could not be found.`}
        </p>
      </div>
    )
  }

  // Calculate average ratings (if available)
  const ratings = vendor.ratings || []
  const avgQuality = ratings.length > 0 ? ratings.reduce((sum: number, rating: any) => sum + rating.quality, 0) / ratings.length : 0
  const avgDelivery = ratings.length > 0 ? ratings.reduce((sum: number, rating: any) => sum + rating.delivery, 0) / ratings.length : 0
  const avgService = ratings.length > 0 ? ratings.reduce((sum: number, rating: any) => sum + rating.service, 0) / ratings.length : 0
  const avgPricing = ratings.length > 0 ? ratings.reduce((sum: number, rating: any) => sum + rating.pricing, 0) / ratings.length : 0
  const avgCommunication = ratings.length > 0 ? ratings.reduce((sum: number, rating: any) => sum + rating.communication, 0) / ratings.length : 0

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{vendor.vendorName || vendor.name}</h1>
            <Badge variant={vendor.status === "active" || vendor.status === "Active" ? "default" : "secondary"}>
              {vendor.status?.charAt(0).toUpperCase() + vendor.status?.slice(1) || "Unknown"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {vendor.category || "No category"} • Vendor ID: {vendor.vendorCode || vendor.vendorId || vendor.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <FileEdit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-2" />
            Contact
          </Button>
          <Button variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Dialog open={isRatingDialogOpen} onOpenChange={setIsRatingDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Star className="h-4 w-4 mr-2" />
                Rate
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Rate Vendor: {vendor.vendorName || vendor.name}</DialogTitle>
                <DialogDescription>Share your experience working with this vendor</DialogDescription>
              </DialogHeader>
              <VendorRatingForm
                vendorId={vendor.vendorId?.toString() || vendor.id}
                vendorName={vendor.vendorName || vendor.name}
                onSuccess={handleRatingSuccess}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Performance Summary Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Performance Summary</CardTitle>
          <CardDescription>Overall vendor performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="flex flex-col items-center">
              <div className="text-3xl font-bold flex items-center">
                {vendor.rating}
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500 ml-1" />
              </div>
              <p className="text-sm text-muted-foreground">Overall Rating</p>
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">On-Time Delivery</span>
                <span className="text-sm font-medium">{vendor.onTimeDelivery || 0}%</span>
              </div>
              <Progress value={vendor.onTimeDelivery || 0} className="h-2" />
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Quality Score</span>
                <span className="text-sm font-medium">{vendor.qualityScore || 0}%</span>
              </div>
              <Progress value={vendor.qualityScore || 0} className="h-2" />
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Response Time</span>
                <span className="text-sm font-medium">{vendor.responseTime || 0} hrs</span>
              </div>
              <Progress value={(vendor.responseTime || 0) * 10} className="h-2" />
            </div>
            <div className="flex flex-col">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Cost Savings</span>
                <span className="text-sm font-medium">{vendor.costSavings || 0}%</span>
              </div>
              <Progress value={(vendor.costSavings || 0) * 5} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Vendor Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Primary Contact</h3>
              <p className="text-sm">{vendor.contactPerson || vendor.contact || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
              <p className="text-sm">{vendor.email || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Phone</h3>
              <p className="text-sm">{vendor.phone || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Address</h3>
              <p className="text-sm">{vendor.address || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Website</h3>
              <p className="text-sm">{vendor.website || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Tax ID</h3>
              <p className="text-sm">{vendor.taxId || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Registration Date</h3>
              <p className="text-sm">{vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString() : vendor.registrationDate || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Payment Terms</h3>
              <p className="text-sm">{vendor.paymentTerms || "-"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Rating</h3>
              <p className="text-sm">{vendor.rating?.toFixed(1) || "0.0"}/5.0</p>
            </div>
          </div>
          {vendor.notes && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground">Notes</h3>
              <p className="text-sm">{vendor.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="contract">Contract</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="ratings">Ratings & Issues</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Products & Services</CardTitle>
                  <CardDescription>Products and services offered by this vendor</CardDescription>
                </div>
                <Button size="sm" onClick={handleAddProduct}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendor.products && vendor.products.length > 0 ? (
                      vendor.products.map((product: any) => (
                        <TableRow key={product.id}>
                          <TableCell>{product.id}</TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.category}</TableCell>
                          <TableCell>KES {product.unitPrice.toLocaleString()}</TableCell>
                          <TableCell>{product.unit}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleEditProduct(product)}>
                                <FileEdit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeletingProduct(product)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                          No products available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="orders">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Purchase Orders</CardTitle>
                  <CardDescription>Order history with this vendor</CardDescription>
                </div>
                <Button size="sm" onClick={handleAddOrder}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendor.orders && vendor.orders.length > 0 ? (
                      vendor.orders.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell>{order.id}</TableCell>
                          <TableCell>{order.date}</TableCell>
                          <TableCell>{order.amount}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.status === "Received" || order.status === "received"
                                  ? "default"
                                  : order.status === "Partial_received" || order.status === "partial_received"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleEditOrder(order)}>
                                <FileEdit className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                          No purchase orders found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="contacts">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Contact Persons</CardTitle>
                <CardDescription>Key contacts at this vendor</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {vendor.contacts && vendor.contacts.length > 0 ? (
                    vendor.contacts.map((contact: any, index: number) => (
                      <Card key={index}>
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                              <h3 className="font-medium">{contact.name}</h3>
                              <p className="text-sm text-muted-foreground">{contact.position}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                              {contact.phone && (
                                <div className="flex items-center gap-2">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{contact.phone}</span>
                                </div>
                              )}
                              {contact.email && (
                                <div className="flex items-center gap-2">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">{contact.email}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">No contacts available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="contract">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Contract Information</CardTitle>
                  <CardDescription>Contract details and terms</CardDescription>
                </div>
                <Button size="sm" onClick={handleAddContract}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  New Contract
                </Button>
              </CardHeader>
              <CardContent>
                {vendor.contracts && vendor.contracts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract Number</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendor.contracts.map((contract: any) => (
                        <TableRow key={contract.contractId}>
                          <TableCell className="font-medium">{contract.contractNumber}</TableCell>
                          <TableCell>{contract.contractType || "-"}</TableCell>
                          <TableCell>{contract.startDate}</TableCell>
                          <TableCell>{contract.endDate}</TableCell>
                          <TableCell>{contract.contractValue ? `KES ${parseFloat(contract.contractValue).toLocaleString()}` : "-"}</TableCell>
                          <TableCell>
                            <Badge variant={contract.status === "active" ? "default" : contract.status === "expired" ? "destructive" : "secondary"}>
                              {contract.status?.charAt(0).toUpperCase() + contract.status?.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleEditContract(contract)}>
                                <FileEdit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeletingContract(contract)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-4 text-muted-foreground">No contracts available</p>
                )}

                <div className="flex justify-end mt-4 gap-2">
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    View Full Contract
                  </Button>
                  <Button variant="outline" size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    Renew Contract
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="documents">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Documents</CardTitle>
                  <CardDescription>Vendor documentation and certificates</CardDescription>
                </div>
                <Button size="sm" onClick={handleAddDocument}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendor.documents && vendor.documents.length > 0 ? (
                      vendor.documents.map((doc: any) => (
                        <TableRow key={doc.id}>
                          <TableCell>{doc.id}</TableCell>
                          <TableCell className="font-medium">{doc.name}</TableCell>
                          <TableCell>{doc.type}</TableCell>
                          <TableCell>{doc.date}</TableCell>
                          <TableCell>{doc.size}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleDownloadDocument(doc)}>
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleEditDocument(doc)}>
                                <FileEdit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeletingDocument(doc)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                          No documents available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="ratings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Ratings</CardTitle>
                  <CardDescription>User ratings and feedback</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Quality</span>
                      <div className="flex items-center">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= avgQuality ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-sm">{avgQuality?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Delivery</span>
                      <div className="flex items-center">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= avgDelivery ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-sm">{avgDelivery?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Service</span>
                      <div className="flex items-center">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= avgService ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-sm">{avgService?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Pricing</span>
                      <div className="flex items-center">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= avgPricing ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-sm">{avgPricing?.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Communication</span>
                      <div className="flex items-center">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-4 w-4 ${
                                star <= avgCommunication ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 text-sm">{avgCommunication?.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {vendor.ratings && vendor.ratings.length > 0 ? (
                      vendor.ratings.map((rating: any) => (
                        <Card key={rating.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-medium">{rating.user}</h3>
                                <p className="text-sm text-muted-foreground">{rating.department}</p>
                              </div>
                              <div className="flex items-center">
                                <div className="flex">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`h-4 w-4 ${
                                        star <= rating.overall ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="ml-2 text-sm">{rating.overall}</span>
                              </div>
                            </div>
                            <p className="text-sm">{rating.comment}</p>
                            <p className="text-xs text-muted-foreground mt-2">{rating.date}</p>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <p className="text-center py-4 text-muted-foreground">No ratings available</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-lg">Issues</CardTitle>
                    <CardDescription>Reported issues and resolutions</CardDescription>
                  </div>
                  <Button size="sm" onClick={handleAddIssue}>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Report Issue
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {vendor.issues && vendor.issues.length > 0 ? (
                      vendor.issues.map((issue: any) => (
                        <Card key={issue.id}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-medium">{issue.title}</h3>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    issue.status === "Resolved" || issue.status === "resolved"
                                      ? "default"
                                      : issue.status === "In_progress" || issue.status === "in_progress"
                                        ? "secondary"
                                        : "destructive"
                                  }
                                >
                                  {issue.status}
                                </Badge>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => handleEditIssue(issue)}>
                                    <FileEdit className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setDeletingIssue(issue)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm mb-2">{issue.description}</p>
                            {issue.resolution && (
                              <div className="bg-muted p-2 rounded-md">
                                <p className="text-sm font-medium">Resolution:</p>
                                <p className="text-sm">{issue.resolution}</p>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">{issue.date}</p>
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <p className="text-center py-4 text-muted-foreground">No issues reported</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Product Dialog */}
      <VendorProductForm
        open={isProductDialogOpen}
        onOpenChange={setIsProductDialogOpen}
        vendorId={vendorId}
        product={editingProduct}
        onSuccess={handleProductSuccess}
      />

      {/* Purchase Order Dialog */}
      <VendorPurchaseOrderForm
        open={isOrderDialogOpen}
        onOpenChange={setIsOrderDialogOpen}
        vendorId={vendorId}
        order={editingOrder}
        onSuccess={handleOrderSuccess}
      />

      {/* Contract Dialog */}
      <VendorContractForm
        open={isContractDialogOpen}
        onOpenChange={setIsContractDialogOpen}
        vendorId={vendorId}
        contract={editingContract}
        onSuccess={handleContractSuccess}
      />

      {/* Document Dialog */}
      <VendorDocumentForm
        open={isDocumentDialogOpen}
        onOpenChange={setIsDocumentDialogOpen}
        vendorId={vendorId}
        document={editingDocument}
        onSuccess={handleDocumentSuccess}
      />

      {/* Issue Dialog */}
      <VendorIssueForm
        open={isIssueDialogOpen}
        onOpenChange={setIsIssueDialogOpen}
        vendorId={vendorId}
        issue={editingIssue}
        onSuccess={handleIssueSuccess}
      />

      {/* Delete Product Confirmation */}
      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => !open && setDeletingProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingProduct?.name || deletingProduct?.productName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} disabled={isDeletingProduct}>
              {isDeletingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Contract Confirmation */}
      <AlertDialog open={!!deletingContract} onOpenChange={(open) => !open && setDeletingContract(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete contract "{deletingContract?.contractNumber}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContract} disabled={isDeletingContract}>
              {isDeletingContract && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Document Confirmation */}
      <AlertDialog open={!!deletingDocument} onOpenChange={(open) => !open && setDeletingDocument(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDocument?.name || deletingDocument?.documentName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument} disabled={isDeletingDocument}>
              {isDeletingDocument && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Issue Confirmation */}
      <AlertDialog open={!!deletingIssue} onOpenChange={(open) => !open && setDeletingIssue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Issue</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingIssue?.issueTitle || deletingIssue?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteIssue} disabled={isDeletingIssue}>
              {isDeletingIssue && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
