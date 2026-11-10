import type {
  QuizAnswerImage,
  QuizImageOnlyAnswer,
  QuizPublicQuestion,
  QuizQuestion,
} from '@/types';

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

// No 0/O, 1/I/L, 5/S or 8/B, so a label read off a printout can't be misread.
const LABEL_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679';

/** A fresh "Picture 7KQ" label no other answer in the question already uses. */
export function newImageOnlyLabel(
  taken: Iterable<string>,
  random: () => number = Math.random
): string {
  const used = new Set(Array.from(taken, (t) => t.trim().toLowerCase()));
  for (;;) {
    let code = '';
    for (let i = 0; i < 3; i++)
      code += LABEL_CHARS[Math.floor(random() * LABEL_CHARS.length)];
    const label = `Picture ${code}`;
    if (!used.has(label.toLowerCase())) return label;
  }
}

/** The image-only entry for an answer's text, or undefined when the answer has typed text. */
export function imageOnlyFor(
  list: readonly QuizImageOnlyAnswer[] | undefined,
  text: string
): QuizImageOnlyAnswer | undefined {
  if (!list || list.length === 0) return undefined;
  const key = normalize(text);
  return key ? list.find((a) => normalize(a.text) === key) : undefined;
}

/** Saved form of editor rows that are only a picture; undefined when none is. */
export function imageOnlyAnswersFromRows(
  rows: readonly { text: string; imageOnly: boolean; alt?: string }[]
): QuizImageOnlyAnswer[] | undefined {
  const seen = new Set<string>();
  const out: QuizImageOnlyAnswer[] = [];
  for (const row of rows) {
    const key = normalize(row.text);
    if (!row.imageOnly || !key || seen.has(key)) continue;
    seen.add(key);
    const alt = row.alt?.trim();
    out.push(alt ? { text: row.text, alt } : { text: row.text });
  }
  return out.length > 0 ? out : undefined;
}

/** The image-only entries a student payload needs: only labels it shows with a picture. */
export function publicImageOnlyAnswers(
  list: readonly QuizImageOnlyAnswer[] | undefined,
  shown: readonly { labels: readonly string[]; images?: readonly string[] }[]
): QuizImageOnlyAnswer[] | undefined {
  if (!list || list.length === 0) return undefined;
  const out = list.filter((entry) =>
    shown.some(({ labels, images }) =>
      labels.some(
        (label, i) =>
          normalize(label) === normalize(entry.text) && !!images?.[i]
      )
    )
  );
  return out.length > 0
    ? out.map((e) =>
        e.alt?.trim() ? { text: e.text, alt: e.alt.trim() } : { text: e.text }
      )
    : undefined;
}

export interface AnswerPicture {
  url: string;
  alt?: string;
}

type PictureFields = Pick<
  QuizQuestion,
  | 'type'
  | 'correctAnswer'
  | 'imageOnlyAnswers'
  | 'answerImages'
  | 'matchingTermImages'
  | 'orderingImages'
>;

/** Label to picture for a question's image-only answers, for teacher views; empty when it has none. */
export function imageOnlyPictures(
  q: PictureFields
): Map<string, AnswerPicture> {
  const map = new Map<string, AnswerPicture>();
  if (!q.imageOnlyAnswers?.length) return map;
  const items = q.type === 'Ordering' ? q.correctAnswer.split('|') : [];
  for (const entry of q.imageOnlyAnswers) {
    const label = entry.text.trim();
    let url = '';
    if (q.type === 'Ordering') {
      const i = items.findIndex((t) => normalize(t) === label);
      const candidate = i >= 0 ? q.orderingImages?.[i] : undefined;
      url =
        typeof candidate === 'string' && candidate.startsWith('https://')
          ? candidate
          : '';
    } else {
      url =
        imageForLabel(q.answerImages, label) ||
        imageForLabel(q.matchingTermImages, label);
    }
    if (url) map.set(label, entry.alt ? { url, alt: entry.alt } : { url });
  }
  return map;
}

