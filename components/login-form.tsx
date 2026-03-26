"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { branding } from "@/lib/branding"

export function LoginForm() {
  const { login, isLoading } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password")
      return
    }

    const result = await login(username, password)
    if (!result.success) {
      setError(result.error || "Login failed")
    }
  }

  console.log("LoginForm: Rendering component")

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">{branding.appBrand} MIS</h1>
          <p className="text-gray-600">Powered by {branding.productName}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl text-center mb-4">Welcome Back</h2>
          <p className="text-center text-gray-600 mb-6">Sign in to access your dashboard</p>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Demo Credentials</h3>
            <div className="space-y-2">
              <div className="text-xs text-gray-600 cursor-pointer hover:text-gray-800 p-2 rounded border border-gray-200 hover:bg-gray-100"
                   onClick={() => { setUsername("admin"); setPassword("admin123"); setError(""); }}>
                <div className="font-medium">Admin</div>
                <div>Username: admin</div>
                <div>Password: admin123</div>
              </div>
              <div className="text-xs text-gray-600 cursor-pointer hover:text-gray-800 p-2 rounded border border-gray-200 hover:bg-gray-100"
                   onClick={() => { setUsername("doctor"); setPassword("doctor123"); setError(""); }}>
                <div className="font-medium">Doctor</div>
                <div>Username: doctor</div>
                <div>Password: doctor123</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          <p>© 2024 {branding.productName}. All rights reserved.</p>
          <p className="mt-1">P. O. Box 8407 - 30100, ELDORET | Tel: 0116695005</p>
          <p className="mt-1">Along Eldoret-Kiplombe Road, B&E Eagle House</p>
          <p className="mt-1">Email: mbemedicalcentre@gmail.com</p>
        </div>
      </div>
    </div>
  )
} 