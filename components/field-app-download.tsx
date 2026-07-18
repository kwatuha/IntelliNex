"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import { mobileAppApi } from "@/lib/api"
import { CheckCircle2, Download, Loader2, Smartphone, Upload } from "lucide-react"

function formatBytes(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return ""
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`
}

export function FieldAppDownload() {
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin = String(user?.role || "").toLowerCase().includes("admin")

  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [available, setAvailable] = useState(false)
  const [release, setRelease] = useState<any>(null)
  const [version, setVersion] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await mobileAppApi.getRelease()
      setAvailable(!!data?.available)
      setRelease(data?.release || null)
      if (data?.available && data?.release?.id) {
        mobileAppApi.dismissRelease().catch(() => {})
      }
    } catch (e: any) {
      toast({
        title: "Could not load Field app release",
        description: e?.message || "API error",
        variant: "destructive",
      })
      setAvailable(false)
      setRelease(null)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const handleDownload = () => {
    setDownloading(true)
    try {
      const href = mobileAppApi.getDownloadHref()
      const a = document.createElement("a")
      a.href = href
      a.download = release?.originalFileName || "intellinex-field.apk"
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast({
        title: "Download started",
        description: "Open the APK on your Android phone and allow install from this source.",
      })
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Choose an APK file", variant: "destructive" })
      return
    }
    if (!version.trim()) {
      toast({ title: "Version required", description: "e.g. 1.0.0", variant: "destructive" })
      return
    }
    setUploading(true)
    try {
      await mobileAppApi.uploadRelease(file, version.trim(), notes.trim() || undefined)
      toast({ title: "Release published", description: `Version ${version.trim()} is now available.` })
      setFile(null)
      setNotes("")
      await load()
    } catch (e: any) {
      toast({ title: "Publish failed", description: e?.message || "Upload error", variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Smartphone className="h-7 w-7" />
          IntelliNex Field app
        </h1>
        <p className="text-muted-foreground">
          Download the Android companion for offline surveillance forms, chemist dispense, and critical asset
          verification. Sign in to the app with your HMIS username and password.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current release</CardTitle>
          <CardDescription>
            Related:{" "}
            <Link href="/field-datasets" className="underline underline-offset-2">
              Field datasets
            </Link>
            {" · "}
            <Link href="/field-app-usage" className="underline underline-offset-2">
              Field app usage
            </Link>{" "}
            (downloads and activity).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : available && release ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>
                  Version <strong>{release.version}</strong>
                  {release.fileSize != null ? ` · ${formatBytes(release.fileSize)}` : ""}
                </span>
              </div>
              {release.createdAt ? (
                <p className="text-sm text-muted-foreground">
                  Published {String(release.createdAt).slice(0, 19).replace("T", " ")}
                </p>
              ) : null}
              {release.releaseNotes ? (
                <Alert>
                  <AlertTitle>Release notes</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">{release.releaseNotes}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="button" onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download APK
              </Button>
              <p className="text-xs text-muted-foreground">
                On Android: open the downloaded file → Allow install from browser/files → Install. Then open
                IntelliNex Field and sign in.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No APK published yet.
              {isAdmin
                ? " Use the admin upload section below after building with npm run android:release."
                : " Ask an administrator to publish a release."}
            </p>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              Publish new release (admin)
            </CardTitle>
            <CardDescription>
              Upload <code className="text-xs">app-release.apk</code> from{" "}
              <code className="text-xs">mobile-collector/android/app/build/outputs/apk/release/</code>. Replaces the
              previous published file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Version</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Release notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>APK file</Label>
              <Input
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <Button type="button" onClick={() => void handleUpload()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Publish
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
