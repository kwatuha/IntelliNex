import type { ReactNode } from "react"
import type { Metadata } from "next"
import { branding } from "@/lib/branding"

export const metadata: Metadata = {
  title: `Book an appointment | ${branding.appBrand}`,
  description: "Request an outpatient or specialist appointment without signing in.",
}

export default function BookLayout({ children }: { children: ReactNode }) {
  return children
}
