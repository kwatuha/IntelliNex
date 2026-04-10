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
 * Fallback chain when a preferred asset is missing (404).
 * For sidebar (dark #0f4c75), prefer optional “on dark” assets first — see `SIDEBAR_LOGO_PREFIX`.
 * For default (login, light background), prefer `intellilogo_white.png` — see `LIGHT_BG_LOGO_PREFIX`.
 */
const LOGO_FILES = ["/logo_intelli.png", "/logo.png", "/logo.svg"] as const
/** Login / light UI — place `public/intellilogo_white.png` (suitable on white). */
const LIGHT_BG_LOGO_PREFIX = ["/intellilogo_white.png"] as const
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
    if (variant === "default") {
      return [...LIGHT_BG_LOGO_PREFIX.map((p) => publicAssetUrl(p)), ...LOGO_FILES.map((p) => publicAssetUrl(p))]
    }
    return LOGO_FILES.map((p) => publicAssetUrl(p))
  }, [variant])

  // Default dimensions (Next/Image intrinsic size; display capped by className max-h-* per variant)
  const defaultWidth =
    width ||
    (variant === "compact" ? 120 : variant === "sidebar" ? 240 : variant === "print" ? 150 : 320)
  const defaultHeight =
    height ||
    (variant === "compact" ? 48 : variant === "sidebar" ? 96 : variant === "print" ? 50 : 120)

  const exhausted = srcIndex >= logoSrcChain.length

  if (exhausted) {
    const isSidebar = variant === "sidebar"
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div
          className={cn(
            "tracking-tight",
            isSidebar
              ? "text-2xl font-extrabold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.45)]"
              : "text-xl font-bold text-[#0f4c75]"
          )}
        >
          {branding.appBrand.toUpperCase()}
        </div>
        <div
          className={cn(
            "font-medium",
            isSidebar ? "mt-0.5 text-sm text-white/95 [text-shadow:0_1px_4px_rgba(0,0,0,0.35)]" : "text-xs text-gray-600"
          )}
        >
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
          "object-contain w-full",
          variant === "sidebar" &&
            "max-h-[96px] min-h-[56px] drop-shadow-[0_4px_14px_rgba(0,0,0,0.5)]",
          variant === "default" && "max-h-[132px] sm:max-h-[140px]",
          variant === "compact" && "max-h-12 w-auto",
          variant === "print" && "max-h-[52px] w-auto"
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
