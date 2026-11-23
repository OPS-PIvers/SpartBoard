// Fetches a quiz's picture, PDF, Doc and Slides stimuli ahead of the test paper print, so the print window opens on the click.
import { useEffect, useState } from 'react';
import type { QuizStimulus } from '@/types';
import { useGoogleDrive } from './useGoogleDrive';
import {
  browserStimulusImageDeps,
  resolveStimulusImages,
} from '@/utils/paperSheetStimulusImages';
import { openPdfPages, PDF_RENDER_DPI } from '@/utils/paperSheetPdfPage';
import { driveMediaUrl, drivePdfExportUrl } from '@/utils/quizStimuli';
import {
  isFetchedStimulus,
  stimulusDocFileId,
  type PaperTestPage,
  type PaperTestStimulusFiles,
} from '@/utils/paperTestStimuli';

/** Longer files print as their link; a test paper is not the place for a whole book. */
export const MAX_STIMULUS_PAGES = 40;
/** Pages across the whole test, so a Chromebook can still decode the print window. */
export const MAX_TEST_PAGES = 60;
const FETCH_TIMEOUT_MS = 20_000;
// Whole-dialog cap: a stalled image or PDF render must not keep Print disabled.
const LOAD_TIMEOUT_MS = 60_000;

const pxToMm = (px: number): number => (px / PDF_RENDER_DPI) * 25.4;

const EMPTY: PaperTestStimulusFiles = { images: {}, pages: {} };

const keyOf = (stimuli: readonly QuizStimulus[]): string =>
  stimuli
    .filter(isFetchedStimulus)
    .map((s) => `${s.id}:${s.type}:${s.driveFileId ?? s.url}`)
    .sort()
    .join('|');

/** A Drive export capped like a plain fetch; null when it fails or runs long. */
function withTimeout(p: Promise<Blob>): Promise<Blob | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Each picture's pixel size; one that will not decode is left out and prints at a default shape. */
async function pictureSizes(
  srcs: Readonly<Record<string, string>>
): Promise<Record<string, { widthPx: number; heightPx: number }>> {
  if (typeof Image === 'undefined') return {};
  const out: Record<string, { widthPx: number; heightPx: number }> = {};
  await Promise.all(
    Object.entries(srcs).map(async ([id, src]) => {
      try {
        const img = new Image();
        img.src = src;
        await img.decode();
        if (img.naturalWidth > 0 && img.naturalHeight > 0)
          out[id] = { widthPx: img.naturalWidth, heightPx: img.naturalHeight };
      } catch {
        // Undecodable: the sheet sizes it by the default shape.
      }
    })
  );
  return out;
}

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

    // What has loaded so far, so the overall cap keeps it instead of dropping everything.
    let imageSrcs: Record<string, string> = {};
    let imageSizes: Record<string, { widthPx: number; heightPx: number }> = {};
    const pages: Record<string, PaperTestPage[]> = {};
    let capped = false;
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
      imageSrcs = images.src;
      imageSizes = await pictureSizes(images.src);
      let pageTotal = 0;
      for (const s of fetched) {
        if (s.type === 'image' || !live || capped) continue;
        let blob: Blob | null = null;
        const docId = stimulusDocFileId(s);
        if (docId) {
          // The teacher's own access first, then the link anyone can view.
          blob =
            (publicOnly || !driveService
              ? null
              : await withTimeout(driveService.exportAsPdf(docId))) ??
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
            const srcs: PaperTestPage[] = [];
            let n = 1;
            // Each page prints cut to its inked part; a blank page prints nothing.
            for (; n <= pdf.pageCount && live && !capped; n += 1) {
              const page = await pdf.renderTrimmed(n);
              if (page)
                srcs.push({
                  src: keep(page.blob),
                  widthMm: pxToMm(page.widthPx),
                  heightMm: pxToMm(page.heightPx),
                });
            }
            if (n > pdf.pageCount && srcs.length) pages[s.id] = srcs;
          } finally {
            pdf.close();
          }
        } catch (err) {
          // An unreadable file prints as its link instead.
          console.warn('[paperTest] could not render stimulus', s.id, err);
        }
      }
      return { images: images.src, imageSizes, pages };
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    // A stalled image or PDF prints as links rather than leaving the button disabled.
    const timedOut = new Promise<PaperTestStimulusFiles>((resolve) => {
      timer = setTimeout(() => {
        capped = true;
        resolve({
          images: { ...imageSrcs },
          imageSizes: { ...imageSizes },
          pages: { ...pages },
        });
      }, LOAD_TIMEOUT_MS);
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
