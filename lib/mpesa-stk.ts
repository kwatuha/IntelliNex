"use client"

/**
 * Shared M-Pesa STK initiate + poll helper for cashier / billing UIs.
 */
import { billingApi } from "@/lib/api"

export type StkAllocation = { invoiceId: number; amount: number; invoiceNumber?: string }

export type StkPollResult = {
  status: string
  mpesaReceiptNumber?: string | null
  resultDesc?: string | null
  resultCode?: number | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll until success/applied/failed or timeout (default 2 minutes). */
export async function pollMpesaStkStatus(
  checkoutRequestId: string,
  opts?: {
    intervalMs?: number
    timeoutMs?: number
    onTick?: (status: StkPollResult) => void
    signal?: AbortSignal
  }
): Promise<StkPollResult> {
  const intervalMs = opts?.intervalMs ?? 3000
  const timeoutMs = opts?.timeoutMs ?? 120_000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    if (opts?.signal?.aborted) {
      throw new Error("STK status check cancelled")
    }
    const status = await billingApi.getMpesaStkStatus(checkoutRequestId)
    opts?.onTick?.(status)
    if (status.status === "success" || status.status === "applied") {
      if (status.status === "success" && !status.appliedAt) {
        try {
          await billingApi.finalizeMpesaStk(checkoutRequestId)
        } catch {
          /* callback may still be applying */
        }
      }
      return status
    }
    if (status.status === "failed") {
      return status
    }
    await sleep(intervalMs)
  }
  throw new Error("Timed out waiting for M-Pesa confirmation. Check Mobile Payment status or ask the patient to retry.")
}

export async function startMpesaStkPayment(params: {
  amount: number
  phone: string
  patientId?: number
  allocations: StkAllocation[]
  batchReceiptNumber?: string
}): Promise<{ checkoutRequestId: string; message?: string }> {
  const res = await billingApi.initiateMpesaStk(params)
  const checkoutRequestId = res.checkoutRequestId || res.checkout_request_id
  if (!checkoutRequestId) {
    throw new Error(res.message || "STK push did not return a checkout request id")
  }
  return { checkoutRequestId, message: res.message }
}
