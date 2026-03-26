"use client"

import Image from "next/image"
import { useState } from "react"
import { branding } from "@/lib/branding"

interface HospitalLogoImageProps {
  className?: string
  width?: number
  height?: number
  variant?: "default" | "print" | "compact" | "sidebar"
}

export function HospitalLogoImage({
  className = "",
  width,
  height,
  variant = "default"
}: HospitalLogoImageProps) {
  const [imageError, setImageError] = useState(false)
  const [triedSvg, setTriedSvg] = useState(false)

  // Default dimensions based on variant
  const defaultWidth = width || (variant === "compact" || variant === "sidebar" ? 120 : variant === "print" ? 150 : 240)
  const defaultHeight = height || (variant === "compact" || variant === "sidebar" ? 40 : variant === "print" ? 50 : 80)

  // If image failed to load, show text fallback (white for sidebar on dark background)
  if (imageError && triedSvg) {
    const isSidebar = variant === "sidebar"
    return (
      <div className={`flex flex-col items-center justify-center ${className}`}>
        <div className={`text-xl font-bold tracking-tight ${isSidebar ? "text-white" : "text-[#0f4c75]"}`}>
          {branding.appBrand.toUpperCase()}
        </div>
        <div className={`text-xs font-medium ${isSidebar ? "text-white/90" : "text-gray-600"}`}>{branding.productName}</div>
      </div>
    )
  }

  // For regular display, use Next.js Image component
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Image
        src={triedSvg ? "/logo.svg" : "/logo.png"}
        alt={branding.appBrand}
        width={defaultWidth}
        height={defaultHeight}
        className="object-contain"
        priority
        onError={() => {
          if (!triedSvg) {
            setTriedSvg(true)
          } else {
            setImageError(true)
          }
        }}
      />
    </div>
  )
}

// Print-friendly logo component (for use in print templates)
export function HospitalLogoPrint() {
  return (
    <div style={{ textAlign: "center", marginBottom: "20px" }}>
      <img
        src="/logo.png"
        alt={branding.appBrand}
        style={{ maxWidth: "150px", height: "auto", marginBottom: "10px" }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          if (target.src.endsWith('.png')) {
            target.src = '/logo.svg'
          } else {
            // Fallback to text
            target.style.display = 'none'
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

