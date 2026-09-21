/**
 * Resolves a quiz's paper sheet stimuli to printable `<img>` sources
 * (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D16).
 *
 * Runs as the list changes rather than at print time, so the teacher sees a
 * stimulus they cannot load while they are still editing, and the print button
 * has the sources already in hand.
 */

import { useEffect, useState } from 'react';
import type { PaperSheetStimulus } from '@/types';
import { useGoogleDrive } from './useGoogleDrive';
import {
  browserStimulusImageDeps,
  resolveStimulusImages,
} from '@/utils/paperSheetStimulusImages';

export interface PaperSheetStimulusImages {
  /** Stimulus id to `<img>` src, for `PaperPrintJob.stimulusImageSrc`. */
  src: Record<string, string>;
  /** Stimuli no route could fetch; printing is blocked while this is non-empty. */
  failed: PaperSheetStimulus[];
  loading: boolean;
}

/** Identity of a list, so a caption edit does not re-fetch every image. */
const imageKey = (stimuli: readonly PaperSheetStimulus[]): string =>
  stimuli
    .filter((s) => s.source === 'image')
    .map((s) => `${s.id}:${s.driveFileId ?? s.url ?? ''}`)
    .join('|');

export function usePaperSheetStimulusImages(
  stimuli: readonly PaperSheetStimulus[]
): PaperSheetStimulusImages {
  const { getDriveFileAsBlob } = useGoogleDrive();
  const [resolved, setResolved] = useState<PaperSheetStimulusImages>({
    src: {},
    failed: [],
    loading: false,
  });
  const key = imageKey(stimuli);

  useEffect(() => {
    if (!key) {
      setResolved({ src: {}, failed: [], loading: false });
      return;
    }
    let live = true;
    let release: (() => void) | null = null;
    setResolved((prev) => ({ ...prev, loading: true }));
    void resolveStimulusImages(
      stimuli,
      browserStimulusImageDeps(async (fileId) => {
        const file = await getDriveFileAsBlob(fileId);
        return file?.blob ?? null;
      })
    ).then((result) => {
      if (!live) {
        result.release();
        return;
      }
      release = result.release;
      setResolved({ src: result.src, failed: result.failed, loading: false });
    });
    return () => {
      live = false;
      release?.();
    };
    // `stimuli` is re-created on every keystroke; `key` is what actually
    // changes what has to be fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, getDriveFileAsBlob]);

  return resolved;
}
