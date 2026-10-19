/**
 * Drive storage for scored paper work. Scan images and the seat-to-name file
 * live under the teacher's own `SpartBoard/Data/Scored Work/` folder; Firestore
 * keeps only the opaque file ids.
 */

import type { ScoredWorkSheet } from './scoredWorkPlan';

export interface ScoredWorkDrive {
  getFolderPath: (path: string) => Promise<string>;
  uploadFileToFolderId: (
    file: Blob,
    fileName: string,
    folderId: string
  ) => Promise<{ id: string; name: string }>;
  updateFileContent: (fileId: string, content: Blob) => Promise<void>;
  downloadFile: (fileId: string) => Promise<Blob>;
}

const ROOT = 'Data/Scored Work';
const NAMES_FILE = 'names.json';

/** Drive queries quote folder names, so keep them to plain characters. */
export function workFolderName(title: string, workId: string): string {
  const clean = title
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .slice(0, 60);
  return `${clean || 'Worksheet'} (${workId.slice(0, 8)})`;
}

export const ensureWorkFolder = (
  drive: ScoredWorkDrive,
  title: string,
  workId: string
): Promise<string> =>
  drive.getFolderPath(`${ROOT}/${workFolderName(title, workId)}`);

/** Seat to printed name, written once so a teacher browsing Drive can tell scans apart. */
export function namesManifest(
  sheets: readonly ScoredWorkSheet[]
): Record<string, { name: string; className: string }> {
  const out: Record<string, { name: string; className: string }> = {};
  for (const s of sheets) {
    out[String(s.seat)] = { name: s.displayName, className: s.className };
  }
  return out;
}

export async function writeNamesManifest(
  drive: ScoredWorkDrive,
  folderId: string,
  sheets: readonly ScoredWorkSheet[]
): Promise<void> {
  await drive.uploadFileToFolderId(
    new Blob([JSON.stringify(namesManifest(sheets), null, 2)], {
      type: 'application/json',
    }),
    NAMES_FILE,
    folderId
  );
}

export const scanFileName = (
  seat: number,
  page: number,
  type: string
): string =>
  `seat-${String(seat).padStart(3, '0')}-p${page}.${type.includes('png') ? 'png' : 'webp'}`;

/** Upload one scanned page and return its Drive file id. */
export async function uploadScanPage(
  drive: ScoredWorkDrive,
  folderId: string,
  seat: number,
  page: number,
  blob: Blob
): Promise<string> {
  const file = await drive.uploadFileToFolderId(
    blob,
    scanFileName(seat, page, blob.type),
    folderId
  );
  return file.id;
}

export const downloadScanPage = (
  drive: ScoredWorkDrive,
  fileId: string
): Promise<Blob> => drive.downloadFile(fileId);
