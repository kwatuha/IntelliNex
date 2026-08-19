"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"

type ChartPoint = {
  label: string
  sortKey: number
  systolic: number | null
  diastolic: number | null
  bloodGlucose: number | null
  hba1c: number | null
}

function shortLabel(d: Date) {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseBp(v: any): { systolic: number | null; diastolic: number | null } {
  const systolic = num(v?.systolicBP ?? v?.bloodPressureSystolic ?? v?.bpSystolic)
  const diastolic = num(v?.diastolicBP ?? v?.bloodPressureDiastolic ?? v?.bpDiastolic)
  if (systolic != null || diastolic != null) return { systolic, diastolic }
  const raw = String(v?.bloodPressure || "")
  const m = raw.match(/(\d+)\s*\/\s*(\d+)/)
  if (m) return { systolic: Number(m[1]), diastolic: Number(m[2]) }
  return { systolic: null, diastolic: null }
}

function CompactChart({
  title,
  data,
  lines,
  emptyHint,
}: {
  title: string
  data: ChartPoint[]
  lines: Array<{ key: keyof ChartPoint; name: string; color: string }>
  emptyHint: string
}) {
  const hasData = lines.some((l) => data.some((d) => d[l.key] != null))
  if (!hasData) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[10px] text-muted-foreground">
        {emptyHint}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold">{title}</p>
      <div className="h-[100px] w-full min-w-0 sm:h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} width={36} />
            <Tooltip contentStyle={{ fontSize: 11 }} labelFormatter={(l) => String(l)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {lines.map((l) => (
              <Line
                key={String(l.key)}
                type="monotone"
                dataKey={l.key as string}
                name={l.name}
                stroke={l.color}
                connectNulls
                dot={{ r: 2 }}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function TelemedicineVitalsCharts({
  vitals = [],
  ncdFollowUps = [],
  title = "Trends before encounter",
  wide = false,
}: {
  vitals?: any[]
  ncdFollowUps?: any[]
  title?: string
  /** Side-by-side charts on patient profile (more width than the telemed dock). */
  wide?: boolean
}) {
  const chartData = useMemo(() => {
    const byKey = new Map<string, ChartPoint>()

    const upsert = (when: Date, patch: Partial<ChartPoint>) => {
      if (Number.isNaN(when.getTime())) return
      const sortKey = when.getTime()
      const key = `${sortKey}`
      const existing = byKey.get(key) || {
        label: shortLabel(when),
        sortKey,
        systolic: null,
        diastolic: null,
        bloodGlucose: null,
        hba1c: null,
      }
      const next: ChartPoint = { ...existing }
      ;(Object.keys(patch) as Array<keyof ChartPoint>).forEach((k) => {
        const val = patch[k]
        if (val !== undefined && val !== null) {
          ;(next as any)[k] = val
        }
      })
      byKey.set(key, next)
    }

    for (const v of vitals || []) {
      const when = new Date(v.recordedDate || v.recordedAt || v.createdAt || Date.now())
      const bp = parseBp(v)
      upsert(when, {
        systolic: bp.systolic,
        diastolic: bp.diastolic,
        bloodGlucose: num(v.bloodGlucose ?? v.glucose),
      })
    }

    for (const f of ncdFollowUps || []) {
      const when = new Date(f.followUpDate || f.createdAt || Date.now())
      upsert(when, {
        systolic: num(f.bpSystolic),
        diastolic: num(f.bpDiastolic),
        bloodGlucose: num(f.bloodGlucose),
        hba1c: num(f.hba1c),
      })
    }

    return Array.from(byKey.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-12)
  }, [vitals, ncdFollowUps])

  const latestBp = [...chartData].reverse().find((d) => d.systolic != null || d.diastolic != null)
  const latestGlucose = [...chartData].reverse().find((d) => d.bloodGlucose != null)
  const latestHba1c = [...chartData].reverse().find((d) => d.hba1c != null)

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2 sm:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold sm:text-sm">{title}</p>
        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground sm:text-xs">
          {latestBp ? (
            <span>
              Latest BP{" "}
              <span className="font-medium text-foreground">
                {latestBp.systolic ?? "—"}/{latestBp.diastolic ?? "—"}
              </span>
            </span>
          ) : null}
          {latestGlucose ? (
            <span>
              Glucose{" "}
              <span className="font-medium text-foreground">{latestGlucose.bloodGlucose}</span>
            </span>
          ) : null}
          {latestHba1c ? (
            <span>
              HbA1c{" "}
              <span className="font-medium text-foreground">{latestHba1c.hba1c}%</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className={cn("grid gap-2", wide ? "sm:grid-cols-3" : "xl:grid-cols-3")}>
        <CompactChart
          title="Blood pressure (mmHg)"
          data={chartData}
          lines={[
            { key: "systolic", name: "Systolic", color: "#ef4444" },
            { key: "diastolic", name: "Diastolic", color: "#3b82f6" },
          ]}
          emptyHint="No BP readings yet"
        />
        <CompactChart
          title="Blood sugar"
          data={chartData}
          lines={[{ key: "bloodGlucose", name: "Glucose", color: "#a855f7" }]}
          emptyHint="No glucose readings yet (vitals / NCD)"
        />
        <CompactChart
          title="HbA1c (%)"
          data={chartData}
          lines={[{ key: "hba1c", name: "HbA1c", color: "#14b8a6" }]}
          emptyHint="No HbA1c on NCD follow-ups yet"
        />
      </div>
    </div>
  )
}