export type PictureTextPart =
  | { kind: 'text'; text: string }
  | { kind: 'picture'; label: string; picture: AnswerPicture };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits teacher-facing answer text around image-only labels so each can show its picture. */
export function splitPictureLabels(
  text: string,
  pictures: ReadonlyMap<string, AnswerPicture>
): PictureTextPart[] {
  if (pictures.size === 0 || !text) return [{ kind: 'text', text }];
  const labels = [...pictures.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${labels.map(escapeRegExp).join('|')})`, 'g');
  const parts: PictureTextPart[] = [];
  for (const piece of text.split(re)) {
    if (!piece) continue;
    const picture = pictures.get(piece);
    parts.push(
      picture
        ? { kind: 'picture', label: piece, picture }
        : { kind: 'text', text: piece }
    );
  }
  return parts;
}

/** Plain teacher text for exports: each image-only label followed by its description. */
export function describePictureLabels(
  text: string,
  pictures: ReadonlyMap<string, AnswerPicture>
): string {
  return splitPictureLabels(text, pictures)
    .map((p) =>
      p.kind === 'text'
        ? p.text
        : p.picture.alt
          ? `${p.label} (${p.picture.alt})`
          : p.label
    )
    .join('');
}

/** What a student sees for an answer: its picture alone when it is image-only and has one. */
export function studentImageOnly(
  q: Pick<QuizPublicQuestion, 'imageOnlyAnswers'>,
  text: string,
  image: string | undefined
): QuizImageOnlyAnswer | undefined {
  return image ? imageOnlyFor(q.imageOnlyAnswers, text) : undefined;
}

/** Label to picture for a student payload's image-only answers, for showing a revealed answer. */
export function publicImageOnlyPictures(
  q: Pick<
    QuizPublicQuestion,
    | 'imageOnlyAnswers'
    | 'choices'
    | 'choiceImages'
    | 'matchingLeft'
    | 'matchingLeftImages'
    | 'matchingRight'
    | 'matchingRightImages'
    | 'orderingItems'
    | 'orderingImages'
  >
): Map<string, AnswerPicture> {
  const map = new Map<string, AnswerPicture>();
  if (!q.imageOnlyAnswers?.length) return map;
  const lists: [string[] | undefined, string[] | undefined][] = [
    [q.choices, q.choiceImages],
    [q.matchingLeft, q.matchingLeftImages],
    [q.matchingRight, q.matchingRightImages],
    [q.orderingItems, q.orderingImages],
  ];
  for (const entry of q.imageOnlyAnswers) {
    const label = entry.text.trim();
    for (const [labels, images] of lists) {
      const i = labels?.findIndex((l) => l.trim() === label) ?? -1;
      const url = i >= 0 ? images?.[i] : undefined;
      if (url) {
        map.set(label, entry.alt ? { url, alt: entry.alt } : { url });
        break;
      }
    }
  }
  return map;
}

/** A picture printed beside a choice; `only` drops the choice's label. */
export interface ChoicePicture {
  url: string;
  alt?: string;
  only?: true;
}

/** A picture per printed choice, null where a choice has none; undefined when none has one. */
export function choicePicturesFor(
  q: Pick<QuizQuestion, 'answerImages' | 'imageOnlyAnswers'>,
  choices: readonly string[]
): (ChoicePicture | null)[] | undefined {
  const out = choices.map((c): ChoicePicture | null => {
    const url = imageForLabel(q.answerImages, c);
    if (!url) return null;
    const only = imageOnlyFor(q.imageOnlyAnswers, c);
    if (!only) return { url };
    return only.alt ? { url, alt: only.alt, only: true } : { url, only: true };
  });
  return out.some(Boolean) ? out : undefined;
}

/** `{ choicePictures }` for a printed question, or `{}` when none of its choices has a picture. */
export function choicePictureFields(
  q: Pick<QuizQuestion, 'answerImages' | 'imageOnlyAnswers'> | undefined,
  choices: readonly string[]
): { choicePictures?: (ChoicePicture | null)[] } {
  const pictures = q ? choicePicturesFor(q, choices) : undefined;
  return pictures ? { choicePictures: pictures } : {};
}
