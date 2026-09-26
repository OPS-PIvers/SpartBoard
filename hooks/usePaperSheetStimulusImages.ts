/**
 * Resolves a quiz's paper sheet stimuli to printable `<img>` sources
 * (docs/plans/shipped/QUIZ_PAPER_SHEET_STIMULI.md D16).
 *
 * Runs as the list changes rather than at print time, so the teacher sees a
 * stimulus they cannot load while they are still editing, and the print button
 * has the sources already in hand.
 */

import { useEffect, useMemo, useState } from 'react';
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

/**
 * Identity of a list, so a caption edit does not re-fetch every image. Sorted,
 * because reordering the stack changes nothing about what has to be fetched.
 */
const imageKey = (stimuli: readonly PaperSheetStimulus[]): string =>
  stimuli
    .filter((s) => s.source === 'image')
    .map((s) => `${s.id}:${s.driveFileId ?? s.url ?? ''}`)
    .sort()
    .join('|');

/** A finished answer, held with the list it was about so a stale one is never read. */
interface Resolved {
  key: string;
  src: Record<string, string>;
  failed: PaperSheetStimulus[];
}

export interface PaperSheetStimulusImageOptions {
  /**
   * Skip the private Drive read and use the link-shared URL only. A teammate
   * printing somebody else's stack has no token that can read their file, so
   * the attempt is a guaranteed 404 (D6).
   */
  publicOnly?: boolean;
}

export function usePaperSheetStimulusImages(
  stimuli: readonly PaperSheetStimulus[],
  options: PaperSheetStimulusImageOptions = {}
): PaperSheetStimulusImages {
  const { getDriveFileAsBlob } = useGoogleDrive();
  const [resolved, setResolved] = useState<Resolved>({
    key: '',
    src: {},
    failed: [],
  });
  const key = imageKey(stimuli);
  const { publicOnly = false } = options;
  const answered = resolved.key === key ? resolved : null;

  useEffect(() => {
    if (!key) return;
    let live = true;
    let release: (() => void) | null = null;
    void resolveStimulusImages(
      stimuli,
      browserStimulusImageDeps(async (fileId) => {
        if (publicOnly) return null;
        const file = await getDriveFileAsBlob(fileId);
        return file?.blob ?? null;
      })
    ).then((result) => {
      if (!live) {
        result.release();
        return;
      }
      release = result.release;
      setResolved({ key, src: result.src, failed: result.failed });
    });
    return () => {
      live = false;
      release?.();
    };
    // `stimuli` is re-created on every keystroke; `key` is what actually
    // changes what has to be fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, publicOnly, getDriveFileAsBlob]);

  return useMemo(
    () => ({
      src: answered?.src ?? {},
      failed: answered?.failed ?? [],
      // Derived rather than stored, so the first render before the effect has
      // run already reads as loading and a click cannot beat the fetch.
      loading: !!key && !answered,
    }),
    [key, answered]
  );
}
