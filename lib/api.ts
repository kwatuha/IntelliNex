// API utility functions for making requests to the backend

// Use relative URLs when in browser (same origin), or use NEXT_PUBLIC_API_URL if set
// This allows the API to work both in development and production behind nginx
const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '')  // Empty string = relative URLs (same origin)
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');  // Server-side needs absolute URL

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  /** Abort request after this many ms (avoids infinite hang if API is unreachable). */
  timeoutMs?: number;
}

/** Parse error message from failed response body (JSON or HTML/text from proxies). */
function parseFailedResponseBodyText(rawText: string, status: number, statusText: string): string {
  const trimmed = rawText?.trim() || '';
  if (!trimmed) {
    return `Request failed (${status} ${statusText || ''})`.trim();
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return (
        (parsed.error as string) ||
        (parsed.message as string) ||
        (parsed.msg as string) ||
        `HTTP error! status: ${status}`
      );
    }
  } catch {
    return trimmed.length > 400 ? `${trimmed.slice(0, 200)}… (${status})` : `${trimmed} (${status})`;
  }
  return `HTTP error! status: ${status}`;
}

async function apiRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeoutMs } = options;

  // Get token from localStorage (could be JWT from backend or simple token from frontend)
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    // Try to get JWT token from backend login (stored as 'token' or 'jwt_token')
    token = localStorage.getItem('token') ||
            localStorage.getItem('jwt_token') ||
            localStorage.getItem('auth_token');
  }
  const currentBranchId = typeof window !== 'undefined'
    ? localStorage.getItem('current_branch_id')
    : null;

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (typeof timeoutMs === 'number' && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  const config: RequestInit = {
    method,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(currentBranchId && { 'X-Branch-Id': currentBranchId }),
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      const base =
        typeof window !== 'undefined'
          ? process.env.NEXT_PUBLIC_API_URL || '(same origin — set NEXT_PUBLIC_API_URL to your API host if the app runs on a different port)'
          : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      throw new Error(
        timeoutMs
          ? `Request timed out after ${timeoutMs}ms. The API may be slow, the database busy, or the request never reached the backend. ` +
              `Configured API base: ${base}. ` +
              `For local dev, set NEXT_PUBLIC_API_URL to your API (e.g. http://localhost:3101) and restart Next.js.`
          : 'Request was cancelled.'
      );
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // If 401, try to clear invalid token
    if (response.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('auth_token');
    }

    const rawText = await response.text();
    const errorMessage = parseFailedResponseBodyText(rawText, response.status, response.statusText);
    const fullError = new Error(errorMessage);
    // Attach additional error details for debugging
    (fullError as any).status = response.status;
    try {
      (fullError as any).response = rawText ? JSON.parse(rawText) : null;
    } catch {
      (fullError as any).response = { raw: rawText?.slice(0, 500) };
    }
    throw fullError;
  }

  return response.json();
}

