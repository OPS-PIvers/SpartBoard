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
  type WidgetConfigOverlay,
} from '@/utils/dashboardPII';
import {
  resolveSubShareDriveGrants,
  type RosterGrantingDrive,
} from '@/utils/subShareDriveGrants';
import { logError } from '@/utils/logError';
import type {
  Dashboard,
  NextUpConfig,
  NextUpQueueItem,
  SubstituteShareDriveGrant,
  WidgetData,
} from '@/types';

/** Where the file lives, beside the dashboard `-pii.json` sidecars. */
export const SUB_SHARE_NAMES_FOLDER = 'Data/SubShares';

export function subShareNamesFileName(shareId: string): string {
  return `${shareId}-names.json`;
}

/** One share's names, keyed by board id. Boards with no names are omitted. */
export interface SubShareNamesFile {
  version: 1;
  boards: Record<string, DashboardPiiSupplement | WidgetConfigOverlay>;
}

/** Where a bundled Next Up queue lands in the widget's config. */
const QUEUE_OVERLAY_KEY = 'subShareQueue';

export function extractSubShareNames(boards: Dashboard[]): SubShareNamesFile {
  const byBoard: Record<string, DashboardPiiSupplement> = {};
  for (const board of boards) {
    const supplement = extractDashboardPII(board);
    if (Object.keys(supplement).length > 0) byBoard[board.id] = supplement;
  }
  return { version: 1, boards: byBoard };
}

/** Next Up widgets running a session, whose queue lives in the teacher's Drive. */
function liveNextUpWidgets(board: Dashboard): WidgetData[] {
  return (board.widgets ?? []).filter((widget) => {
    if (widget.type !== 'nextUp') return false;
    const config = widget.config as NextUpConfig | undefined;
    return Boolean(config?.isActive && config.activeDriveFileId);
  });
}

/**
 * Adds each live Next Up queue to the names file. The queue is a list of
 * student names, so it goes here rather than into the share's `content/`,
 * which any verified district account holding the link can read.
 *
 * A queue that cannot be read is named back to the caller and left out: the
 * sub gets the board with an empty queue, as they do today.
 */
export async function withSubShareQueues(
  names: SubShareNamesFile,
  boards: Dashboard[],
  readQueue: ((fileId: string) => Promise<unknown>) | undefined
): Promise<{ names: SubShareNamesFile; unreadable: string[] }> {
  const unreadable = new Set<string>();
  const withQueues: SubShareNamesFile = {
    version: 1,
    boards: { ...names.boards },
  };
  const reads = boards.flatMap((board) =>
    liveNextUpWidgets(board).map(async (widget) => {
      const config = widget.config as NextUpConfig;
      const label = config.sessionName ?? board.name;
      if (!readQueue) return { board, widget, label, queue: null };
      try {
        const queue = parseNextUpQueue(
          await readQueue(config.activeDriveFileId as string)
        );
        return { board, widget, label, queue };
      } catch (err) {
        logError('withSubShareQueues', err, { widgetId: widget.id });
        return { board, widget, label, queue: null };
      }
    })
  );
  for (const read of await Promise.all(reads)) {
    if (!read.queue) {
      unreadable.add(read.label);
      continue;
    }
    withQueues.boards[read.board.id] = {
      ...withQueues.boards[read.board.id],
      [read.widget.id]: { [QUEUE_OVERLAY_KEY]: read.queue },
    };
  }
  return { names: withQueues, unreadable: [...unreadable] };
}

/** The queue file is the teacher's own; read it defensively all the same. */
function parseNextUpQueue(body: unknown): NextUpQueueItem[] {
  if (!Array.isArray(body)) throw new Error('queue file is not a list');
  return body.filter(
    (item): item is NextUpQueueItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as NextUpQueueItem).name === 'string'
  );
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

/** The queue reader, when the teacher's client has a live Drive service. */
export function driveQueueReader(
  drive: { downloadFile: (fileId: string) => Promise<Blob> } | null | undefined
): ((fileId: string) => Promise<unknown>) | undefined {
  if (!drive) return undefined;
  return async (fileId) => {
    const blob = await drive.downloadFile(fileId);
    return JSON.parse(await blob.text()) as unknown;
  };
}

/** Everything the share writer needs from the teacher's Drive session. */
export interface SubShareNamesServices {
  write: SubShareNamesWriter;
  /** Reads a Next Up queue file from the teacher's Drive. */
  readQueue?: (fileId: string) => Promise<unknown>;
  /** Called with the labels of whatever could not be read. */
  onIncomplete?: (labels: string[]) => void;
}
