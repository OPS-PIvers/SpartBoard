import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { parseRosterFileBody } from '@/hooks/useRosters';
import { GoogleDriveService } from '@/utils/googleDriveService';
import { assignPins } from '@/utils/rosterPins';
import { logError } from '@/utils/logError';
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
}

interface RosterResult {
  key: string;
  status: Exclude<SubRosterStatus, 'none' | 'checking'>;
  rosters: ClassRoster[];
}

const EMPTY_SHARED: SubstituteShareRoster[] = [];
const EMPTY_ROSTERS: ClassRoster[] = [];

async function downloadSharedRosters(
  drive: GoogleDriveService,
  shared: SubstituteShareRoster[]
): Promise<ClassRoster[]> {
  return Promise.all(
    shared.map(async (meta) => {
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
}

/** Loads a substitute share's roster files from the sub's own Drive access. */
export function useSubstituteRosters(
  sharedRosters: SubstituteShareRoster[] | undefined
): SubstituteRosterState {
  const { googleAccessToken, refreshGoogleToken, ensureGoogleScope } =
    useAuth();
  const { openPicker } = useGooglePicker();
  const shared = sharedRosters ?? EMPTY_SHARED;
  const key = shared.map((r) => `${r.id}:${r.driveFileId}`).join(',');
  const [result, setResult] = useState<RosterResult | null>(null);
  const current = result?.key === key ? result : null;

  // Files picked on an earlier visit stay readable, so try silently first.
  useEffect(() => {
    if (!key || !googleAccessToken) return;
    let cancelled = false;
    const drive = new GoogleDriveService(googleAccessToken, refreshGoogleToken);
    downloadSharedRosters(drive, shared).then(
      (rosters) => {
        if (cancelled) return;
        setResult((prev) =>
          prev?.key === key && prev.status === 'ready'
            ? prev
            : { key, status: 'ready', rosters }
        );
      },
      () => {
        if (cancelled) return;
        setResult((prev) =>
          prev?.key === key && prev.status !== 'locked'
            ? prev
            : { key, status: 'locked', rosters: EMPTY_ROSTERS }
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, shared, googleAccessToken, refreshGoogleToken]);

  const loadRosters = useCallback(async () => {
    if (!key) return;
    const token = await ensureGoogleScope('drive.file', { interactive: true });
    if (!token) {
      setResult({ key, status: 'error', rosters: EMPTY_ROSTERS });
      return;
    }
    try {
      const picked = await openPicker({
        token,
        fileIds: shared.map((r) => r.driveFileId),
        title: 'Select the class list to load',
      });
      if (!picked) return;
      setResult({ key, status: 'loading', rosters: EMPTY_ROSTERS });
      const drive = new GoogleDriveService(token, refreshGoogleToken);
      const rosters = await downloadSharedRosters(drive, shared);
      setResult({ key, status: 'ready', rosters });
    } catch (err) {
      logError('useSubstituteRosters.loadRosters', err, {
        rosterCount: shared.length,
      });
      setResult({ key, status: 'error', rosters: EMPTY_ROSTERS });
    }
  }, [key, shared, ensureGoogleScope, openPicker, refreshGoogleToken]);

  const status: SubRosterStatus = !key
    ? 'none'
    : (current?.status ?? (googleAccessToken ? 'checking' : 'locked'));

  return {
    rosters: current?.status === 'ready' ? current.rosters : EMPTY_ROSTERS,
    status,
    loadRosters,
  };
}
