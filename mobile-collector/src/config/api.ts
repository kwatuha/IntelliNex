/**
 * IntelliNex Field — companion API base URL.
 *
 * Production (same-origin proxy or public API host), e.g.:
 *   https://intellinex.intellibizafrica.co.ke
 * Android emulator → host machine API:
 *   http://10.0.2.2:3001
 * Physical device on LAN:
 *   http://YOUR_LAN_IP:3001
 */
export const API_BASE_URL = 'https://intellinex.intellibizafrica.co.ke';

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@intellinex_field_auth_token',
  USER_DATA: '@intellinex_field_user_data',
  TEMPLATES_CACHE: '@intellinex_field_templates',
  PENDING_SUBMISSIONS: '@intellinex_field_pending_submissions',
  PENDING_CHEMIST_ACTIONS: '@intellinex_field_pending_chemist',
  PENDING_ASSET_VERIFICATIONS: '@intellinex_field_pending_assets',
  VISIT_DRAFT: '@intellinex_field_visit_draft',
  CACHE_TIMESTAMP: '@intellinex_field_cache_ts',
  REFERRALS_CACHE: '@intellinex_field_referrals',
  ASSETS_CACHE: '@intellinex_field_assets',
};

export const APP_VERSION = '1.0.2';

export const THEME = {
  primary: '#0F4C75',
  primaryDark: '#0A3350',
  accent: '#3282B8',
  background: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textMuted: '#666666',
  border: '#E0E0E0',
  danger: '#C62828',
  warning: '#F57C00',
  success: '#2E7D32',
};
