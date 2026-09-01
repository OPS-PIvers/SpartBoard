// glTransfer — pure .gl.json export/import helpers with injected network/storage effects.

import type { GuidedLearningSet } from '@/types';
import { normalizeGuidedLearningSet } from './setMigration';

export const GL_EXPORT_EXTENSION = '.gl.json';

// Per-slide embed ceiling — larger media stays linked online.
export const GL_MAX_EMBED_BYTES = 25 * 1024 * 1024;

// Whole-export embed ceiling — aborts the export before a giant/unusable file is produced.
export const GL_MAX_TOTAL_EMBED_BYTES = 100 * 1024 * 1024;

// Thrown when the running total of embedded slide bytes exceeds the export budget.
export class GlExportBudgetExceededError extends Error {}

// Matches guidedLearningDriveService's file naming.
export function sanitizeGlFileName(title: string): string {
  return title.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}

export function buildGlExportFilename(title: string, id: string): string {
  return `${sanitizeGlFileName(title)}.${id.slice(0, 8)}${GL_EXPORT_EXTENSION}`;
}

export interface GlTransferResult {
  set: GuidedLearningSet;
  warnings: string[];
}

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read media blob'));
    reader.readAsDataURL(blob);
  });
}

const DATA_URI_PATTERN = /^data:([^;,]+)?(;base64)?,/;

export interface DataUriParts {
  mimeType: string;
  bytes: Uint8Array;
}

