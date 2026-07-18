"use client"

import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, ChevronDown, ChevronRight } from "lucide-react"
import { roleMenuApi } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { navigationCategories } from "@/lib/navigation"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface RoleMenuConfigProps {
  roleId: string
  roleName: string
  onConfigChange?: (config: MenuConfig) => void
}

interface MenuConfig {
  categories: Array<{ categoryId: string; isAllowed: boolean }>
  menuItems: Array<{ categoryId: string; menuItemPath: string; isAllowed: boolean }>
  tabs: Array<{ pagePath: string; tabId: string; isAllowed: boolean }>
  queues: Array<{ servicePoint: string; isAllowed: boolean }>
}

export interface RoleMenuConfigRef {
  save: () => Promise<void>
  getConfig: () => MenuConfig | null
}

// Queue service points configuration
const QUEUE_SERVICE_POINTS = [
  { value: "triage", label: "Triage" },
  { value: "registration", label: "Registration" },
  { value: "consultation", label: "Consultation" },
  { value: "laboratory", label: "Laboratory" },
  { value: "radiology", label: "Radiology" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "billing", label: "Billing" },
  { value: "cashier", label: "Cashier" },
  { value: "telemedicine", label: "Telemedicine" },
  { value: "procedure", label: "Procedure" },
]

// Common page tabs configuration
const PAGE_TABS: Record<string, Array<{ value: string; label: string }>> = {
  "/patients/[id]": [
    { value: "overview", label: "Overview" },
    { value: "vitals", label: "Vitals" },
    { value: "lab-results", label: "Lab Results" },
    { value: "medications", label: "Medications" },
    { value: "procedures", label: "Procedures" },
    { value: "orders", label: "Orders" },
    { value: "appointments", label: "Appointments" },
    { value: "billing", label: "Billing" },
    { value: "admissions", label: "Admissions" },
    { value: "documents", label: "Documents" },
    { value: "allergies", label: "Allergies" },
    { value: "ncd", label: "NCD Care" },
    { value: "insurance", label: "Insurance" },
    { value: "family-history", label: "Family History" },
    { value: "queue-status", label: "Queue Status" },
  ],
  "/procurement/vendors/[id]": [
    { value: "overview", label: "Overview" },
    { value: "products", label: "Products" },
    { value: "orders", label: "Orders" },
    { value: "contracts", label: "Contracts" },
    { value: "documents", label: "Documents" },
    { value: "ratings", label: "Ratings" },
    { value: "issues", label: "Issues" },
    { value: "performance", label: "Performance" },
  ],
  "/inpatient": [
    { value: "patients", label: "Inpatients" },
    { value: "beds", label: "Bed Management" },
    { value: "ward-status", label: "Ward Status" },
    { value: "wards", label: "Ward Management" },
  ],
  "/pharmacy": [
    { value: "prescriptions", label: "Prescriptions" },
    { value: "medications", label: "Medications" },
    { value: "drug-inventory", label: "Drug Inventory" },
    { value: "drug-inventory-summary", label: "Inventory Summary" },
    { value: "batch-trace", label: "Batch Trace" },
    { value: "drug-history", label: "Drug History" },
    { value: "nurse-pickup", label: "Nurse Pickup" },
  ],
  "/laboratory": [
    { value: "tests", label: "Test Requests" },
    { value: "queue", label: "Queue" },
    { value: "catalog", label: "Test Catalog" },
  ],
}

