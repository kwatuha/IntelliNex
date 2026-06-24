"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { FlaskConical, History, Package, Store, Truck, UserCog, Users } from "lucide-react"

const CHEMIST_LINKS = [
  { href: "/chemist/referrals", label: "Referrals", icon: Store },
  { href: "/chemist/drugs", label: "Drug availability", icon: Package },
  { href: "/chemist/stock-requests", label: "Stock requests", icon: Truck },
  { href: "/chemist/labs", label: "Labs", icon: FlaskConical },
  { href: "/chemist/history", label: "Pickup history", icon: History },
  { href: "/chemist/profile", label: "Profile", icon: UserCog },
  { href: "/chemist/users", label: "Users", icon: Users },
] as const

export function ChemistPortalNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-2">
      {CHEMIST_LINKS.map((link) => {
        const Icon = link.icon
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
