"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { AlertCircle, Loader2, Heart } from "lucide-react"
import { HospitalLogoImage } from "@/components/hospital-logo-image"
import { getAppHomeHref } from "@/lib/utils/url"

export default function LoginPage() {
  const { login, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isRedirecting, setIsRedirecting] = useState(false)

  // 1. Handle automatic redirection if user arrives already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated && pathname === "/login") {
      setIsRedirecting(true)
      router.replace("/")
    }
  }, [isAuthenticated, isLoading, router, pathname])

  // 2. Handle the "Sign In" click
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      const result = await login(username, password)
      if (result.success) {
        setIsRedirecting(true)
        // Hard reload so the shell picks up auth; must use app URL (basePath), not "/"
        window.location.href = getAppHomeHref()
      } else {
        setError(result.error || "Invalid username or password")
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.")
    }
  }

  // Loading Screen for Auth checks and Active Redirects
  if (isLoading || (isAuthenticated && pathname === "/login") || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center space-y-4">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-[#0f4c75] mx-auto" />
            <div className="absolute inset-0 h-12 w-12 border-4 border-[#0f4c75]/20 rounded-full mx-auto"></div>
          </div>
          <p className="text-sm font-medium text-slate-700 animate-pulse">
            Securely logging you in...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl border border-slate-200/50 bg-white/98 backdrop-blur-md transition-all duration-300 hover:shadow-3xl">
          <CardHeader className="space-y-8 pb-10 pt-10 px-8">
            <div className="flex justify-center">
              <div className="flex flex-col items-center space-y-6">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border border-blue-100/50 shadow-inner">
                  <HospitalLogoImage variant="default" width={320} height={110} />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="username" className="text-sm font-medium text-slate-700">
                  Username
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  className="h-12 text-base border-slate-300 focus:border-[#0f4c75] focus:ring-[#0f4c75] transition-all duration-200"
                  required
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-12 text-base border-slate-300 focus:border-[#0f4c75] focus:ring-[#0f4c75] transition-all duration-200"
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2.5 rounded-lg bg-red-50/80 border border-red-200/50 p-3.5 text-sm text-red-700 shadow-sm animate-in fade-in-50">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[#0f4c75] to-[#1b5e8a] hover:from-[#1b5e8a] hover:to-[#2563eb] text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="pt-6 border-t border-slate-200">
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/30 border border-slate-200/50 p-5 space-y-3.5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0f4c75]"></span>
                  Test Credentials
                </h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-slate-600">Admin:</span>
                    <code className="bg-white/80 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 font-mono text-xs shadow-sm group-hover:bg-white transition-colors">
                      admin / admin123
                    </code>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-slate-600">Doctor:</span>
                    <code className="bg-white/80 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 font-mono text-xs shadow-sm group-hover:bg-white transition-colors">
                      doctor1 / password123
                    </code>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-slate-600">Nurse:</span>
                    <code className="bg-white/80 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 font-mono text-xs shadow-sm group-hover:bg-white transition-colors">
                      nurse1 / password123
                    </code>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="font-medium text-slate-600">Pharmacist:</span>
                    <code className="bg-white/80 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 font-mono text-xs shadow-sm group-hover:bg-white transition-colors">
                      pharmacist1 / password123
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}