"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { diagnosesApi } from "@/lib/api"

interface Diagnosis {
  diagnosisId: number
  icd10Code?: string
  diagnosisName: string
  category?: string
  description?: string
}

interface DiagnosisComboboxProps {
  value?: string
  onValueChange: (value: string, diagnosis?: Diagnosis) => void
  placeholder?: string
  disabled?: boolean
  allowMultiple?: boolean
  selectedDiagnoses?: Diagnosis[]
  onRemoveDiagnosis?: (diagnosisId: number) => void
  /** Use true when rendered inside a Dialog so the list receives pointer events */
  modal?: boolean
}

export function DiagnosisCombobox({
  value,
  onValueChange,
  placeholder = "Search ICD-10 diagnosis...",
  disabled = false,
  allowMultiple = false,
  selectedDiagnoses = [],
  onRemoveDiagnosis,
  modal = false,
}: DiagnosisComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [diagnoses, setDiagnoses] = React.useState<Diagnosis[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  // Load diagnoses when popover opens - load all first
  React.useEffect(() => {
    if (open) {
      // Load all diagnoses first, then filter as user types
      loadDiagnoses("")
    } else {
      // Clear results when closed
      setSearchQuery("")
    }
  }, [open])

  // Debounced search - reload when search query changes
  React.useEffect(() => {
    if (!open) return

    const timer = setTimeout(() => {
      loadDiagnoses(searchQuery.trim() || "")
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, open])

  const loadDiagnoses = async (search?: string) => {
    try {
      setLoading(true)
      const data = await diagnosesApi.getAll(search || "", 1, 50)
      setDiagnoses(Array.isArray(data) ? data : [])
      
      // Log for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log(`Loaded ${data?.length || 0} diagnoses${search ? ` for search: "${search}"` : ''}`)
      }
    } catch (error: any) {
      console.error("Error loading diagnoses:", error)
      console.error("Error details:", {
        message: error?.message,
        status: error?.status,
        response: error?.response
      })
      setDiagnoses([])
      
      // Show user-friendly error in development
      if (process.env.NODE_ENV === 'development') {
        console.warn("Diagnoses API Error - Check if:")
        console.warn("1. The diagnoses table exists in the database")
        console.warn("2. The API endpoint /api/diagnoses is accessible")
        console.warn("3. Sample data has been loaded (see api/database/sample_data/18_icd10_diagnoses_sample.sql)")
      }
    } finally {
      setLoading(false)
    }
  }

  const selectedDiagnosis = diagnoses.find(
    (d) => d.diagnosisId.toString() === value
  )

  const getDiagnosisDisplay = (diagnosis: Diagnosis) => {
    if (diagnosis.icd10Code) {
      return `${diagnosis.icd10Code} - ${diagnosis.diagnosisName}`
    }
    return diagnosis.diagnosisName
  }

  const handleSelect = (diagnosis: Diagnosis) => {
    if (allowMultiple) {
      // For multiple selection, add to list
      onValueChange(diagnosis.diagnosisId.toString(), diagnosis)
      setSearchQuery("")
      // Don't close popover for multiple selection
    } else {
      // Single selection
      onValueChange(diagnosis.diagnosisId.toString(), diagnosis)
      setOpen(false)
      setSearchQuery("")
    }
  }

  // Filter out already selected diagnoses in multiple mode
  const availableDiagnoses = allowMultiple
    ? diagnoses.filter(
        (d) => !selectedDiagnoses.some((sd) => sd.diagnosisId === d.diagnosisId)
      )
    : diagnoses

  return (
    <div className="space-y-2">
      {allowMultiple && selectedDiagnoses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedDiagnoses.map((diagnosis) => (
            <Badge
              key={diagnosis.diagnosisId}
              variant="secondary"
              className="flex items-center gap-1 py-1"
            >
              <span className="text-xs">
                {diagnosis.icd10Code && (
                  <span className="font-mono font-semibold">
                    {diagnosis.icd10Code}
                  </span>
                )}
                <span className="ml-1">{diagnosis.diagnosisName}</span>
              </span>
              {onRemoveDiagnosis && (
                <button
                  type="button"
                  onClick={() => onRemoveDiagnosis(diagnosis.diagnosisId)}
                  className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen} modal={modal}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
            type="button"
          >
            {selectedDiagnosis && !allowMultiple
              ? getDiagnosisDisplay(selectedDiagnosis)
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by ICD-10 code (e.g., I10, E11.9) or name (e.g., hypertension, diabetes)..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading diagnoses...
                  </span>
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {loading ? (
                      <div className="py-6 text-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Loading diagnoses...</p>
                      </div>
                    ) : searchQuery ? (
                      <div className="py-6 text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          No diagnoses found matching "{searchQuery}"
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Try searching by ICD-10 code (e.g., "I10", "E11.9") or diagnosis name (e.g., "hypertension", "diabetes")
                        </p>
                        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded text-left space-y-1">
                          <p className="font-medium mb-1">💡 Troubleshooting:</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            <li>Check if the diagnoses table has data</li>
                            <li>Try a broader search term</li>
                            <li>Verify API endpoint is working: <code className="text-xs">/api/diagnoses</code></li>
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center">
                        <p className="text-sm text-muted-foreground mb-2">
                          {diagnoses.length === 0 
                            ? "No diagnoses available" 
                            : `Showing ${diagnoses.length} diagnoses - Start typing to search`}
                        </p>
                        {diagnoses.length === 0 && (
                          <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 rounded text-left space-y-2 mt-3">
                            <p className="font-medium text-amber-900 dark:text-amber-200">⚠️ Diagnoses table is empty</p>
                            <p className="text-amber-800 dark:text-amber-300">
                              To populate the database, run:
                            </p>
                            <code className="block text-xs bg-white dark:bg-gray-900 p-2 rounded mt-1 font-mono">
                              mysql -u user -p database &lt; api/database/sample_data/18_icd10_diagnoses_sample.sql
                            </code>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                              Or manually add diagnoses via the API endpoint.
                            </p>
                          </div>
                        )}
                        {diagnoses.length > 0 && (
                          <div className="text-xs text-muted-foreground space-y-1 mt-3 text-left px-4">
                            <p className="font-medium mb-2">Search examples:</p>
                            <ul className="list-disc list-inside space-y-1">
                              <li>ICD-10 code: <span className="font-mono">I10</span> (Hypertension)</li>
                              <li>ICD-10 code: <span className="font-mono">E11.9</span> (Type 2 Diabetes)</li>
                              <li>Diagnosis name: "hypertension", "diabetes", "pneumonia"</li>
                              <li>Category: "Cardiovascular", "Respiratory", "Infectious"</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {availableDiagnoses.map((diagnosis) => (
                      <CommandItem
                        key={diagnosis.diagnosisId}
                        value={diagnosis.diagnosisId.toString()}
                        onSelect={() => handleSelect(diagnosis)}
                        className="flex flex-col items-start py-3"
                      >
                        <div className="flex items-center w-full">
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0",
                              value === diagnosis.diagnosisId.toString()
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div className="flex-1">
                            {diagnosis.icd10Code && (
                              <span className="font-mono font-semibold text-sm mr-2">
                                {diagnosis.icd10Code}
                              </span>
                            )}
                            <span className="font-medium">
                              {diagnosis.diagnosisName}
                            </span>
                          </div>
                        </div>
                        {diagnosis.category && (
                          <span className="text-xs text-muted-foreground ml-6 mt-1">
                            {diagnosis.category}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

