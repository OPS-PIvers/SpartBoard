import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { parseRosterFileBody } from '@/hooks/useRosters';
import { GoogleDriveService } from '@/utils/googleDriveService';
import { assignPins } from '@/utils/rosterPins';
import { logError } from '@/utils/logError';
import {
  parseSubShareNames,
  type SubShareNamesFile,
} from '@/utils/subShareNames';
import type { ClassRoster, SubstituteShareRoster } from '@/types';

// `locked`: drive.file can't read another user's file until the sub opens it in the Picker.
// `partial`: some of the share's files loaded; the rest still need picking.
export type SubRosterStatus =
  'none' | 'checking' | 'locked' | 'loading' | 'partial' | 'ready' | 'error';

export interface SubstituteRosterState {
  rosters: ClassRoster[];
  status: SubRosterStatus;
  loadRosters: () => Promise<void>;
  /** Student names scrubbed out of the board snapshots, by board id. */
  names: SubShareNamesFile | null;
}

interface RosterResult {
  key: string;
  status: Exclude<SubRosterStatus, 'none' | 'checking'>;
  rosters: ClassRoster[];
  names: SubShareNamesFile | null;
}

const GRANT_RETRY_DELAY_MS = 1200;
const EMPTY_SHARED: SubstituteShareRoster[] = [];
const EMPTY_ROSTERS: ClassRoster[] = [];

function rosterFromBody(
  meta: SubstituteShareRoster,
  body: unknown
): ClassRoster {
  const content = parseRosterFileBody(body);
  const students = assignPins(content.students, { randomForLinked: false });
  return {
    id: meta.id,
    name: meta.name,
    driveFileId: meta.driveFileId,
    studentCount: students.length,
    createdAt: 0,
    students,
    groups: content.groups,
    defaultOverridesByStudentId: content.defaultOverridesByStudentId,
  };
}

async function downloadRoster(
  drive: GoogleDriveService,
  meta: SubstituteShareRoster
): Promise<ClassRoster> {
  const blob = await drive.downloadFile(meta.driveFileId);
  return rosterFromBody(meta, JSON.parse(await blob.text()));
}

async function downloadNames(
  drive: GoogleDriveService,
  namesFileId: string
): Promise<SubShareNamesFile> {
  const blob = await drive.downloadFile(namesFileId);
  return parseSubShareNames(JSON.parse(await blob.text()) as unknown);
}

interface ShareFiles {
  rosters: ClassRoster[];
  names: SubShareNamesFile | null;
  /** Files the share expects that could not be read. */
  missing: number;
}

/** Whatever is readable right now; throws only when nothing is. */
async function downloadShareFiles(
  drive: GoogleDriveService,
  shared: SubstituteShareRoster[],
  namesFileId: string | undefined
): Promise<ShareFiles> {
  const [rosterResults, namesResult] = await Promise.all([
    Promise.allSettled(shared.map((meta) => downloadRoster(drive, meta))),
    namesFileId
      ? downloadNames(drive, namesFileId).then(
          (value) => ({ ok: true as const, value }),
          (reason: unknown) => ({ ok: false as const, reason })
        )
      : Promise.resolve(null),
  ]);
  const rosters = rosterResults.flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : []
  );
  const names = namesResult?.ok ? namesResult.value : null;
  const missing =
    shared.length - rosters.length + (namesResult && !namesResult.ok ? 1 : 0);
  if (rosters.length === 0 && !names) {
    const failure = rosterResults.find((r) => r.status === 'rejected');
    throw (
      failure?.reason ??
      (namesResult && !namesResult.ok ? namesResult.reason : null) ??
      new Error('No shared files could be loaded')
    );
  }
  return { rosters, names, missing };
}

/** The grant can land a beat after the Picker closes, so an incomplete read is tried once more. */
async function downloadAfterPick(
  drive: GoogleDriveService,
  shared: SubstituteShareRoster[],
  namesFileId: string | undefined
): Promise<ShareFiles> {
  try {
    const first = await downloadShareFiles(drive, shared, namesFileId);
    if (first.missing === 0) return first;
  } catch {
    // Retried below.
  }
  await new Promise((resolve) => setTimeout(resolve, GRANT_RETRY_DELAY_MS));
  return downloadShareFiles(drive, shared, namesFileId);
}

type ServedFiles =
  | { status: 'needs-host' }
  | {
      status: 'ok';
      rosters: Array<{ id: string; body: unknown }>;
      names: unknown;
      missing: number;
    };

/** The share's files read server-side from the teacher's Drive, or null when that path gave nothing. */
async function loadFromServer(
  shareId: string,
  shared: SubstituteShareRoster[]
): Promise<ShareFiles | null> {
  const { data } = await httpsCallable<{ shareId: string }, ServedFiles>(
    functions,
    'loadSubShareFilesV1'
  )({ shareId });
  if (data.status !== 'ok') return null;
  const metaById = new Map(shared.map((m) => [m.id, m]));
  let unparsed = 0;
  const rosters = data.rosters.flatMap((r) => {
    const meta = metaById.get(r.id);
    if (!meta) return [];
    try {
      return [rosterFromBody(meta, r.body)];
    } catch {
      unparsed += 1;
      return [];
    }
  });
  let names: SubShareNamesFile | null = null;
  if (data.names != null) {
    try {
      names = parseSubShareNames(data.names);
    } catch {
      unparsed += 1;
    }
  }
  if (rosters.length === 0 && !names) return null;
  return { rosters, names, missing: data.missing + unparsed };
}

