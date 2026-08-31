/**
 * glTransfer — pure helpers for Guided Learning .gl.json export/import.
 *
 * Export produces the same envelope the Drive service writes (a plain
 * `GuidedLearningSet` JSON blob) with slide media rewritten to base64 data
 * URIs so the file is self-contained. Import reverses that: data URIs are
 * uploaded to the importing user's Firebase Storage and the URLs rewritten.
 * Network/storage effects are injected so everything here is unit-testable.
 */

import type { GuidedLearningSet } from '@/types';
import { normalizeGuidedLearningSet } from './setMigration';

export const GL_EXPORT_EXTENSION = '.gl.json';

/** Matches guidedLearningDriveService's file naming. */
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

/** Decode a base64 data URI. Returns null for anything else. */
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

/**
 * Rewrite every slide URL to a base64 data URI for a self-contained export.
 * Slides that can't be fetched keep their remote URL and add a warning —
 * the export still opens for anyone with access to those URLs.
 */
export async function embedSetImages(
  set: GuidedLearningSet,
  fetchMedia: (url: string) => Promise<Blob>
): Promise<GlTransferResult> {
  const warnings: string[] = [];
  const imageUrls = await Promise.all(
    set.imageUrls.map(async (url, index) => {
      if (url.startsWith('data:')) return url;
      try {
        return await blobToDataUri(await fetchMedia(url));
      } catch {
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

/**
 * Upload every data-URI slide to the importing user's storage and rewrite
 * the URLs. Remote http(s) slides are kept as-is with a warning.
 */
export async function rehostImportedSetImages(
  set: GuidedLearningSet,
  upload: GlMediaUploader
): Promise<GlTransferResult> {
  const warnings: string[] = [];
  const imagePaths: string[] = [];
  let uploadedAny = false;
  const imageUrls: string[] = [];
  for (let index = 0; index < set.imageUrls.length; index++) {
    const url = set.imageUrls[index];
    if (!url.startsWith('data:')) {
      if (!url.startsWith('blob:')) {
        warnings.push(`Slide ${index + 1} references an online link.`);
      }
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
  }
  const rehosted: GuidedLearningSet = { ...set, imageUrls };
  if (uploadedAny) {
    rehosted.imagePaths = imagePaths;
  } else {
    delete rehosted.imagePaths;
  }
  return { set: rehosted, warnings };
}

/**
 * Mint a fresh identity for an imported set. `schemaVersion` passes through
 * untouched so legacy files keep legacy rendering semantics.
 */
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

/**
 * Parse and structurally check pasted/uploaded .gl.json text. Throws with a
 * teacher-readable message on malformed input.
 */
export function parseGuidedLearningJson(text: string): GlTransferResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That is not valid JSON. Export a .gl.json file first.');
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
      'This file does not look like a Guided Learning export (missing images or steps).'
    );
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
