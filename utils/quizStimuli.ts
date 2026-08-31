/**
 * Helpers for quiz question stimuli (image / pdf / audio / video / youtube /
 * gdoc-embed). Pure functions shared by the editor, the session-create
 * projection, and the student renderers.
 */
import type {
  QuizData,
  QuizQuestion,
  QuizStimulus,
  QuizStimulusType,
} from '@/types';
import { extractYouTubeId } from '@/utils/youtube';

/** Doc-shaped stimuli render in the side panel on wide student screens. */
export function isDocShapedStimulus(type: QuizStimulusType): boolean {
  return type === 'pdf' || type === 'gdoc-embed';
}

/** Types whose completed plays are counted against `playLimit`. */
export function isPlayLimitedType(type: QuizStimulusType): boolean {
  return type === 'audio' || type === 'video' || type === 'youtube';
}

/** Human-readable label for a stimulus type (authoring + monitor UI). */
export const STIMULUS_TYPE_LABELS: Record<QuizStimulusType, string> = {
  image: 'Image',
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Video',
  youtube: 'YouTube',
  'gdoc-embed': 'Doc/Slides embed',
};

/**
 * Direct-render URL for a Drive-hosted image. `lh3.googleusercontent.com`
 * serves link-shared Drive images to any browser (the delivery path GL
 * slides and activity-wall photos already use) — but images ONLY.
 */
export function driveImageUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/** Drive's embeddable preview iframe URL — the PDF byte-fetch fallback. */
export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Drive API media URL usable from a student's browser without user auth.
 * Works for link-shared ("anyone with link") files: the browser API key
 * satisfies the API's project-identification requirement and the file's
 * `anyone` permission satisfies authorization. Returns null when no key
 * is configured (the caller falls back to the preview iframe / error card).
 */
export function driveMediaUrl(fileId: string): string | null {
  const key = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  if (!key) return null;
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media&key=${encodeURIComponent(key)}`;
}

/** Best `<img>`/`<video>`/`<audio>` source for a stimulus. */
export function stimulusMediaUrl(s: QuizStimulus): string {
  if (s.driveFileId) {
    if (s.type === 'image') return driveImageUrl(s.driveFileId);
    return driveMediaUrl(s.driveFileId) ?? s.url;
  }
  return s.url;
}

/**
 * Remove `stimulusIds` pointers that reference no entry in `stimuli`.
 * Returns the same array when nothing changed so React state and dirty
 * checks aren't churned.
 */
export function sanitizeStimulusPointers<T extends QuizQuestion>(
  questions: T[],
  stimuli: QuizStimulus[] | undefined
): T[] {
  const valid = new Set((stimuli ?? []).map((s) => s.id));
  let changed = false;
  const next = questions.map((q) => {
    if (!q.stimulusIds || q.stimulusIds.length === 0) return q;
    const kept = q.stimulusIds.filter((id) => valid.has(id));
    if (kept.length === q.stimulusIds.length) return q;
    changed = true;
    // `undefined` is dropped by JSON.stringify (Drive) and by Firestore's
    // `ignoreUndefinedProperties` (synced-group publishes).
    return { ...q, stimulusIds: kept.length > 0 ? kept : undefined };
  });
  return changed ? next : questions;
}

/**
 * Stimuli actually referenced by at least one question, with authoring
 * labels stripped — the array projected onto the session doc.
 */
export function projectSessionStimuli(
  quiz: Pick<QuizData, 'questions' | 'stimuli'>
): QuizStimulus[] {
  const referenced = new Set<string>();
  for (const q of quiz.questions) {
    for (const id of q.stimulusIds ?? []) referenced.add(id);
  }
  // Drive-sync/arrayUnion races can write the same stimulus id twice into
  // `stimuli` (same bug class as dedupeQuestionsById) — fence it here too.
  const seen = new Set<string>();
  const out: QuizStimulus[] = [];
  for (const s of quiz.stimuli ?? []) {
    if (!referenced.has(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ ...s, label: '' });
  }
  return out;
}

/** Resolve a question's stimuli against a session/quiz stimulus array. */
export function resolveStimuli(
  stimulusIds: string[] | undefined,
  stimuli: QuizStimulus[] | undefined
): QuizStimulus[] {
  if (!stimulusIds || stimulusIds.length === 0 || !stimuli?.length) return [];
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  const out: QuizStimulus[] = [];
  for (const id of stimulusIds) {
    const s = byId.get(id);
    if (s) out.push(s);
  }
  return out;
}

/** Per-attempt key for the `stimulusPlays` counters on the response doc. */
export function stimulusPlayKey(attemptIndex: number, stimulusId: string) {
  return `a${attemptIndex}:${stimulusId}`;
}

/** Partition stimuli into doc-shaped (side panel) vs inline media. */
export function splitStimuliForLayout(stimuli: QuizStimulus[]): {
  docShaped: QuizStimulus[];
  inline: QuizStimulus[];
} {
  const docShaped: QuizStimulus[] = [];
  const inline: QuizStimulus[] = [];
  for (const s of stimuli) {
    if (isDocShapedStimulus(s.type)) docShaped.push(s);
    else inline.push(s);
  }
  return { docShaped, inline };
}

/** Best-effort stimulus type from an uploaded file's MIME type / name. */
export function detectStimulusTypeFromFile(
  file: File
): QuizStimulusType | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
    return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name)) return 'image';
  if (/\.(mp3|wav|m4a|ogg)$/i.test(file.name)) return 'audio';
  if (/\.(mp4|webm|mov)$/i.test(file.name)) return 'video';
  return null;
}

/** Best-effort stimulus type from a pasted URL. */
export function detectStimulusTypeFromUrl(url: string): QuizStimulusType {
  if (extractYouTubeId(url)) return 'youtube';
  if (/docs\.google\.com\/(document|presentation)\//.test(url))
    return 'gdoc-embed';
  if (/\.pdf(\?|#|$)/i.test(url)) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)(\?|#|$)/i.test(url)) return 'image';
  if (/\.(mp3|wav|m4a|ogg)(\?|#|$)/i.test(url)) return 'audio';
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return 'video';
  // Docs/Slides embeds are the most forgiving iframe fallback for an
  // unrecognized page URL.
  return 'gdoc-embed';
}

/**
 * Question ids grouped by shared stimuli — used by the editor to show
 * which questions an entry covers ("Q2–Q4, Q7" style summaries).
 */
export function questionsUsingStimulus(
  questions: readonly Pick<QuizQuestion, 'id' | 'stimulusIds'>[],
  stimulusId: string
): number[] {
  const out: number[] = [];
  questions.forEach((q, i) => {
    if (q.stimulusIds?.includes(stimulusId)) out.push(i);
  });
  return out;
}
