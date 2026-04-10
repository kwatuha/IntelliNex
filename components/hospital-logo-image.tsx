"use client"

import Image from "next/image"
import { useMemo, useState } from "react"
import { branding } from "@/lib/branding"
import { publicAssetUrl } from "@/lib/utils/url"
import { cn } from "@/lib/utils"

interface HospitalLogoImageProps {
  className?: string
  width?: number
  height?: number
  variant?: "default" | "print" | "compact" | "sidebar"
}

/**
 * Default logo chain (light backgrounds: login, print).
 * For sidebar (dark #0f4c75), prefer optional “on dark” assets first — see `SIDEBAR_LOGO_PREFIX`.
 */
const LOGO_FILES = ["/logo_intelli.png", "/logo.png", "/logo.svg"] as const
/** Tried before the default chain when variant is `sidebar` (transparent / light wordmark on dark blue). */
const SIDEBAR_LOGO_PREFIX = ["/logo_intelli_darkbg.png", "/logo_intelli_sidebar.png"] as const

export function HospitalLogoImage({
  className = "",
  width,
  height,
  variant = "default"
}: HospitalLogoImageProps) {
  const [srcIndex, setSrcIndex] = useState(0)

  const logoSrcChain = useMemo(() => {
    if (variant === "sidebar") {
      return [...SIDEBAR_LOGO_PREFIX.map((p) => publicAssetUrl(p)), ...LOGO_FILES.map((p) => publicAssetUrl(p))]
    }
    return LOGO_FILES.map((p) => publicAssetUrl(p))
  }, [variant])

  // Default dimensions based on variant
  const defaultWidth = width || (variant === "compact" || variant === "sidebar" ? 120 : variant === "print" ? 150 : 240)
  const defaultHeight = height || (variant === "compact" || variant === "sidebar" ? 48 : variant === "print" ? 50 : 80)

  const exhausted = srcIndex >= logoSrcChain.length

  if (exhausted) {
    const isSidebar = variant === "sidebar"
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div
          className={cn(
            "text-xl font-bold tracking-tight",
            isSidebar ? "text-white drop-shadow-sm" : "text-[#0f4c75]"
          )}
        >
          {branding.appBrand.toUpperCase()}
        </div>
        <div className={cn("text-xs font-medium", isSidebar ? "text-white/85" : "text-gray-600")}>
          {branding.productName}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Image
        src={logoSrcChain[srcIndex]}
        alt={branding.appBrand}
        width={defaultWidth}
        height={defaultHeight}
        className={cn(
          "object-contain w-auto",
          variant === "sidebar" ? "max-h-[56px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" : "max-h-[52px]"
        )}
        priority
        onError={() => setSrcIndex((i) => i + 1)}
      />
    </div>
  )
}

// Print-friendly logo component (for use in print templates)
export function HospitalLogoPrint() {
  return (
    <div style={{ textAlign: "center", marginBottom: "20px" }}>
      <img
        src={publicAssetUrl("/logo_intelli.png")}
        alt={branding.appBrand}
        style={{ maxWidth: "150px", height: "auto", marginBottom: "10px" }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          if (target.src.includes("logo_intelli")) {
            target.src = publicAssetUrl("/logo.png")
          } else if (target.src.endsWith(".png") && !target.src.includes("logo_intelli")) {
            target.src = publicAssetUrl("/logo.svg")
          } else {
            target.style.display = "none"
            const parent = target.parentElement
            if (parent) {
              parent.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="margin: 0; font-size: 28px; font-weight: bold; color: #0f4c75; letter-spacing: 2px;">${branding.appBrand.toUpperCase()}</h1>
                  <h2 style="margin: 5px 0; font-size: 18px; color: #333;">${branding.productName}</h2>
                </div>
              `
            }
          }
        }}
      />
      <div style={{ marginTop: "10px" }}>
        <h2 style={{ margin: "5px 0", fontSize: "18px", color: "#333" }}>
          {branding.appBrand}
        </h2>
      </div>
    </div>
  )
}
