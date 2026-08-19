"use client"

import { useMemo, useState, type FormEvent } from "react"
import { format } from "date-fns"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import {
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Eye,
  MoreVertical,
  PlusCircle,
  Search,
  XCircle,
} from "lucide-react"

type ClaimStatus = "Pending" | "Approved" | "Rejected" | "Under Review" | "Submitted"

interface Patient {
  id: string
  fullName: string
}

interface InsuranceProvider {
  id: string
  name: string
}

interface InsuranceClaim {
  id: string
  claimNumber: string
  patientId: string
  patientName: string
  providerId: string
  providerName: string
  serviceOrDiagnosis: string
  amountKes: number
  claimDate: string // YYYY-MM-DD
  status: ClaimStatus
  supportingNotes: string
}

function formatKes(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatClaimDate(dateStr: string) {
  // dateStr is expected to be "YYYY-MM-DD"
  return format(new Date(dateStr), "dd MMM yyyy")
}

function getStatusBadgeClass(status: ClaimStatus) {
  switch (status) {
    case "Pending":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30"
    case "Approved":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    case "Rejected":
      return "bg-red-500/15 text-red-700 border-red-500/30"
    case "Under Review":
      return "bg-blue-500/15 text-blue-700 border-blue-500/30"
    case "Submitted":
      return "bg-muted text-muted-foreground border-muted-foreground/30"
    default:
      return "bg-muted text-muted-foreground border-muted-foreground/30"
  }
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <Badge variant="outline" className={getStatusBadgeClass(status)}>{status}</Badge>
  )
}

const CLAIM_STATUSES: ClaimStatus[] = ["Pending", "Under Review", "Submitted", "Approved", "Rejected"]

const PATIENTS: Patient[] = [
  { id: "p-akello-otieno", fullName: "Akello Otieno" },
  { id: "p-brian-wekesa", fullName: "Brian Wekesa" },
  { id: "p-catherine-njeri", fullName: "Catherine Njeri" },
  { id: "p-david-mwangi", fullName: "David Mwangi" },
  { id: "p-esther-achieng", fullName: "Esther Achieng" },
  { id: "p-frankline-odhiambo", fullName: "Frankline Odhiambo" },
  { id: "p-grace-wanjiku", fullName: "Grace Wanjiku" },
  { id: "p-hassan-mohammed", fullName: "Hassan Mohammed" },
  { id: "p-irene-cheruiyot", fullName: "Irene Cheruiyot" },
  { id: "p-josephat-mutua", fullName: "Josephat Mutua" },
  { id: "p-kendi-mutiso", fullName: "Kendi Mutiso" },
  { id: "p-lillian-naitore", fullName: "Lillian Naitore" },
  { id: "p-daniel-kiptoo", fullName: "Daniel Kiptoo" },
]

const PROVIDERS: InsuranceProvider[] = [
  { id: "prov-aar", name: "AAR" },
  { id: "prov-nhif", name: "NHIF" },
  { id: "prov-jubilee", name: "Jubilee" },
  { id: "prov-madison", name: "Madison" },
  { id: "prov-cic", name: "CIC" },
  { id: "prov-britam", name: "Britam" },
]

