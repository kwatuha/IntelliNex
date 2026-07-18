"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth/auth-context"
import { mobileAppApi } from "@/lib/api"
import { Loader2, Smartphone } from "lucide-react"

function formatWhen(value: string | Date | null | undefined) {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function VersionStatusBadge({ onLatest }: { onLatest: boolean | null | undefined }) {
  if (onLatest === true) return <Badge className="bg-emerald-600 hover:bg-emerald-600">Latest</Badge>
  if (onLatest === false) return <Badge variant="secondary">Older</Badge>
  return <Badge variant="outline">Unknown</Badge>
}

export function FieldAppUsage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin = String(user?.role || "").toLowerCase().includes("admin")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<any>(null)

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const data = await mobileAppApi.getUsageReport()
      setReport(data)
    } catch (e: any) {
      const msg = e?.message || "Could not load Field app usage"
      setError(msg)
      setReport(null)
      toast({ title: "Usage report failed", description: msg, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [isAdmin, toast])

  useEffect(() => {
    void load()
  }, [load])

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Administrator access required</AlertTitle>
        <AlertDescription>Only administrators can view Field app usage tracking.</AlertDescription>
      </Alert>
    )
  }

  const summary = report?.summary || {}
  const currentVersion = report?.currentRelease?.version || "—"

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Smartphone className="h-7 w-7" />
            Field app usage
          </h1>
          <p className="text-muted-foreground">
            Track APK downloads and Field app activity by user and version. Current published release:{" "}
            <strong>{currentVersion}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/field-app">Manage release</Link>
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !report ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading usage…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "APK downloads", value: summary.totalDownloads ?? 0 },
              { label: "Staff who downloaded", value: summary.uniqueDownloaders ?? 0 },
              { label: "Active app users", value: summary.uniqueAppUsers ?? 0 },
              { label: "On latest app version", value: summary.onLatestAppVersion ?? 0 },
              { label: "On older app version", value: summary.onOlderAppVersion ?? 0 },
            ].map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-3xl">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By version</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead className="text-right">Downloads</TableHead>
                    <TableHead className="text-right">Downloaders</TableHead>
                    <TableHead className="text-right">App activity</TableHead>
                    <TableHead className="text-right">App users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.versionBreakdown || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No usage recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.versionBreakdown.map((row: any) => (
                      <TableRow key={row.version_label}>
                        <TableCell className="font-medium">{row.version_label}</TableCell>
                        <TableCell className="text-right">{row.download_count ?? 0}</TableCell>
                        <TableCell className="text-right">{row.downloader_count ?? 0}</TableCell>
                        <TableCell className="text-right">{row.app_activity_count ?? 0}</TableCell>
                        <TableCell className="text-right">{row.app_user_count ?? 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By user</CardTitle>
              <CardDescription>
                Last download version comes from the web portal. Last app version is reported when the Android app
                signs in or syncs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last download</TableHead>
                    <TableHead>Download ver.</TableHead>
                    <TableHead>Last app use</TableHead>
                    <TableHead>App ver.</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.users || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No user activity yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.users.map((row: any) => (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <div className="font-medium">{row.fullName?.trim() || row.username || `#${row.userId}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.username}
                            {row.email ? ` · ${row.email}` : ""}
                          </div>
                        </TableCell>
                        <TableCell>{row.roleName || "—"}</TableCell>
                        <TableCell>{formatWhen(row.lastDownloadAt)}</TableCell>
                        <TableCell>{row.lastDownloadVersion || "—"}</TableCell>
                        <TableCell>{formatWhen(row.lastAppActivityAt)}</TableCell>
                        <TableCell>{row.lastAppVersion || "—"}</TableCell>
                        <TableCell className="text-center">
                          <VersionStatusBadge onLatest={row.onLatestAppVersion} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent events</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report?.recentEvents || []).slice(0, 50).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No events yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (report?.recentEvents || []).slice(0, 50).map((ev: any) => (
                      <TableRow key={ev.id}>
                        <TableCell>{formatWhen(ev.createdAt)}</TableCell>
                        <TableCell>{ev.username || `#${ev.userId}`}</TableCell>
                        <TableCell>{ev.eventType}</TableCell>
                        <TableCell>{ev.appVersion || ev.releaseVersion || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