// Patient API
export const patientApi = {
  getAll: (search?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/patients?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/patients/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/patients', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/patients/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/patients/${id}`, { method: 'DELETE' }),

  // Patient allergies
  getAllergies: (patientId: string) =>
    apiRequest<any[]>(`/api/patients/${patientId}/allergies`),

  getAllergy: (patientId: string, allergyId: string) =>
    apiRequest<any>(`/api/patients/${patientId}/allergies/${allergyId}`),

  createAllergy: (patientId: string, data: any) =>
    apiRequest<any>(`/api/patients/${patientId}/allergies`, { method: 'POST', body: data }),

  updateAllergy: (patientId: string, allergyId: string, data: any) =>
    apiRequest<any>(`/api/patients/${patientId}/allergies/${allergyId}`, { method: 'PUT', body: data }),

  deleteAllergy: (patientId: string, allergyId: string) =>
    apiRequest<any>(`/api/patients/${patientId}/allergies/${allergyId}`, { method: 'DELETE' }),

        // Patient vitals
        getVitals: (patientId: string, today?: boolean, date?: string) => {
          const params = new URLSearchParams();
          if (today) params.append('today', 'true');
          if (date) params.append('date', date);
          return apiRequest<any[]>(`/api/patients/${patientId}/vitals${params.toString() ? `?${params.toString()}` : ''}`);
        },

        // Get all vital signs from today
        getTodayVitals: () =>
          apiRequest<any[]>(`/api/patients/vitals/today`),

        // Patient family history
        getFamilyHistory: (patientId: string) =>
          apiRequest<any[]>(`/api/patients/${patientId}/family-history`),

        createFamilyHistory: (patientId: string, data: any) =>
          apiRequest<any>(`/api/patients/${patientId}/family-history`, { method: 'POST', body: data }),

        updateFamilyHistory: (patientId: string, id: string, data: any) =>
          apiRequest<any>(`/api/patients/${patientId}/family-history/${id}`, { method: 'PUT', body: data }),

        deleteFamilyHistory: (patientId: string, id: string) =>
          apiRequest<any>(`/api/patients/${patientId}/family-history/${id}`, { method: 'DELETE' }),

        // Patient documents
        getDocuments: (patientId: string) =>
          apiRequest<any[]>(`/api/patients/${patientId}/documents`),

        createDocument: (patientId: string, formData: FormData) => {
          // Use relative URL in browser, or public URL if set
          const baseUrl = typeof window !== 'undefined'
            ? (process.env.NEXT_PUBLIC_API_URL || '')
            : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

          // Get token from localStorage
          let token: string | null = null;
          if (typeof window !== 'undefined') {
            token = localStorage.getItem('token') ||
                    localStorage.getItem('jwt_token') ||
                    localStorage.getItem('auth_token');
          }

          return fetch(`${baseUrl}/api/patients/${patientId}/documents`, {
            method: 'POST',
            headers: {
              ...(token && { 'Authorization': `Bearer ${token}` }),
              // Don't set Content-Type - let browser set it with boundary for FormData
            },
            body: formData,
          }).then(async (res) => {
            if (!res.ok) {
              const text = await res.text();
              throw new Error(parseFailedResponseBodyText(text, res.status, res.statusText));
            }
            return res.json();
          });
        },

        updateDocument: (patientId: string, documentId: string, data: any) =>
          apiRequest<any>(`/api/patients/${patientId}/documents/${documentId}`, { method: 'PUT', body: data }),

        deleteDocument: (patientId: string, documentId: string) =>
          apiRequest<any>(`/api/patients/${patientId}/documents/${documentId}`, { method: 'DELETE' }),

        downloadDocument: (patientId: string, documentId: string) => {
          // Use relative URL in browser, or public URL if set
          const baseUrl = typeof window !== 'undefined'
            ? (process.env.NEXT_PUBLIC_API_URL || '')
            : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
          return `${baseUrl}/api/patients/${patientId}/documents/${documentId}/download`;
        },
      };

// Department API
export const departmentApi = {
  getAll: (search?: string) =>
    apiRequest<any[]>(`/api/departments?${new URLSearchParams(search ? { search } : {})}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/departments/${id}`),

  getEmployees: (id: string) =>
    apiRequest<any[]>(`/api/departments/${id}/employees`),

  getPositions: (id: string) =>
    apiRequest<any[]>(`/api/departments/${id}/positions`),

  create: (data: any) =>
    apiRequest<any>('/api/departments', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/departments/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/departments/${id}`, { method: 'DELETE' }),
};

// Pharmacy API
export const pharmacyApi = {
  // Medications
  getMedications: (search?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/pharmacy/medications?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }) })}`),

  getMedication: (id: string) =>
    apiRequest<any>(`/api/pharmacy/medications/${id}`),

  createMedication: (data: any) =>
    apiRequest<any>('/api/pharmacy/medications', { method: 'POST', body: data }),

  updateMedication: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/medications/${id}`, { method: 'PUT', body: data }),

  deleteMedication: (id: string) =>
    apiRequest<any>(`/api/pharmacy/medications/${id}`, { method: 'DELETE' }),

  // Prescriptions
  getPrescriptions: (patientId?: string, status?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/pharmacy/prescriptions?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(patientId && { patientId }), ...(status && { status }) })}`),

  getPrescription: (id: string) =>
    apiRequest<any>(`/api/pharmacy/prescriptions/${id}`),

  createPrescription: (data: any) =>
    apiRequest<any>('/api/pharmacy/prescriptions', { method: 'POST', body: data }),

  updatePrescription: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/prescriptions/${id}`, { method: 'PUT', body: data }),

  // Inventory
  getInventory: () =>
    apiRequest<any[]>('/api/pharmacy/inventory'),

  // Drug Inventory
  getDrugInventory: (medicationId?: string, search?: string, page = 1, limit = 50, location?: string) =>
    apiRequest<any[]>(`/api/pharmacy/drug-inventory?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(medicationId && { medicationId }), ...(search && { search }), ...(location && { location }) })}`),

  getDrugInventorySummary: (search?: string, page = 1, limit = 100) =>
    apiRequest<{ data: any[], pagination: any }>(`/api/pharmacy/drug-inventory/summary?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }) })}`),

  getInventoryValueByLocation: (filters?: { location?: string; search?: string; dateFrom?: string; dateTo?: string }) => {
    const params = new URLSearchParams()
    if (filters?.location && filters.location !== 'all') params.append('location', filters.location)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom)
    if (filters?.dateTo) params.append('dateTo', filters.dateTo)
    return apiRequest<{ data: any[]; totals: { quantity: number; amountValue: number } }>(`/api/pharmacy/drug-inventory/value-by-location?${params.toString()}`)
  },

  getDrugInventoryItem: (id: string) =>
    apiRequest<any>(`/api/pharmacy/drug-inventory/${id}`),

  createDrugInventoryItem: (data: any) =>
    apiRequest<any>('/api/pharmacy/drug-inventory', { method: 'POST', body: data }),

  updateDrugInventoryItem: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/drug-inventory/${id}`, { method: 'PUT', body: data }),

  deleteDrugInventoryItem: (id: string) =>
    apiRequest<any>(`/api/pharmacy/drug-inventory/${id}`, { method: 'DELETE' }),

  // Branches
  getBranches: (search?: string, isActive?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (isActive) params.append('isActive', isActive);
    return apiRequest<any[]>(`/api/pharmacy/branches?${params.toString()}`);
  },

  getBranch: (id: string) =>
    apiRequest<any>(`/api/pharmacy/branches/${id}`),

  createBranch: (data: any) =>
    apiRequest<any>('/api/pharmacy/branches', { method: 'POST', body: data }),

  updateBranch: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/branches/${id}`, { method: 'PUT', body: data }),

  deleteBranch: (id: string) =>
    apiRequest<any>(`/api/pharmacy/branches/${id}`, { method: 'DELETE' }),

  // Drug Stores
  getDrugStores: (branchId?: string, search?: string, isActive?: string, isDispensingStore?: string) => {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (search) params.append('search', search);
    if (isActive) params.append('isActive', isActive);
    if (isDispensingStore) params.append('isDispensingStore', isDispensingStore);
    return apiRequest<any[]>(`/api/pharmacy/drug-stores?${params.toString()}`);
  },

  getDrugStore: (id: string) =>
    apiRequest<any>(`/api/pharmacy/drug-stores/${id}`),

  createDrugStore: (data: any) =>
    apiRequest<any>('/api/pharmacy/drug-stores', { method: 'POST', body: data }),

  updateDrugStore: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/drug-stores/${id}`, { method: 'PUT', body: data }),

  deleteDrugStore: (id: string) =>
    apiRequest<any>(`/api/pharmacy/drug-stores/${id}`, { method: 'DELETE' }),

  // Stock transfers between stores/branches
  getStockTransfers: (filters?: { status?: string; fromStoreId?: string; toStoreId?: string; branchId?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.fromStoreId) params.append('fromStoreId', filters.fromStoreId)
    if (filters?.toStoreId) params.append('toStoreId', filters.toStoreId)
    if (filters?.branchId) params.append('branchId', filters.branchId)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))
    return apiRequest<any[]>(`/api/pharmacy/stock-transfers?${params.toString()}`)
  },

  getStockTransfer: (id: string) =>
    apiRequest<any>(`/api/pharmacy/stock-transfers/${id}`),

  createStockTransfer: (data: any) =>
    apiRequest<any>('/api/pharmacy/stock-transfers', { method: 'POST', body: data }),

  updateStockTransferStatus: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/stock-transfers/${id}/status`, { method: 'PATCH', body: data }),

  // External chemist stock supply requests
  getChemistStockRequests: (filters?: { status?: string; chemistId?: string; sourceStoreId?: string; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.chemistId) params.append('chemistId', filters.chemistId)
    if (filters?.sourceStoreId) params.append('sourceStoreId', filters.sourceStoreId)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))
    return apiRequest<any[]>(`/api/pharmacy/chemist-stock-requests?${params.toString()}`)
  },

  getChemistStockRequest: (id: string) =>
    apiRequest<any>(`/api/pharmacy/chemist-stock-requests/${id}`),

  createChemistStockRequest: (data: any) =>
    apiRequest<any>('/api/pharmacy/chemist/stock-requests', { method: 'POST', body: data }),

  updateChemistStockRequestStatus: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/chemist-stock-requests/${id}/status`, { method: 'PATCH', body: data }),

  // Reorder levels
  getStoreReorderLevels: (storeId: string) =>
    apiRequest<any[]>(`/api/pharmacy/drug-stores/${storeId}/reorder-levels`),

  createStoreReorderLevel: (storeId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/drug-stores/${storeId}/reorder-levels`, { method: 'POST', body: data }),

  updateReorderLevel: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/reorder-levels/${id}`, { method: 'PUT', body: data }),

  deleteReorderLevel: (id: string) =>
    apiRequest<any>(`/api/pharmacy/reorder-levels/${id}`, { method: 'DELETE' }),

  getReorderAlerts: (storeId?: string) => {
    const params = new URLSearchParams()
    if (storeId) params.append('storeId', storeId)
    return apiRequest<any[]>(`/api/pharmacy/reorder-alerts?${params.toString()}`)
  },

  checkReorderAlerts: (data?: { storeId?: number; medicationId?: number }) =>
    apiRequest<{ alerts: any[]; count: number }>('/api/pharmacy/reorder-alerts/check', { method: 'POST', body: data || {} }),

  // Dispensing
  getPaidPrescriptionItemsReadyForDispensing: (patientId?: string) => {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    return apiRequest<any[]>(`/api/pharmacy/prescriptions/paid/ready-for-dispensing?${params.toString()}`);
  },

  getPrescriptionItemsReadyForDispensing: (prescriptionId: string) =>
    apiRequest<any[]>(`/api/pharmacy/prescriptions/${prescriptionId}/items/ready-for-dispensing`),

  getAvailableDrugInventory: (medicationId: string, storeId?: string, scope: 'store' | 'branch' = 'branch') => {
    const params = new URLSearchParams()
    if (storeId) params.append('storeId', storeId)
    if (scope) params.append('scope', scope)
    const query = params.toString()
    return apiRequest<any[]>(`/api/pharmacy/drug-inventory/available/${medicationId}${query ? `?${query}` : ''}`)
  },

  createDispensation: (data: any) =>
    apiRequest<any>('/api/pharmacy/dispensations', { method: 'POST', body: data }),

  // External chemists and prescription referrals
  getExternalChemists: (search?: string, active?: boolean) => {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (active !== undefined) params.append('active', String(active))
    return apiRequest<any[]>(`/api/pharmacy/external-chemists?${params.toString()}`)
  },

  getExternalChemist: (id: string) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${id}`),

  createExternalChemist: (data: any) =>
    apiRequest<any>('/api/pharmacy/external-chemists', { method: 'POST', body: data }),

  updateExternalChemist: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${id}`, { method: 'PUT', body: data }),

  getExternalChemistDrugs: (chemistId: string, filters?: { search?: string; status?: string }) => {
    const params = new URLSearchParams()
    if (filters?.search) params.append('search', filters.search)
    if (filters?.status) params.append('status', filters.status)
    return apiRequest<any[]>(`/api/pharmacy/external-chemists/${chemistId}/drugs?${params.toString()}`)
  },

  createExternalChemistDrug: (chemistId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/drugs`, { method: 'POST', body: data }),

  updateExternalChemistDrug: (chemistId: string, chemistDrugId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/drugs/${chemistDrugId}`, { method: 'PUT', body: data }),

  deleteExternalChemistDrug: (chemistId: string, chemistDrugId: string) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/drugs/${chemistDrugId}`, { method: 'DELETE' }),

  getExternalChemistDrugMovements: (chemistId: string, chemistDrugId: string, limit = 100) =>
    apiRequest<any[]>(
      `/api/pharmacy/external-chemists/${chemistId}/drugs/${chemistDrugId}/movements?${new URLSearchParams({ limit: String(limit) })}`
    ),

  getExternalChemistLabs: (chemistId: string, filters?: { search?: string; status?: string }) => {
    const params = new URLSearchParams()
    if (filters?.search) params.append('search', filters.search)
    if (filters?.status) params.append('status', filters.status)
    return apiRequest<any[]>(`/api/pharmacy/external-chemists/${chemistId}/labs?${params.toString()}`)
  },

  createExternalChemistLab: (chemistId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/labs`, { method: 'POST', body: data }),

  updateExternalChemistLab: (chemistId: string, chemistLabId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/labs/${chemistLabId}`, { method: 'PUT', body: data }),

  deleteExternalChemistLab: (chemistId: string, chemistLabId: string) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/labs/${chemistLabId}`, { method: 'DELETE' }),

  bulkImportExternalChemistDrugs: (chemistId: string, rows: any[]) =>
    apiRequest<any>(`/api/pharmacy/external-chemists/${chemistId}/drugs/bulk`, { method: 'POST', body: { rows } }),

  getExternalChemistPriorityDrugs: (chemistId: string, limit = 100) =>
    apiRequest<any[]>(`/api/pharmacy/external-chemists/${chemistId}/priority-drugs?${new URLSearchParams({ limit: String(limit) })}`),

  getExternalChemistPrescriptionAvailability: (params: { chemistId: string; prescriptionId: string; itemIds?: Array<string | number> }) => {
    const searchParams = new URLSearchParams()
    searchParams.append('chemistId', params.chemistId)
    searchParams.append('prescriptionId', params.prescriptionId)
    if (params.itemIds?.length) searchParams.append('itemIds', params.itemIds.join(','))
    return apiRequest<any>(`/api/pharmacy/external-referrals/availability?${searchParams.toString()}`)
  },

  getExternalChemistLabAvailability: (params: { chemistId: string; labOrderId: string; itemIds?: Array<string | number> }) => {
    const searchParams = new URLSearchParams()
    searchParams.append('chemistId', params.chemistId)
    searchParams.append('labOrderId', params.labOrderId)
    if (params.itemIds?.length) searchParams.append('itemIds', params.itemIds.join(','))
    return apiRequest<any>(`/api/pharmacy/external-referrals/lab-availability?${searchParams.toString()}`)
  },

  getExternalReferrals: (filters?: { status?: string; chemistId?: string; patientId?: string; search?: string; referralType?: string }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.chemistId) params.append('chemistId', filters.chemistId)
    if (filters?.patientId) params.append('patientId', filters.patientId)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.referralType) params.append('referralType', filters.referralType)
    return apiRequest<any[]>(`/api/pharmacy/external-referrals?${params.toString()}`)
  },

  createExternalReferral: (data: any) =>
    apiRequest<any>('/api/pharmacy/external-referrals', { method: 'POST', body: data }),

  updateExternalReferralStatus: (id: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-referrals/${id}/status`, { method: 'PATCH', body: data }),

  updateExternalReferralItem: (referralId: string, referralItemId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/external-referrals/${referralId}/items/${referralItemId}`, { method: 'PATCH', body: data }),

  getCurrentChemist: () =>
    apiRequest<any>('/api/pharmacy/chemist/me'),

  getChemistStockAlerts: (status: string = 'open') =>
    apiRequest<any[]>(`/api/pharmacy/chemist/alerts?${new URLSearchParams({ status })}`),

  updateChemistStockAlert: (alertId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/chemist/alerts/${alertId}`, { method: 'PATCH', body: data }),

  getChemistUsers: (filters?: { chemistId?: string }) => {
    const params = new URLSearchParams()
    if (filters?.chemistId) params.append('chemistId', filters.chemistId)
    return apiRequest<any[]>(`/api/pharmacy/chemist/users?${params.toString()}`)
  },

  createChemistUser: (data: any) =>
    apiRequest<any>('/api/pharmacy/chemist/users', { method: 'POST', body: data }),

  updateChemistUser: (chemistUserId: string, data: any) =>
    apiRequest<any>(`/api/pharmacy/chemist/users/${chemistUserId}`, { method: 'PATCH', body: data }),

  // Batch Traceability
  getBatchTrace: (batchNumber: string) =>
    apiRequest<any>(`/api/pharmacy/batch-trace/${batchNumber}`),

  getBatchTraceList: (search?: string, medicationId?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (medicationId) params.append('medicationId', medicationId);
    const query = params.toString();
    return apiRequest<any[]>(`/api/pharmacy/batch-trace${query ? `?${query}` : ''}`);
  },

  // Drug Inventory Transaction History
  getDrugInventoryTransactions: (drugInventoryId: string) =>
    apiRequest<any>(`/api/pharmacy/drug-inventory/${drugInventoryId}/transactions`),

  getDrugInventoryTransactionsByBatch: (batchNumber: string) =>
    apiRequest<any>(`/api/pharmacy/drug-inventory/batch/${batchNumber}/transactions`),

  getMedicationInventoryHistory: (medicationId: string) =>
    apiRequest<any>(`/api/pharmacy/drug-inventory/medication/${medicationId}/history`),

  // Drug History (New comprehensive history with filters)
  getDrugHistory: (filters?: {
    medicationId?: string
    patientId?: string
    batchNumber?: string
    adjustmentType?: string
    startDate?: string
    endDate?: string
    search?: string
    page?: number
    limit?: number
  }) => {
    const params = new URLSearchParams()
    if (filters?.medicationId) params.append('medicationId', filters.medicationId)
    if (filters?.patientId) params.append('patientId', filters.patientId)
    if (filters?.batchNumber) params.append('batchNumber', filters.batchNumber)
    if (filters?.adjustmentType) params.append('adjustmentType', filters.adjustmentType)
    if (filters?.startDate) params.append('startDate', filters.startDate)
    if (filters?.endDate) params.append('endDate', filters.endDate)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.page) params.append('page', filters.page.toString())
    if (filters?.limit) params.append('limit', filters.limit.toString())
    return apiRequest<any>(`/api/pharmacy/drug-history?${params.toString()}`)
  },

  getPatientDrugHistory: (patientId: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    return apiRequest<any[]>(`/api/pharmacy/drug-history/patient/${patientId}?${params.toString()}`)
  },

  // Stock Adjustments
  createStockAdjustment: (data: any) =>
    apiRequest<any>('/api/pharmacy/stock-adjustments', { method: 'POST', body: data }),

  // Nurse Pickups (for admitted patients)
  getPrescriptionsReadyForPickup: (admissionId?: string, patientId?: string) => {
    const params = new URLSearchParams();
    if (admissionId) params.append('admissionId', admissionId);
    if (patientId) params.append('patientId', patientId);
    return apiRequest<any[]>(`/api/pharmacy/nurse-pickups/ready?${params.toString()}`);
  },

  createNursePickup: (data: { pickups: Array<{ prescriptionId: string, items: Array<{ prescriptionItemId: string, dispensationId?: string, quantityPickedUp: number, notes?: string }>, notes?: string, admissionId?: string }> }) =>
    apiRequest<any>('/api/pharmacy/nurse-pickups', { method: 'POST', body: data }),

  getNursePickups: (params?: { nurseId?: string, patientId?: string, admissionId?: string, startDate?: string, endDate?: string, status?: string, page?: number, limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, value.toString());
        }
      });
    }
    return apiRequest<{ pickups: any[], pagination: any }>(`/api/pharmacy/nurse-pickups?${searchParams.toString()}`);
  },

  getNursePickup: (id: string) =>
    apiRequest<any>(`/api/pharmacy/nurse-pickups/${id}`),

  /** Mark a pending nurse pickup as ready for pickup (pharmacy has dispensed). Removes from Pending, appears in History. */
  markNursePickupReadyForPickup: (pickupId: string) =>
    apiRequest<{ message: string; pickupId: string; status: string }>(
      `/api/pharmacy/nurse-pickups/${pickupId}`,
      { method: 'PATCH', body: { status: 'ready_for_pickup' } }
    ),

  /** Cancel a nurse pickup (pharmacist only). If status was picked_up, quantities are returned to inventory. */
  cancelNursePickup: (pickupId: string) =>
    apiRequest<{ message: string; pickupId: string; status: string }>(
      `/api/pharmacy/nurse-pickups/${pickupId}`,
      { method: 'PATCH', body: { status: 'cancelled' } }
    ),
};

// Notification API
export const notificationApi = {
  getDrugNotifications: (status?: string, priority?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (priority && priority !== 'all') params.append('priority', priority);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/notifications/drug-notifications?${params.toString()}`);
  },

  getDrugNotification: (id: string) =>
    apiRequest<any>(`/api/notifications/drug-notifications/${id}`),

  acknowledgeDrugNotification: (id: string) =>
    apiRequest<any>(`/api/notifications/drug-notifications/${id}/acknowledge`, { method: 'PUT' }),

  resolveDrugNotification: (id: string) =>
    apiRequest<any>(`/api/notifications/drug-notifications/${id}/resolve`, { method: 'PUT' }),

  deleteDrugNotification: (id: string) =>
    apiRequest<any>(`/api/notifications/drug-notifications/${id}`, { method: 'DELETE' }),

  getPharmacyNotifications: (filters?: { status?: string; notificationType?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.notificationType) params.append('notificationType', filters.notificationType)
    if (filters?.limit) params.append('limit', String(filters.limit))
    return apiRequest<any[]>(`/api/notifications/pharmacy-notifications?${params.toString()}`)
  },

  acknowledgePharmacyNotification: (id: string) =>
    apiRequest<any>(`/api/notifications/pharmacy-notifications/${id}/acknowledge`, { method: 'PUT' }),

  resolvePharmacyNotification: (id: string) =>
    apiRequest<any>(`/api/notifications/pharmacy-notifications/${id}/resolve`, { method: 'PUT' }),
};

