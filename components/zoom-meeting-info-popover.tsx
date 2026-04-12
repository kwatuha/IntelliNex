"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TelemedicineHelpLink } from "@/components/telemedicine-help-link"
import { cn } from "@/lib/utils"
import { Info } from "lucide-react"

/** Shared “Zoom tips” popover for embedded Meeting SDK (floating toolbar + full-page controls). */
export function ZoomMeetingInfoPopover({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn("h-6 w-6 shrink-0", className)} title="Zoom tips">
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,20rem)] space-y-2 text-xs" align="end">
        <p className="leading-relaxed text-muted-foreground">
          The preview is sized so Zoom&apos;s bottom controls usually fit without scrolling. The frame is <strong className="text-foreground">16:9</strong>.
          HMIS uses the <strong className="text-foreground">embedded Meeting SDK</strong> — no separate “waiting room” page. If the bar is still hidden,
          open the visit on the <strong className="text-foreground">full session page</strong> or <strong className="text-foreground">minimize</strong> this
          dock.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          If Zoom shows an <strong className="text-foreground">apps or integrations</strong> notice, that is Zoom platform transparency — not an HMIS
          alert. Give the dock more room or use full page so the in-meeting toolbar stays visible.
        </p>
        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">Host</strong> vs <strong className="text-foreground">Participant</strong> is the Zoom Meeting SDK join role
          in the signed token. HMIS infers it from your session link vs <strong className="text-foreground">My Zoom defaults</strong> and shows it on the
          badge (hover for detail).
        </p>
        <TelemedicineHelpLink />
      </PopoverContent>
    </Popover>
  )
}