const statusOf = (files: ShareFiles): 'ready' | 'partial' =>
  files.missing === 0 ? 'ready' : 'partial';

/**
 * Loads a substitute share's roster files and its names file from the sub's
 * own Drive access, in one unlock (plan §3.4).
 */
export function useSubstituteRosters(
  sharedRosters: SubstituteShareRoster[] | undefined,
  namesFileId?: string,
  /** A collection share's id; lets the server read the files for a named sub. */
  shareId?: string
): SubstituteRosterState {
  const { googleAccessToken, refreshGoogleToken, ensureGoogleScope } =
    useAuth();
  const { openPicker } = useGooglePicker();
  const incoming = sharedRosters ?? EMPTY_SHARED;
  const key = [
    ...incoming.map((r) => `${r.id}:${r.driveFileId}`),
    ...(namesFileId ? [`names:${namesFileId}`] : []),
  ].join(',');
  // Share snapshots re-create the array; hold one reference per key so Drive isn't re-hit.
  const [stable, setStable] = useState({ key, shared: incoming });
  if (stable.key !== key) setStable({ key, shared: incoming });
  const shared = stable.key === key ? stable.shared : incoming;
  const [result, setResult] = useState<RosterResult | null>(null);
  const current = result?.key === key ? result : null;

  // The server reads for a named sub; otherwise files picked on an earlier visit are tried silently.
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const take = (files: ShareFiles) =>
      setResult((prev) =>
        prev?.key === key && prev.status === 'ready'
          ? prev
          : {
              key,
              status: statusOf(files),
              rosters: files.rosters,
              names: files.names,
            }
      );
    const lock = () =>
      setResult((prev) =>
        prev?.key === key && prev.status !== 'locked'
          ? prev
          : { key, status: 'locked', rosters: EMPTY_ROSTERS, names: null }
      );
    void (async () => {
      if (shareId) {
        const served = await loadFromServer(shareId, shared).catch(
          (err: unknown) => {
            logError('useSubstituteRosters.loadFromServer', err, { shareId });
            return null;
          }
        );
        if (cancelled) return;
        if (served) return take(served);
      }
      if (!googleAccessToken) return lock();
      const drive = new GoogleDriveService(
        googleAccessToken,
        refreshGoogleToken
      );
      try {
        const files = await downloadShareFiles(drive, shared, namesFileId);
        if (!cancelled) take(files);
      } catch {
        if (!cancelled) lock();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    key,
    shared,
    namesFileId,
    shareId,
    googleAccessToken,
    refreshGoogleToken,
  ]);

  const loadRosters = useCallback(async () => {
    if (!key) return;
    const token = await ensureGoogleScope('drive.file', { interactive: true });
    if (!token) {
      setResult({ key, status: 'error', rosters: EMPTY_ROSTERS, names: null });
      return;
    }
    // The names file rides the same Picker as the class lists, so the sub
    // unlocks the share once (plan §3.4).
    const pickerFileIds = [
      ...shared.map((r) => r.driveFileId),
      ...(namesFileId ? [namesFileId] : []),
    ];
    try {
      const picked = await openPicker({
        token,
        fileIds: pickerFileIds,
        title:
          pickerFileIds.length > 1
            ? 'Tick every file in the list, then Select'
            : 'Select the class list to load',
      });
      if (!picked) {
        // Dismissed, or the Picker closed without handing a file back.
        logError(
          'useSubstituteRosters.loadRosters',
          new Error('Picker returned no file'),
          { rosterCount: shared.length }
        );
        return;
      }
      // A second pass keeps what the first one loaded on screen.
      setResult((prev) => ({
        key,
        status: 'loading',
        rosters: prev?.key === key ? prev.rosters : EMPTY_ROSTERS,
        names: prev?.key === key ? prev.names : null,
      }));
      const drive = new GoogleDriveService(token, refreshGoogleToken);
      const files = await downloadAfterPick(drive, shared, namesFileId);
      setResult({
        key,
        status: statusOf(files),
        rosters: files.rosters,
        names: files.names,
      });
    } catch (err) {
      logError('useSubstituteRosters.loadRosters', err, {
        rosterCount: shared.length,
        pickedFileIds: pickerFileIds.join(','),
      });
      setResult({ key, status: 'error', rosters: EMPTY_ROSTERS, names: null });
    }
  }, [
    key,
    shared,
    namesFileId,
    ensureGoogleScope,
    openPicker,
    refreshGoogleToken,
  ]);

  const status: SubRosterStatus = !key
    ? 'none'
    : (current?.status ??
      (googleAccessToken || shareId ? 'checking' : 'locked'));

  return {
    rosters: current?.rosters ?? EMPTY_ROSTERS,
    status,
    loadRosters,
    names: current?.names ?? null,
  };
}
