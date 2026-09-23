import { useCallback, useEffect, useState } from 'react';
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
export type SubRosterStatus =
  | 'none'
  | 'checking'
  | 'locked'
  | 'loading'
  | 'ready'
  | 'error';

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

async function downloadSharedRosters(
  drive: GoogleDriveService,
  shared: SubstituteShareRoster[]
): Promise<ClassRoster[]> {
  const results = await Promise.allSettled(
    shared.map(async (meta): Promise<ClassRoster> => {
      const blob = await drive.downloadFile(meta.driveFileId);
      const content = parseRosterFileBody(JSON.parse(await blob.text()));
      const students = assignPins(content.students);
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
    })
  );
  // drive.file only covers files the sub picked, so keep whichever ones loaded.
  const loaded = results.flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : []
  );
  if (loaded.length === 0) {
    const failure = results.find((r) => r.status === 'rejected');
    throw failure?.reason ?? new Error('No shared rosters could be loaded');
  }
  return loaded;
}

/** The names file, or null when the share has none. */
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
}

/**
 * Everything the share expects. Used for the silent first try, so one
 * unreadable file means the sub has not unlocked this share yet.
 */
async function downloadShareFiles(
  drive: GoogleDriveService,
  shared: SubstituteShareRoster[],
  namesFileId: string | undefined
): Promise<ShareFiles> {
  const [rosters, names] = await Promise.all([
    shared.length > 0
      ? downloadSharedRosters(drive, shared)
      : Promise.resolve(EMPTY_ROSTERS),
    namesFileId ? downloadNames(drive, namesFileId) : Promise.resolve(null),
  ]);
  return { rosters, names };
}

/**
 * After the Picker, whatever came back is what the sub gets: the grant can
 * land a beat after it closes, so retry once, and then a names file the
 * teacher's sweep has already trashed must not keep the class lists locked.
 */
async function downloadAfterPick(
  drive: GoogleDriveService,
  shared: SubstituteShareRoster[],
  namesFileId: string | undefined
): Promise<ShareFiles> {
  try {
    return await downloadShareFiles(drive, shared, namesFileId);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, GRANT_RETRY_DELAY_MS));
  }
  const [rosterResult, namesResult] = await Promise.allSettled([
    shared.length > 0
      ? downloadSharedRosters(drive, shared)
      : Promise.resolve(EMPTY_ROSTERS),
    namesFileId ? downloadNames(drive, namesFileId) : Promise.resolve(null),
  ]);
  if (rosterResult.status === 'rejected') throw rosterResult.reason;
  return {
    rosters: rosterResult.value,
    names: namesResult.status === 'fulfilled' ? namesResult.value : null,
  };
}

/**
 * Loads a substitute share's roster files and its names file from the sub's
 * own Drive access, in one unlock (plan §3.4).
 */
export function useSubstituteRosters(
  sharedRosters: SubstituteShareRoster[] | undefined,
  namesFileId?: string
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

  // Files picked on an earlier visit stay readable, so try silently first.
  useEffect(() => {
    if (!key || !googleAccessToken) return;
    let cancelled = false;
    const drive = new GoogleDriveService(googleAccessToken, refreshGoogleToken);
    downloadShareFiles(drive, shared, namesFileId).then(
      (files) => {
        if (cancelled) return;
        setResult((prev) =>
          prev?.key === key && prev.status === 'ready'
            ? prev
            : { key, status: 'ready', ...files }
        );
      },
      () => {
        if (cancelled) return;
        setResult((prev) =>
          prev?.key === key && prev.status !== 'locked'
            ? prev
            : { key, status: 'locked', rosters: EMPTY_ROSTERS, names: null }
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, shared, namesFileId, googleAccessToken, refreshGoogleToken]);

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
        title: 'Select the class list to load',
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
      setResult({
        key,
        status: 'loading',
        rosters: EMPTY_ROSTERS,
        names: null,
      });
      const drive = new GoogleDriveService(token, refreshGoogleToken);
      const files = await downloadAfterPick(drive, shared, namesFileId);
      setResult({ key, status: 'ready', ...files });
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
    : (current?.status ?? (googleAccessToken ? 'checking' : 'locked'));

  return {
    rosters: current?.status === 'ready' ? current.rosters : EMPTY_ROSTERS,
    status,
    loadRosters,
    names: current?.status === 'ready' ? current.names : null,
  };
}
