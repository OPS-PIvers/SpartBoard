/**
 * The per-share names file (plan §3.4).
 *
 * Board snapshots reach `/shared_collections` scrubbed of student names, and
 * `content/` is readable by any verified district account holding the link, so
 * neither can carry a roster a teacher typed into a widget. The names travel
 * the same way a teacher's own board carries them: a Drive file, readable only
 * by the substitutes named on the share.
 */

import {
  extractDashboardPII,
  type DashboardPiiSupplement,
} from '@/utils/dashboardPII';
import {
  resolveSubShareDriveGrants,
  type RosterGrantingDrive,
} from '@/utils/subShareDriveGrants';
import { logError } from '@/utils/logError';
import type { Dashboard, SubstituteShareDriveGrant } from '@/types';

/** Where the file lives, beside the dashboard `-pii.json` sidecars. */
export const SUB_SHARE_NAMES_FOLDER = 'Data/SubShares';

export function subShareNamesFileName(shareId: string): string {
  return `${shareId}-names.json`;
}

/** One share's names, keyed by board id. Boards with no names are omitted. */
export interface SubShareNamesFile {
  version: 1;
  boards: Record<string, DashboardPiiSupplement>;
}

export function extractSubShareNames(boards: Dashboard[]): SubShareNamesFile {
  const byBoard: Record<string, DashboardPiiSupplement> = {};
  for (const board of boards) {
    const supplement = extractDashboardPII(board);
    if (Object.keys(supplement).length > 0) byBoard[board.id] = supplement;
  }
  return { version: 1, boards: byBoard };
}

export function subShareNamesIsEmpty(file: SubShareNamesFile): boolean {
  return Object.keys(file.boards).length === 0;
}

/**
 * Reads a downloaded names file. Anything unrecognised reads as no names
 * rather than throwing: a sub whose file is missing or stale should still get
 * the board, as they do today.
 */
export function parseSubShareNames(body: unknown): SubShareNamesFile {
  const empty: SubShareNamesFile = { version: 1, boards: {} };
  if (typeof body !== 'object' || body === null) return empty;
  const boards = (body as { boards?: unknown }).boards;
  if (typeof boards !== 'object' || boards === null) return empty;
  const parsed: Record<string, DashboardPiiSupplement> = {};
  for (const [boardId, supplement] of Object.entries(
    boards as Record<string, unknown>
  )) {
    if (typeof supplement === 'object' && supplement !== null) {
      parsed[boardId] = supplement as DashboardPiiSupplement;
    }
  }
  return { version: 1, boards: parsed };
}

/** What the teacher's client got done: the file, and who can read it. */
export interface SubShareNamesWrite {
  driveFileId: string;
  driveGrants: SubstituteShareDriveGrant[];
  /** Subs the grant did not land for; they will see the boards without names. */
  failedEmails: string[];
}

/** The slice of `GoogleDriveService` the names file needs. */
export interface NamesFileDrive extends RosterGrantingDrive {
  uploadFile: (
    content: Blob,
    name: string,
    folderPath: string
  ) => Promise<{ id: string }>;
  updateFileContent: (fileId: string, content: Blob) => Promise<void>;
}

/**
 * Writes `{shareId}-names.json` and grants the named subs reader on it.
 * Returns null when the file could not be written at all, which the caller
 * reports: a share whose names did not travel is still worth having, the same
 * way a roster grant that fails does not abort the share.
 */
export async function writeSubShareNamesFile({
  drive,
  shareId,
  names,
  emails,
  existingFileId,
}: {
  drive: NamesFileDrive | null | undefined;
  shareId: string;
  names: SubShareNamesFile;
  emails: string[];
  existingFileId?: string;
}): Promise<SubShareNamesWrite | null> {
  if (!drive) return null;
  const blob = new Blob([JSON.stringify(names)], {
    type: 'application/json',
  });
  let driveFileId = existingFileId;
  try {
    if (driveFileId) {
      await drive.updateFileContent(driveFileId, blob);
    } else {
      const file = await drive.uploadFile(
        blob,
        subShareNamesFileName(shareId),
        SUB_SHARE_NAMES_FOLDER
      );
      driveFileId = file.id;
    }
  } catch (err) {
    logError('writeSubShareNamesFile', err, { shareId });
    return null;
  }
  const { driveGrants, failedPairs } = await resolveSubShareDriveGrants({
    driveService: drive,
    fileIds: [driveFileId],
    emails,
    scope: 'writeSubShareNamesFile',
  });
  return {
    driveFileId,
    driveGrants,
    failedEmails: failedPairs.map((p) => p.email),
  };
}

/**
 * Writes one share's names file and grants the named subs reader on it. Drive
 * lives on the teacher's client, so the share writer takes this in rather than
 * reaching for a Drive service of its own.
 */
export type SubShareNamesWriter = (
  shareId: string,
  names: SubShareNamesFile,
  existingFileId?: string
) => Promise<SubShareNamesWrite | null>;
