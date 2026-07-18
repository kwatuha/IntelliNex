"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from "react"
import { queueApi, patientApi, triageApi } from "@/lib/api"
import { checkAndNotifyCriticalVitals } from "@/lib/critical-vitals-utils"

export interface CriticalNotification {
  id: string
  patientId: string
  patientName?: string
  type: 'vital' | 'lab'
  alerts: Array<{
    parameter: string
    value: number | string
    unit: string
    range: string
    description: string | null
    severity: 'critical' | 'urgent'
  }>
  timestamp: Date
}

const STORAGE_KEY = 'critical-notifications'

// Helper to serialize notifications for localStorage
function serializeNotifications(notifications: CriticalNotification[]): string {
  return JSON.stringify(
    notifications.map(n => ({
      ...n,
      timestamp: n.timestamp.toISOString(),
    }))
  )
}

// Helper to deserialize notifications from localStorage
function deserializeNotifications(data: string): CriticalNotification[] {
  try {
    const parsed = JSON.parse(data)
    return parsed.map((n: any) => ({
      ...n,
      timestamp: new Date(n.timestamp),
    }))
  } catch {
    return []
  }
}

// Load notifications from localStorage
function loadNotificationsFromStorage(): CriticalNotification[] {
  if (typeof window === 'undefined') return []
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return deserializeNotifications(stored)
    }
  } catch (err) {
    console.error('Error loading notifications from storage:', err)
  }
  
  return []
}

// Save notifications to localStorage
function saveNotificationsToStorage(notifications: CriticalNotification[]): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, serializeNotifications(notifications))
  } catch (err) {
    console.error('Error saving notifications to storage:', err)
  }
}

interface CriticalNotificationsContextType {
  notifications: CriticalNotification[]
  addNotification: (notification: Omit<CriticalNotification, 'id' | 'timestamp'>) => void
  removeNotification: (patientId: string) => void
  clearAll: () => void
  refreshNotifications: () => Promise<void> // Add function to refresh from database
}

const CriticalNotificationsContext = createContext<CriticalNotificationsContextType | undefined>(undefined)