// Laboratory API
export const laboratoryApi = {
  getTestTypes: (search?: string, category?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/laboratory/test-types?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(category && { category }) })}`),

  getTestTypeById: (id: string) =>
    apiRequest<any>(`/api/laboratory/test-types/${id}`),

  createTestType: (data: any) =>
    apiRequest<any>('/api/laboratory/test-types', { method: 'POST', body: data }),

  updateTestType: (id: string, data: any) =>
    apiRequest<any>(`/api/laboratory/test-types/${id}`, { method: 'PUT', body: data }),

  deleteTestType: (id: string) =>
    apiRequest<any>(`/api/laboratory/test-types/${id}`, { method: 'DELETE' }),

  getOrders: (patientId?: string, status?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/laboratory/orders?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(patientId && { patientId }), ...(status && { status }) })}`),

  getOrder: (id: string) =>
    apiRequest<any>(`/api/laboratory/orders/${id}`),

  createOrder: (data: any) =>
    apiRequest<any>('/api/laboratory/orders', { method: 'POST', body: data }),

  updateOrder: (id: string, data: any) =>
    apiRequest<any>(`/api/laboratory/orders/${id}`, { method: 'PUT', body: data }),

  // Results API
  getOrderResults: (orderId: string) =>
    apiRequest<any[]>(`/api/laboratory/orders/${orderId}/results`),

  createResult: (orderId: string, data: any) =>
    apiRequest<any>(`/api/laboratory/orders/${orderId}/results`, { method: 'POST', body: data }),

  updateResult: (resultId: string, data: any) =>
    apiRequest<any>(`/api/laboratory/results/${resultId}`, { method: 'PUT', body: data }),

  // Critical Results API
  getCriticalResults: () =>
    apiRequest<any[]>(`/api/laboratory/critical-results`),

  getPatientCriticalResults: (patientId: string) =>
    apiRequest<any[]>(`/api/laboratory/critical-results/${patientId}`),

  // Critical Tests Management API (deprecated - use critical value ranges instead)
  getCriticalTests: () =>
    apiRequest<any[]>(`/api/laboratory/critical-tests`),

  addCriticalTest: (data: { testTypeId: number, description?: string }) =>
    apiRequest<any>(`/api/laboratory/critical-tests`, { method: 'POST', body: data }),

  removeCriticalTest: (id: string) =>
    apiRequest<any>(`/api/laboratory/critical-tests/${id}`, { method: 'DELETE' }),

  // Critical Value Ranges API
  getCriticalValueRanges: () =>
    apiRequest<any[]>(`/api/laboratory/critical-value-ranges`),

  createCriticalValueRange: (data: { testTypeId: number, parameterName: string, unit?: string, criticalLowValue?: number, criticalHighValue?: number, description?: string }) =>
    apiRequest<any>(`/api/laboratory/critical-value-ranges`, { method: 'POST', body: data }),

  updateCriticalValueRange: (id: string, data: { parameterName?: string, unit?: string, criticalLowValue?: number, criticalHighValue?: number, description?: string, isActive?: boolean }) =>
    apiRequest<any>(`/api/laboratory/critical-value-ranges/${id}`, { method: 'PUT', body: data }),

  deleteCriticalValueRange: (id: string) =>
    apiRequest<any>(`/api/laboratory/critical-value-ranges/${id}`, { method: 'DELETE' }),
};

// Inpatient API
export const inpatientApi = {
  getAdmissions: (status?: string, wardId?: string, page = 1, limit = 50, search?: string, patientId?: string) =>
    apiRequest<any[]>(`/api/inpatient/admissions?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }), ...(wardId && { wardId }), ...(search && { search }), ...(patientId && { patientId }) })}`),

  getAdmission: (id: string) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}`),

  createAdmission: (data: any) =>
    apiRequest<any>('/api/inpatient/admissions', { method: 'POST', body: data }),

  updateAdmission: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}`, { method: 'PUT', body: data }),

  deleteAdmission: (id: string) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}`, { method: 'DELETE' }),

  getBeds: (wardId?: string, status?: string, page = 1, limit = 100) =>
    apiRequest<any[]>(`/api/inpatient/beds?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(wardId && { wardId }), ...(status && { status }) })}`),

  getBed: (id: string) =>
    apiRequest<any>(`/api/inpatient/beds/${id}`),

  createBed: (data: any) =>
    apiRequest<any>('/api/inpatient/beds', { method: 'POST', body: data }),

  updateBed: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/beds/${id}`, { method: 'PUT', body: data }),

  deleteBed: (id: string) =>
    apiRequest<any>(`/api/inpatient/beds/${id}`, { method: 'DELETE' }),

  getWards: (wardType?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/inpatient/wards?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(wardType && { wardType }) })}`),

  getWard: (id: string) =>
    apiRequest<any>(`/api/inpatient/wards/${id}`),

  createWard: (data: any) =>
    apiRequest<any>('/api/inpatient/wards', { method: 'POST', body: data }),

  updateWard: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/wards/${id}`, { method: 'PUT', body: data }),

  deleteWard: (id: string) =>
    apiRequest<any>(`/api/inpatient/wards/${id}`, { method: 'DELETE' }),

  // Inpatient Management
  getAdmissionOverview: (id: string) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/overview`),

  getAdmissionBill: (id: string) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/bill`),

  getAdmissionBillAdjustments: (id: string) =>
    apiRequest<any[]>(`/api/inpatient/admissions/${id}/bill-adjustments`),

  createAdmissionBillAdjustment: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/bill-adjustments`, { method: 'POST', body: data }),

  updateAdmissionBillAdjustment: (id: string, adjustmentId: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/bill-adjustments/${adjustmentId}`, { method: 'PUT', body: data }),

  getDoctorReviews: (id: string) =>
    apiRequest<any[]>(`/api/inpatient/admissions/${id}/reviews`),

  createDoctorReview: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/reviews`, { method: 'POST', body: data }),

  updateDoctorReview: (reviewId: string, data: any) =>
    apiRequest<any>(`/api/inpatient/reviews/${reviewId}`, { method: 'PUT', body: data }),

  getNursingCare: (id: string) =>
    apiRequest<any[]>(`/api/inpatient/admissions/${id}/nursing-care`),

  createNursingCare: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/nursing-care`, { method: 'POST', body: data }),

  updateNursingCare: (careId: string, data: any) =>
    apiRequest<any>(`/api/inpatient/nursing-care/${careId}`, { method: 'PUT', body: data }),

  getVitalsSchedule: (id: string) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/vitals-schedule`),

  createVitalsSchedule: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/vitals-schedule`, { method: 'POST', body: data }),

  recordVitals: (id: string, data: any) =>
    apiRequest<any>(`/api/inpatient/admissions/${id}/vitals`, { method: 'POST', body: data }),

  updateVitals: (vitalId: string, data: any) =>
    apiRequest<any>(`/api/inpatient/vitals/${vitalId}`, { method: 'PUT', body: data }),

  deleteVitals: (vitalId: string) =>
    apiRequest<any>(`/api/inpatient/vitals/${vitalId}`, { method: 'DELETE' }),
};

// Maternity API
export const maternityApi = {
  getAdmissions: (status?: string, page = 1, limit = 50, search?: string) =>
    apiRequest<any[]>(`/api/maternity/admissions?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }), ...(search && { search }) })}`),

  getAdmission: (id: string) =>
    apiRequest<any>(`/api/maternity/admissions/${id}`),

  createAdmission: (data: any) =>
    apiRequest<any>('/api/maternity/admissions', { method: 'POST', body: data }),

  updateAdmission: (id: string, data: any) =>
    apiRequest<any>(`/api/maternity/admissions/${id}`, { method: 'PUT', body: data }),

  deleteAdmission: (id: string) =>
    apiRequest<any>(`/api/maternity/admissions/${id}`, { method: 'DELETE' }),

  getDeliveries: (page = 1, limit = 50, search?: string, deliveryType?: string) =>
    apiRequest<any[]>(`/api/maternity/deliveries?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(deliveryType && { deliveryType }) })}`),

  getDelivery: (id: string) =>
    apiRequest<any>(`/api/maternity/deliveries/${id}`),

  createDelivery: (data: any) =>
    apiRequest<any>('/api/maternity/deliveries', { method: 'POST', body: data }),

  updateDelivery: (id: string, data: any) =>
    apiRequest<any>(`/api/maternity/deliveries/${id}`, { method: 'PUT', body: data }),
};

