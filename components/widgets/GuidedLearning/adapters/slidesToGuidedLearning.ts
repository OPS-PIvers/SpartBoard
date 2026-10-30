import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import type { PageImage } from '@/utils/import/pageImages';

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read a page picture.'));
    reader.readAsDataURL(blob);
  });

/** A step label longer than this moves into the step text. */
const MAX_LABEL_CHARS = 120;

/** First line is the slide's title; the rest is its body text. */
export function splitSlideText(text: string): {
  label?: string;
  body?: string;
} {
  const [first = '', ...rest] = text.split('\n');
  if (first.trim().length > MAX_LABEL_CHARS) {
    const body = text.trim();
    return body ? { body } : {};
  }
  const label = first.trim();
  const body = rest.join('\n').trim();
  return {
    ...(label ? { label } : {}),
    ...(body ? { body } : {}),
  };
}

/** One slide and one step per page; the step carries the page's text for read-aloud. */
export async function pagesToGuidedLearningSet(
  title: string,
  pages: readonly PageImage[]
): Promise<GuidedLearningSet> {
  // Data URIs ride the existing import rehost, which uploads them at save.
  const imageUrls = await Promise.all(pages.map((p) => blobToDataUri(p.blob)));
  const steps: GuidedLearningStep[] = pages.map((page, imageIndex) => {
    const { label, body } = splitSlideText(page.text);
    return {
      id: crypto.randomUUID(),
      xPct: 50,
      yPct: 50,
      imageIndex,
      interactionType: 'tooltip',
      hotspotAlwaysHidden: true,
      ...(label ? { label } : {}),
      ...(body ? { text: body } : {}),
    };
  });
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 3,
    title,
    imageUrls,
    steps,
    mode: 'structured',
    createdAt: now,
    updatedAt: now,
  };
}
