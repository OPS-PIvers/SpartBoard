// Fetches a quiz's picture, PDF, Doc and Slides stimuli ahead of the test paper print, so the print window opens on the click.
import { useEffect, useState } from 'react';
import type { QuizStimulus } from '@/types';
import { useGoogleDrive } from './useGoogleDrive';
import {
  browserStimulusImageDeps,
  resolveStimulusImages,
} from '@/utils/paperSheetStimulusImages';
import { openPdfPages } from '@/utils/paperSheetPdfPage';
import { driveMediaUrl, drivePdfExportUrl } from '@/utils/quizStimuli';
import {
  isFetchedStimulus,
  stimulusDocFileId,
  type PaperTestStimulusFiles,
} from '@/utils/paperTestStimuli';

/** Longer files print as their link; a test paper is not the place for a whole book. */
export const MAX_STIMULUS_PAGES = 40;
/** Pages across the whole test, so a Chromebook can still decode the print window. */
export const MAX_TEST_PAGES = 60;
const FETCH_TIMEOUT_MS = 20_000;
// Whole-dialog cap: a stalled image or PDF render must not keep Print disabled.
const LOAD_TIMEOUT_MS = 60_000;

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
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
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
      let pageTotal = 0;
      for (const s of fetched) {
        if (s.type === 'image' || !live) continue;
        let blob: Blob | null = null;
        const docId = stimulusDocFileId(s);
        if (docId) {
          // The teacher's own access first, then the link anyone can view.
          blob =
            (publicOnly || !driveService
              ? null
              : await driveService.exportAsPdf(docId).catch(() => null)) ??
            (await fetchBlob(drivePdfExportUrl(docId) ?? ''));
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
            if (
              pdf.pageCount > MAX_STIMULUS_PAGES ||
              pageTotal + pdf.pageCount > MAX_TEST_PAGES
            )
              continue;
            pageTotal += pdf.pageCount;
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

    let timer: ReturnType<typeof setTimeout> | undefined;
    // A stalled image or PDF prints as links rather than leaving the button disabled.
    const timedOut = new Promise<PaperTestStimulusFiles>((resolve) => {
      timer = setTimeout(() => resolve(EMPTY), LOAD_TIMEOUT_MS);
    });
    void Promise.race([
      // A failed fetch prints as links rather than leaving the button disabled.
      run().catch((): PaperTestStimulusFiles => EMPTY),
      timedOut,
    ]).then((files) => {
      clearTimeout(timer);
      if (live) setResolved({ key, files });
      // Unmounted mid-fetch: free what finished after the cleanup ran.
      else for (const url of objectUrls) URL.revokeObjectURL(url);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      for (const url of objectUrls) URL.revokeObjectURL(url);
      // Those URLs are gone, so report loading until the next run lands.
      setResolved({ key: '', files: EMPTY });
    };
    // `stimuli` is rebuilt on every render; `key` is what changes what has to be fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, publicOnly, driveService, getDriveFileAsBlob]);

  if (!key) return { files: EMPTY, loading: false };
  return resolved.key === key
    ? { files: resolved.files, loading: false }
    : { files: EMPTY, loading: true };
}