// ICU API
export const icuApi = {
  getAdmissions: (status?: string, page = 1, limit = 50, search?: string) =>
    apiRequest<any[]>(`/api/icu/admissions?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }), ...(search && { search }) })}`),

  getAdmission: (id: string) =>
    apiRequest<any>(`/api/icu/admissions/${id}`),

  getAdmissionOverview: (id: string) =>
    apiRequest<any>(`/api/icu/admissions/${id}/overview`),

  createAdmission: (data: any) =>
    apiRequest<any>('/api/icu/admissions', { method: 'POST', body: data }),

  updateAdmission: (id: string, data: any) =>
    apiRequest<any>(`/api/icu/admissions/${id}`, { method: 'PUT', body: data }),

  deleteAdmission: (id: string) =>
    apiRequest<any>(`/api/icu/admissions/${id}`, { method: 'DELETE' }),

  getMonitoring: (id: string) =>
    apiRequest<any[]>(`/api/icu/admissions/${id}/monitoring`),

  createMonitoring: (id: string, data: any) =>
    apiRequest<any>(`/api/icu/admissions/${id}/monitoring`, { method: 'POST', body: data }),

  updateMonitoring: (id: string, monitoringId: string, data: any) =>
    apiRequest<any>(`/api/icu/admissions/${id}/monitoring/${monitoringId}`, { method: 'PUT', body: data }),

  deleteMonitoring: (id: string, monitoringId: string) =>
    apiRequest<any>(`/api/icu/admissions/${id}/monitoring/${monitoringId}`, { method: 'DELETE' }),

  getBeds: (status?: string, page = 1, limit = 100) =>
    apiRequest<any[]>(`/api/icu/beds?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }) })}`),

  getBed: (id: string) =>
    apiRequest<any>(`/api/icu/beds/${id}`),

  createBed: (data: any) =>
    apiRequest<any>('/api/icu/beds', { method: 'POST', body: data }),

  updateBed: (id: string, data: any) =>
    apiRequest<any>(`/api/icu/beds/${id}`, { method: 'PUT', body: data }),

  deleteBed: (id: string) =>
    apiRequest<any>(`/api/icu/beds/${id}`, { method: 'DELETE' }),

  getEquipment: (status?: string, page = 1, limit = 100) =>
    apiRequest<any[]>(`/api/icu/equipment?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }) })}`),

  getEquipmentById: (id: string) =>
    apiRequest<any>(`/api/icu/equipment/${id}`),

  createEquipment: (data: any) =>
    apiRequest<any>('/api/icu/equipment', { method: 'POST', body: data }),

  updateEquipment: (id: string, data: any) =>
    apiRequest<any>(`/api/icu/equipment/${id}`, { method: 'PUT', body: data }),

  deleteEquipment: (id: string) =>
    apiRequest<any>(`/api/icu/equipment/${id}`, { method: 'DELETE' }),
};

// Radiology API
export const radiologyApi = {
  getExamTypes: (search?: string, category?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/radiology/exam-types?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(category && { category }) })}`),

  getExamTypeById: (id: string) =>
    apiRequest<any>(`/api/radiology/exam-types/${id}`),

  createExamType: (data: any) =>
    apiRequest<any>('/api/radiology/exam-types', { method: 'POST', body: data }),

  updateExamType: (id: string, data: any) =>
    apiRequest<any>(`/api/radiology/exam-types/${id}`, { method: 'PUT', body: data }),

  deleteExamType: (id: string) =>
    apiRequest<any>(`/api/radiology/exam-types/${id}`, { method: 'DELETE' }),

  getOrders: (patientId?: string, status?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/radiology/orders?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(patientId && { patientId }), ...(status && { status }) })}`),

  getOrder: (id: string) =>
    apiRequest<any>(`/api/radiology/orders/${id}`),

  createOrder: (data: any) =>
    apiRequest<any>('/api/radiology/orders', { method: 'POST', body: data }),

  updateOrder: (id: string, data: any) =>
    apiRequest<any>(`/api/radiology/orders/${id}`, { method: 'PUT', body: data }),

  /** Persist exam + report rows and mark order completed */
  completeOrderReport: (orderId: string, data: {
    findings?: string;
    impression?: string;
    recommendations?: string;
    examDate?: string;
    technicianId?: number;
    performedBy?: number;
    reportedBy: number;
    queueId?: number;
  }) =>
    apiRequest<any>(`/api/radiology/orders/${orderId}/complete-report`, { method: 'POST', body: data }),

  /** Stored reports (radiology_reports + joins) */
  getReports: (params?: {
    patientId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.patientId) p.append('patientId', params.patientId);
    if (params?.search) p.append('search', params.search);
    if (params?.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params?.dateTo) p.append('dateTo', params.dateTo);
    if (params?.page) p.append('page', String(params.page));
    if (params?.limit) p.append('limit', String(params.limit));
    const q = p.toString();
    return apiRequest<any[]>(`/api/radiology/reports${q ? `?${q}` : ''}`);
  },
};

