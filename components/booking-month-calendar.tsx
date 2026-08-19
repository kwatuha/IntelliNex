"use client"

import { useMemo } from "react"
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type BookingMonthCalendarProps = {
  month: Date
  onMonthChange: (month: Date) => void
  selected: Date
  onSelect: (date: Date) => void
  /** YYYY-MM-DD → booking count */
  countsByDate: Map<string, number>
  size?: "compact" | "large"
  className?: string
}

function toYmd(d: Date) {
  return format(d, "yyyy-MM-dd")
}

function heatClass(count: number, max: number, selected: boolean) {
  if (selected || count <= 0) return ""
  const intensity = count / max
  if (intensity >= 0.75) return "bg-primary/25 hover:bg-primary/35"
  if (intensity >= 0.4) return "bg-primary/15 hover:bg-primary/25"
  return "bg-primary/10 hover:bg-primary/20"
}

/**
 * Month grid that shows booking counts on each day (compact or large).
 */
export function BookingMonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  countsByDate,
  size = "compact",
  className,
}: BookingMonthCalendarProps) {
  const large = size === "large"
  const monthStart = startOfMonth(month)

  const maxCount = useMemo(() => {
    let max = 0
    countsByDate.forEach((n) => {
      if (n > max) max = n
    })
    return Math.max(1, max)
  }, [countsByDate])

  const weeks = useMemo(() => {
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 })
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
    const rows: Date[][] = []
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7))
    }
    return rows
  }, [monthStart])

  const weekdays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 0 })
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), large ? "EEE" : "EEEEE"))
  }, [large])

  return (
    <div className={cn("p-2 select-none", className)}>
      <div className="relative mb-2 flex items-center justify-center px-8">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("absolute left-0", large ? "h-8 w-8" : "h-7 w-7")}
          onClick={() => onMonthChange(startOfMonth(addDays(monthStart, -1)))}
          aria-label="Previous month"
        >
          <ChevronLeft className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </Button>
        <p className={cn("font-semibold", large ? "text-base" : "text-sm")}>
          {format(monthStart, "MMMM yyyy")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("absolute right-0", large ? "h-8 w-8" : "h-7 w-7")}
          onClick={() => onMonthChange(startOfMonth(addDays(endOfMonth(monthStart), 1)))}
          aria-label="Next month"
        >
          <ChevronRight className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {weekdays.map((label) => (
          <div
            key={label}
            className={cn(
              "text-center text-muted-foreground font-normal",
              large ? "text-xs py-1" : "text-[0.7rem] py-0.5"
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {weeks.flat().map((date) => {
          const key = toYmd(date)
          const count = countsByDate.get(key) || 0
          const inMonth = isSameMonth(date, monthStart)
          const isSelected = isSameDay(date, selected)
          const today = isToday(date)

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(date)}
              title={
                count > 0
                  ? `${format(date, "d MMM")}: ${count} booking${count === 1 ? "" : "s"}`
                  : format(date, "d MMM yyyy")
              }
              className={cn(
                "flex flex-col items-center justify-center rounded-md border border-transparent transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                large ? "h-16" : "h-12",
                heatClass(count, maxCount, isSelected),
                today && !isSelected && "ring-1 ring-primary/40",
                isSelected && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                !inMonth && "opacity-40 text-muted-foreground"
              )}
            >
              <span className={cn("leading-none", large ? "text-sm font-medium" : "text-xs")}>
                {date.getDate()}
              </span>
              {count > 0 ? (
                <span
                  className={cn(
                    "mt-0.5 rounded-full px-1.5 font-semibold tabular-nums leading-none",
                    large ? "text-[11px] py-0.5" : "text-[9px] py-px",
                    isSelected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {count}
                </span>
              ) : large ? (
                <span className="mt-0.5 text-[10px] text-muted-foreground/70">—</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type ExpandableBookingCalendarProps = {
  month: Date
  onMonthChange: (month: Date) => void
  selected: Date
  onSelect: (date: Date) => void
  countsByDate: Map<string, number>
  title?: string
  description?: string
  expandOpen: boolean
  onExpandOpenChange: (open: boolean) => void
}

/**
 * Compact booking calendar with expand control → large modal month view.
 */
export function ExpandableBookingCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  countsByDate,
  title = "Booking calendar",
  description = "Numbers on each day are booked appointments. Click a day to open its patient list.",
  expandOpen,
  onExpandOpenChange,
}: ExpandableBookingCalendarProps) {
  const monthTotal = useMemo(() => {
    let total = 0
    countsByDate.forEach((n) => {
      total += n
    })
    return total
  }, [countsByDate])

  return (
    <>
      <div className="relative w-fit min-w-[280px] mx-auto lg:mx-0 rounded-md border bg-background/50">
        <div className="absolute right-1.5 top-1.5 z-10">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 bg-background/90 shadow-sm"
            title="Expand calendar"
            aria-label="Expand calendar"
            onClick={() => onExpandOpenChange(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <BookingMonthCalendar
          size="compact"
          month={month}
          onMonthChange={onMonthChange}
          selected={selected}
          onSelect={onSelect}
          countsByDate={countsByDate}
          className="pt-9"
        />
        <p className="border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">
          {monthTotal > 0
            ? `${monthTotal} booking${monthTotal === 1 ? "" : "s"} this month · expand for a clearer view`
            : "No bookings this month yet · expand for a larger calendar"}
        </p>
      </div>

      <Dialog open={expandOpen} onOpenChange={onExpandOpenChange}>
        <DialogContent className="max-w-2xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 p-2">
            <BookingMonthCalendar
              size="large"
              month={month}
              onMonthChange={onMonthChange}
              selected={selected}
              onSelect={(d) => {
                onSelect(d)
                onExpandOpenChange(false)
              }}
              countsByDate={countsByDate}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-primary/10" /> Light = few
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-primary/25" /> Darker = more bookings
            </span>
            <span className="ml-auto font-medium text-foreground">
              {monthTotal} total this month
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
