/**
 * Keeps track of which of a quiz's sheet images a PLC teammate could open, and
 * shares the ones the teacher says may be shared
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D6).
 *
 * Only looks when the quiz is actually in a PLC group: a quiz nobody else can
 * see has nothing to decide, and Drive should not be asked either way.
 */

import { useCallback, useEffect, useState } from 'react';
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
  checking: boolean;
  /** Share them all with anyone who has the link; resolves to what failed. */
  share: () => Promise<PaperSheetStimulus[]>;
}

export function usePaperSheetImageSharing(
  stimuli: readonly PaperSheetStimulus[],
  inPlcGroup: boolean
): PaperSheetImageSharing {
  const { driveService } = useGoogleDrive();
  const [unshared, setUnshared] = useState<PaperSheetStimulus[]>([]);
  const [checking, setChecking] = useState(false);
  const fileIds = sheetImageFileIds(stimuli).join('|');

  useEffect(() => {
    if (!inPlcGroup || !driveService || !fileIds) {
      setUnshared([]);
      return;
    }
    let live = true;
    setChecking(true);
    void findUnsharedSheetImages(stimuli, async (fileId) => {
      const permissions = await driveService.listFilePermissions(fileId);
      return permissions.some((p) => p.type === 'anyone');
    }).then((found) => {
      if (!live) return;
      setUnshared(found);
      setChecking(false);
    });
    return () => {
      live = false;
    };
    // `stimuli` is a new array on every keystroke; the Drive files are what
    // decide whether anything has to be looked up again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileIds, inPlcGroup, driveService]);

  const share = useCallback(async (): Promise<PaperSheetStimulus[]> => {
    if (!driveService) return [...unshared];
    const failed = await shareSheetImages(unshared, (fileId) =>
      driveService.makePublic(fileId, undefined)
    );
    setUnshared(failed);
    return failed;
  }, [driveService, unshared]);

  return { unshared, checking, share };
}
