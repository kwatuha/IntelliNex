"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { PanelLeft, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed"

const sidebarVariants = cva(
  "fixed inset-y-0 left-0 z-50 flex h-full flex-col text-sidebar-foreground shadow-lg border-r border-sidebar-border transition-[width,transform] duration-200 ease-out",
  {
    variants: {
      variant: {
        default: "w-64",
        narrow: "w-16",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

type SidebarContextValue = {
  isCollapsed: boolean
  toggleSidebar: () => void
  setCollapsed: (collapsed: boolean) => void
  isMobile: boolean
  isMobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  toggleMobile: () => void
  /** Open the mobile drawer and keep it open through the next route change (e.g. top-nav category switch). */
  openMobileForCategoryBrowse: () => void
  /** Used by AppSidebar: return true once after openMobileForCategoryBrowse to skip auto-close. */
  consumeSkipCloseOnNextNav: () => boolean
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

/** Safe for Header / pages that may render outside SidebarProvider (e.g. landing shells). */
function useSidebarOptional() {
  return React.useContext(SidebarContext)
}

interface SidebarProviderProps {
  children: React.ReactNode
}

export const SidebarProvider = ({ children }: SidebarProviderProps) => {
  const isMobile = useIsMobile()
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)
  const skipCloseOnNextNavRef = React.useRef(false)

  React.useEffect(() => {
    try {
      setIsCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true")
    } catch {
      // ignore storage errors
    }
  }, [])

  React.useEffect(() => {
    if (!isMobile) setIsMobileOpen(false)
  }, [isMobile])

  React.useEffect(() => {
    if (!isMobile || !isMobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isMobile, isMobileOpen])

  const setCollapsed = React.useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    } catch {
      // ignore storage errors
    }
  }, [])

  const toggleSidebar = React.useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [])

  const setMobileOpen = React.useCallback((open: boolean) => {
    setIsMobileOpen(open)
  }, [])

  const toggleMobile = React.useCallback(() => {
    setIsMobileOpen((prev) => !prev)
  }, [])

  const openMobileForCategoryBrowse = React.useCallback(() => {
    skipCloseOnNextNavRef.current = true
    setIsMobileOpen(true)
  }, [])

  const consumeSkipCloseOnNextNav = React.useCallback(() => {
    if (!skipCloseOnNextNavRef.current) return false
    skipCloseOnNextNavRef.current = false
    return true
  }, [])

  const value = React.useMemo(
    () => ({
      isCollapsed,
      toggleSidebar,
      setCollapsed,
      isMobile,
      isMobileOpen,
      setMobileOpen,
      toggleMobile,
      openMobileForCategoryBrowse,
      consumeSkipCloseOnNextNav,
    }),
    [
      isCollapsed,
      toggleSidebar,
      setCollapsed,
      isMobile,
      isMobileOpen,
      setMobileOpen,
      toggleMobile,
      openMobileForCategoryBrowse,
      consumeSkipCloseOnNextNav,
    ],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "narrow"
  }
>(({ className, variant, style, ...props }, ref) => {
  const { isCollapsed, isMobile, isMobileOpen } = useSidebar()
  const effectiveCollapsed = isMobile ? false : isCollapsed
  const resolvedVariant = variant ?? (effectiveCollapsed ? "narrow" : "default")

  return (
    <div
      ref={ref}
      data-collapsed={effectiveCollapsed ? "true" : "false"}
      data-mobile={isMobile ? "true" : "false"}
      data-mobile-open={isMobileOpen ? "true" : "false"}
      className={cn(
        sidebarVariants({ variant: resolvedVariant }),
        // CSS breakpoints keep first paint correct before useIsMobile hydrates
        "max-md:!w-64 max-md:max-w-[85vw]",
        isMobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full max-md:pointer-events-none",
        "md:translate-x-0 md:pointer-events-auto",
        className,
      )}
      style={style}
      {...props}
    />
  )
})
Sidebar.displayName = "Sidebar"

function SidebarOverlay() {
  const { isMobile, isMobileOpen, setMobileOpen } = useSidebar()
  if (!isMobile || !isMobileOpen) return null

  return (
    <button
      type="button"
      aria-label="Close sidebar"
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
      onClick={() => setMobileOpen(false)}
    />
  )
}

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("border-b border-white/10 px-4 py-2", className)} {...props} />
  ),
)
SidebarHeader.displayName = "SidebarHeader"

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex-1 overflow-auto p-2", className)} {...props} />,
)
SidebarContent.displayName = "SidebarContent"

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("border-t border-white/10 p-2", className)} {...props} />
  ),
)
SidebarFooter.displayName = "SidebarFooter"

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("mb-4", className)} {...props} />,
)
SidebarGroup.displayName = "SidebarGroup"

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-white/70", className)}
      {...props}
    />
  ),
)
SidebarGroupLabel.displayName = "SidebarGroupLabel"

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("space-y-1", className)} {...props} />,
)
SidebarGroupContent.displayName = "SidebarGroupContent"