// Triage API
export const triageApi = {
  getAll: (priority?: string, status?: string, search?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/triage?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(priority && { priority }), ...(status && { status }), ...(search && { search }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/triage/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/triage', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/triage/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/triage/${id}`, { method: 'DELETE' }),

  updateOrder: (id: string, data: any) =>
    apiRequest<any>(`/api/radiology/orders/${id}`, { method: 'PUT', body: data }),

  // Critical Vital Ranges API
  getCriticalVitalRanges: () =>
    apiRequest<any[]>(`/api/triage/critical-vital-ranges`),

  createCriticalVitalRange: (data: { vitalParameter: string, unit?: string, criticalLowValue?: number, criticalHighValue?: number, description?: string }) =>
    apiRequest<any>(`/api/triage/critical-vital-ranges`, { method: 'POST', body: data }),

  updateCriticalVitalRange: (id: string, data: { vitalParameter?: string, unit?: string, criticalLowValue?: number, criticalHighValue?: number, description?: string, isActive?: boolean }) =>
    apiRequest<any>(`/api/triage/critical-vital-ranges/${id}`, { method: 'PUT', body: data }),

  deleteCriticalVitalRange: (id: string) =>
    apiRequest<any>(`/api/triage/critical-vital-ranges/${id}`, { method: 'DELETE' }),
};

// Medical Records API
export const medicalRecordsApi = {
  getAll: (search?: string, patientId?: string, doctorId?: string, visitType?: string, department?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/medical-records?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(patientId && { patientId }), ...(doctorId && { doctorId }), ...(visitType && { visitType }), ...(department && { department }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/medical-records/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/medical-records', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/medical-records/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/medical-records/${id}`, { method: 'DELETE' }),
};

// Inventory API
export const inventoryApi = {
  getAll: (category?: string, status?: string, search?: string, lowStock?: boolean) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    if (lowStock) params.append('lowStock', 'true');
    const query = params.toString();
    return apiRequest<any[]>(`/api/inventory${query ? `?${query}` : ''}`);
  },

  getSummary: () =>
    apiRequest<any>('/api/inventory/summary'),

  getAnalytics: (timeRange?: string) =>
    apiRequest<any>(`/api/inventory/analytics${timeRange ? `?timeRange=${timeRange}` : ''}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/inventory/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/inventory', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/inventory/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/inventory/${id}`, { method: 'DELETE' }),
};

// Inventory Transactions API
export const inventoryTransactionApi = {
  getAll: (itemId?: string, transactionType?: string, startDate?: string, endDate?: string, page = 1, limit = 50) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (itemId) params.append('itemId', itemId);
    if (transactionType) params.append('transactionType', transactionType);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any[]>(`/api/inventory/transactions?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/inventory/transactions/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/inventory/transactions', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/inventory/transactions/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/inventory/transactions/${id}`, { method: 'DELETE' }),
};

// Clinical Services API
export const clinicalServicesApi = {
  getAll: (search?: string, category?: string) =>
    apiRequest<any[]>(`/api/clinical-services?${new URLSearchParams({ ...(search && { search }), ...(category && { category }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/clinical-services/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/clinical-services', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/clinical-services/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/clinical-services/${id}`, { method: 'DELETE' }),
};

// Doctors API
export const doctorsApi = {
  getAll: (search?: string) =>
    apiRequest<any[]>(`/api/doctors?${new URLSearchParams(search ? { search } : {})}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/doctors/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/doctors', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/doctors/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/doctors/${id}`, { method: 'DELETE' }),
};

// Appointments API
export const appointmentsApi = {
  getAll: (date?: string, status?: string, doctorId?: string, patientId?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/appointments?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(date && { date }), ...(status && { status }), ...(doctorId && { doctorId }), ...(patientId && { patientId }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/appointments/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/appointments', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/appointments/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/appointments/${id}`, { method: 'DELETE' }),
};

// Telemedicine API (Zoom link mode + optional Meeting SDK embed via server-signed JWT)
export const telemedicineApi = {
  /** Per-user defaults (PMI link, passcode); copied into new sessions when no URL is sent */
  getMyDefaults: () => apiRequest<any>('/api/telemedicine/my-defaults'),

  updateMyDefaults: (data: { defaultZoomJoinUrl?: string | null; defaultZoomPassword?: string | null }) =>
    apiRequest<any>('/api/telemedicine/my-defaults', { method: 'PUT', body: data }),

  /**
   * Paginated list. Default: doctors see own sessions; admins see all.
   * `scope: 'facility'` — nurses/doctors/admins see facility-wide list (for boards / handoff).
   * `statusGroup: 'active' | 'ended'` — filter by session lifecycle.
   */
  listSessions: (params?: { page?: number; limit?: number; scope?: 'facility'; statusGroup?: 'active' | 'ended' }) => {
    const q = new URLSearchParams();
    if (params?.page != null) q.set('page', String(params.page));
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.scope) q.set('scope', params.scope);
    if (params?.statusGroup) q.set('statusGroup', params.statusGroup);
    const qs = q.toString();
    return apiRequest<{ sessions: any[]; page: number; limit: number; total: number }>(
      `/api/telemedicine/sessions${qs ? `?${qs}` : ''}`
    );
  },

  /**
   * Creates a telemedicine session, or returns an existing active one for the same patient
   * (`reusedExistingSession: true`). Optional `forceNew: true` skips reuse (advanced).
   */
  createSession: (data: any) =>
    apiRequest<any>('/api/telemedicine/sessions', {
      method: 'POST',
      body: data,
      /** Longer than most routes — create waits on DB pool + transaction */
      timeoutMs: 60000,
    }),

  getSession: (sessionId: string) =>
    apiRequest<any>(`/api/telemedicine/sessions/${sessionId}`),

  /** Save or update pasted meeting link, optional password, and provider */
  updateSessionLink: (sessionId: string, data: { zoomJoinUrl?: string | null; zoomPassword?: string | null; provider?: string; videoProvider?: string }) =>
    apiRequest<any>(`/api/telemedicine/sessions/${sessionId}/link`, {
      method: 'PATCH',
      body: data,
    }),

  recordConsent: (sessionId: string, data: any) =>
    apiRequest<any>(`/api/telemedicine/sessions/${sessionId}/consent`, {
      method: 'POST',
      body: data,
    }),

  startSession: (sessionId: string) =>
    apiRequest<any>(`/api/telemedicine/sessions/${sessionId}/start`, { method: 'POST' }),

  endSession: (sessionId: string) =>
    apiRequest<any>(`/api/telemedicine/sessions/${sessionId}/end`, { method: 'POST' }),

  /** Returns { joinUrl, zoomPassword } from stored session (doctor/admin only) */
  getDoctorJoinUrl: (sessionId: string) =>
    apiRequest<any>(`/api/telemedicine/sessions/${sessionId}/join-url?${new URLSearchParams({
      participant: 'doctor',
    })}`),

  /** True when API has ZOOM_MEETING_SDK_KEY + ZOOM_MEETING_SDK_SECRET (embedded Component View). */
  getZoomMeetingSdkStatus: () =>
    apiRequest<{ configured: boolean }>('/api/telemedicine/zoom-meeting-sdk-status'),

  /** Server-generated Meeting SDK JWT for ZoomMtgEmbedded.join — never sign in the browser. */
  getZoomSdkSignature: (sessionId: string, body?: { role?: 0 | 1 }) =>
    apiRequest<{ signature: string; meetingNumber: string; password: string; sdkKey?: string }>(
      `/api/telemedicine/sessions/${sessionId}/zoom-sdk-signature`,
      { method: 'POST', body: body ?? {} }
    ),
};

// Workflow API
export const workflowApi = {
  // After triage, create cashier queue for consultation fees
  triageToCashier: (data: any) =>
    apiRequest<any>('/api/workflow/triage-to-cashier', { method: 'POST', body: data }),

  // After payment, create consultation queue
  cashierToConsultation: (data: any) =>
    apiRequest<any>('/api/workflow/cashier-to-consultation', { method: 'POST', body: data }),

  // After consultation, send to lab
  consultationToLab: (data: any) =>
    apiRequest<any>('/api/workflow/consultation-to-lab', { method: 'POST', body: data }),

  // After prescription, create cashier queue for drug payment
  prescriptionToCashier: (data: any) =>
    apiRequest<any>('/api/workflow/prescription-to-cashier', { method: 'POST', body: data }),

  // After drug payment, create pharmacy queue
  cashierToPharmacy: (data: any) =>
    apiRequest<any>('/api/workflow/cashier-to-pharmacy', { method: 'POST', body: data }),

  // Get time summary for a queue entry
  getQueueTimeSummary: (queueId: string) =>
    apiRequest<any>(`/api/workflow/queue/${queueId}/time-summary`),

  // Get patient queue history with time tracking
  getPatientQueueHistory: (patientId: string) =>
    apiRequest<any[]>(`/api/workflow/patients/${patientId}/queue-history`),
};

// Queue API
export const queueApi = {
  getAll: (servicePoint?: string, status?: string, page = 1, limit = 50, includeCompleted?: boolean) =>
    apiRequest<any[]>(`/api/queue?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(servicePoint && { servicePoint }), ...(status && { status }), ...(includeCompleted && { includeCompleted: 'true' }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/queue/${id}`),

  cleanupOld: (dryRun: boolean = false) =>
    apiRequest<any>('/api/queue/cleanup-old', { method: 'POST', body: { dryRun } }),

  create: (data: any) =>
    apiRequest<any>('/api/queue', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/queue/${id}`, { method: 'PUT', body: data }),

  updateStatus: (id: string, status: string) =>
    apiRequest<any>(`/api/queue/${id}/status`, { method: 'PUT', body: { status } }),

  archive: (id: string) =>
    apiRequest<any>(`/api/queue/${id}/archive`, { method: 'POST' }),

  archiveCompleted: () =>
    apiRequest<any>('/api/queue/archive-completed', { method: 'POST' }),

  getHistory: (params?: { servicePoint?: string; status?: string; patientId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.servicePoint) queryParams.append('servicePoint', params.servicePoint);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.patientId) queryParams.append('patientId', params.patientId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    return apiRequest<any[]>(`/api/queue/history?${queryParams.toString()}`);
  },

  delete: (id: string) =>
    apiRequest<any>(`/api/queue/${id}`, { method: 'DELETE' }),
};

// Ledger API
export const ledgerApi = {
  // Accounts
  getAccounts: (search?: string, accountType?: string, asOfDate?: string, page = 1, limit = 50) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(accountType && { accountType }), ...(asOfDate && { asOfDate }) });
    return apiRequest<any[]>(`/api/ledger/accounts?${params.toString()}`);
  },

  getAccountById: (id: string, asOfDate?: string) => {
    const params = new URLSearchParams();
    if (asOfDate) params.append('asOfDate', asOfDate);
    return apiRequest<any>(`/api/ledger/accounts/${id}?${params.toString()}`);
  },

  getAccountTransactions: (id: string, startDate?: string, endDate?: string, asOfDate?: string, page = 1, limit = 50) => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(startDate && { startDate }), ...(endDate && { endDate }), ...(asOfDate && { asOfDate }) });
    return apiRequest<any[]>(`/api/ledger/accounts/${id}/transactions?${params.toString()}`);
  },

  createAccount: (data: any) =>
    apiRequest<any>('/api/ledger/accounts', { method: 'POST', body: data }),

  updateAccount: (id: string, data: any) =>
    apiRequest<any>(`/api/ledger/accounts/${id}`, { method: 'PUT', body: data }),

  deleteAccount: (id: string) =>
    apiRequest<any>(`/api/ledger/accounts/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (search?: string, startDate?: string, endDate?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/ledger/transactions?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(startDate && { startDate }), ...(endDate && { endDate }) })}`),

  getTransactionById: (id: string) =>
    apiRequest<any>(`/api/ledger/transactions/${id}`),

  createTransaction: (data: any) =>
    apiRequest<any>('/api/ledger/transactions', { method: 'POST', body: data }),

  updateTransaction: (id: string, data: any) =>
    apiRequest<any>(`/api/ledger/transactions/${id}`, { method: 'PUT', body: data }),

  deleteTransaction: (id: string) =>
    apiRequest<any>(`/api/ledger/transactions/${id}`, { method: 'DELETE' }),

  // Financial Reports
  getTrialBalance: (asOfDate?: string) => {
    const params = new URLSearchParams();
    if (asOfDate) params.append('asOfDate', asOfDate);
    return apiRequest<any>(`/api/ledger/reports/trial-balance?${params.toString()}`);
  },

  getIncomeStatement: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any>(`/api/ledger/reports/income-statement?${params.toString()}`);
  },

  getBalanceSheet: (asOfDate?: string) => {
    const params = new URLSearchParams();
    if (asOfDate) params.append('asOfDate', asOfDate);
    return apiRequest<any>(`/api/ledger/reports/balance-sheet?${params.toString()}`);
  },

  // Patient & Staff Statements
  getPatientStatement: (patientId: string, startDate?: string, endDate?: string, asOfDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (asOfDate) params.append('asOfDate', asOfDate);
    return apiRequest<any>(`/api/ledger/reports/patient-statement/${patientId}?${params.toString()}`);
  },

  getStaffStatement: (staffId: string, startDate?: string, endDate?: string, asOfDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (asOfDate) params.append('asOfDate', asOfDate);
    return apiRequest<any>(`/api/ledger/reports/staff-statement/${staffId}?${params.toString()}`);
  },
};

// Procurement Vendors API
export const vendorApi = {
  getAll: (search?: string, status?: string, category?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/procurement/vendors?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(status && { status }), ...(category && { category }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/procurement/vendors/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/procurement/vendors', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/procurement/vendors/${id}`, { method: 'DELETE' }),

  // Vendor Ratings
  getRatings: (vendorId: string) =>
    apiRequest<any[]>(`/api/procurement/vendors/${vendorId}/ratings`),

  createRating: (vendorId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/ratings`, { method: 'POST', body: data }),

  // Vendor Products
  getProducts: (vendorId: string) =>
    apiRequest<any[]>(`/api/procurement/vendors/${vendorId}/products`),

  createProduct: (vendorId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/products`, { method: 'POST', body: data }),

  updateProduct: (vendorId: string, productId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/products/${productId}`, { method: 'PUT', body: data }),

  deleteProduct: (vendorId: string, productId: string) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/products/${productId}`, { method: 'DELETE' }),

  // Vendor Contracts
  getAllContracts: () =>
    apiRequest<any[]>(`/api/procurement/vendors/contracts`),

  getContracts: (vendorId: string) =>
    apiRequest<any[]>(`/api/procurement/vendors/${vendorId}/contracts`),

  createContract: (vendorId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/contracts`, { method: 'POST', body: data }),

  updateContract: (vendorId: string, contractId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/contracts/${contractId}`, { method: 'PUT', body: data }),

  deleteContract: (vendorId: string, contractId: string) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/contracts/${contractId}`, { method: 'DELETE' }),

  // Vendor Documents
  getDocuments: (vendorId: string) =>
    apiRequest<any[]>(`/api/procurement/vendors/${vendorId}/documents`),

  createDocument: (vendorId: string, formData: FormData) => {
    // Use relative URL in browser, or public URL if set
    const baseUrl = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_URL || '')
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
    return fetch(`${baseUrl}/api/procurement/vendors/${vendorId}/documents`, {
      method: 'POST',
      body: formData,
    }).then(res => res.ok ? res.json() : Promise.reject(res));
  },

  updateDocument: (vendorId: string, documentId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/documents/${documentId}`, { method: 'PUT', body: data }),

  deleteDocument: (vendorId: string, documentId: string) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/documents/${documentId}`, { method: 'DELETE' }),

  downloadDocument: (vendorId: string, documentId: string) => {
    // Use relative URL in browser, or public URL if set
    const baseUrl = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_URL || '')
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
    return `${baseUrl}/api/procurement/vendors/${vendorId}/documents/${documentId}/download`;
  },

  // Vendor Issues
  getIssues: (vendorId: string, status?: string, priority?: string) =>
    apiRequest<any[]>(`/api/procurement/vendors/${vendorId}/issues?${new URLSearchParams({ ...(status && { status }), ...(priority && { priority }) })}`),

  createIssue: (vendorId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/issues`, { method: 'POST', body: data }),

  updateIssue: (vendorId: string, issueId: string, data: any) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/issues/${issueId}`, { method: 'PUT', body: data }),

  deleteIssue: (vendorId: string, issueId: string) =>
    apiRequest<any>(`/api/procurement/vendors/${vendorId}/issues/${issueId}`, { method: 'DELETE' }),

  // Vendor Performance
  getPerformance: () =>
    apiRequest<any[]>(`/api/procurement/vendors/performance`),
};

// Purchase Orders API
export const purchaseOrderApi = {
  getAll: (vendorId?: string, status?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/procurement/purchase-orders?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(vendorId && { vendorId }), ...(status && { status }) })}`),

  getByVendor: (vendorId: string, status?: string, page = 1, limit = 50) =>
    apiRequest<any[]>(`/api/procurement/purchase-orders/vendors/${vendorId}?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/procurement/purchase-orders/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/procurement/purchase-orders', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/procurement/purchase-orders/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/procurement/purchase-orders/${id}`, { method: 'DELETE' }),
};

