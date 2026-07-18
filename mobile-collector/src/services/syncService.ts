import apiService from './api';
import {
  getCachedTemplates,
  getPendingAssetVerifications,
  getPendingChemistActions,
  getPendingSubmissions,
  removePendingAssetVerification,
  removePendingChemistAction,
  removePendingSubmission,
  savePendingAssetVerification,
  savePendingChemistAction,
  savePendingSubmission,
  setCachedAssets,
  setCachedReferrals,
  setCachedTemplates,
} from './offlineStore';
import { PendingSubmission } from '../types/dataCollection';
import { extractApiError, shouldQueueOffline } from '../utils/apiErrorUtils';
import { normalizeAnswersForSubmit } from '../utils/checklistValidation';

export type CatalogRefreshResult = {
  templates: number;
  referrals: number;
  assets: number;
  partial?: boolean;
};

/** Download templates (+ best-effort chemist referrals / critical assets) for offline use. */
export async function refreshCatalog(): Promise<CatalogRefreshResult> {
  const templates = await apiService.listTemplates({});
  await setCachedTemplates(templates);

  let referrals = 0;
  let assets = 0;
  let partial = false;

  try {
    const rows = await apiService.listExternalReferrals({ status: 'active' });
    await setCachedReferrals(rows);
    referrals = rows.length;
  } catch {
    try {
      // Chemist users: unfiltered list scoped by API to their chemist
      const rows = await apiService.listExternalReferrals({});
      await setCachedReferrals(rows);
      referrals = rows.length;
    } catch {
      partial = true;
    }
  }

  try {
    const rows = await apiService.getCriticalAssets();
    await setCachedAssets(rows);
    assets = rows.length;
  } catch {
    partial = true;
  }

  return { templates: templates.length, referrals, assets, partial };
}

export async function syncPendingSubmissions(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const pending = await getPendingSubmissions();
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  const templates = await getCachedTemplates();

  for (const item of pending) {
    if (item.status !== 'pending' && item.status !== 'failed') continue;
    try {
      const tpl = templates.find((t) => t.templateId === item.templateId);
      const answers = normalizeAnswersForSubmit(tpl?.structure || { sections: [] }, item.answers);
      await apiService.createSubmission({
        templateId: item.templateId,
        subjectType: item.subjectType || 'standalone',
        subjectId: item.subjectId,
        subjectLabel: item.subjectLabel,
        visitDate: item.visitDate,
        title: item.title,
        answers,
      });
      await removePendingSubmission(item.localId);
      synced += 1;
    } catch (err: unknown) {
      failed += 1;
      const message = extractApiError(err);
      errors.push(`${item.title || item.localId}: ${message}`);
      const updated: PendingSubmission = {
        ...item,
        status: shouldQueueOffline(err) ? 'pending' : 'failed',
        lastError: message,
      };
      await savePendingSubmission(updated);
    }
  }

  return { synced, failed, errors };
}

export async function syncPendingChemistActions(): Promise<{ synced: number; failed: number; errors: string[] }> {
  const pending = await getPendingChemistActions();
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    try {
      await apiService.updateReferralItem(item.referralId, item.referralItemId, {
        status: item.status,
        quantityPicked: item.quantityPicked,
        chemistNotes: item.chemistNotes,
      });
      await removePendingChemistAction(item.localId);
      synced += 1;
    } catch (err: unknown) {
      failed += 1;
      const message = extractApiError(err);
      errors.push(`Referral item ${item.referralItemId}: ${message}`);
      await savePendingChemistAction({
        ...item,
        syncStatus: shouldQueueOffline(err) ? 'pending' : 'failed',
        lastError: message,
      });
    }
  }
  return { synced, failed, errors };
}

export async function syncPendingAssetVerifications(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const pending = await getPendingAssetVerifications();
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  if (!pending.length) return { synced, failed, errors };

  const user = await apiService.getStoredUser();
  const verifiedBy = user?.id;
  if (!verifiedBy) {
    return { synced: 0, failed: pending.length, errors: ['Not signed in'] };
  }

  const onlineReady = pending.filter((p) => p.syncStatus === 'pending' || p.syncStatus === 'failed');
  if (!onlineReady.length) return { synced, failed, errors };

  try {
    await apiService.bulkVerifyAssets({
      verifiedBy,
      verifications: onlineReady.map((p) => ({
        assetId: p.assetId,
        isPresent: p.isPresent,
        notes: p.notes,
        condition: p.condition || 'good',
      })),
    });
    for (const p of onlineReady) {
      await removePendingAssetVerification(p.localId);
      synced += 1;
    }
  } catch (err: unknown) {
    const message = extractApiError(err);
    for (const p of onlineReady) {
      failed += 1;
      errors.push(`${p.assetTag || p.assetId}: ${message}`);
      await savePendingAssetVerification({
        ...p,
        syncStatus: shouldQueueOffline(err) ? 'pending' : 'failed',
        lastError: message,
      });
    }
  }
  return { synced, failed, errors };
}

export async function syncAllPending(): Promise<{
  submissions: { synced: number; failed: number };
  chemist: { synced: number; failed: number };
  assets: { synced: number; failed: number };
  errors: string[];
}> {
  const submissions = await syncPendingSubmissions();
  const chemist = await syncPendingChemistActions();
  const assets = await syncPendingAssetVerifications();
  return {
    submissions: { synced: submissions.synced, failed: submissions.failed },
    chemist: { synced: chemist.synced, failed: chemist.failed },
    assets: { synced: assets.synced, failed: assets.failed },
    errors: [...submissions.errors, ...chemist.errors, ...assets.errors],
  };
}

export { makeLocalId } from './offlineStore';
