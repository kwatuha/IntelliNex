import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "../globals.css"
import { NavigationProvider } from "@/lib/navigation-context"
import { MainLayoutContent } from "@/components/main-layout-content"
import { ProtectedRoute } from "@/components/protected-route"
import { branding } from "@/lib/branding"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: `${branding.appBrand} MIS`,
  description: `Hospital Management Information System powered by ${branding.productName}`,
  generator: 'v0.dev'
}

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ProtectedRoute>
      <NavigationProvider>
        <MainLayoutContent>{children}</MainLayoutContent>
      </NavigationProvider>
    </ProtectedRoute>
  )
} 