// Employee API
export const employeeApi = {
  getAll: (search?: string, departmentId?: string, status?: string, positionId?: string, page = 1, limit = 50) =>
    apiRequest<{ employees: any[], pagination: any }>(`/api/employees?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(search && { search }), ...(departmentId && { departmentId }), ...(status && { status }), ...(positionId && { positionId }) })}`),

  getById: (id: string) =>
    apiRequest<any>(`/api/employees/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/employees', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/employees/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/employees/${id}`, { method: 'DELETE' }),

  // Leave Management
  getLeave: (employeeId: string, status?: string, leaveType?: string) =>
    apiRequest<any[]>(`/api/employees/${employeeId}/leave?${new URLSearchParams({ ...(status && { status }), ...(leaveType && { leaveType }) })}`),

  getAllLeave: (status?: string, leaveType?: string, employeeId?: string, page = 1, limit = 50) =>
    apiRequest<{ leaves: any[], pagination: any }>(`/api/employees/leave?${new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...(status && { status }), ...(leaveType && { leaveType }), ...(employeeId && { employeeId }) })}`),

  createLeave: (employeeId: string, data: any) =>
    apiRequest<any>(`/api/employees/${employeeId}/leave`, { method: 'POST', body: data }),

  updateLeave: (leaveId: string, data: any) =>
    apiRequest<any>(`/api/employees/leave/${leaveId}`, { method: 'PUT', body: data }),

  deleteLeave: (leaveId: string) =>
    apiRequest<any>(`/api/employees/leave/${leaveId}`, { method: 'DELETE' }),

  getLeaveBalance: (employeeId: string, year?: number) =>
    apiRequest<any[]>(`/api/employees/${employeeId}/leave/balance?${new URLSearchParams({ ...(year && { year: year.toString() }) })}`),

  // Payroll
  getSalary: (employeeId: string) =>
    apiRequest<any>(`/api/employees/${employeeId}/salary`),

  getSalaryHistory: (employeeId: string) =>
    apiRequest<any[]>(`/api/employees/${employeeId}/salary/history`),

  createSalary: (employeeId: string, data: any) =>
    apiRequest<any>(`/api/employees/${employeeId}/salary`, { method: 'POST', body: data }),

  getPayroll: (employeeId: string, startDate?: string, endDate?: string, status?: string) =>
    apiRequest<any[]>(`/api/employees/${employeeId}/payroll?${new URLSearchParams({ ...(startDate && { startDate }), ...(endDate && { endDate }), ...(status && { status }) })}`),

  createPayroll: (employeeId: string, data: any) =>
    apiRequest<any>(`/api/employees/${employeeId}/payroll`, { method: 'POST', body: data }),

  updatePayroll: (payrollId: string, data: any) =>
    apiRequest<any>(`/api/employees/payroll/${payrollId}`, { method: 'PUT', body: data }),

  // Promotions/Position History
  getPromotions: (employeeId: string) =>
    apiRequest<any[]>(`/api/employees/${employeeId}/promotions`),

  createPromotion: (employeeId: string, data: any) =>
    apiRequest<any>(`/api/employees/${employeeId}/promotions`, { method: 'POST', body: data }),

  // Attendance
  getAttendance: (employeeId: string, startDate?: string, endDate?: string) =>
    apiRequest<any[]>(`/api/employees/attendance/${employeeId}?${new URLSearchParams({ ...(startDate && { startDate }), ...(endDate && { endDate }) })}`),

  createAttendance: (data: any) =>
    apiRequest<any>(`/api/employees/attendance`, { method: 'POST', body: data }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () =>
    apiRequest<any>('/api/dashboard/stats'),

  getRecentActivities: (limit?: number) =>
    apiRequest<any>(`/api/dashboard/recent-activities?${new URLSearchParams({ ...(limit && { limit: limit.toString() }) })}`),
};

// Analytics API
export const analyticsApi = {
  getPatients: (months?: number) =>
    apiRequest<any[]>(`/api/analytics/patients?${new URLSearchParams({ ...(months && { months: months.toString() }) })}`),

  getRevenue: (months?: number) =>
    apiRequest<any[]>(`/api/analytics/revenue?${new URLSearchParams({ ...(months && { months: months.toString() }) })}`),

  getDepartments: () =>
    apiRequest<any[]>('/api/analytics/departments'),

  getSummary: () =>
    apiRequest<any>('/api/analytics/summary'),

  getRevenueBySource: (params?: { months?: number; startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams()
    if (params?.months) queryParams.append('months', params.months.toString())
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    const query = queryParams.toString()
    return apiRequest<any[]>(`/api/analytics/revenue-by-source${query ? `?${query}` : ''}`)
  },

  getPharmacySales: (params?: { months?: number; limit?: number; startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams()
    if (params?.months) queryParams.append('months', params.months.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    const query = queryParams.toString()
    return apiRequest<any>(`/api/analytics/pharmacy-sales${query ? `?${query}` : ''}`)
  },

  getInventoryValue: () =>
    apiRequest<any>(`/api/analytics/inventory-value`),

  getInventoryValueByLocation: (filters?: { location?: string; search?: string; dateFrom?: string; dateTo?: string }) => {
    const queryParams = new URLSearchParams()
    if (filters?.location && filters.location !== 'all') queryParams.append('location', filters.location)
    if (filters?.search) queryParams.append('search', filters.search)
    if (filters?.dateFrom) queryParams.append('dateFrom', filters.dateFrom)
    if (filters?.dateTo) queryParams.append('dateTo', filters.dateTo)
    const query = queryParams.toString()
    return apiRequest<{ data: any[]; totals: { quantity: number; amountValue: number } }>(`/api/pharmacy/drug-inventory/value-by-location${query ? `?${query}` : ''}`)
  },

  getPaymentMethods: (params?: { months?: number; startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams()
    if (params?.months) queryParams.append('months', params.months.toString())
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    const query = queryParams.toString()
    return apiRequest<any[]>(`/api/analytics/payment-methods${query ? `?${query}` : ''}`)
  },

  getRevenueTrends: (params?: { months?: number; startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams()
    if (params?.months) queryParams.append('months', params.months.toString())
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    const query = queryParams.toString()
    return apiRequest<any[]>(`/api/analytics/revenue-trends${query ? `?${query}` : ''}`)
  },

  getRevenueWeekly: (params?: { weeks?: number; startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams()
    if (params?.weeks) queryParams.append('weeks', params.weeks.toString())
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    const query = queryParams.toString()
    return apiRequest<any[]>(`/api/analytics/revenue-weekly${query ? `?${query}` : ''}`)
  },
};

// Service Charges API
export const serviceChargeApi = {
  getAll: (status?: string, category?: string, department?: string, search?: string, chargeType?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    if (department) params.append('department', department);
    if (search) params.append('search', search);
    if (chargeType) params.append('chargeType', chargeType);
    return apiRequest<any[]>(`/api/billing/charges?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/billing/charges/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/billing/charges', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/billing/charges/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/billing/charges/${id}`, { method: 'DELETE' }),
};

// Specialist Charges API
export const specialistChargeApi = {
  getAll: (chargeId?: string, doctorId?: string, search?: string) => {
    const params = new URLSearchParams();
    if (chargeId) params.append('chargeId', chargeId);
    if (doctorId) params.append('doctorId', doctorId);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/billing/specialist-charges?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/billing/specialist-charges/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/billing/specialist-charges', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/billing/specialist-charges/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/billing/specialist-charges/${id}`, { method: 'DELETE' }),
};

// Consumables Charges API
export const consumablesChargeApi = {
  getAll: (chargeId?: string, search?: string) => {
    const params = new URLSearchParams();
    if (chargeId) params.append('chargeId', chargeId);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/billing/consumables-charges?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/billing/consumables-charges/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/billing/consumables-charges', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/billing/consumables-charges/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/billing/consumables-charges/${id}`, { method: 'DELETE' }),
};

// Billing/Invoice API
export const billingApi = {
  getInvoices: (patientId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (status) params.append('status', status);
    return apiRequest<any[]>(`/api/billing/invoices?${params.toString()}`);
  },

  getInvoiceById: (id: string) =>
    apiRequest<any>(`/api/billing/invoices/${id}`),

  getPendingInvoicesForPatient: (patientId: string) =>
    apiRequest<any[]>(`/api/billing/invoices/patient/${patientId}/pending`),

  createInvoice: (data: any) =>
    apiRequest<any>('/api/billing/invoices', { method: 'POST', body: data }),

  updateInvoice: (id: string, data: any) =>
    apiRequest<any>(`/api/billing/invoices/${id}`, { method: 'PUT', body: data }),

  deleteInvoice: (id: string) =>
    apiRequest<any>(`/api/billing/invoices/${id}`, { method: 'DELETE' }),

  recordPayment: (id: string, data: any) =>
    apiRequest<any>(`/api/billing/invoices/${id}/payment`, { method: 'POST', body: data }),

  getInvoiceStats: () =>
    apiRequest<any>('/api/billing/invoices/stats/summary'),

  // Mobile Payment Logs
  getMobilePaymentLogs: (params?: { search?: string; mobileProvider?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.mobileProvider) queryParams.append('mobileProvider', params.mobileProvider);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    return apiRequest<any>(`/api/billing/mobile-payment-logs?${queryParams.toString()}`);
  },

  getMobilePaymentLogById: (id: string) =>
    apiRequest<any>(`/api/billing/mobile-payment-logs/${id}`),

  // Insurance Claim Integration
  getInvoiceInsuranceInfo: (invoiceId: string) =>
    apiRequest<any>(`/api/billing/invoices/${invoiceId}/insurance-info`),

  createClaimFromInvoice: (invoiceId: string, data?: any) =>
    apiRequest<any>(`/api/billing/invoices/${invoiceId}/create-claim`, { method: 'POST', body: data }),

  getInvoicePayments: (invoiceId: string) =>
    apiRequest<any[]>(`/api/billing/invoices/${invoiceId}/payments`),

  getPaymentBatch: (batchReceiptNumber: string, patientId?: string) => {
    const params = patientId ? `?patientId=${patientId}` : '';
    return apiRequest<any>(`/api/billing/payment-batches/${batchReceiptNumber}${params}`);
  },

  getPatientPayments: (patientId: string) =>
    apiRequest<any[]>(`/api/billing/patients/${patientId}/payments`),

  getAllPayments: (params?: { patientId?: string; startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams()
    if (params?.patientId) queryParams.append('patientId', params.patientId)
    if (params?.startDate) queryParams.append('startDate', params.startDate)
    if (params?.endDate) queryParams.append('endDate', params.endDate)
    const query = queryParams.toString()
    return apiRequest<any[]>(`/api/billing/payments${query ? `?${query}` : ''}`)
  },

  createMobilePaymentLog: (data: any) =>
    apiRequest<any>('/api/billing/mobile-payment-logs', { method: 'POST', body: data }),

  updateMobilePaymentLog: (id: string, data: any) =>
    apiRequest<any>(`/api/billing/mobile-payment-logs/${id}`, { method: 'PUT', body: data }),

  deleteMobilePaymentLog: (id: string) =>
    apiRequest<any>(`/api/billing/mobile-payment-logs/${id}`, { method: 'DELETE' }),
};

// Receivables API
export const receivableApi = {
  getAll: (status?: string, patientId?: string, search?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (patientId) params.append('patientId', patientId);
    if (search) params.append('search', search);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any[]>(`/api/receivables?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/receivables/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/receivables', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/receivables/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/receivables/${id}`, { method: 'DELETE' }),

  recordPayment: (id: string, data: any) =>
    apiRequest<any>(`/api/receivables/${id}/payment`, { method: 'POST', body: data }),

  getStats: () =>
    apiRequest<any>('/api/receivables/stats/summary'),
};

// Payables API
export const payableApi = {
  getAll: (status?: string, vendorId?: string, search?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (vendorId) params.append('vendorId', vendorId);
    if (search) params.append('search', search);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any[]>(`/api/payables?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/payables/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/payables', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/payables/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/payables/${id}`, { method: 'DELETE' }),

  recordPayment: (id: string, data: any) =>
    apiRequest<any>(`/api/payables/${id}/payment`, { method: 'POST', body: data }),

  getSummary: () =>
    apiRequest<any>('/api/payables/stats/summary'),
};

// Role API
// Role Menu Access API
export const roleMenuApi = {
  getMenuConfig: (roleId: string) =>
    apiRequest<any>(`/api/roles/${roleId}/menu-config`),

  updateMenuConfig: (roleId: string, config: {
    categories?: Array<{ categoryId: string; isAllowed: boolean }>;
    menuItems?: Array<{ categoryId: string; menuItemPath: string; isAllowed: boolean }>;
    tabs?: Array<{ pagePath: string; tabId: string; isAllowed: boolean }>;
    queues?: Array<{ servicePoint: string; isAllowed: boolean }>;
  }) =>
    apiRequest<any>(`/api/roles/${roleId}/menu-config`, { method: 'POST', body: config }),

  getUserMenuAccess: (userId?: string) => {
    const params = userId ? `?userId=${userId}` : '';
    return apiRequest<any>(`/api/roles/users/me/menu-access${params}`);
  },
};

export const roleApi = {
  getAll: () =>
    apiRequest<any[]>('/api/roles'),

  getUsersByRole: (roleId: string) =>
    apiRequest<{ role: any; users: any[] }>(`/api/roles/${roleId}/users`),
  getById: (id: string) =>
    apiRequest<any>(`/api/roles/${id}`),
  create: (data: any) =>
    apiRequest<any>('/api/roles', { method: 'POST', body: data }),
  update: (id: string, data: any) =>
    apiRequest<any>(`/api/roles/${id}`, { method: 'PUT', body: data }),
  delete: (id: string) =>
    apiRequest<any>(`/api/roles/${id}`, { method: 'DELETE' }),
};

// Privilege API
export const privilegeApi = {
  getAll: (module?: string, groupByModule?: boolean) =>
    apiRequest<any[]>(`/api/privileges?${new URLSearchParams({ ...(module && { module }), ...(groupByModule && { groupByModule: 'true' }) })}`),
  getById: (id: string) =>
    apiRequest<any>(`/api/privileges/${id}`),
  create: (data: any) =>
    apiRequest<any>('/api/privileges', { method: 'POST', body: data }),
  update: (id: string, data: any) =>
    apiRequest<any>(`/api/privileges/${id}`, { method: 'PUT', body: data }),
  delete: (id: string) =>
    apiRequest<any>(`/api/privileges/${id}`, { method: 'DELETE' }),
};

// Budget API
export const budgetApi = {
  getAll: (status?: string, departmentId?: string, budgetPeriod?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (departmentId) params.append('departmentId', departmentId);
    if (budgetPeriod) params.append('budgetPeriod', budgetPeriod);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/budgets?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/budgets/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/budgets', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/budgets/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/budgets/${id}`, { method: 'DELETE' }),

  getStats: () =>
    apiRequest<any>('/api/budgets/stats/summary'),
};

// Cash Management API
export const cashApi = {
  getTransactions: (transactionType?: string, startDate?: string, endDate?: string, search?: string) => {
    const params = new URLSearchParams();
    if (transactionType) params.append('transactionType', transactionType);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/cash/transactions?${params.toString()}`);
  },

  getTransactionById: (id: string) =>
    apiRequest<any>(`/api/cash/transactions/${id}`),

  createTransaction: (data: any) =>
    apiRequest<any>('/api/cash/transactions', { method: 'POST', body: data }),

  updateTransaction: (id: string, data: any) =>
    apiRequest<any>(`/api/cash/transactions/${id}`, { method: 'PUT', body: data }),

  deleteTransaction: (id: string) =>
    apiRequest<any>(`/api/cash/transactions/${id}`, { method: 'DELETE' }),

  getAccounts: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/cash/accounts?${params.toString()}`);
  },

  getStats: () =>
    apiRequest<any>('/api/cash/stats/summary'),
};

// Asset Management API
export const assetApi = {
  getAll: (status?: string, category?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/assets?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/assets/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/assets', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/assets/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/assets/${id}`, { method: 'DELETE' }),

  getStats: () =>
    apiRequest<any>('/api/assets/stats/summary'),

  // Critical Assets
  getCriticalAssets: () =>
    apiRequest<any[]>('/api/assets/critical/list'),

  getVerificationHistory: (assetId?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (assetId) params.append('assetId', assetId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any[]>(`/api/assets/critical/verification-history?${params.toString()}`);
  },

  createDailyLog: (data: any) =>
    apiRequest<any>('/api/assets/critical/daily-log', { method: 'POST', body: data }),

  bulkVerify: (data: any) =>
    apiRequest<any>('/api/assets/critical/bulk-verify', { method: 'POST', body: data }),

  getCriticalStats: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any>(`/api/assets/critical/stats?${params.toString()}`);
  },

  // Maintenance Records
  getMaintenanceByAsset: (assetId: string, status?: string, type?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any[]>(`/api/assets/${assetId}/maintenance?${params.toString()}`);
  },

  getUpcomingMaintenance: (days?: number) => {
    const params = new URLSearchParams();
    if (days) params.append('days', days.toString());
    return apiRequest<any[]>(`/api/assets/maintenance/upcoming?${params.toString()}`);
  },

  getMaintenanceHistory: (assetId?: string, startDate?: string, endDate?: string, status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (assetId) params.append('assetId', assetId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    return apiRequest<any[]>(`/api/assets/maintenance/history?${params.toString()}`);
  },

  createMaintenance: (data: any) =>
    apiRequest<any>('/api/assets/maintenance', { method: 'POST', body: data }),

  updateMaintenance: (id: string, data: any) =>
    apiRequest<any>(`/api/assets/maintenance/${id}`, { method: 'PUT', body: data }),

  deleteMaintenance: (id: string) =>
    apiRequest<any>(`/api/assets/maintenance/${id}`, { method: 'DELETE' }),

  getMaintenanceStats: () =>
    apiRequest<any>('/api/assets/maintenance/stats'),

  completeMaintenance: (id: string, data: any) =>
    apiRequest<any>(`/api/assets/maintenance/${id}/complete`, { method: 'POST', body: data }),

  // Asset Assignments
  getAssignmentsByAsset: (assetId: string, status?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    return apiRequest<any[]>(`/api/assets/${assetId}/assignments?${params.toString()}`);
  },

  getCurrentAssignments: (userId?: string, department?: string) => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (department) params.append('department', department);
    return apiRequest<any[]>(`/api/assets/assignments/current?${params.toString()}`);
  },

  getAssignmentHistory: (assetId?: string, userId?: string, status?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (assetId) params.append('assetId', assetId);
    if (userId) params.append('userId', userId);
    if (status) params.append('status', status);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any[]>(`/api/assets/assignments/history?${params.toString()}`);
  },

  createAssignment: (data: any) =>
    apiRequest<any>('/api/assets/assignments', { method: 'POST', body: data }),

  updateAssignment: (id: string, data: any) =>
    apiRequest<any>(`/api/assets/assignments/${id}`, { method: 'PUT', body: data }),

  returnAssignment: (id: string, data: any) =>
    apiRequest<any>(`/api/assets/assignments/${id}/return`, { method: 'POST', body: data }),

  deleteAssignment: (id: string) =>
    apiRequest<any>(`/api/assets/assignments/${id}`, { method: 'DELETE' }),

  getAssignmentStats: () =>
    apiRequest<any>('/api/assets/assignments/stats'),
};

// Insurance Management API
export const insuranceApi = {
  // Providers
  getProviders: (status?: string, providerType?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (providerType) params.append('providerType', providerType);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/insurance/providers?${params.toString()}`);
  },

  getProviderById: (id: string) =>
    apiRequest<any>(`/api/insurance/providers/${id}`),

  createProvider: (data: any) =>
    apiRequest<any>('/api/insurance/providers', { method: 'POST', body: data }),

  updateProvider: (id: string, data: any) =>
    apiRequest<any>(`/api/insurance/providers/${id}`, { method: 'PUT', body: data }),

  deleteProvider: (id: string) =>
    apiRequest<any>(`/api/insurance/providers/${id}`, { method: 'DELETE' }),

  /** Remove duplicate providers (keep one per unique name, case-insensitive) */
  cleanupDuplicateProviders: () =>
    apiRequest<{ message: string; deleted: number; kept: number }>(
      '/api/insurance/providers/cleanup-duplicates',
      { method: 'POST' }
    ),

  // Packages
  getPackages: (providerId?: string, status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (providerId) params.append('providerId', providerId);
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/insurance/packages?${params.toString()}`);
  },

  getPackageById: (id: string) =>
    apiRequest<any>(`/api/insurance/packages/${id}`),

  createPackage: (data: any) =>
    apiRequest<any>('/api/insurance/packages', { method: 'POST', body: data }),

  updatePackage: (id: string, data: any) =>
    apiRequest<any>(`/api/insurance/packages/${id}`, { method: 'PUT', body: data }),

  deletePackage: (id: string) =>
    apiRequest<any>(`/api/insurance/packages/${id}`, { method: 'DELETE' }),

  /** Remove duplicate packages (keep one per provider + package name, case-insensitive) */
  cleanupDuplicatePackages: () =>
    apiRequest<{ message: string; deleted: number; kept: number }>(
      '/api/insurance/packages/cleanup-duplicates',
      { method: 'POST' }
    ),

  // Insurance charge rates (insurer-specific rates per charge, over time)
  getChargeRates: (providerId?: string, chargeId?: string, asOf?: string) => {
    const params = new URLSearchParams();
    if (providerId) params.append('providerId', providerId);
    if (chargeId) params.append('chargeId', chargeId);
    if (asOf) params.append('asOf', asOf);
    return apiRequest<any[]>(`/api/insurance/charge-rates?${params.toString()}`);
  },
  getChargeRateEffective: (chargeId: string, providerId: string, date?: string) =>
    apiRequest<any>(`/api/insurance/charge-rates/effective?chargeId=${chargeId}&providerId=${providerId}${date ? `&date=${date}` : ''}`),
  getChargeRateById: (id: string) => apiRequest<any>(`/api/insurance/charge-rates/${id}`),
  createChargeRate: (data: any) => apiRequest<any>('/api/insurance/charge-rates', { method: 'POST', body: data }),
  updateChargeRate: (id: string, data: any) => apiRequest<any>(`/api/insurance/charge-rates/${id}`, { method: 'PUT', body: data }),
  deleteChargeRate: (id: string) => apiRequest<any>(`/api/insurance/charge-rates/${id}`, { method: 'DELETE' }),

  // Inpatient charge rates (cash-paying inpatients; can vary by ward/ward type)
  getInpatientChargeRates: (chargeId?: string, wardId?: string, wardType?: string, asOf?: string) => {
    const params = new URLSearchParams();
    if (chargeId) params.append('chargeId', chargeId);
    if (wardId) params.append('wardId', wardId);
    if (wardType) params.append('wardType', wardType);
    if (asOf) params.append('asOf', asOf);
    return apiRequest<any[]>(`/api/insurance/inpatient-charge-rates?${params.toString()}`);
  },
  getInpatientChargeRateEffective: (chargeId: string, wardId?: string, wardType?: string, date?: string) => {
    const params = new URLSearchParams({ chargeId });
    if (wardId) params.append('wardId', wardId);
    if (wardType) params.append('wardType', wardType);
    if (date) params.append('date', date);
    return apiRequest<any>(`/api/insurance/inpatient-charge-rates/effective?${params.toString()}`);
  },
  getInpatientChargeRateById: (id: string) => apiRequest<any>(`/api/insurance/inpatient-charge-rates/${id}`),
  createInpatientChargeRate: (data: any) => apiRequest<any>('/api/insurance/inpatient-charge-rates', { method: 'POST', body: data }),
  updateInpatientChargeRate: (id: string, data: any) => apiRequest<any>(`/api/insurance/inpatient-charge-rates/${id}`, { method: 'PUT', body: data }),
  deleteInpatientChargeRate: (id: string) => apiRequest<any>(`/api/insurance/inpatient-charge-rates/${id}`, { method: 'DELETE' }),

  // Centralized charge rate rules (single source of truth for pricing overrides)
  getChargeRateRules: (filters?: {
    payerType?: string
    providerId?: string
    chargeId?: string
    wardId?: string
    wardType?: string
    asOf?: string
  }) => {
    const params = new URLSearchParams()
    if (filters?.payerType) params.append("payerType", filters.payerType)
    if (filters?.providerId) params.append("providerId", filters.providerId)
    if (filters?.chargeId) params.append("chargeId", filters.chargeId)
    if (filters?.wardId) params.append("wardId", filters.wardId)
    if (filters?.wardType) params.append("wardType", filters.wardType)
    if (filters?.asOf) params.append("asOf", filters.asOf)
    return apiRequest<any[]>(`/api/insurance/charge-rate-rules?${params.toString()}`)
  },
  createChargeRateRule: (data: any) =>
    apiRequest<any>("/api/insurance/charge-rate-rules", { method: "POST", body: data }),
  updateChargeRateRule: (id: string, data: any) =>
    apiRequest<any>(`/api/insurance/charge-rate-rules/${id}`, { method: "PUT", body: data }),
  deleteChargeRateRule: (id: string) =>
    apiRequest<any>(`/api/insurance/charge-rate-rules/${id}`, { method: "DELETE" }),

  // Policies
  getPolicies: (patientId?: string, providerId?: string, status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (patientId) params.append('patientId', patientId);
    if (providerId) params.append('providerId', providerId);
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/insurance/policies?${params.toString()}`);
  },

  getPolicyById: (id: string) =>
    apiRequest<any>(`/api/insurance/policies/${id}`),

  createPolicy: (data: any) =>
    apiRequest<any>('/api/insurance/policies', { method: 'POST', body: data }),

  updatePolicy: (id: string, data: any) =>
    apiRequest<any>(`/api/insurance/policies/${id}`, { method: 'PUT', body: data }),

  deletePolicy: (id: string) =>
    apiRequest<any>(`/api/insurance/policies/${id}`, { method: 'DELETE' }),

  // Statistics
  getStats: () =>
    apiRequest<any>('/api/insurance/stats/summary'),

  // Claims
  getClaims: (status?: string, providerId?: string, patientId?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (providerId) params.append('providerId', providerId);
    if (patientId) params.append('patientId', patientId);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/insurance/claims?${params.toString()}`);
  },

  getClaimById: (id: string) =>
    apiRequest<any>(`/api/insurance/claims/${id}`),

  createClaim: (data: any) =>
    apiRequest<any>('/api/insurance/claims', { method: 'POST', body: data }),

  updateClaim: (id: string, data: any) =>
    apiRequest<any>(`/api/insurance/claims/${id}`, { method: 'PUT', body: data }),

  // Claim Requirements
  getClaimRequirements: (claimId: string) =>
    apiRequest<any[]>(`/api/insurance/claims/${claimId}/requirements`),

  updateClaimRequirement: (claimId: string, requirementId: string, data: any) =>
    apiRequest<any>(`/api/insurance/claims/${claimId}/requirements/${requirementId}`, { method: 'PUT', body: data }),

  // Provider Requirements
  getProviderRequirements: (providerId: string) =>
    apiRequest<any>(`/api/insurance/providers/${providerId}/requirements`),

  createRequirementTemplate: (providerId: string, data: any) =>
    apiRequest<any>(`/api/insurance/providers/${providerId}/requirements/template`, { method: 'POST', body: data }),

  addRequirement: (providerId: string, data: any) =>
    apiRequest<any>(`/api/insurance/providers/${providerId}/requirements`, { method: 'POST', body: data }),

  updateRequirement: (providerId: string, requirementId: string, data: any) =>
    apiRequest<any>(`/api/insurance/providers/${providerId}/requirements/${requirementId}`, { method: 'PUT', body: data }),

  deleteRequirement: (providerId: string, requirementId: string) =>
    apiRequest<any>(`/api/insurance/providers/${providerId}/requirements/${requirementId}`, { method: 'DELETE' }),
};

// Revenue Share Management API
export const revenueShareApi = {
  // Rules
  getRules: (ruleType?: string, departmentId?: string, status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (ruleType) params.append('ruleType', ruleType);
    if (departmentId) params.append('departmentId', departmentId);
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/revenue-share/rules?${params.toString()}`);
  },

  getRuleById: (id: string) =>
    apiRequest<any>(`/api/revenue-share/rules/${id}`),

  createRule: (data: any) =>
    apiRequest<any>('/api/revenue-share/rules', { method: 'POST', body: data }),

  updateRule: (id: string, data: any) =>
    apiRequest<any>(`/api/revenue-share/rules/${id}`, { method: 'PUT', body: data }),

  deleteRule: (id: string) =>
    apiRequest<any>(`/api/revenue-share/rules/${id}`, { method: 'DELETE' }),

  // Distributions
  getDistributions: (status?: string, startDate?: string, endDate?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/revenue-share/distributions?${params.toString()}`);
  },

  getDistributionById: (id: string) =>
    apiRequest<any>(`/api/revenue-share/distributions/${id}`),

  createDistribution: (data: any) =>
    apiRequest<any>('/api/revenue-share/distributions', { method: 'POST', body: data }),

  updateDistribution: (id: string, data: any) =>
    apiRequest<any>(`/api/revenue-share/distributions/${id}`, { method: 'PUT', body: data }),

  deleteDistribution: (id: string) =>
    apiRequest<any>(`/api/revenue-share/distributions/${id}`, { method: 'DELETE' }),

  // Statistics
  getStats: () =>
    apiRequest<any>('/api/revenue-share/stats/summary'),
};

// Diagnoses API (ICD-10)
export const diagnosesApi = {
  getAll: (search?: string, page = 1, limit = 100) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search && search.trim()) {
      params.append('search', search.trim());
    }
    return apiRequest<any[]>(`/api/diagnoses?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/diagnoses/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/diagnoses', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/diagnoses/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/diagnoses/${id}`, { method: 'DELETE' }),
};

// Procedures API
export const proceduresApi = {
  getAll: (search?: string, category?: string, isActive?: boolean, chargeId?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (chargeId) params.append('chargeId', chargeId);
    return apiRequest<any[]>(`/api/procedures?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/procedures/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/procedures', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/procedures/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/procedures/${id}`, { method: 'DELETE' }),

  /** Procedures performed on patients (report / register) */
  getPerformedReport: (params?: {
    patientId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    hasOutcomeOnly?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const p = new URLSearchParams();
    if (params?.patientId) p.append('patientId', params.patientId);
    if (params?.search) p.append('search', params.search);
    if (params?.dateFrom) p.append('dateFrom', params.dateFrom);
    if (params?.dateTo) p.append('dateTo', params.dateTo);
    if (params?.hasOutcomeOnly) p.append('hasOutcomeOnly', 'true');
    if (params?.page) p.append('page', String(params.page));
    if (params?.limit) p.append('limit', String(params.limit));
    const q = p.toString();
    return apiRequest<any[]>(`/api/procedures/reports/performed${q ? `?${q}` : ''}`);
  },

  // Patient procedures
  getPatientProcedures: (patientId: string, date?: string, procedureId?: string) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (procedureId) params.append('procedureId', procedureId);
    const queryString = params.toString();
    return apiRequest<any[]>(`/api/procedures/patient/${patientId}${queryString ? `?${queryString}` : ''}`);
  },

  createPatientProcedure: (data: any) =>
    apiRequest<any>('/api/procedures/patient', { method: 'POST', body: data }),

  updatePatientProcedure: (id: string, data: any) =>
    apiRequest<any>(`/api/procedures/patient/${id}`, { method: 'PUT', body: data }),

  deletePatientProcedure: (id: string) =>
    apiRequest<any>(`/api/procedures/patient/${id}`, { method: 'DELETE' }),
};

// Ambulance API
export const ambulanceApi = {
  getAll: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/ambulance?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/ambulance/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/ambulance', { method: 'POST', body: data }),

  update: (id: string, data: any) =>
    apiRequest<any>(`/api/ambulance/${id}`, { method: 'PUT', body: data }),

  delete: (id: string) =>
    apiRequest<any>(`/api/ambulance/${id}`, { method: 'DELETE' }),

  // Trips
  getTrips: (status?: string, tripType?: string, search?: string, page = 1, limit = 50) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (status) params.append('status', status);
    if (tripType) params.append('tripType', tripType);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/ambulance/trips/all?${params.toString()}`);
  },

  getTrip: (id: string) =>
    apiRequest<any>(`/api/ambulance/trips/${id}`),

  createTrip: (data: any) =>
    apiRequest<any>('/api/ambulance/trips', { method: 'POST', body: data }),

  updateTrip: (id: string, data: any) =>
    apiRequest<any>(`/api/ambulance/trips/${id}`, { method: 'PUT', body: data }),

  deleteTrip: (id: string) =>
    apiRequest<any>(`/api/ambulance/trips/${id}`, { method: 'DELETE' }),
};

// Bill Waiver API
export const waiverApi = {
  // Waiver Types
  getWaiverTypes: (isActive?: boolean, responsibility?: string) => {
    const params = new URLSearchParams();
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (responsibility) params.append('responsibility', responsibility);
    return apiRequest<any[]>(`/api/waivers/types?${params.toString()}`);
  },

  getWaiverType: (id: string) =>
    apiRequest<any>(`/api/waivers/types/${id}`),

  createWaiverType: (data: any) =>
    apiRequest<any>('/api/waivers/types', { method: 'POST', body: data }),

  updateWaiverType: (id: string, data: any) =>
    apiRequest<any>(`/api/waivers/types/${id}`, { method: 'PUT', body: data }),

  // Waivers
  getAll: (status?: string, responsibility?: string, waiverTypeId?: string, patientId?: string, invoiceId?: string, search?: string, page = 1, limit = 50) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (status) params.append('status', status);
    if (responsibility) params.append('responsibility', responsibility);
    if (waiverTypeId) params.append('waiverTypeId', waiverTypeId);
    if (patientId) params.append('patientId', patientId);
    if (invoiceId) params.append('invoiceId', invoiceId);
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/waivers?${params.toString()}`);
  },

  getById: (id: string) =>
    apiRequest<any>(`/api/waivers/${id}`),

  create: (data: any) =>
    apiRequest<any>('/api/waivers', { method: 'POST', body: data }),

  approve: (id: string, data: { approvedBy: string; notes?: string }) =>
    apiRequest<any>(`/api/waivers/${id}/approve`, { method: 'PUT', body: data }),

  reject: (id: string, data: { rejectedBy: string; rejectionReason: string }) =>
    apiRequest<any>(`/api/waivers/${id}/reject`, { method: 'PUT', body: data }),

  recordStaffPayment: (id: string, data: any) =>
    apiRequest<any>(`/api/waivers/${id}/staff-payment`, { method: 'POST', body: data }),

  getStats: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return apiRequest<any>(`/api/waivers/stats/summary?${params.toString()}`);
  },

  getPatientsWithOutstandingBills: (search?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/waivers/patients/outstanding?${params.toString()}`);
  },

  getStaffForWaiver: (search?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/waivers/staff?${params.toString()}`);
  },
};

// MOH Reports API
export const mohReportsApi = {
  get717: (startDate: string, endDate: string) =>
    apiRequest<any>(`/api/moh-reports/717?startDate=${startDate}&endDate=${endDate}`),

  get705: (startDate: string, endDate: string) =>
    apiRequest<any>(`/api/moh-reports/705?startDate=${startDate}&endDate=${endDate}`),

  get711: (startDate: string, endDate: string) =>
    apiRequest<any>(`/api/moh-reports/711?startDate=${startDate}&endDate=${endDate}`),

  get708: (startDate: string, endDate: string) =>
    apiRequest<any>(`/api/moh-reports/708?startDate=${startDate}&endDate=${endDate}`),

  get731Plus: (startDate: string, endDate: string) =>
    apiRequest<any>(`/api/moh-reports/731-plus?startDate=${startDate}&endDate=${endDate}`),

  get730: () =>
    apiRequest<any>(`/api/moh-reports/730`),
};

// User API
export const userApi = {
  getAll: (search?: string, page = 1, limit = 100) => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) params.append('search', search);
    return apiRequest<any[]>(`/api/users?${params.toString()}`);
  },
  getById: (id: string) =>
    apiRequest<any>(`/api/users/${id}`),
  create: (data: any) =>
    apiRequest<any>('/api/users', { method: 'POST', body: data }),
  update: (id: string, data: any) =>
    apiRequest<any>(`/api/users/${id}`, { method: 'PUT', body: data }),
  delete: (id: string) =>
    apiRequest<any>(`/api/users/${id}`, { method: 'DELETE' }),
  changePassword: (id: string, data: { currentPassword: string; newPassword: string }) =>
    apiRequest<any>(`/api/users/${id}/password`, { method: 'PUT', body: data }),
};

// Nursing API
export const nursingApi = {
  getAssignedWards: () =>
    apiRequest<any[]>('/api/nursing/wards/assigned'),

  getNurseAssignments: (nurseUserId: number) =>
    apiRequest<any[]>(`/api/nursing/wards/nurse/${nurseUserId}`),

  assignWards: (nurseUserId: number, wardIds: number[]) =>
    apiRequest<any>('/api/nursing/wards/assign', { method: 'POST', body: { nurseUserId, wardIds } }),

  /** List nurses (users with nurse-related roles) for dropdowns */
  getNurses: () =>
    apiRequest<any[]>('/api/nursing/nurses'),

  /** Get shift schedule: { morning, evening, night } arrays of staff with ward info */
  getShiftSchedule: () =>
    apiRequest<{ morning: any[]; evening: any[]; night: any[] }>('/api/nursing/shift-schedule'),

  /** Assign a nurse to a shift (morning | evening | night). One shift per nurse. */
  assignNurseShift: (nurseUserId: number, shiftType: 'morning' | 'evening' | 'night') =>
    apiRequest<any>('/api/nursing/shift-schedule/assign', { method: 'POST', body: { nurseUserId, shiftType } }),

  getReadyPickupRequests: () =>
    apiRequest<any[]>('/api/nursing/pickup-requests/ready'),

  getMyPickupRequests: () =>
    apiRequest<any[]>('/api/nursing/pickup-requests'),

  createPickupRequest: (data: any) =>
    apiRequest<any>('/api/nursing/pickup-requests', { method: 'POST', body: data }),

  /** Nurse cancels their own pickup request (only pending or ready_for_pickup). */
  cancelPickupRequest: (pickupId: string) =>
    apiRequest<{ message: string; pickupId: string; status: string }>(
      `/api/nursing/pickup-requests/${pickupId}/cancel`,
      { method: 'POST' }
    ),
};