// Decode a base64 data URI; null for anything else.
export function parseDataUri(uri: string): DataUriParts | null {
  const match = DATA_URI_PATTERN.exec(uri);
  if (!match || match[2] !== ';base64') return null;
  const mimeType = match[1] || 'application/octet-stream';
  try {
    const binary = atob(uri.slice(match[0].length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function extensionForMime(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType.toLowerCase()] ?? 'bin';
}

// Rewrite image slides to data URIs; video/oversize/unfetchable slides keep their link + warn.
export async function embedSetImages(
  set: GuidedLearningSet,
  fetchMedia: (url: string) => Promise<Blob>
): Promise<GlTransferResult> {
  const warnings: string[] = [];
  let totalEmbeddedBytes = 0;
  const imageUrls = await Promise.all(
    set.imageUrls.map(async (url, index) => {
      if (url.startsWith('data:')) return url;
      if ((set.imageKinds?.[index] ?? 'image') === 'video') {
        warnings.push(`Slide ${index + 1} is a video and stays linked online.`);
        return url;
      }
      try {
        const blob = await fetchMedia(url);
        if (blob.size > GL_MAX_EMBED_BYTES) {
          warnings.push(
            `Slide ${index + 1} is larger than ${Math.round(GL_MAX_EMBED_BYTES / 1024 / 1024)}MB and stays linked online.`
          );
          return url;
        }
        // Checked before conversion, using base64-inflated size so the budget bounds the actual .gl.json file.
        totalEmbeddedBytes += Math.ceil(blob.size / 3) * 4;
        if (totalEmbeddedBytes > GL_MAX_TOTAL_EMBED_BYTES) {
          throw new GlExportBudgetExceededError(
            `This activity's embedded media exceeds the ${Math.round(GL_MAX_TOTAL_EMBED_BYTES / 1024 / 1024)}MB export limit. Remove some slides or shrink the media before exporting.`
          );
        }
        return await blobToDataUri(blob);
      } catch (err) {
        if (err instanceof GlExportBudgetExceededError) throw err;
        warnings.push(
          `Slide ${index + 1} could not be embedded and keeps its online link.`
        );
        return url;
      }
    })
  );
  const stepMediaCount = set.steps.filter(
    (s) => Boolean(s.audioUrl) || Boolean(s.videoUrl && s.videoStoragePath)
  ).length;
  if (stepMediaCount > 0) {
    warnings.push(
      `${stepMediaCount} step${stepMediaCount === 1 ? ' uses' : 's use'} uploaded audio/video that stays linked online.`
    );
  }
  // imagePaths are importer-specific Storage paths — meaningless in a file.
  const exported: GuidedLearningSet = { ...set, imageUrls };
  delete exported.imagePaths;
  return { set: exported, warnings };
}

export type GlMediaUploader = (
  blob: Blob,
  fileName: string
) => Promise<{ url: string; storagePath: string }>;

// Upload data-URI slides to storage; `onUploaded` lets a caller track orphans on a mid-way throw.
export async function rehostImportedSetImages(
  set: GuidedLearningSet,
  upload: GlMediaUploader,
  onUploaded?: (storagePath: string) => void
): Promise<GlTransferResult> {
  const warnings: string[] = [];
  const imagePaths: string[] = [];
  let uploadedAny = false;
  const imageUrls: string[] = [];
  for (let index = 0; index < set.imageUrls.length; index++) {
    const url = set.imageUrls[index];
    if (!url.startsWith('data:')) {
      warnings.push(`Slide ${index + 1} references an online link.`);
      imageUrls.push(url);
      imagePaths.push('');
      continue;
    }
    const parsed = parseDataUri(url);
    if (!parsed) {
      throw new Error(`Slide ${index + 1} has an unreadable embedded image.`);
    }
    const blob = new Blob([parsed.bytes.buffer as ArrayBuffer], {
      type: parsed.mimeType,
    });
    const fileName = `imported-slide-${index + 1}.${extensionForMime(parsed.mimeType)}`;
    const uploaded = await upload(blob, fileName);
    imageUrls.push(uploaded.url);
    imagePaths.push(uploaded.storagePath);
    uploadedAny = true;
    onUploaded?.(uploaded.storagePath);
  }
  const rehosted: GuidedLearningSet = { ...set, imageUrls };
  if (uploadedAny) {
    rehosted.imagePaths = imagePaths;
  } else {
    delete rehosted.imagePaths;
  }
  return { set: rehosted, warnings };
}

// Mint fresh identity; schemaVersion passes through so legacy files keep legacy semantics.
export function prepareImportedSet(
  set: GuidedLearningSet,
  authorUid?: string
): GuidedLearningSet {
  const now = Date.now();
  const prepared: GuidedLearningSet = {
    ...set,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    authorUid,
  };
  delete prepared.isBuilding;
  return prepared;
}

// Parse + structurally check .gl.json text; throws teacher-readable messages.
export function parseGuidedLearningJson(text: string): GlTransferResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      'That is not valid JSON. Paste or upload a .gl.json export.'
    );
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Expected a single Guided Learning activity object.');
  }
  const candidate = raw as Partial<GuidedLearningSet> & { imageUrl?: string };
  const hasAnyImage =
    (Array.isArray(candidate.imageUrls) && candidate.imageUrls.length > 0) ||
    typeof candidate.imageUrl === 'string';
  if (!hasAnyImage || !Array.isArray(candidate.steps)) {
    throw new Error(
      'This does not look like a Guided Learning export (missing images or steps).'
    );
  }
  if (
    Array.isArray(candidate.imageUrls) &&
    candidate.imageUrls.some((u) => typeof u !== 'string')
  ) {
    throw new Error('Every entry in imageUrls must be a string URL.');
  }
  if (candidate.steps.some((s) => s === null || typeof s !== 'object')) {
    throw new Error('Every step must be an object — check the steps array.');
  }
  const set = normalizeGuidedLearningSet(candidate as GuidedLearningSet);
  const warnings: string[] = [];
  const remoteCount = set.imageUrls.filter(
    (u) => !u.startsWith('data:')
  ).length;
  if (remoteCount > 0) {
    warnings.push(
      `${remoteCount} slide${remoteCount === 1 ? '' : 's'} link to online media instead of embedded copies.`
    );
  }
  return { set, warnings };
}
