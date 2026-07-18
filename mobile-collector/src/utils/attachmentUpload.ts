import { ChecklistPhotoAnswer } from '../types/dataCollection';

/**
 * IntelliNex Field stores photo local URIs in the submission JSON for now.
 * Server attachment upload can be added later (multipart → /uploads).
 */
export async function uploadPendingPhotosInAnswers(
  answers: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...answers };
  for (const [key, value] of Object.entries(answers)) {
    if (!value || typeof value !== 'object') continue;
    const photos = (value as ChecklistPhotoAnswer).photos;
    if (!Array.isArray(photos)) continue;
    next[key] = {
      photos: photos.map((p) => ({
        ...p,
        // Keep localUri so reviewers know capture happened offline.
        url: p.url || p.localUri,
      })),
    };
  }
  return next;
}
