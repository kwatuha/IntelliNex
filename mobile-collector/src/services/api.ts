import axios, { AxiosError, AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, STORAGE_KEYS, APP_VERSION } from '../config/api';
import { parseJwtUser } from '../utils/jwtUtils';
import {
  DataCollectionSubmission,
  DataCollectionTemplate,
  VisitSubjectType,
} from '../types/dataCollection';

export interface AuthUser {
  id: number;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  roleName?: string;
}

class ApiService {
  private client: AxiosInstance;
  private onUnauthorized: (() => void) | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 45000,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-App': 'intellinex-field',
        'X-App-Version': APP_VERSION,
      },
    });

    this.client.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_DATA]);
          this.onUnauthorized?.();
        }
        return Promise.reject(error);
      }
    );
  }

  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler;
  }

  private mapUser(raw: any): AuthUser {
    const id = Number(raw?.id ?? raw?.userId);
    return {
      id: Number.isFinite(id) && id > 0 ? id : 0,
      username: raw?.username,
      email: raw?.email,
      firstName: raw?.firstName,
      lastName: raw?.lastName,
      roleName: raw?.role || raw?.roleName,
    };
  }

  async login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const response = await this.client.post('/api/auth/login', { username, password });
    const token = response.data?.token;
    if (!token) throw new Error('No token returned from login');
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    const user = this.mapUser(response.data?.user);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    // Fire-and-forget usage + update prompt (same as Machakos)
    this.reportAppUsage('app_login').catch(() => {});
    this.promptForAppUpdateIfNeeded().catch(() => {});
    return { token, user };
  }

  async logout(): Promise<void> {
    await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER_DATA]);
  }

  async resumeSession(): Promise<{ authenticated: boolean; user?: AuthUser }> {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!token) return { authenticated: false };
    try {
      const response = await this.client.get('/api/auth/verify');
      const user = this.mapUser(response.data?.user);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
      return { authenticated: true, user };
    } catch {
      const jwtUser = parseJwtUser(token);
      if (jwtUser) {
        const user = this.mapUser(jwtUser);
        return { authenticated: true, user };
      }
      await this.logout();
      return { authenticated: false };
    }
  }

  async getStoredUser(): Promise<AuthUser | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async listTemplates(params: { category?: string } = {}): Promise<DataCollectionTemplate[]> {
    const response = await this.client.get('/api/data-collection/templates', { params });
    return Array.isArray(response.data) ? response.data : [];
  }

  async getTemplate(id: number): Promise<DataCollectionTemplate> {
    const response = await this.client.get(`/api/data-collection/templates/${id}`);
    return response.data;
  }

  async listMySubmissions(limit = 50): Promise<DataCollectionSubmission[]> {
    const response = await this.client.get('/api/data-collection/submissions', {
      params: { mine: 1, limit },
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async createSubmission(body: {
    templateId: number;
    subjectType?: VisitSubjectType;
    subjectId?: number;
    subjectLabel?: string;
    visitDate?: string;
    title?: string;
    answers: Record<string, unknown>;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
  }): Promise<DataCollectionSubmission> {
    const response = await this.client.post('/api/data-collection/submissions', body);
    return response.data;
  }

  async getChemistMe(): Promise<any> {
    const response = await this.client.get('/api/pharmacy/chemist/me');
    return response.data;
  }

  async listExternalReferrals(params: { status?: string; chemistId?: number | string; search?: string } = {}): Promise<any[]> {
    const response = await this.client.get('/api/pharmacy/external-referrals', { params });
    return Array.isArray(response.data) ? response.data : [];
  }

  async updateReferralStatus(referralId: number, status: string, notes?: string): Promise<any> {
    const response = await this.client.patch(`/api/pharmacy/external-referrals/${referralId}/status`, {
      status,
      notes,
    });
    return response.data;
  }

  async updateReferralItem(
    referralId: number,
    referralItemId: number,
    body: { status?: string; quantityPicked?: number; chemistNotes?: string }
  ): Promise<any> {
    const response = await this.client.patch(
      `/api/pharmacy/external-referrals/${referralId}/items/${referralItemId}`,
      body
    );
    return response.data;
  }

  async getCriticalAssets(): Promise<any[]> {
    const response = await this.client.get('/api/assets/critical/list');
    return Array.isArray(response.data) ? response.data : response.data?.assets || [];
  }

  async bulkVerifyAssets(payload: {
    verifiedBy: number;
    verifications: Array<{
      assetId: number;
      isPresent?: boolean;
      notes?: string;
      condition?: string;
    }>;
  }): Promise<any> {
    const response = await this.client.post('/api/assets/critical/bulk-verify', payload);
    return response.data;
  }

  async getMobileAppRelease(): Promise<{ available: boolean; release?: { version?: string } | null }> {
    const response = await this.client.get('/api/mobile-app/release');
    return response.data;
  }

  async reportAppUsage(eventType: 'app_login' | 'app_sync'): Promise<void> {
    try {
      await this.client.post('/api/mobile-app/usage/report', {
        eventType,
        appVersion: APP_VERSION,
      });
    } catch {
      /* non-blocking */
    }
  }

  async promptForAppUpdateIfNeeded(): Promise<void> {
    try {
      const { Alert, Linking } = require('react-native');
      const { isNewerVersion } = require('../utils/versionUtils');
      const data = await this.getMobileAppRelease();
      const latest = data?.release?.version;
      if (!data?.available || !latest || !isNewerVersion(String(latest), APP_VERSION)) return;

      const dismissKey = `@intellinex_field_update_dismissed_${latest}`;
      const dismissed = await AsyncStorage.getItem(dismissKey);
      if (dismissed === '1') return;

      Alert.alert(
        'Update available',
        `IntelliNex Field ${latest} is available (you have ${APP_VERSION}). Open the download page in HMIS?`,
        [
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => {
              AsyncStorage.setItem(dismissKey, '1').catch(() => {});
            },
          },
          {
            text: 'Open download',
            onPress: () => {
              Linking.openURL(`${API_BASE_URL}/hmis/field-app`).catch(() => {});
            },
          },
        ]
      );
    } catch {
      /* ignore */
    }
  }

  /** Compatibility stubs for checklist widgets carried from Machakos collector. */
  async getUserData(): Promise<AuthUser | null> {
    return this.getStoredUser();
  }

  async fetchMe(): Promise<AuthUser> {
    const session = await this.resumeSession();
    if (!session.user) throw new Error('Not signed in');
    return session.user;
  }

  async getFieldOptions(): Promise<{ options: string[] }> {
    return { options: [] };
  }

  async getGeographySubcounties(): Promise<string[]> {
    return [];
  }

  async getGeographyWards(): Promise<string[]> {
    return [];
  }

  async getGeographySublocations(): Promise<string[]> {
    return [];
  }

  async getGeographyVillages(): Promise<string[]> {
    return [];
  }
}

const apiService = new ApiService();
export default apiService;
