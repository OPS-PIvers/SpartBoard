/**
 * Helpers for quiz question stimuli (image / pdf / audio / video / youtube /
 * gdoc-embed / text). Pure functions shared by the editor, the session-create
 * projection, and the student renderers.
 */
import type {
  QuizCalculatorKind,
  QuizData,
  QuizQuestion,
  QuizStimulus,
  QuizStimulusType,
} from '@/types';
import { extractYouTubeId } from '@/utils/youtube';

/** Doc-shaped stimuli render in the side panel on wide student screens. */
export function isDocShapedStimulus(type: QuizStimulusType): boolean {
  // A passage is read alongside the question the way a PDF is, so it takes
  // the same side panel rather than pushing the question off the screen.
  return (
    type === 'pdf' ||
    type === 'gdoc-embed' ||
    type === 'text' ||
    type === 'word-bank' ||
    type === 'calculator'
  );
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
  text: 'Passage',
  'word-bank': 'Word bank',
  calculator: 'Calculator',
};

const DESMOS_PATHS: Record<QuizCalculatorKind, string> = {
  graphing: 'calculator',
  scientific: 'scientific',
  'four-function': 'fourfunction',
};

/** Desmos page for a calculator stimulus; unknown kinds fall back to graphing. */
export function desmosCalculatorUrl(
  kind: QuizCalculatorKind | undefined
): string {
  const path =
    kind && Object.hasOwn(DESMOS_PATHS, kind)
      ? DESMOS_PATHS[kind]
      : DESMOS_PATHS.graphing;
  return `https://www.desmos.com/${path}?embed`;
}

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

/** A Doc, Slides or Sheets file as a PDF, readable when it is shared with anyone who has the link. */
export function drivePdfExportUrl(fileId: string): string | null {
  const key = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  if (!key) return null;
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}/export?mimeType=application%2Fpdf&key=${encodeURIComponent(key)}`;
}

/** Best `<img>`/`<video>`/`<audio>` source for a stimulus. */
export function stimulusMediaUrl(s: QuizStimulus): string {
  // A passage has no file to fetch; its content travels on the stimulus.
  if (s.type === 'text' || s.type === 'word-bank' || s.type === 'calculator')
    return '';
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
export function sanitizeStimulusPointers<T extends { stimulusIds?: string[] }>(
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
    // Authoring-only fields stay off the session doc; reviewed text travels via readAloudTextByStimulusId.
    const {
      readAloudText: _t,
      readAloudSource: _src,
      paperPlacement: _paper,
      ...rest
    } = s;
    out.push({ ...rest, label: '' });
  }
  return out;
}

/** Reviewed read-aloud text for referenced image/pdf stimuli, keyed by id (plan §3). */
export function readAloudTextByStimulusId(
  quiz: Pick<QuizData, 'questions' | 'stimuli'>
): Record<string, string> {
  const referenced = new Set<string>();
  for (const q of quiz.questions) {
    for (const id of q.stimulusIds ?? []) referenced.add(id);
  }
  const out: Record<string, string> = {};
  for (const s of quiz.stimuli ?? []) {
    if (!referenced.has(s.id) || out[s.id] !== undefined) continue;
    // A passage is its own spoken text, so it needs no review pass (D16).
    if (s.type === 'text') {
      const passage = s.text?.trim();
      if (passage) out[s.id] = passage;
      continue;
    }
    if (s.type !== 'image' && s.type !== 'pdf') continue;
    const text = s.readAloudText?.trim();
    if (text) out[s.id] = text;
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

/** The `stimulusPlays` id a question's recorded prompt counts its views under. */
export const promptAudioPlayId = (questionId: string) => `prompt-${questionId}`;

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

/** Teacher-facing name: a custom label, else the passage's opening words, else a file name, else the type. */
export function stimulusDisplayName(
  s: Pick<QuizStimulus, 'label' | 'text' | 'url' | 'type' | 'driveFileId'>
): string {
  const typeLabel = STIMULUS_TYPE_LABELS[s.type];
  const label = s.label.trim();
  if (label && label !== typeLabel) return label;
  const passage = s.text?.replace(/\s+/g, ' ').trim();
  if (passage) return clip(passage);
  if (s.driveFileId || /^data:/i.test(s.url)) return typeLabel;
  if (/(^|\.)(google\.com|youtube\.com|youtu\.be)$/i.test(hostOf(s.url)))
    return typeLabel;
  const tail = s.url.split(/[?#]/)[0]?.split('/').filter(Boolean).pop() ?? '';
  if (!/\.[a-z0-9]{2,5}$/i.test(tail)) return typeLabel;
  try {
    return clip(decodeURIComponent(tail));
  } catch {
    return clip(tail);
  }
}

/** Picker row title: the display name, word-bank choices as a list, or the type plus its number among same-type stimuli. */
export function stimulusPickerTitle(
  s: QuizStimulus,
  all: readonly QuizStimulus[]
): string {
  const typeLabel = STIMULUS_TYPE_LABELS[s.type];
  const label = s.label.trim();
  if (s.type === 'word-bank' && (!label || label === typeLabel)) {
    const words = (s.text ?? '')
      .split('\n')
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length > 0) return clip(words.join(', '));
  }
  const name = stimulusDisplayName(s);
  if (name !== typeLabel) return name;
  const unnamed = all.filter(
    (o) => o.type === s.type && stimulusDisplayName(o) === typeLabel
  );
  if (unnamed.length < 2) return typeLabel;
  return `${typeLabel} ${unnamed.findIndex((o) => o.id === s.id) + 1}`;
}

/** True for a passage or word bank with no text yet. */
export const isEmptyTextStimulus = (s: QuizStimulus): boolean =>
  (s.type === 'text' || s.type === 'word-bank') && !s.text?.trim();

const clip = (text: string) => {
  if (text.length <= 60) return text;
  const cut = text.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${space > 40 ? cut.slice(0, space) : cut}…`;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
