"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, XCircle, Loader2, AlertTriangle, QrCode } from "lucide-react"
import { assetApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import { format } from "date-fns"
import { StaticRouteRegex, useResolvedRouteParam } from "@/lib/utils/static-export-params"

export default function AssetVerifyPage() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const assetId = useResolvedRouteParam("id", StaticRouteRegex.assetVerifyId)
  const assetCode = searchParams.get("code")

  const [asset, setAsset] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [verification, setVerification] = useState({
    isPresent: true,
    location: "",
    condition: "good",
    issues: "",
    notes: "",
  })

  useEffect(() => {
    if (assetId) {
      loadAsset()
    }
  }, [assetId])

  const loadAsset = async () => {
    try {
      setLoading(true)
      const data = await assetApi.getById(assetId)
      setAsset(data)

      // Pre-fill location if available
      if (data?.location) {
        setVerification((prev) => ({ ...prev, location: data.location }))
      }
    } catch (error: any) {
      console.error("Error loading asset:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load asset",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    // Check for user - the User type has an 'id' property (string)
    const userId = user?.id
    if (!userId) {
      console.error("User not available:", user)
      toast({
        title: "Error",
        description: "User information not available. Please log in.",
        variant: "destructive",
      })
      return
    }

    if (!asset?.isCritical) {
      toast({
        title: "Not a Critical Asset",
        description: "This asset is not marked as critical and does not require daily verification.",
        variant: "default",
      })
      return
    }

    try {
      setVerifying(true)

      const today = new Date().toISOString().split("T")[0]

      await assetApi.createDailyLog({
        assetId: parseInt(assetId),
        logDate: today,
        isPresent: verification.isPresent,
        verifiedBy: parseInt(userId), // Convert string id to number for API
        notes: verification.notes,
        issues: verification.issues,
        location: verification.location,
        condition: verification.condition,
      })

      setVerified(true)
      toast({
        title: "Success",
        description: "Asset verified successfully",
      })
    } catch (error: any) {
      console.error("Error verifying asset:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to verify asset",
        variant: "destructive",
      })
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading asset information...</p>
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Asset Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The asset could not be found.</p>
      </div>
    )
  }

  if (verified) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-green-100 p-4">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <CardTitle>Asset Verified Successfully</CardTitle>
            <CardDescription>Verification has been recorded in the system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Asset Code:</span>
                <span className="text-sm font-medium">{asset.assetCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Asset Name:</span>
                <span className="text-sm font-medium">{asset.assetName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Verified By:</span>
                <span className="text-sm font-medium">
                  {user?.firstName} {user?.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Date:</span>
                <span className="text-sm font-medium">{format(new Date(), "PPP")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Time:</span>
                <span className="text-sm font-medium">{format(new Date(), "HH:mm:ss")}</span>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setVerified(false)
                setVerification({
                  isPresent: true,
                  location: asset.location || "",
                  condition: "good",
                  issues: "",
                  notes: "",
                })
              }}
            >
              Verify Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-muted/30">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            <CardTitle>Asset Verification</CardTitle>
          </div>
          <CardDescription>Scan QR code to verify asset presence</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Asset Information */}
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-muted-foreground">Asset Code:</span>
              <span className="text-sm font-semibold">{asset.assetCode || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-muted-foreground">Asset Name:</span>
              <span className="text-sm font-semibold">{asset.assetName || "N/A"}</span>
            </div>
            {asset.category && (
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">Category:</span>
                <span className="text-sm">{asset.category}</span>
              </div>
            )}
            {asset.location && (
              <div className="flex justify-between">
                <span className="text-sm font-medium text-muted-foreground">Location:</span>
                <span className="text-sm">{asset.location}</span>
              </div>
            )}
            {asset.isCritical && (
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-100 text-red-800 text-xs font-medium">
                  Critical Asset
                </span>
              </div>
            )}
          </div>

          {!asset.isCritical && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This asset is not marked as critical. Daily verification is only required for critical assets.
              </AlertDescription>
            </Alert>
          )}

          {asset.isCritical && (
            <>
              {/* Verification Form */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isPresent"
                    checked={verification.isPresent}
                    onCheckedChange={(checked) =>
                      setVerification((prev) => ({ ...prev, isPresent: checked === true }))
                    }
                  />
                  <Label htmlFor="isPresent" className="text-sm font-medium">
                    Asset is present
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={verification.location}
                    onChange={(e) => setVerification((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="Where is the asset located?"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="condition">Condition</Label>
                  <Select
                    value={verification.condition}
                    onValueChange={(value) => setVerification((prev) => ({ ...prev, condition: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                      <SelectItem value="needs_repair">Needs Repair</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issues">Issues (Optional)</Label>
                  <Input
                    id="issues"
                    value={verification.issues}
                    onChange={(e) => setVerification((prev) => ({ ...prev, issues: e.target.value }))}
                    placeholder="Any issues or discrepancies?"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={verification.notes}
                    onChange={(e) => setVerification((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>

              <Button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleVerify()
                }}
                disabled={verifying}
                className="w-full"
                size="lg"
                type="button"
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Verify Asset
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