export function CriticalNotificationsProvider({ children }: { children: React.ReactNode }) {
  // Load notifications from localStorage on mount
  const [notifications, setNotifications] = useState<CriticalNotification[]>(() => {
    if (typeof window === 'undefined') return []
    const loaded = loadNotificationsFromStorage()
    console.log('Loaded notifications from localStorage:', loaded.length, loaded)
    return loaded
  })

  // Save to localStorage whenever notifications change
  useEffect(() => {
    console.log('Saving notifications to localStorage:', notifications.length, notifications)
    saveNotificationsToStorage(notifications)
  }, [notifications])

  const addNotification = useCallback((notification: Omit<CriticalNotification, 'id' | 'timestamp'>) => {
    console.log('✅ [ADD NOTIFICATION] Called with:', {
      patientId: notification.patientId,
      patientName: notification.patientName,
      alertsCount: notification.alerts?.length || 0,
      alerts: notification.alerts
    })
    
    if (!notification.alerts || notification.alerts.length === 0) {
      console.warn('⚠️ [ADD NOTIFICATION] No alerts provided, skipping')
      return
    }
    
    setNotifications((prev) => {
      console.log(`📊 [ADD NOTIFICATION] Current notifications count: ${prev.length}`)
      
      // Check if notification already exists for this patient
      const existingIndex = prev.findIndex((n) => n.patientId === notification.patientId)
      
      let updated: CriticalNotification[]
      if (existingIndex >= 0) {
        // Update existing notification
        updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...notification,
          id: updated[existingIndex].id,
          timestamp: updated[existingIndex].timestamp, // Keep original timestamp
        }
        console.log(`🔄 [ADD NOTIFICATION] Updated existing notification for patient ${notification.patientId}. New total: ${updated.length}`)
      } else {
        // Add new notification
        updated = [
          ...prev,
          {
            ...notification,
            id: `critical-${notification.patientId}-${Date.now()}`,
            timestamp: new Date(),
          },
        ]
        console.log(`➕ [ADD NOTIFICATION] Added new notification for patient ${notification.patientId}. New total: ${updated.length}`)
      }
      
      console.log('📋 [ADD NOTIFICATION] Updated notifications:', updated.map(n => ({ 
        patientId: n.patientId, 
        patientName: n.patientName, 
        alertsCount: n.alerts.length 
      })))
      
      return updated
    })
  }, [])

  // Soft background scan — defer so it does not compete with page navigations
  // (Patients list, tabs, etc.). Prefer cached alerts from localStorage first.
  useEffect(() => {
    let cancelled = false
    let idleId: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const scanForCriticalPatients = async () => {
      if (cancelled) return
      try {
        const todayVitals = await patientApi.getTodayVitals()
        if (cancelled || !todayVitals?.length) return

        const ranges = await triageApi.getCriticalVitalRanges()
        if (cancelled) return
        const criticalRanges = ranges.filter((r: any) => r.isActive !== false)
        if (criticalRanges.length === 0) return

        // Skip queue fan-out here — it was flooding the API on every layout mount.
        // Serving patients can clear alerts when staff act on them or open the badge.
        const patientVitalsMap = new Map<string, any>()
        todayVitals.forEach((vital: any) => {
          const patientId = vital.patientId?.toString()
          if (!patientId) return
          const existing = patientVitalsMap.get(patientId)
          if (!existing || new Date(vital.recordedDate) > new Date(existing.recordedDate)) {
            patientVitalsMap.set(patientId, vital)
          }
        })

        for (const [patientId, vital] of patientVitalsMap.entries()) {
          if (cancelled) return
          const vitalsForCheck = {
            systolicBP: vital.systolicBP,
            diastolicBP: vital.diastolicBP,
            heartRate: vital.heartRate,
            respiratoryRate: vital.respiratoryRate,
            temperature: vital.temperature,
            oxygenSaturation: vital.oxygenSaturation,
            glasgowComaScale: vital.glasgowComaScale,
            bloodGlucose: vital.bloodGlucose,
          }
          const patientName =
            vital.patientName ||
            (vital.patientFirstName && vital.patientLastName
              ? `${vital.patientFirstName} ${vital.patientLastName}`.trim()
              : undefined)

          await checkAndNotifyCriticalVitals(
            vitalsForCheck,
            patientId,
            patientName,
            addNotification,
          )
        }
      } catch (err) {
        // Soft-fail: do not surface on page UI
        console.error('[CRITICAL ALERTS] Background scan failed:', err)
      }
    }

    const startScan = () => {
      if (cancelled) return
      void scanForCriticalPatients()
    }

    // Wait for idle (or 8s fallback) so first navigation requests win
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(startScan, { timeout: 8000 })
    } else {
      timer = setTimeout(startScan, 8000)
    }

    return () => {
      cancelled = true
      if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timer) clearTimeout(timer)
    }
  }, [addNotification])
  // Soft-check stored alerts against serving status (deferred; never blocks navigation)
  useEffect(() => {
    if (notifications.length === 0) return

    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      const patientIds = notifications.map((n) => n.patientId).slice(0, 20)

      try {
        // One consultation queue pull instead of N per-patient fan-outs
        const consultationQueue = await queueApi.getAll('consultation', undefined, 1, 100, true).catch(() => [])
        if (cancelled) return
        const servingIds = new Set(
          consultationQueue
            .filter((entry: any) => entry.status === 'serving')
            .map((entry: any) => entry.patientId?.toString()),
        )
        const toRemove = patientIds.filter((id) => servingIds.has(id.toString()))
        if (toRemove.length > 0) {
          setNotifications((prev) => prev.filter((n) => !toRemove.includes(n.patientId)))
        }
      } catch (err) {
        console.error('Error checking initial queue statuses:', err)
      }
    }, 10000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  const removeNotification = useCallback((patientId: string) => {
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.patientId !== patientId)
      return updated
    })
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  // Refresh notifications by checking current vital signs from database
  // This is a no-op for now - notifications should persist from localStorage
  // and be added when forms are saved
  const refreshNotifications = useCallback(async () => {
    // Notifications are loaded from localStorage on mount
    // They are added when critical values are detected after form save
    // No need to actively refresh - just ensure they persist
    console.log('Refresh notifications called - notifications should persist from localStorage')
  }, [])

  // Light poll: one consultation queue request, not N×3 per patient
  useEffect(() => {
    if (notifications.length === 0) return

    const checkQueueStatus = async () => {
      try {
        const consultationQueue = await queueApi.getAll('consultation', undefined, 1, 100, true).catch(() => [])
        const servingIds = new Set(
          consultationQueue
            .filter((entry: any) => entry.status === 'serving')
            .map((entry: any) => entry.patientId?.toString()),
        )
        notifications.forEach((n) => {
          if (servingIds.has(n.patientId.toString())) {
            removeNotification(n.patientId)
          }
        })
      } catch (err) {
        console.error('Error checking queue statuses:', err)
      }
    }

    const interval = setInterval(checkQueueStatus, 30000)
    return () => clearInterval(interval)
  }, [notifications, removeNotification])

  return (
    <CriticalNotificationsContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        clearAll,
        refreshNotifications,
      }}
    >
      {children}
    </CriticalNotificationsContext.Provider>
  )
}

export function useCriticalNotifications() {
  const context = useContext(CriticalNotificationsContext)
  if (context === undefined) {
    throw new Error("useCriticalNotifications must be used within a CriticalNotificationsProvider")
  }
  return context
}

