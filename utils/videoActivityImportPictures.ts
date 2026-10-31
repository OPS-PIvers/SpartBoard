// Copies a sent video lesson's pictures into the teacher's Drive before the editor opens (docs/plans/IMPORT.md D32).
import type { ImportVideoLesson } from '@/utils/import/contract';
import type { RemoteImageFetcher } from '@/utils/quizDocumentImport/types';
import type { StimulusUploader } from '@/utils/quizDocumentImport/attachImages';

/** Pictures past this are left out, well inside `fetchImportImage`'s rate limit. */
export const MAX_IMPORT_PICTURES = 50;

export interface CopiedPictures {
  /** Source picture address to its Drive file id. */
  byUrl: Map<string, string>;
  /** Pictures that couldn't be copied (or were past the cap); their stops come over without one. */
  failed: number;
}

export async function copyLessonPictures(
  video: ImportVideoLesson,
  deps: { fetchImage: RemoteImageFetcher; uploader: StimulusUploader }
): Promise<CopiedPictures> {
  const urls = [
    ...new Set(video.stops.flatMap((s) => (s.image ? [s.image] : []))),
  ];
  const byUrl = new Map<string, string>();
  let failed = Math.max(0, urls.length - MAX_IMPORT_PICTURES);
  for (const [i, url] of urls.slice(0, MAX_IMPORT_PICTURES).entries()) {
    try {
      const fetched = await deps.fetchImage(url);
      if (!fetched) {
        failed += 1;
        continue;
      }
      const ext = fetched.contentType.split('/')[1] ?? 'img';
      const { driveFileId } = await deps.uploader.upload({
        id: `picture-${i}`,
        blob: fetched.blob,
        contentType: fetched.contentType,
        name: `video-activity-picture-${i + 1}.${ext}`,
      });
      byUrl.set(url, driveFileId);
    } catch {
      failed += 1;
    }
  }
  return { byUrl, failed };
}
