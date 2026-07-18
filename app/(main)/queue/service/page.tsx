"use client"

import { useMemo, useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Loader2 } from "lucide-react"
import { getServicePointName } from "@/lib/data/queue-data"
import type { ServicePoint } from "@/lib/data/queue-data"
import { useAuth } from "@/lib/auth/auth-context"
import { useRoleMenuAccess } from "@/lib/hooks/use-role-menu-access"
import { filterQueueServicePoints } from "@/lib/role-menu-filter"

const CallPatientPanel = dynamic(
  () => import("@/components/call-patient-panel").then((m) => m.CallPatientPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center rounded-lg border bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

const QueueDisplay = dynamic(
  () => import("@/components/queue-display").then((m) => m.QueueDisplay),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

const ALL_SERVICE_POINTS: ServicePoint[] = [
  "triage",
  "registration",
  "consultation",
  "laboratory",
  "radiology",
  "pharmacy",
  "billing",
  "cashier",
  "telemedicine",
  "procedure",
]

export default function ServicePointDashboard() {
  const searchParams = useSearchParams()
  const { user } = useAuth()

  const userId = user?.id ? String(user.id) : undefined
  const { menuAccess, loading: menuLoading } = useRoleMenuAccess(userId)

  const urlServicePoint = searchParams.get("servicePoint")
  const roleServicePoint =
    (user?.landingConfig as { servicePoint?: string } | null)?.servicePoint ?? null

  const staffName = user?.name || "Staff"

  const allowedServicePoints = useMemo(() => {
    if (menuLoading) return [] as ServicePoint[]
    if (!menuAccess) return ALL_SERVICE_POINTS
    return filterQueueServicePoints(ALL_SERVICE_POINTS, menuAccess) as ServicePoint[]
  }, [menuLoading, menuAccess])

  const preferredTab = useMemo(() => {
    const candidates = [urlServicePoint, roleServicePoint].filter(Boolean) as string[]
    for (const c of candidates) {
      if (allowedServicePoints.includes(c as ServicePoint)) {
        return c as ServicePoint
      }
    }
    return (allowedServicePoints[0] ?? "triage") as ServicePoint
  }, [urlServicePoint, roleServicePoint, allowedServicePoints])

  const [activeTab, setActiveTab] = useState<ServicePoint | null>(null)

  useEffect(() => {
    if (menuLoading || allowedServicePoints.length === 0) return
    setActiveTab((prev) => {
      if (prev && allowedServicePoints.includes(prev)) return prev
      return preferredTab
    })
  }, [menuLoading, allowedServicePoints, preferredTab])

  if (menuLoading || !activeTab) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Point Dashboard</h1>
          <p className="text-muted-foreground">Manage patient queue and service delivery</p>
        </div>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading service points…</p>
          </div>
        </div>
      </div>
    )
  }

  if (allowedServicePoints.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Point Dashboard</h1>
          <p className="text-muted-foreground">Manage patient queue and service delivery</p>
        </div>
        <p className="text-muted-foreground">
          No queue service points are configured for your role. Ask an administrator to assign queue
          service points in the role menu.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Service Point Dashboard</h1>
        <p className="text-muted-foreground">Manage patient queue and service delivery</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ServicePoint)}
        className="w-full"
      >
        <div className="relative mb-6">
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              {allowedServicePoints.map((point) => (
                <TabsTrigger
                  key={point}
                  value={point}
                  className="relative h-12 rounded-none border-b-2 border-b-transparent bg-transparent px-6 pb-3 pt-3 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {getServicePointName(point)}
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>

        {/* Only mount the active service point — avoids N× queue API + heavy JS for every tab */}
        <div className="mt-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <CallPatientPanel
              key={`call-${activeTab}`}
              servicePoint={activeTab}
              staffName={staffName}
              counterNumber={1}
            />
          </div>
          <div className="lg:col-span-2">
            <QueueDisplay
              key={`queue-${activeTab}`}
              initialServicePoint={activeTab}
              restrictToSingleServicePoint
            />
          </div>
        </div>
      </Tabs>
    </div>
  )
}