export const RoleMenuConfig = forwardRef<RoleMenuConfigRef, RoleMenuConfigProps>(
  ({ roleId, roleName, onConfigChange }, ref) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<MenuConfig>({
    categories: [],
    menuItems: [],
    tabs: [],
    queues: [],
  })
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadConfig()
  }, [roleId])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const data = await roleMenuApi.getMenuConfig(roleId)

      // Transform API response to our format
      const categories = data.categories || []
      const menuItems = data.menuItems || []
      const tabs = data.tabs || []
      const queues = data.queues || []

      console.log("Loading menu config for role:", roleId, {
        categoriesFromAPI: categories,
        menuItemsFromAPI: menuItems,
        tabsFromAPI: tabs,
        queuesFromAPI: queues
      })

      const newConfig = {
        categories: navigationCategories.map(cat => {
          const existing = categories.find((c: any) => c.categoryId === cat.id)
          // If not in database, default to false (denied) - secure by default
          const isAllowed = existing ? (existing.isAllowed === true || existing.isAllowed === 1) : false
          return {
            categoryId: cat.id,
            isAllowed,
          }
        }),
        menuItems: navigationCategories.flatMap(cat =>
          cat.items.map(item => {
            const existing = menuItems.find(
              (m: any) => m.categoryId === cat.id && m.menuItemPath === item.href
            )
            // If not in database, default to false (denied) - secure by default
            const isAllowed = existing ? (existing.isAllowed === true || existing.isAllowed === 1) : false
            return {
              categoryId: cat.id,
              menuItemPath: item.href,
              isAllowed,
            }
          })
        ),
        tabs: Object.entries(PAGE_TABS).flatMap(([pagePath, pageTabs]) =>
          pageTabs.map(tab => {
            const existing = tabs.find(
              (t: any) => t.pagePath === pagePath && t.tabId === tab.value
            )
            // If not in database, default to false (denied) - secure by default
            const isAllowed = existing ? (existing.isAllowed === true || existing.isAllowed === 1) : false
            return {
              pagePath,
              tabId: tab.value,
              isAllowed,
            }
          })
        ),
        queues: QUEUE_SERVICE_POINTS.map(sp => {
          const existing = queues.find((q: any) => q.servicePoint === sp.value)
          // If not in database, default to false (denied) - secure by default
          const isAllowed = existing ? (existing.isAllowed === true || existing.isAllowed === 1) : false
          return {
            servicePoint: sp.value,
            isAllowed,
          }
        }),
      }
      setConfig(newConfig)
      if (onConfigChange) {
        onConfigChange(newConfig)
      }
    } catch (error: any) {
      console.error("Error loading menu config:", error)
      toast({
        title: "Error",
        description: "Failed to load menu configuration.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c =>
        c.categoryId === categoryId ? { ...c, isAllowed: checked } : c
      ),
      // When category is disabled, disable all items in it
      menuItems: prev.menuItems.map(m =>
        m.categoryId === categoryId ? { ...m, isAllowed: checked } : m
      ),
    }))
  }

  const handleMenuItemToggle = (categoryId: string, path: string, checked: boolean) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        menuItems: prev.menuItems.map(m =>
          m.categoryId === categoryId && m.menuItemPath === path
            ? { ...m, isAllowed: checked }
            : m
        ),
      }
      if (onConfigChange) {
        onConfigChange(newConfig)
      }
      return newConfig
    })
  }

  const handleTabToggle = (pagePath: string, tabId: string, checked: boolean) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        tabs: prev.tabs.map(t =>
          t.pagePath === pagePath && t.tabId === tabId ? { ...t, isAllowed: checked } : t
        ),
      }
      if (onConfigChange) {
        onConfigChange(newConfig)
      }
      return newConfig
    })
  }

  const handleQueueToggle = (servicePoint: string, checked: boolean) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        queues: prev.queues.map(q =>
          q.servicePoint === servicePoint ? { ...q, isAllowed: checked } : q
        ),
      }
      if (onConfigChange) {
        onConfigChange(newConfig)
      }
      return newConfig
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      console.log("Saving menu config for role:", roleId)
      console.log("Config data:", {
        categories: config.categories?.length || 0,
        menuItems: config.menuItems?.length || 0,
        tabs: config.tabs?.length || 0,
        queues: config.queues?.length || 0,
      })

      // Validate config has required data
      if (!config.categories || !config.menuItems || !config.tabs || !config.queues) {
        throw new Error("Configuration data is incomplete")
      }

      const result = await roleMenuApi.updateMenuConfig(roleId, {
        categories: config.categories,
        menuItems: config.menuItems,
        tabs: config.tabs,
        queues: config.queues,
      })

      console.log("Save result:", result)
      return result
    } catch (error: any) {
      console.error("Error saving menu config:", error)
      const errorMessage = error?.response?.error || error?.response?.message || error?.message || "Failed to save menu configuration."
      throw new Error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  // Expose save function and config to parent via ref
  // Use a ref to ensure we always get the latest config state
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  useImperativeHandle(ref, () => ({
    save: async () => {
      // Use the ref to get the latest config state
      const currentConfig = configRef.current
      console.log("handleSave called with config:", {
        categoriesCount: currentConfig.categories?.length || 0,
        menuItemsCount: currentConfig.menuItems?.length || 0,
        tabsCount: currentConfig.tabs?.length || 0,
        queuesCount: currentConfig.queues?.length || 0,
      })

      // Validate config has required data
      if (!currentConfig.categories || !currentConfig.menuItems || !currentConfig.tabs || !currentConfig.queues) {
        throw new Error("Configuration data is incomplete")
      }

      try {
        setSaving(true)
        console.log("Saving menu config for role:", roleId)
        console.log("Config data being saved:", {
          categories: currentConfig.categories?.length || 0,
          menuItems: currentConfig.menuItems?.length || 0,
          tabs: currentConfig.tabs?.length || 0,
          queues: currentConfig.queues?.length || 0,
        })

        const result = await roleMenuApi.updateMenuConfig(roleId, {
          categories: currentConfig.categories,
          menuItems: currentConfig.menuItems,
          tabs: currentConfig.tabs,
          queues: currentConfig.queues,
        })

        console.log("Save result:", result)
        return result
      } catch (error: any) {
        console.error("Error saving menu config:", error)
        const errorMessage = error?.response?.error || error?.response?.message || error?.message || "Failed to save menu configuration."
        throw new Error(errorMessage)
      } finally {
        setSaving(false)
      }
    },
    getConfig: () => configRef.current,
  }), [roleId])

  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const selectAllCategories = () => {
    setConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c => ({ ...c, isAllowed: true })),
      menuItems: prev.menuItems.map(m => ({ ...m, isAllowed: true })),
    }))
  }

  const deselectAllCategories = () => {
    setConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c => ({ ...c, isAllowed: false })),
      menuItems: prev.menuItems.map(m => ({ ...m, isAllowed: false })),
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 flex flex-col h-full relative">
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Menu & Tab Access Configuration
                <Badge variant="default" className="text-sm font-semibold">
                  {roleName}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-2">
                Configure which menus, sidebar items, and tabs this role can access
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllCategories}>
                Allow All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAllCategories}>
                Deny All
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log("Save Configuration button clicked (header)")
                  handleSave()
                }}
                disabled={saving}
                size="sm"
                className="ml-2"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">
              {/* Top Menu Categories */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Top Menu Categories</h3>
                <div className="space-y-2">
                  {navigationCategories.map(category => {
                    const categoryConfig = config.categories.find(c => c.categoryId === category.id)
                    // Default to false if not found - secure by default
                    const isAllowed = categoryConfig?.isAllowed ?? false
                    const isExpanded = expandedCategories.has(category.id)
                    const categoryItems = config.menuItems.filter(m => m.categoryId === category.id)
                    const allowedItems = categoryItems.filter(m => m.isAllowed).length

                    return (
                      <Card key={category.id} className="border-l-4 border-l-primary">
                        <Collapsible open={isExpanded} onOpenChange={() => toggleCategoryExpanded(category.id)}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent">
                              <div className="flex items-center gap-3">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                <Checkbox
                                  checked={isAllowed}
                                  onCheckedChange={(checked) =>
                                    handleCategoryToggle(category.id, checked as boolean)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div>
                                  <div className="font-medium">{category.title}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {allowedItems} / {categoryItems.length} items allowed
                                  </div>
                                </div>
                              </div>
                              <Badge variant={isAllowed ? "default" : "secondary"}>
                                {isAllowed ? "Allowed" : "Denied"}
                              </Badge>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 space-y-2">
                              <Separator />
                              <div className="text-sm font-medium mb-2">Sidebar Items:</div>
                              {category.items.map(item => {
                                const itemConfig = config.menuItems.find(
                                  m => m.categoryId === category.id && m.menuItemPath === item.href
                                )
                                // Default to false if not found - secure by default
                                const itemAllowed = itemConfig?.isAllowed ?? false

                                return (
                                  <div
                                    key={item.href}
                                    className="flex items-center gap-3 p-2 rounded hover:bg-accent"
                                  >
                                    <Checkbox
                                      checked={itemAllowed}
                                      onCheckedChange={(checked) =>
                                        handleMenuItemToggle(category.id, item.href, checked as boolean)
                                      }
                                      disabled={!isAllowed}
                                    />
                                    <div className="flex-1">
                                      <div className="text-sm font-medium">{item.title}</div>
                                      <div className="text-xs text-muted-foreground">{item.href}</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    )
                  })}
                </div>
              </div>

              <Separator className="my-6" />

              {/* Queue Service Points */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Queue Service Points</h3>
                <Card>
                  <CardHeader>
                    <CardDescription>
                      Configure which queue service points this role can access. Users will only see queues for allowed service points.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {QUEUE_SERVICE_POINTS.map(sp => {
                        const queueConfig = config.queues.find(q => q.servicePoint === sp.value)
                        // Default to false if not found - secure by default
                        const isAllowed = queueConfig?.isAllowed ?? false

                        return (
                          <div
                            key={sp.value}
                            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                          >
                            <Checkbox
                              checked={isAllowed}
                              onCheckedChange={(checked) =>
                                handleQueueToggle(sp.value, checked as boolean)
                              }
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm">{sp.label}</div>
                              <div className="text-xs text-muted-foreground">{sp.value}</div>
                            </div>
                            <Badge variant={isAllowed ? "default" : "secondary"}>
                              {isAllowed ? "Allowed" : "Denied"}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator className="my-6" />

              {/* Page Tabs */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Page Tabs</h3>
                <div className="space-y-4">
                  {Object.entries(PAGE_TABS).map(([pagePath, tabs]) => {
                    const pageTabs = config.tabs.filter(t => t.pagePath === pagePath)
                    const allowedTabs = pageTabs.filter(t => t.isAllowed).length

                    return (
                      <Card key={pagePath}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base">{pagePath}</CardTitle>
                              <CardDescription>
                                {allowedTabs} / {tabs.length} tabs allowed
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-3">
                            {tabs.map(tab => {
                              const tabConfig = config.tabs.find(
                                t => t.pagePath === pagePath && t.tabId === tab.value
                              )
                              // Default to false if not found - secure by default
                              const tabAllowed = tabConfig?.isAllowed ?? false

                              return (
                                <div
                                  key={tab.value}
                                  className="flex items-center gap-2 p-2 rounded hover:bg-accent"
                                >
                                  <Checkbox
                                    checked={tabAllowed}
                                    onCheckedChange={(checked) =>
                                      handleTabToggle(pagePath, tab.value, checked as boolean)
                                    }
                                  />
                                  <label className="text-sm cursor-pointer flex-1">
                                    {tab.label}
                                  </label>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t pt-4 pb-2 flex justify-end gap-2 flex-shrink-0 z-10 shadow-lg -mx-4 px-4">
        <Button
          type="button"
          variant="outline"
          onClick={loadConfig}
        >
          Reset
        </Button>
      </div>
    </div>
  )
})