const INITIAL_CLAIMS: InsuranceClaim[] = [
  {
    id: "cl-1007",
    claimNumber: "CLM-1007",
    patientId: "p-akello-otieno",
    patientName: "Akello Otieno",
    providerId: "prov-aar",
    providerName: "AAR",
    serviceOrDiagnosis: "Neurosurgery",
    amountKes: 350000,
    claimDate: "2026-08-01",
    status: "Pending",
    supportingNotes: "CT scan report attached; awaiting pre-authorization confirmation.",
  },
  {
    id: "cl-1008",
    claimNumber: "CLM-1008",
    patientId: "p-brian-wekesa",
    patientName: "Brian Wekesa",
    providerId: "prov-nhif",
    providerName: "NHIF",
    serviceOrDiagnosis: "ICU (Critical Care)",
    amountKes: 220000,
    claimDate: "2026-07-26",
    status: "Submitted",
    supportingNotes: "ICU stay notes and discharge summary attached.",
  },
  {
    id: "cl-1009",
    claimNumber: "CLM-1009",
    patientId: "p-catherine-njeri",
    patientName: "Catherine Njeri",
    providerId: "prov-jubilee",
    providerName: "Jubilee",
    serviceOrDiagnosis: "Radiology MRI (Brain)",
    amountKes: 75000,
    claimDate: "2026-07-18",
    status: "Under Review",
    supportingNotes: "MRI findings highlighted; referral letter included.",
  },
  {
    id: "cl-1010",
    claimNumber: "CLM-1010",
    patientId: "p-david-mwangi",
    patientName: "David Mwangi",
    providerId: "prov-madison",
    providerName: "Madison",
    serviceOrDiagnosis: "Orthopaedics (Fracture Fixation)",
    amountKes: 140000,
    claimDate: "2026-06-30",
    status: "Approved",
    supportingNotes: "Surgery theatre invoice and implant receipt attached.",
  },
  {
    id: "cl-1011",
    claimNumber: "CLM-1011",
    patientId: "p-esther-achieng",
    patientName: "Esther Achieng",
    providerId: "prov-cic",
    providerName: "CIC",
    serviceOrDiagnosis: "Lab Tests (CBC + Chemistry Panel)",
    amountKes: 45000,
    claimDate: "2026-07-10",
    status: "Rejected",
    supportingNotes: "Missing physician order form for laboratory tests.",
  },
  {
    id: "cl-1012",
    claimNumber: "CLM-1012",
    patientId: "p-frankline-odhiambo",
    patientName: "Frankline Odhiambo",
    providerId: "prov-britam",
    providerName: "Britam",
    serviceOrDiagnosis: "Pharmacy (Antibiotics)",
    amountKes: 28000,
    claimDate: "2026-08-05",
    status: "Approved",
    supportingNotes: "Prescription and pharmacy dispensing record attached.",
  },
  {
    id: "cl-1013",
    claimNumber: "CLM-1013",
    patientId: "p-grace-wanjiku",
    patientName: "Grace Wanjiku",
    providerId: "prov-aar",
    providerName: "AAR",
    serviceOrDiagnosis: "OPD Consultation (Follow-up)",
    amountKes: 15000,
    claimDate: "2026-07-02",
    status: "Submitted",
    supportingNotes: "Clinic review notes and consultation receipt attached.",
  },
  {
    id: "cl-1014",
    claimNumber: "CLM-1014",
    patientId: "p-hassan-mohammed",
    patientName: "Hassan Mohammed",
    providerId: "prov-nhif",
    providerName: "NHIF",
    serviceOrDiagnosis: "Radiology MRI (Spine)",
    amountKes: 62000,
    claimDate: "2026-07-09",
    status: "Pending",
    supportingNotes: "Pre-imaging consent signed; awaiting claim validation.",
  },
  {
    id: "cl-1015",
    claimNumber: "CLM-1015",
    patientId: "p-irene-cheruiyot",
    patientName: "Irene Cheruiyot",
    providerId: "prov-jubilee",
    providerName: "Jubilee",
    serviceOrDiagnosis: "ICU (Post-op Monitoring)",
    amountKes: 205000,
    claimDate: "2026-07-15",
    status: "Under Review",
    supportingNotes: "Post-operative progress notes attached for review.",
  },
  {
    id: "cl-1016",
    claimNumber: "CLM-1016",
    patientId: "p-josephat-mutua",
    patientName: "Josephat Mutua",
    providerId: "prov-madison",
    providerName: "Madison",
    serviceOrDiagnosis: "Lab Tests (Urinalysis + Culture)",
    amountKes: 38000,
    claimDate: "2026-06-21",
    status: "Pending",
    supportingNotes: "Specimen collection form and lab results attached.",
  },
  {
    id: "cl-1017",
    claimNumber: "CLM-1017",
    patientId: "p-kendi-mutiso",
    patientName: "Kendi Mutiso",
    providerId: "prov-cic",
    providerName: "CIC",
    serviceOrDiagnosis: "Neurosurgery (Emergency Craniotomy)",
    amountKes: 390000,
    claimDate: "2026-07-28",
    status: "Approved",
    supportingNotes: "Emergency procedure report and ICU stay summary included.",
  },
  {
    id: "cl-1018",
    claimNumber: "CLM-1018",
    patientId: "p-lillian-naitore",
    patientName: "Lillian Naitore",
    providerId: "prov-britam",
    providerName: "Britam",
    serviceOrDiagnosis: "Orthopaedics (Knee Arthroscopy)",
    amountKes: 110000,
    claimDate: "2026-08-10",
    status: "Rejected",
    supportingNotes: "Missing pre-op medical assessment letter.",
  },
]

