export type ChecklistItemType =
  | 'yes_no'
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'photo'
  | 'location'
  | 'area_location'
  | 'user'
  | 'progress_status';

/** Healthcare-oriented subject types for a form visit. */
export type VisitSubjectType = 'standalone' | 'facility' | 'patient' | 'chemist_referral' | 'asset';

export interface ChecklistPhotoEntry {
  fileId?: number;
  url?: string;
  fileName?: string;
  localUri?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface ChecklistPhotoAnswer {
  photos: ChecklistPhotoEntry[];
}

export interface ChecklistLocationAnswer {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  type: ChecklistItemType;
  required?: boolean;
  options?: string[];
  maxPhotos?: number;
  requireGps?: boolean;
  allowMultiple?: boolean;
  userDisplay?: 'name' | 'email' | 'role';
  showIf?: {
    itemId?: string;
    op?: string;
    value?: unknown;
    values?: string[];
    all?: Array<{
      itemId: string;
      op?: string;
      value?: unknown;
      values?: string[];
    }>;
    any?: Array<{
      itemId: string;
      op?: string;
      value?: unknown;
      values?: string[];
    }>;
  };
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface TemplateStructure {
  sections: ChecklistSection[];
}

export interface DataCollectionTemplate {
  templateId: number;
  name: string;
  description?: string | null;
  templateCategory?: string;
  structure: TemplateStructure;
  isActive?: boolean;
  allowedSubjectTypes?: VisitSubjectType[];
  updatedAt?: string;
}

export interface DataCollectionSubmission {
  submissionId: number;
  templateId: number;
  templateName?: string;
  subjectType?: VisitSubjectType;
  subjectId?: number | null;
  subjectLabel?: string | null;
  visitDate?: string | null;
  title?: string | null;
  answers: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PendingSubmission {
  localId: string;
  templateId: number;
  templateName: string;
  subjectType?: VisitSubjectType;
  subjectId?: number;
  subjectLabel?: string;
  visitDate: string;
  title: string;
  answers: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface VisitDraft {
  templateId?: number;
  subjectType?: VisitSubjectType;
  subjectId?: number;
  subjectLabel?: string;
  visitDate?: string;
  title?: string;
  answers?: Record<string, unknown>;
  savedAt?: string;
}

export interface PendingChemistItemAction {
  localId: string;
  referralId: number;
  referralItemId: number;
  status: string;
  quantityPicked?: number;
  chemistNotes?: string;
  createdAt: string;
  syncStatus: 'pending' | 'failed';
  lastError?: string;
}

export interface PendingAssetVerification {
  localId: string;
  assetId: number;
  assetTag?: string;
  isPresent: boolean;
  notes?: string;
  condition?: string;
  createdAt: string;
  syncStatus: 'pending' | 'failed';
  lastError?: string;
}
