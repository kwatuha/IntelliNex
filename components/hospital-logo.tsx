import Link from "next/link"
import { branding } from "@/lib/branding"

interface HospitalLogoProps {
  className?: string
}

export function HospitalLogo({ className }: HospitalLogoProps) {
  return (
    <Link href="/" className={`flex items-center ${className}`}>
      <div className="flex flex-col items-center">
        <div className="text-xl font-bold tracking-tight">
          <span className="text-blue-600">{branding.appBrand.toUpperCase()}</span>
        </div>
        <div className="text-xs text-gray-600 font-medium">{branding.productName}</div>
      </div>
    </Link>
  )
}
