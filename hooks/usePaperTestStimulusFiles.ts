// Fetches a quiz's picture, PDF, Doc and Slides stimuli ahead of the test paper print, so the print window opens on the click.
import { useEffect, useState } from 'react';
import type { QuizStimulus } from '@/types';
import { useGoogleDrive } from './useGoogleDrive';
import {
  browserStimulusImageDeps,
  resolveStimulusImages,
} from '@/utils/paperSheetStimulusImages';
import { openPdfPages } from '@/utils/paperSheetPdfPage';
import { driveMediaUrl } from '@/utils/quizStimuli';
import {
  isFetchedStimulus,
  type PaperTestStimulusFiles,
} from '@/utils/paperTestStimuli';

/** Longer files print as their link; a test paper is not the place for a whole book. */
export const MAX_STIMULUS_PAGES = 40;

const EMPTY: PaperTestStimulusFiles = { images: {}, pages: {} };

const keyOf = (stimuli: readonly QuizStimulus[]): string =>
  stimuli
    .filter(isFetchedStimulus)
    .map((s) => `${s.id}:${s.type}:${s.driveFileId ?? s.url}`)
    .sort()
    .join('|');

async function fetchBlob(url: string): Promise<Blob | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

export function usePaperTestStimulusFiles(
  stimuli: readonly QuizStimulus[],
  options: { publicOnly?: boolean } = {}
): { files: PaperTestStimulusFiles; loading: boolean } {
  const { driveService, getDriveFileAsBlob } = useGoogleDrive();
  const { publicOnly = false } = options;
  const key = keyOf(stimuli);
  const [resolved, setResolved] = useState<{
    key: string;
    files: PaperTestStimulusFiles;
  }>({ key: '', files: EMPTY });

  useEffect(() => {
    if (!key) return;
    let live = true;
    const objectUrls: string[] = [];
    const keep = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      return url;
    };
    const fetched = stimuli.filter(isFetchedStimulus);
    const ownBlob = async (fileId: string) =>
      publicOnly ? null : ((await getDriveFileAsBlob(fileId))?.blob ?? null);

    const run = async (): Promise<PaperTestStimulusFiles> => {
      const images = await resolveStimulusImages(
        fetched
          .filter((s) => s.type === 'image')
          .map((s) => ({
            id: s.id,
            label: s.label,
            source: 'image' as const,
            ...(s.driveFileId ? { driveFileId: s.driveFileId } : {}),
            ...(s.url ? { url: s.url } : {}),
          })),
        browserStimulusImageDeps(ownBlob)
      );
      objectUrls.push(
        ...Object.values(images.src).filter((u) => u.startsWith('blob:'))
      );
      const pages: Record<string, string[]> = {};
      for (const s of fetched) {
        if (s.type === 'image' || !live) continue;
        let blob: Blob | null = null;
        if (s.type === 'gdoc-embed' && s.driveFileId) {
          blob =
            publicOnly || !driveService
              ? null
              : await driveService.exportAsPdf(s.driveFileId).catch(() => null);
        } else if (s.driveFileId) {
          blob =
            (await ownBlob(s.driveFileId)) ??
            (await fetchBlob(driveMediaUrl(s.driveFileId) ?? ''));
        } else {
          blob = await fetchBlob(s.url);
        }
        if (!blob) continue;
        try {
          const pdf = await openPdfPages(blob);
          try {
            if (pdf.pageCount > MAX_STIMULUS_PAGES) continue;
            const srcs: string[] = [];
            for (let n = 1; n <= pdf.pageCount && live; n += 1)
              srcs.push(keep((await pdf.render(n)).blob));
            pages[s.id] = srcs;
          } finally {
            pdf.close();
          }
        } catch (err) {
          // An unreadable file prints as its link instead.
          console.warn('[paperTest] could not render stimulus', s.id, err);
        }
      }
      return { images: images.src, pages };
    };

    void run().then((files) => {
      if (live) setResolved({ key, files });
      // Unmounted mid-fetch: free what finished after the cleanup ran.
      else for (const url of objectUrls) URL.revokeObjectURL(url);
    });
    return () => {
      live = false;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
    // `stimuli` is rebuilt on every render; `key` is what changes what has to be fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, publicOnly, driveService, getDriveFileAsBlob]);

  if (!key) return { files: EMPTY, loading: false };
  return resolved.key === key
    ? { files: resolved.files, loading: false }
    : { files: EMPTY, loading: true };
}
