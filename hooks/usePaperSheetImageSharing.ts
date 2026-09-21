/**
 * Keeps track of which of a quiz's sheet images a PLC teammate could open, and
 * shares the ones the teacher says may be shared
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D6).
 *
 * Only looks when the quiz is actually in a PLC group: a quiz nobody else can
 * see has nothing to decide, and Drive should not be asked either way.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaperSheetStimulus } from '@/types';
import { useGoogleDrive } from './useGoogleDrive';
import {
  findUnsharedSheetImages,
  sheetImageFileIds,
  shareSheetImages,
} from '@/utils/paperSheetStimulusSharing';

export interface PaperSheetImageSharing {
  /** Images a teammate cannot open yet; empty for a quiz not in a PLC. */
  unshared: PaperSheetStimulus[];
  /** Drive has not answered about the current images yet. */
  checking: boolean;
  /** Share them all with anyone who has the link; resolves to what failed. */
  share: () => Promise<PaperSheetStimulus[]>;
}

/** What Drive said, and about which files, so a stale answer is never used. */
interface Checked {
  fileIds: string;
  unshared: PaperSheetStimulus[];
}

export function usePaperSheetImageSharing(
  stimuli: readonly PaperSheetStimulus[],
  inPlcGroup: boolean
): PaperSheetImageSharing {
  const { driveService } = useGoogleDrive();
  const [checked, setChecked] = useState<Checked | null>(null);
  // Sorted: reordering the stack changes nothing about what Drive was asked.
  const fileIds = sheetImageFileIds(stimuli).sort().join('|');
  const wanted = inPlcGroup && !!driveService && !!fileIds;

  useEffect(() => {
    if (!wanted || !driveService) return;
    let live = true;
    void findUnsharedSheetImages(stimuli, async (fileId) => {
      const permissions = await driveService.listFilePermissions(fileId);
      return permissions.some((p) => p.type === 'anyone');
    }).then((unshared) => {
      if (live) setChecked({ fileIds, unshared });
    });
    return () => {
      live = false;
    };
    // `stimuli` is a new array on every keystroke; the Drive files are what
    // decide whether anything has to be looked up again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIds, wanted, driveService]);

  // Derived rather than stored, so the first render before the effect runs
  // already reads as "checking" and the Print button cannot beat the lookup.
  const answered = checked?.fileIds === fileIds ? checked : null;
  const unshared = useMemo(
    () => (wanted && answered ? answered.unshared : []),
    [wanted, answered]
  );

  const share = useCallback(async (): Promise<PaperSheetStimulus[]> => {
    if (!driveService) return [...unshared];
    const failed = await shareSheetImages(unshared, (fileId) =>
      // undefined domain forces type:'anyone'. A domain grant does not make a
      // file loadable from lh3.googleusercontent.com, which is the only route
      // a teammate's sheet has to it — the same reason quiz stimuli and
      // backgrounds share this way.
      driveService.makePublic(fileId, undefined)
    );
    setChecked({ fileIds, unshared: failed });
    return failed;
  }, [driveService, unshared, fileIds]);

  return { unshared, checking: wanted && !answered, share };
}