export function InsuranceClaimsTable() {
  const [claims, setClaims] = useState<InsuranceClaim[]>(INITIAL_CLAIMS)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("all")
  const [providerFilter, setProviderFilter] = useState<string | "all">("all")

  const [newClaimOpen, setNewClaimOpen] = useState(false)
  const [newClaimSubmitting, setNewClaimSubmitting] = useState(false)

  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<InsuranceClaim | null>(null)

  const [nextClaimSequence, setNextClaimSequence] = useState(() => {
    const max = INITIAL_CLAIMS.reduce((acc, c) => {
      const match = c.claimNumber.match(/(\d+)$/)
      if (!match) return acc
      const num = Number(match[1])
      return Number.isFinite(num) ? Math.max(acc, num) : acc
    }, 1000)
    return max + 1
  })

  const todayYmd = format(new Date(), "yyyy-MM-dd")

  const [form, setForm] = useState<{
    patientId: string
    providerId: string
    serviceOrDiagnosis: string
    amountKes: string
    claimDate: string
    supportingNotes: string
  }>(() => ({
    patientId: PATIENTS[0]?.id ?? "",
    providerId: PROVIDERS[0]?.id ?? "",
    serviceOrDiagnosis: "",
    amountKes: "",
    claimDate: todayYmd,
    supportingNotes: "",
  }))

  const summary = useMemo(() => {
    const totalClaims = claims.length
    const pending = claims.filter((c) => c.status === "Pending").length
    const approved = claims.filter((c) => c.status === "Approved").length
    const rejected = claims.filter((c) => c.status === "Rejected").length
    const totalValueKes = claims.reduce((sum, c) => sum + c.amountKes, 0)
    return { totalClaims, pending, approved, rejected, totalValueKes }
  }, [claims])

  const filteredClaims = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return claims.filter((claim) => {
      if (q) {
        const patientMatch = claim.patientName.toLowerCase().includes(q)
        const claimMatch = claim.claimNumber.toLowerCase().includes(q)
        if (!patientMatch && !claimMatch) return false
      }
      if (statusFilter !== "all" && claim.status !== statusFilter) return false
      if (providerFilter !== "all" && claim.providerId !== providerFilter) return false
      return true
    })
  }, [claims, providerFilter, searchQuery, statusFilter])

  const openViewDetails = (claim: InsuranceClaim) => {
    setSelectedClaim(claim)
    setViewDialogOpen(true)
  }

  const updateClaimStatus = (claimId: string, newStatus: ClaimStatus) => {
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, status: newStatus } : c))
    )

    const statusVerb =
      newStatus === "Approved"
        ? "approved"
        : newStatus === "Rejected"
          ? "rejected"
          : newStatus === "Under Review"
            ? "marked under review"
            : newStatus === "Submitted"
              ? "submitted"
              : "updated"

    toast({
      title: "Claim updated",
      description: `Claim has been ${statusVerb}.`,
    })
  }

  const resetForm = () => {
    setForm({
      patientId: PATIENTS[0]?.id ?? "",
      providerId: PROVIDERS[0]?.id ?? "",
      serviceOrDiagnosis: "",
      amountKes: "",
      claimDate: format(new Date(), "yyyy-MM-dd"),
      supportingNotes: "",
    })
  }

  const handleSubmitNewClaim = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const patient = PATIENTS.find((p) => p.id === form.patientId)
    const provider = PROVIDERS.find((p) => p.id === form.providerId)
    const amountValue = Number(form.amountKes)

    if (!patient || !provider) {
      toast({
        title: "Missing details",
        description: "Select a patient and insurance provider.",
        variant: "destructive",
      })
      return
    }

    if (!form.serviceOrDiagnosis.trim()) {
      toast({
        title: "Service/Diagnosis required",
        description: "Enter the service or diagnosis for the claim.",
        variant: "destructive",
      })
      return
    }

    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a valid claim amount in KES.",
        variant: "destructive",
      })
      return
    }

    if (!form.claimDate) {
      toast({
        title: "Claim date required",
        description: "Choose the claim date.",
        variant: "destructive",
      })
      return
    }

    setNewClaimSubmitting(true)

    const claimSeq = nextClaimSequence
    const claimNumber = `CLM-${claimSeq}`
    setNextClaimSequence((prev) => prev + 1)

    const newClaim: InsuranceClaim = {
      id: `cl-${Date.now()}`,
      claimNumber,
      patientId: patient.id,
      patientName: patient.fullName,
      providerId: provider.id,
      providerName: provider.name,
      serviceOrDiagnosis: form.serviceOrDiagnosis.trim(),
      amountKes: Math.round(amountValue),
      claimDate: form.claimDate,
      status: "Submitted",
      supportingNotes: form.supportingNotes.trim(),
    }

    // Demo mode: simulate a small delay for the submission state.
    window.setTimeout(() => {
      setClaims((prev) => [newClaim, ...prev])
      toast({
        title: "Claim submitted",
        description: `${newClaim.claimNumber} for ${newClaim.patientName} has been submitted.`,
      })
      setNewClaimOpen(false)
      setNewClaimSubmitting(false)
      resetForm()
    }, 450)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Total Claims
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalClaims}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.rejected}</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Total Value (KES)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatKes(summary.totalValueKes)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Insurance Claims</CardTitle>
              <p className="text-sm text-muted-foreground">
                Track claim submissions and decisions with filters and quick actions.
              </p>
            </div>

            <Button onClick={() => setNewClaimOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Claim
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by patient or claim #"
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ClaimStatus | "all")}>
                <SelectTrigger className="w-[210px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {CLAIM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v)}>
                <SelectTrigger className="w-[210px]">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Amount (KES)</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredClaims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No claims match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.claimNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{claim.patientName}</div>
                      </TableCell>
                      <TableCell>{claim.providerName}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate">{claim.serviceOrDiagnosis}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatKes(claim.amountKes)}
                      </TableCell>
                      <TableCell>{formatClaimDate(claim.claimDate)}</TableCell>
                      <TableCell>
                        <StatusBadge status={claim.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openViewDetails(claim)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => updateClaimStatus(claim.id, "Approved")}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateClaimStatus(claim.id, "Rejected")} className="text-destructive">
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateClaimStatus(claim.id, "Under Review")}>
                              <Clock className="mr-2 h-4 w-4 text-blue-700" />
                              Mark Under Review
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={newClaimOpen} onOpenChange={(open) => {
        setNewClaimOpen(open)
        if (!open) {
          setNewClaimSubmitting(false)
          resetForm()
        }
      }}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>New Insurance Claim</DialogTitle>
            <DialogDescription>
              Submit a claim for insurance review. The claim starts as <span className="font-medium">Submitted</span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitNewClaim} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Patient</label>
                <Select
                  value={form.patientId}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, patientId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {PATIENTS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Insurance Provider</label>
                <Select
                  value={form.providerId}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, providerId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Service / Diagnosis</label>
              <Input
                value={form.serviceOrDiagnosis}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceOrDiagnosis: e.target.value }))}
                placeholder="e.g., Radiology MRI (Chest)"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (KES)</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.amountKes}
                  onChange={(e) => setForm((prev) => ({ ...prev, amountKes: e.target.value }))}
                  placeholder="e.g., 75000"
                  min={0}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Claim Date</label>
                <Input
                  type="date"
                  value={form.claimDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, claimDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Supporting notes</label>
              <Textarea
                value={form.supportingNotes}
                onChange={(e) => setForm((prev) => ({ ...prev, supportingNotes: e.target.value }))}
                placeholder="Add any notes or requirements for the insurer..."
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setNewClaimOpen(false)} disabled={newClaimSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={newClaimSubmitting}>
                {newClaimSubmitting ? "Submitting..." : "Submit Claim"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open)
          if (!open) setSelectedClaim(null)
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Claim Details</DialogTitle>
            <DialogDescription>
              {selectedClaim ? (
                <>
                  {selectedClaim.claimNumber} · {selectedClaim.providerName}
                </>
              ) : (
                "Claim details"
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedClaim ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Patient</p>
                  <p className="text-sm font-semibold">{selectedClaim.patientName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Provider</p>
                  <p className="text-sm font-semibold">{selectedClaim.providerName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Service / Diagnosis</p>
                  <p className="text-sm">{selectedClaim.serviceOrDiagnosis}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Amount (KES)</p>
                  <p className="text-sm font-semibold">{formatKes(selectedClaim.amountKes)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Claim Date</p>
                  <p className="text-sm">{formatClaimDate(selectedClaim.claimDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <StatusBadge status={selectedClaim.status} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Supporting notes</p>
                <div className="rounded-md border bg-muted/20 p-3 text-sm whitespace-pre-wrap">
                  {selectedClaim.supportingNotes?.trim() ? selectedClaim.supportingNotes : "—"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => updateClaimStatus(selectedClaim.id, "Approved")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive"
                  onClick={() => updateClaimStatus(selectedClaim.id, "Rejected")}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => updateClaimStatus(selectedClaim.id, "Under Review")}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Mark Under Review
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No claim selected.</div>
          )}

          <DialogFooter className="pt-4">
            <Button onClick={() => setViewDialogOpen(false)} variant="secondary">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