const SidebarMenu = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("space-y-1", className)} {...props} />,
)
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("", className)} {...props} />,
)
SidebarMenuItem.displayName = "SidebarMenuItem"

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    isActive?: boolean
    tooltip?: string
    asChild?: boolean
  }
>(({ className, isActive, tooltip, asChild = false, children, ...props }, ref) => {
  if (asChild) {
    return (
      <div
        className={cn(
          "group flex flex-row items-center w-full rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none disabled:pointer-events-none disabled:opacity-50",
          isActive && "bg-white/20 text-white font-semibold",
          className,
        )}
        title={tooltip}
      >
        {children}
      </div>
    )
  }

  return (
    <button
      ref={ref}
      className={cn(
        "group flex flex-row items-center w-full rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none disabled:pointer-events-none disabled:opacity-50",
        isActive && "bg-white/20 text-white font-semibold",
        className,
      )}
      title={tooltip}
      {...props}
    >
      {children}
    </button>
  )
})
SidebarMenuButton.displayName = "SidebarMenuButton"

const SidebarRail = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("absolute inset-y-0 right-0 w-1 bg-white/10", className)} {...props} />
  ),
)
SidebarRail.displayName = "SidebarRail"

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { isCollapsed, isMobile } = useSidebar()
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-1 flex-col transition-[margin] duration-200 ease-out",
          isMobile ? "ml-0" : isCollapsed ? "ml-16" : "ml-64",
          className,
        )}
        {...props}
      />
    )
  },
)
SidebarInset.displayName = "SidebarInset"

const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, onClick, ...props }, ref) => {
    const context = useSidebarOptional()
    // Landing / simplified shells render Header without SidebarProvider
    if (!context) return null

    const { isCollapsed, toggleSidebar, isMobile, isMobileOpen, toggleMobile } = context
    const openOnMobile = isMobile && isMobileOpen
    const expanded = isMobile ? isMobileOpen : !isCollapsed

    return (
      <button
        ref={ref}
        type="button"
        aria-label={expanded ? "Hide sidebar menu" : "Show sidebar menu"}
        aria-expanded={expanded}
        title={expanded ? "Hide sidebar menu" : "Show sidebar menu"}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-transparent text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        onClick={(event) => {
          // Prefer live viewport check so the first click before hydration is correct
          const mobileNow =
            typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
          if (mobileNow) toggleMobile()
          else toggleSidebar()
          onClick?.(event)
        }}
        {...props}
      >
        {openOnMobile ? <X className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        <span className="sr-only">Toggle Menu</span>
      </button>
    )
  },
)
SidebarTrigger.displayName = "SidebarTrigger"

const SidebarInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-white/20 bg-white/10 px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
)
SidebarInput.displayName = "SidebarInput"

export {
  Sidebar,
  SidebarOverlay,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInset,
  SidebarTrigger,
  SidebarInput,
}
