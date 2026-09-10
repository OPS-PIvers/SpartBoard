// Client wrappers for the read-aloud callables (docs/plans/QUIZ_READ_ALOUD.md §4).
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { functions, storage } from '@/config/firebase';
import type { QuizReadAloudPart, QuizReadAloudTiming } from '@/types';

export type SynthesizeQuizAudioRequest =
  | {
      mode: 'student';
      sessionId: string;
      questionId: string;
      part: QuizReadAloudPart;
    }
  | { mode: 'preview'; language: string; voice?: string };

export interface SynthesizeQuizAudioResult {
  path: string;
  mimeType: 'audio/mpeg';
  chars: number;
  cached: boolean;
  parts?: QuizReadAloudTiming[];
  chunks?: string[];
}

export interface PrepareQuizReadAloudResult {
  status: 'preparing' | 'ready' | 'partial' | 'failed';
  parts: number;
  synthesized: number;
  chars: number;
}

/** Manifest key for a part; mirrors `partKey` in functions/src/quizReadAloud.ts. */
export function readAloudPartKey(
  questionId: string,
  part: QuizReadAloudPart
): string {
  switch (part.kind) {
    case 'question':
      return `q:${questionId}:question`;
    case 'choice':
      return `q:${questionId}:choice:${part.index}`;
    case 'matchingLeft':
      return `q:${questionId}:left:${part.index}`;
    case 'matchingRight':
      return `q:${questionId}:right:${part.index}`;
    case 'orderingItem':
      return `q:${questionId}:item:${part.index}`;
    case 'whole':
      return `q:${questionId}:whole`;
    case 'stimulus':
      return `stim:${part.stimulusId}`;
  }
}

export async function synthesizeQuizAudio(
  input: SynthesizeQuizAudioRequest
): Promise<SynthesizeQuizAudioResult> {
  const callable = httpsCallable<
    SynthesizeQuizAudioRequest,
    SynthesizeQuizAudioResult
  >(functions, 'synthesizeQuizAudioV1');
  return (await callable(input)).data;
}

export async function prepareQuizReadAloud(
  sessionId: string
): Promise<PrepareQuizReadAloudResult> {
  const callable = httpsCallable<
    { sessionId: string },
    PrepareQuizReadAloudResult
  >(functions, 'prepareQuizReadAloudV1');
  return (await callable({ sessionId })).data;
}

/** Fire-and-forget prepare after an assign; failures only log (the student fallback covers them). */
export function prepareQuizReadAloudInBackground(sessionId: string): void {
  void prepareQuizReadAloud(sessionId).catch((err: unknown) => {
    console.warn('[quizReadAloud] prepare failed', err);
  });
}

/** R9: manifest paths open through the Storage SDK; no signed URLs. */
export function resolveReadAloudUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(storage, path));
}

export interface ExtractStimulusTextResult {
  text: string;
  source: 'pdf-text' | 'ocr' | 'needs-manual';
}

/** Teacher-only authoring call (plan §4.2); the server picks text layer vs OCR. */
export async function extractStimulusReadAloudText(input: {
  stimulusId: string;
  type: 'image' | 'pdf';
  driveFileId?: string;
  url?: string;
}): Promise<ExtractStimulusTextResult> {
  const callable = httpsCallable<typeof input, ExtractStimulusTextResult>(
    functions,
    'extractStimulusReadAloudTextV1'
  );
  return (await callable(input)).data;
}

export const STIMULUS_CHUNK_BYTES = 4500;
const utf8 = new TextEncoder();
const byteLength = (s: string) => utf8.encode(s).length;

const UNIT_WORDS: Record<string, string> = {
  mm: 'millimeters',
  cm: 'centimeters',
  km: 'kilometers',
  kg: 'kilograms',
  mg: 'milligrams',
  ml: 'milliliters',
  mL: 'milliliters',
  '°C': 'degrees Celsius',
  '°F': 'degrees Fahrenheit',
};

/** Client mirror of the server's R11 normalizer (functions/src/quizReadAloud.ts); both sides must chunk the same input. */
export function normalizeReadAloudText(raw: string): string {
  let s = raw;
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/_{3,}/g, ' blank ');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/(\*\*|__)(.+?)\1/g, '$2');
  s = s.replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,;:!?])/g, '$1$2');
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  s = s.replace(/(\d+)\s*\^\s*2\b/g, '$1 squared');
  s = s.replace(/(\d+)\s*\^\s*3\b/g, '$1 cubed');
  s = s.replace(
    /([A-Za-z0-9)]+)\s*\^\s*\(?(-?\d+)\)?/g,
    '$1 to the power of $2'
  );
  s = s.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, '$1 over $2');
  s = s.replace(/(\d)\s*%/g, '$1 percent');
  s = s.replace(
    /(\d)\s*(mm|cm|km|kg|mg|mL|ml|°C|°F)\b/g,
    (_m, n: string, u: string) => `${n} ${UNIT_WORDS[u] ?? u}`
  );
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/** Client mirror of the server's R4 chunker so the text pane can highlight the chunk being read. */
export function chunkReadAloudText(
  text: string,
  maxBytes = STIMULUS_CHUNK_BYTES
): string[] {
  const clean = normalizeReadAloudText(text);
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const sentence of sentences) {
    let piece = sentence.trim();
    while (byteLength(piece) > maxBytes) {
      push();
      let cut = piece.length;
      while (cut > 0 && byteLength(piece.slice(0, cut)) > maxBytes)
        cut = Math.floor(cut * 0.9);
      const space = piece.lastIndexOf(' ', cut);
      const at = space > cut / 2 ? space : cut;
      chunks.push(piece.slice(0, at).trim());
      piece = piece.slice(at).trim();
    }
    const candidate = current ? `${current} ${piece}` : piece;
    if (byteLength(candidate) > maxBytes) {
      push();
      current = piece;
    } else {
      current = candidate;
    }
  }
  push();
  return chunks;
}
