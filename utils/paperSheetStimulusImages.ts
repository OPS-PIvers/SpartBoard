/**
 * Turns a quiz's paper sheet stimuli into `<img>` sources the print document
 * can draw (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D16).
 *
 * Nothing waits for the network inside the print window: every image is
 * resolved here first, and a stimulus that cannot be fetched is named back to
 * the caller so the teacher is told rather than handed a sheet with a hole in
 * it. Pure apart from its injected dependencies, so the failure paths are
 * testable without a browser or a Drive token.
 */

import type { PaperSheetStimulus } from '@/types';
import { driveImageUrl } from './quizStimuli';

export interface StimulusImageDeps {
  /**
   * Fetch a Drive file with the printer's own token. Covers the owner's
   * private uploads, which no public URL can reach.
   */
  downloadAsBlob: (fileId: string) => Promise<Blob | null>;
  /** Confirm a URL actually loads as an image before the print window opens. */
  preload: (url: string) => Promise<boolean>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

export interface ResolvedStimulusImages {
  /** Stimulus id to `<img>` src, for `PaperPrintJob.stimulusImageSrc`. */
  src: Record<string, string>;
  /** Stimuli whose image could not be fetched; the print is blocked on these. */
  failed: PaperSheetStimulus[];
  /** Frees the object URLs; call once the print window has closed. */
  release: () => void;
}

/** What to tell the teacher about a stimulus that would print as an empty box. */
export function stimulusLoadErrorMessage(
  failed: readonly PaperSheetStimulus[]
): string {
  const names = failed.map((s) => `"${s.label}"`).join(', ');
  return failed.length === 1
    ? `Couldn't load ${names} — is it still in your Drive?`
    : `Couldn't load ${names} — are they still in your Drive?`;
}

const isImage = (s: PaperSheetStimulus): boolean => s.source === 'image';

/**
 * Resolve every image stimulus, private file first and link-shared second.
 *
 * The owner's own file answers to their token and nothing else, so the blob
 * fetch runs first. A teammate printing the owner's stack has no such access
 * and falls through to the public URL, which is what the D6 share confirm
 * exists to create.
 */
export async function resolveStimulusImages(
  stimuli: readonly PaperSheetStimulus[],
  deps: StimulusImageDeps
): Promise<ResolvedStimulusImages> {
  const src: Record<string, string> = {};
  const failed: PaperSheetStimulus[] = [];
  const objectUrls: string[] = [];

  await Promise.all(
    stimuli.filter(isImage).map(async (stimulus) => {
      if (stimulus.driveFileId) {
        const blob = await deps
          .downloadAsBlob(stimulus.driveFileId)
          .catch(() => null);
        if (blob) {
          const url = deps.createObjectUrl(blob);
          objectUrls.push(url);
          src[stimulus.id] = url;
          return;
        }
      }
      const publicUrl = stimulus.driveFileId
        ? driveImageUrl(stimulus.driveFileId)
        : stimulus.url;
      if (publicUrl && (await deps.preload(publicUrl).catch(() => false))) {
        src[stimulus.id] = publicUrl;
        return;
      }
      failed.push(stimulus);
    })
  );

  return {
    src,
    // Author order, so the message names them the way the teacher listed them.
    failed: stimuli.filter((s) => failed.includes(s)),
    release: () => {
      for (const url of objectUrls) deps.revokeObjectUrl(url);
      objectUrls.length = 0;
    },
  };
}

/** Browser dependencies for `resolveStimulusImages`. */
export function browserStimulusImageDeps(
  downloadAsBlob: (fileId: string) => Promise<Blob | null>
): StimulusImageDeps {
  return {
    downloadAsBlob,
    preload: (url) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      }),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  };
}
