import type { QuizAnswerImage } from '@/types';

const normalize = (text: string) => text.trim();

/** The https picture saved for an answer's text, or '' when it has none. */
export function imageForLabel(
  images: readonly QuizAnswerImage[] | undefined,
  label: string
): string {
  const key = normalize(label);
  const url = images?.find((img) => normalize(img.text) === key)?.url;
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
}

/** Pictures index-aligned with `labels` for a student payload; undefined when none has one. */
export function imagesForLabels(
  labels: readonly string[],
  images: readonly QuizAnswerImage[] | undefined
): string[] | undefined {
  if (!images || images.length === 0) return undefined;
  const out = labels.map((label) => imageForLabel(images, label));
  return out.some(Boolean) ? out : undefined;
}

/** Saved form of editor rows: one entry per labeled row with a picture, first row wins a repeat. */
export function answerImagesFromRows(
  rows: readonly { text: string; image?: string }[]
): QuizAnswerImage[] | undefined {
  const seen = new Set<string>();
  const out: QuizAnswerImage[] = [];
  for (const row of rows) {
    const key = normalize(row.text);
    if (!key || !row.image || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: row.text, url: row.image });
  }
  return out.length > 0 ? out : undefined;
}

/** The image in a paste, or null when it holds text the field should receive instead. */
export function pastedImage(
  data: Pick<DataTransfer, 'files' | 'types'>
): File | null {
  if (data.types.includes('text/plain')) return null;
  return (
    Array.from(data.files).find((f) => f.type.startsWith('image/')) ?? null
  );
}
