/**
 * React hook for accessing role-based menu and tab permissions.
 * Shares one in-flight request + short TTL cache across Sidebar, TopNav, Tabs, etc.
 */

import { useState, useEffect, useCallback } from 'react'
import { roleMenuApi } from '@/lib/api'
import { RoleMenuAccess } from '@/lib/role-menu-filter'

const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = {
  access: RoleMenuAccess
  fetchedAt: number
}

const menuAccessCache = new Map<string, CacheEntry>()
const menuAccessInflight = new Map<string, Promise<RoleMenuAccess>>()

function cacheKey(userId: string) {
  return String(userId)
}

function transformMenuAccess(data: any): RoleMenuAccess {
  return {
    menuConfigPresent: Boolean(data.menuConfigPresent),
    categoriesWithMenuItemRows: Array.isArray(data.categoriesWithMenuItemRows)
      ? data.categoriesWithMenuItemRows
      : [],
    categories: data.categories || [],
    menuItems: data.menuItems || [],
    tabs: data.tabs || [],
    queues: data.queues || [],
  }
}

async function fetchMenuAccess(userId: string): Promise<RoleMenuAccess> {
  const key = cacheKey(userId)
  const cached = menuAccessCache.get(key)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.access
  }

  const existing = menuAccessInflight.get(key)
  if (existing) return existing

  const promise = roleMenuApi
    .getUserMenuAccess(userId)
    .then((data) => {
      const access = transformMenuAccess(data)
      menuAccessCache.set(key, { access, fetchedAt: Date.now() })
      return access
    })
    .finally(() => {
      menuAccessInflight.delete(key)
    })

  menuAccessInflight.set(key, promise)
  return promise
}

/** Call on logout so the next user does not inherit prior menu permissions. */
export function invalidateRoleMenuAccessCache(userId?: string) {
  if (userId) {
    const key = cacheKey(userId)
    menuAccessCache.delete(key)
    menuAccessInflight.delete(key)
    return
  }
  menuAccessCache.clear()
  menuAccessInflight.clear()
}

export function useRoleMenuAccess(userId?: string) {
  const key = userId ? cacheKey(userId) : ''
  const initial = key ? menuAccessCache.get(key)?.access ?? null : null
  const [menuAccess, setMenuAccess] = useState<RoleMenuAccess | null>(initial)
  const [loading, setLoading] = useState(!initial && !!userId)
  const [error, setError] = useState<string | null>(null)

  const loadMenuAccess = useCallback(async (force = false) => {
    if (!userId) {
      setLoading(false)
      setMenuAccess(null)
      return
    }

    if (force) {
      invalidateRoleMenuAccessCache(userId)
    }

    try {
      const hasFreshCache =
        !force &&
        menuAccessCache.has(cacheKey(userId)) &&
        Date.now() - (menuAccessCache.get(cacheKey(userId))?.fetchedAt || 0) < CACHE_TTL_MS

      if (!hasFreshCache) {
        setLoading(true)
      }
      setError(null)
      const access = await fetchMenuAccess(userId)
      setMenuAccess(access)
    } catch (err: any) {
      console.error('Error loading menu access:', err)
      setError(err.message || 'Failed to load menu access')
      // Keep any previous access so tab switches don't wipe the nav
      setMenuAccess((prev) => prev)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadMenuAccess(false)
  }, [loadMenuAccess])

  return {
    menuAccess,
    loading,
    error,
    refetch: () => loadMenuAccess(true),
  }
}
