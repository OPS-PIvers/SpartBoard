/**
 * Quiz read-aloud (docs/plans/QUIZ_READ_ALOUD.md §4). Two callables share one
 * synthesis core:
 *
 *   - `prepareQuizReadAloudV1` (teacher): synthesizes every part of a session
 *     up front and writes the manifest `session.readAloud`.
 *   - `synthesizeQuizAudioV1` (student fallback + teacher preview): one part
 *     on demand, patching the manifest so the next student hits the cache.
 *
 * Text is only ever read from the session doc (never from the request), MP3s
 * are content-hashed under `quiz_tts_cache/{voice}/{hash}.mp3`, every
 * synthesized character is billed to the teacher, and a self-tracked monthly
 * counter flips new synthesis to Standard voices past the admin cap.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { v1beta1, protos } from '@google-cloud/text-to-speech';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import './functionsInit';

type Firestore = admin.firestore.Firestore;

export const QUIZ_READ_ALOUD_FEATURE_ID = 'quiz-read-aloud';
export const QUIZ_READ_ALOUD_SETTINGS_DOC = 'quiz_read_aloud';
export const QUIZ_TTS_CACHE_ROOT = 'quiz_tts_cache';
export const DEFAULT_QUIZ_LANGUAGE = 'en-US';
/** Cloud TTS request ceiling is 5,000 bytes; chunks stay well under it. */
export const MAX_PART_CHARS = 5000;
export const STIMULUS_CHUNK_BYTES = 4500;
export const PREPARE_CONCURRENCY = 8;
/** A `preparing` manifest older than this is considered abandoned and re-run. */
export const PREPARING_STALE_MS = 3 * 60 * 1000;
const WHOLE_BREAK = '<break time="600ms"/>';

// Mirrors config/quizReadAloud.ts; functions cannot import the root package.
const DEFAULT_SETTINGS: QuizReadAloudSettings = {
  voicesByLanguage: {
    'en-US': 'en-US-Neural2-F',
    'es-US': 'es-US-Neural2-A',
    'de-DE': 'de-DE-Neural2-F',
    'fr-FR': 'fr-FR-Neural2-A',
  },
  standardVoicesByLanguage: {
    'en-US': 'en-US-Standard-H',
    'es-US': 'es-US-Standard-A',
    'de-DE': 'de-DE-Standard-F',
    'fr-FR': 'fr-FR-Standard-A',
  },
  defaultLanguage: DEFAULT_QUIZ_LANGUAGE,
  neural2MonthlyCapChars: 900_000,
  speakingRateDefault: 1.0,
};

const PREVIEW_SENTENCES: Record<string, string> = {
  'en-US':
    'This is how your quiz will sound when it is read aloud. Which of these is a prime number?',
  'es-US':
    'Así sonará tu cuestionario cuando se lea en voz alta. ¿Cuál de estos es un número primo?',
  'de-DE':
    'So klingt dein Quiz, wenn es vorgelesen wird. Welche dieser Zahlen ist eine Primzahl?',
  'fr-FR':
    'Voici comment votre quiz sonnera lorsqu’il sera lu à voix haute. Lequel de ces nombres est premier ?',
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuizReadAloudSettings {
  voicesByLanguage: Record<string, string>;
  standardVoicesByLanguage: Record<string, string>;
  defaultLanguage: string;
  neural2MonthlyCapChars: number;
  speakingRateDefault: number;
}

export type QuizReadAloudPart =
  | { kind: 'question' }
  | { kind: 'choice'; index: number }
  | { kind: 'matchingLeft' | 'matchingRight' | 'orderingItem'; index: number }
  | { kind: 'stimulus'; stimulusId: string }
  | { kind: 'whole' };

export interface ReadAloudTiming {
  kind: string;
  index?: number;
  startMs: number;
}

export interface SubPart {
  /** SSML mark name; omitted for single-part audio. */
  mark?: string;
  text: string;
}

export interface SynthesizedPart {
  path: string;
  chars: number;
  cached: boolean;
  timings?: ReadAloudTiming[];
}

export interface EnumeratedPart {
  key: string;
  subParts: SubPart[];
}

export interface ReadAloudDeps {
  db: Firestore;
  /** Object metadata when the cached MP3 exists, else null. */
  statFile: (path: string) => Promise<{ timings?: ReadAloudTiming[] } | null>;
  saveFile: (
    path: string,
    bytes: Buffer,
    metadata: Record<string, string>
  ) => Promise<void>;
  synthesize: (req: {
    ssml: string;
    voice: string;
    languageCode: string;
  }) => Promise<{
    audio: Buffer;
    timepoints: { markName: string; timeSeconds: number }[];
  }>;
  isFeatureGranted: (teacherUid: string) => Promise<boolean>;
  now: () => number;
}

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
  parts?: ReadAloudTiming[];
  chunks?: string[];
}

export interface PrepareQuizReadAloudResult {
  status: 'preparing' | 'ready' | 'partial' | 'failed';
  parts: number;
  synthesized: number;
  chars: number;
}

interface SessionQuestion {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  choices?: unknown;
  matchingLeft?: unknown;
  matchingRight?: unknown;
  orderingItems?: unknown;
  stimulusIds?: unknown;
}

// ── Pure helpers (exported for tests) ──────────────────────────────────────

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

/** R11: plain speech text from quiz markup; blanks become the word "blank". */
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

export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** R10: one `<speak>` with a mark before each sub-part and a 600 ms break between them. */
export function buildSsml(subParts: SubPart[]): string {
  const body = subParts
    .map((p) => {
      const mark = p.mark ? `<mark name="${escapeSsml(p.mark)}"/>` : '';
      return `${mark}${escapeSsml(p.text)}`;
    })
    .join(WHOLE_BREAK);
  return `<speak>${body}</speak>`;
}

export function ssmlCharCount(subParts: SubPart[]): number {
  return subParts.reduce((n, p) => n + p.text.length, 0);
}

/** R4: splits long stimulus text into chunks under `maxBytes` on sentence boundaries. */
export function chunkText(
  text: string,
  maxBytes = STIMULUS_CHUNK_BYTES
): string[] {
  const clean = text.trim();
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
    while (Buffer.byteLength(piece, 'utf8') > maxBytes) {
      push();
      let cut = piece.length;
      while (
        cut > 0 &&
        Buffer.byteLength(piece.slice(0, cut), 'utf8') > maxBytes
      )
        cut = Math.floor(cut * 0.9);
      const space = piece.lastIndexOf(' ', cut);
      const at = space > cut / 2 ? space : cut;
      chunks.push(piece.slice(0, at).trim());
      piece = piece.slice(at).trim();
    }
    const candidate = current ? `${current} ${piece}` : piece;
    if (Buffer.byteLength(candidate, 'utf8') > maxBytes) {
      push();
      current = piece;
    } else {
      current = candidate;
    }
  }
  push();
  return chunks;
}

export function cacheHash(voice: string, ssml: string): string {
  return createHash('sha256').update(`${voice} ${ssml}`).digest('hex');
}

export function cachePath(voice: string, hash: string): string {
  return `${QUIZ_TTS_CACHE_ROOT}/${voice}/${hash}.mp3`;
}

export function partKey(questionId: string, part: QuizReadAloudPart): string {
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

export function stimulusChunkKey(stimulusId: string, index: number): string {
  return `stim:${stimulusId}:${index}`;
}

export function markToTiming(
  markName: string,
  startMs: number
): ReadAloudTiming {
  const [kind, idx] = markName.split(':');
  const index = idx === undefined ? undefined : Number.parseInt(idx, 10);
  return Number.isFinite(index as number)
    ? { kind, index: index as number, startMs }
    : { kind, startMs };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const capText = (text: string): string =>
  text.length > MAX_PART_CHARS ? text.slice(0, MAX_PART_CHARS) : text;

// D9: prompt, pause, then each choice / left then right / items in order. Choices are
// unlettered: answer order is shuffled per student, so the row highlight carries the order.
export function wholeSubParts(question: SessionQuestion): SubPart[] {
  const prompt = normalizeReadAloudText(
    typeof question.text === 'string' ? question.text : ''
  );
  const out: SubPart[] = [];
  if (prompt) out.push({ mark: 'question', text: capText(prompt) });
  const add = (kind: string, items: string[]) => {
    items.forEach((item, index) => {
      const text = normalizeReadAloudText(item);
      if (!text) return;
      out.push({ mark: `${kind}:${index}`, text: capText(text) });
    });
  };
  if (question.type === 'MC') add('choice', strings(question.choices));
  if (question.type === 'Matching') {
    add('matchingLeft', strings(question.matchingLeft));
    add('matchingRight', strings(question.matchingRight));
  }
  if (question.type === 'Ordering')
    add('orderingItem', strings(question.orderingItems));
  return out;
}

/** The exact text a part speaks, from the session doc only; null when the part does not exist. */
export function resolvePartText(
  question: SessionQuestion,
  part: QuizReadAloudPart
): SubPart[] | null {
  const single = (items: unknown, index: number): SubPart[] | null => {
    const list = strings(items);
    if (!Number.isInteger(index) || index < 0 || index >= list.length)
      return null;
    const text = normalizeReadAloudText(list[index]);
    return text ? [{ text: capText(text) }] : null;
  };
  switch (part.kind) {
    case 'question': {
      const text = normalizeReadAloudText(
        typeof question.text === 'string' ? question.text : ''
      );
      return text ? [{ text: capText(text) }] : null;
    }
    case 'choice':
      return question.type === 'MC'
        ? single(question.choices, part.index)
        : null;
    case 'matchingLeft':
      return question.type === 'Matching'
        ? single(question.matchingLeft, part.index)
        : null;
    case 'matchingRight':
      return question.type === 'Matching'
        ? single(question.matchingRight, part.index)
        : null;
    case 'orderingItem':
      return question.type === 'Ordering'
        ? single(question.orderingItems, part.index)
        : null;
    case 'whole': {
      const parts = wholeSubParts(question);
      return parts.length > 0 ? parts : null;
    }
    case 'stimulus':
      return null;
  }
}

/** Every part of a session, keyed for the manifest (§4.0 step 3). */
export function enumerateParts(session: Record<string, unknown>): {
  parts: EnumeratedPart[];
  stimulusChunks: Record<string, string[]>;
} {
  const parts: EnumeratedPart[] = [];
  const questions = Array.isArray(session.publicQuestions)
    ? (session.publicQuestions as SessionQuestion[])
    : [];
  const seen = new Set<string>();
  const push = (key: string, subParts: SubPart[] | null) => {
    if (!subParts || seen.has(key)) return;
    seen.add(key);
    parts.push({ key, subParts });
  };
  for (const q of questions) {
    if (typeof q?.id !== 'string') continue;
    push(
      partKey(q.id, { kind: 'question' }),
      resolvePartText(q, { kind: 'question' })
    );
    const listed = (
      kind: 'choice' | 'matchingLeft' | 'matchingRight' | 'orderingItem',
      items: unknown
    ) => {
      strings(items).forEach((_item, index) => {
        const part = { kind, index } as QuizReadAloudPart;
        push(partKey(q.id as string, part), resolvePartText(q, part));
      });
    };
    if (q.type === 'MC') listed('choice', q.choices);
    if (q.type === 'Matching') {
      listed('matchingLeft', q.matchingLeft);
      listed('matchingRight', q.matchingRight);
    }
    if (q.type === 'Ordering') listed('orderingItem', q.orderingItems);
    const whole = wholeSubParts(q);
    if (whole.length > 1) push(partKey(q.id, { kind: 'whole' }), whole);
  }
  const stimulusChunks: Record<string, string[]> = {};
  const byStimulus = session.readAloudTextByStimulusId;
  if (typeof byStimulus === 'object' && byStimulus !== null) {
    for (const [sid, text] of Object.entries(
      byStimulus as Record<string, unknown>
    )) {
      if (typeof text !== 'string') continue;
      const chunks = chunkText(normalizeReadAloudText(text));
      if (chunks.length === 0) continue;
      stimulusChunks[sid] = chunks.map((chunk, i) => {
        const key = stimulusChunkKey(sid, i);
        push(key, [{ text: chunk }]);
        return key;
      });
    }
  }
  return { parts, stimulusChunks };
}

export function normalizeSettings(raw: unknown): QuizReadAloudSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const map = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (typeof v === 'object' && v !== null) {
      for (const [k, val] of Object.entries(v as Record<string, unknown>))
        if (typeof val === 'string' && val) out[k] = val;
    }
    return out;
  };
  const cap = src.neural2MonthlyCapChars;
  const rate = src.speakingRateDefault;
  return {
    voicesByLanguage: {
      ...DEFAULT_SETTINGS.voicesByLanguage,
      ...map(src.voicesByLanguage),
    },
    standardVoicesByLanguage: {
      ...DEFAULT_SETTINGS.standardVoicesByLanguage,
      ...map(src.standardVoicesByLanguage),
    },
    defaultLanguage:
      typeof src.defaultLanguage === 'string' && src.defaultLanguage
        ? src.defaultLanguage
        : DEFAULT_QUIZ_LANGUAGE,
    neural2MonthlyCapChars:
      typeof cap === 'number' && Number.isFinite(cap) && cap >= 0
        ? Math.floor(cap)
        : DEFAULT_SETTINGS.neural2MonthlyCapChars,
    speakingRateDefault:
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0
        ? rate
        : DEFAULT_SETTINGS.speakingRateDefault,
  };
}

/** Neural2 + Standard voice for a language, falling back to the admin default language. */
export function voicesForLanguage(
  settings: QuizReadAloudSettings,
  language: string
): { neural2: string; standard: string } {
  const lang = settings.voicesByLanguage[language]
    ? language
    : settings.defaultLanguage;
  return {
    neural2:
      settings.voicesByLanguage[lang] ??
      DEFAULT_SETTINGS.voicesByLanguage[DEFAULT_QUIZ_LANGUAGE],
    standard:
      settings.standardVoicesByLanguage[lang] ??
      DEFAULT_SETTINGS.standardVoicesByLanguage[DEFAULT_QUIZ_LANGUAGE],
  };
}

export function monthlyUsageDocId(nowMs: number): string {
  const d = new Date(nowMs);
  return `global_tts_${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function teacherDailyDocId(teacherUid: string, nowMs: number): string {
  return `${teacherUid}_tts_${new Date(nowMs).toISOString().slice(0, 10)}`;
}

const VOICE_NAME_RE = /^[a-z]{2,3}-[A-Z]{2}-(Neural2|Standard)-[A-J]$/;
const LANGUAGE_TAG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function parseSynthesizeRequest(
  raw: unknown
): SynthesizeQuizAudioRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  if (data.mode === 'preview') {
    const language =
      typeof data.language === 'string' ? data.language.trim() : '';
    if (!LANGUAGE_TAG_RE.test(language))
      throw new HttpsError('invalid-argument', 'A language tag is required.');
    const voice = typeof data.voice === 'string' ? data.voice.trim() : '';
    if (
      voice &&
      (!VOICE_NAME_RE.test(voice) || !voice.startsWith(`${language}-`))
    )
      throw new HttpsError('invalid-argument', 'Unknown voice.');
    return { mode: 'preview', language, ...(voice ? { voice } : {}) };
  }
  if (data.mode !== 'student')
    throw new HttpsError('invalid-argument', 'Unknown mode.');
  const sessionId =
    typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
  const questionId =
    typeof data.questionId === 'string' ? data.questionId.trim() : '';
  if (!sessionId || !questionId || sessionId.includes('/'))
    throw new HttpsError(
      'invalid-argument',
      'sessionId and questionId are required.'
    );
  const part = parsePart(data.part);
  return { mode: 'student', sessionId, questionId, part };
}

export function parsePart(raw: unknown): QuizReadAloudPart {
  const p = (raw ?? {}) as Record<string, unknown>;
  const index =
    typeof p.index === 'number' && Number.isInteger(p.index) && p.index >= 0
      ? p.index
      : null;
  switch (p.kind) {
    case 'question':
    case 'whole':
      return { kind: p.kind };
    case 'choice':
    case 'matchingLeft':
    case 'matchingRight':
    case 'orderingItem':
      if (index === null)
        throw new HttpsError('invalid-argument', 'Part index required.');
      return { kind: p.kind, index };
    case 'stimulus':
      if (typeof p.stimulusId !== 'string' || !p.stimulusId)
        throw new HttpsError('invalid-argument', 'stimulusId required.');
      return { kind: 'stimulus', stimulusId: p.stimulusId };
    default:
      throw new HttpsError('invalid-argument', 'Unknown part.');
  }
}

// ── Synthesis core ─────────────────────────────────────────────────────────

export async function loadSettings(
  db: Firestore
): Promise<QuizReadAloudSettings> {
  const snap = await db
    .collection('admin_settings')
    .doc(QUIZ_READ_ALOUD_SETTINGS_DOC)
    .get();
  return normalizeSettings(snap.exists ? snap.data() : undefined);
}

/** Soft tier switch: read outside a transaction, so parallel parts can overshoot the cap by their in-flight chars. */
async function neural2Exhausted(
  db: Firestore,
  settings: QuizReadAloudSettings,
  nowMs: number
): Promise<boolean> {
  const snap = await db
    .collection('ai_usage')
    .doc(monthlyUsageDocId(nowMs))
    .get();
  const used = snap.exists ? Number(snap.get('neural2Chars') ?? 0) : 0;
  return used >= settings.neural2MonthlyCapChars;
}

/** R2/R3: teacher daily row and the global monthly tier counter, one transaction. */
async function billSynthesis(
  db: Firestore,
  teacherUid: string,
  chars: number,
  tier: 'neural2' | 'standard',
  nowMs: number
): Promise<void> {
  const inc = (n: number) => admin.firestore.FieldValue.increment(n);
  const monthlyRef = db.collection('ai_usage').doc(monthlyUsageDocId(nowMs));
  const dailyRef = db
    .collection('ai_usage')
    .doc(teacherDailyDocId(teacherUid, nowMs));
  await db.runTransaction(async (tx) => {
    await Promise.all([tx.get(monthlyRef), tx.get(dailyRef)]);
    tx.set(
      monthlyRef,
      {
        [tier === 'neural2' ? 'neural2Chars' : 'standardChars']: inc(chars),
        updatedAt: nowMs,
      },
      { merge: true }
    );
    tx.set(
      dailyRef,
      { count: inc(1), chars: inc(chars), updatedAt: nowMs },
      { merge: true }
    );
  });
}

export async function recordCacheHits(
  db: Firestore,
  hits: number,
  nowMs: number
): Promise<void> {
  if (hits <= 0) return;
  await db
    .collection('ai_usage')
    .doc(monthlyUsageDocId(nowMs))
    .set(
      {
        cacheHits: admin.firestore.FieldValue.increment(hits),
        updatedAt: nowMs,
      },
      { merge: true }
    );
}

/** §4.1 steps 6–11 for one part. Cache hits cost nothing; misses bill `teacherUid`. */
export async function synthesizePart(
  deps: ReadAloudDeps,
  input: {
    subParts: SubPart[];
    language: string;
    teacherUid: string;
    settings: QuizReadAloudSettings;
    voiceOverride?: string;
  }
): Promise<SynthesizedPart> {
  const { subParts, language, teacherUid, settings } = input;
  const ssml = buildSsml(subParts);
  const chars = ssmlCharCount(subParts);
  const voices = voicesForLanguage(settings, language);
  if (input.voiceOverride) {
    voices.neural2 = input.voiceOverride;
    voices.standard = input.voiceOverride;
  }
  const neuralPath = cachePath(voices.neural2, cacheHash(voices.neural2, ssml));
  const hit = await deps.statFile(neuralPath);
  if (hit)
    return { path: neuralPath, chars, cached: true, timings: hit.timings };
  const standardPath = cachePath(
    voices.standard,
    cacheHash(voices.standard, ssml)
  );
  if (standardPath !== neuralPath) {
    const stdHit = await deps.statFile(standardPath);
    if (stdHit)
      return {
        path: standardPath,
        chars,
        cached: true,
        timings: stdHit.timings,
      };
  }

  const nowMs = deps.now();
  const useStandard =
    !input.voiceOverride && (await neural2Exhausted(deps.db, settings, nowMs));
  const voice = useStandard ? voices.standard : voices.neural2;
  const path = useStandard ? standardPath : neuralPath;
  const languageCode = voice.split('-').slice(0, 2).join('-');
  let audio: Buffer;
  let timepoints: { markName: string; timeSeconds: number }[];
  try {
    ({ audio, timepoints } = await deps.synthesize({
      ssml,
      voice,
      languageCode,
    }));
  } catch (error) {
    console.error('[quizReadAloud] Cloud TTS failed', { voice, chars, error });
    throw new HttpsError('unavailable', 'Read-aloud is unavailable right now.');
  }
  const timings =
    subParts.length > 1
      ? timepoints.map((tp) =>
          markToTiming(tp.markName, Math.round(tp.timeSeconds * 1000))
        )
      : undefined;
  await billSynthesis(
    deps.db,
    teacherUid,
    chars,
    useStandard ? 'standard' : 'neural2',
    nowMs
  );
  await deps.saveFile(path, audio, {
    chars: String(chars),
    voice,
    createdAt: new Date(nowMs).toISOString(),
    ...(timings ? { timings: JSON.stringify(timings) } : {}),
  });
  return { path, chars, cached: false, timings };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    }
  );
  await Promise.all(lanes);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// ── prepareQuizReadAloudV1 ─────────────────────────────────────────────────

export async function prepareQuizReadAloud(
  input: { sessionId: string; callerUid: string },
  deps: ReadAloudDeps,
  opts: { deadlineMs?: number } = {}
): Promise<PrepareQuizReadAloudResult> {
  const { db } = deps;
  const sessionRef = db.collection('quiz_sessions').doc(input.sessionId);
  const snap = await sessionRef.get();
  if (!snap.exists)
    throw new HttpsError('not-found', 'Quiz session not found.');
  const session = snap.data() ?? {};
  if (session.teacherUid !== input.callerUid)
    throw new HttpsError('permission-denied', 'Not the owner of this session.');
  if (!(await deps.isFeatureGranted(input.callerUid)))
    throw new HttpsError(
      'permission-denied',
      'Read-aloud is not enabled for this account.'
    );

  const nowMs = deps.now();
  const existing = (session.readAloud ?? {}) as Record<string, unknown>;
  const existingFiles =
    typeof existing.files === 'object' && existing.files !== null
      ? (existing.files as Record<string, string>)
      : {};
  const startedAt =
    typeof existing.startedAt === 'number' ? existing.startedAt : 0;
  if (
    existing.status === 'preparing' &&
    nowMs - startedAt < PREPARING_STALE_MS
  ) {
    return { status: 'preparing', parts: 0, synthesized: 0, chars: 0 };
  }

  const settings = await loadSettings(db);
  const language =
    typeof session.language === 'string' && session.language
      ? session.language
      : settings.defaultLanguage;
  const voices = voicesForLanguage(settings, language);
  const teacherUid = input.callerUid;
  await sessionRef.set(
    {
      readAloud: {
        status: 'preparing',
        voice: voices.neural2,
        startedAt: nowMs,
        files: existingFiles,
      },
    },
    { merge: true }
  );

  const { parts, stimulusChunks } = enumerateParts(session);
  const files: Record<string, string> = {};
  const timings: Record<string, ReadAloudTiming[]> = {};
  const failedKeys: string[] = [];
  let synthesized = 0;
  let chars = 0;
  let hits = 0;
  const deadline = opts.deadlineMs
    ? nowMs + opts.deadlineMs
    : Number.POSITIVE_INFINITY;

  await runPool(parts, PREPARE_CONCURRENCY, async (part) => {
    if (deps.now() > deadline) {
      failedKeys.push(part.key);
      return;
    }
    try {
      const result = await withRetry(
        () =>
          synthesizePart(deps, {
            subParts: part.subParts,
            language,
            teacherUid,
            settings,
          }),
        3
      );
      files[part.key] = result.path;
      if (result.timings) timings[part.key] = result.timings;
      if (result.cached) hits += 1;
      else {
        synthesized += 1;
        chars += result.chars;
      }
    } catch (error) {
      console.error('[quizReadAloud] part failed', { key: part.key, error });
      failedKeys.push(part.key);
    }
  });

  const status: PrepareQuizReadAloudResult['status'] =
    failedKeys.length === 0
      ? 'ready'
      : Object.keys(files).length > 0
        ? 'partial'
        : 'failed';
  await sessionRef.set(
    {
      readAloud: {
        status,
        voice: voices.neural2,
        preparedAt: deps.now(),
        startedAt: admin.firestore.FieldValue.delete(),
        files,
        timings,
        stimulusChunks,
        failedKeys,
      },
    },
    { merge: true }
  );
  await recordCacheHits(db, hits, nowMs);
  return { status, parts: parts.length, synthesized, chars };
}

/** Best-effort re-prepare after `setAssignmentTargetsV1` flags a student (R1); never throws. */
export async function prepareReadAloudAfterTargets(
  sessionId: string,
  callerUid: string,
  deadlineMs = 40_000
): Promise<void> {
  try {
    await prepareQuizReadAloud({ sessionId, callerUid }, buildDefaultDeps(), {
      deadlineMs,
    });
  } catch (error) {
    console.error('[quizReadAloud] prepare after targets failed', {
      sessionId,
      error,
    });
  }
}

// ── synthesizeQuizAudioV1 ──────────────────────────────────────────────────

function inSessionClass(
  session: Record<string, unknown>,
  classIds: readonly string[] | undefined
): boolean {
  if (!classIds || classIds.length === 0) return false;
  const sessionClassIds: unknown = session.classIds;
  const ids = new Set<string>(
    Array.isArray(sessionClassIds)
      ? sessionClassIds.filter((c): c is string => typeof c === 'string')
      : []
  );
  if (typeof session.classId === 'string') ids.add(session.classId);
  return classIds.some((c) => ids.has(c));
}

export async function synthesizeQuizAudio(
  request: SynthesizeQuizAudioRequest,
  caller: {
    uid: string;
    email: string | null;
    studentRole: boolean;
    /** `classIds` custom claim; lets class-wide (pointer-less) students in. */
    classIds?: string[];
  },
  deps: ReadAloudDeps
): Promise<SynthesizeQuizAudioResult> {
  const { db } = deps;
  if (request.mode === 'preview') {
    if (caller.studentRole)
      throw new HttpsError('permission-denied', 'Teacher account required.');
    if (!(await deps.isFeatureGranted(caller.uid)))
      throw new HttpsError(
        'permission-denied',
        'Read-aloud is not enabled for this account.'
      );
    const settings = await loadSettings(db);
    const sentence =
      PREVIEW_SENTENCES[request.language] ??
      PREVIEW_SENTENCES[
        settings.voicesByLanguage[request.language]
          ? request.language
          : DEFAULT_QUIZ_LANGUAGE
      ] ??
      PREVIEW_SENTENCES[DEFAULT_QUIZ_LANGUAGE];
    const result = await synthesizePart(deps, {
      subParts: [{ text: sentence }],
      language: request.language,
      teacherUid: caller.uid,
      settings,
      voiceOverride: request.voice,
    });
    if (result.cached) await recordCacheHits(db, 1, deps.now());
    return {
      path: result.path,
      mimeType: 'audio/mpeg',
      chars: result.chars,
      cached: result.cached,
    };
  }

  if (!caller.studentRole)
    throw new HttpsError('permission-denied', 'Student sign-in required.');
  const pointerSnap = await db
    .collection('student_assignments')
    .doc(caller.uid)
    .collection('items')
    .doc(request.sessionId)
    .get();
  const pointer = pointerSnap.data() ?? {};
  const sessionRef = db.collection('quiz_sessions').doc(request.sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists)
    throw new HttpsError('not-found', 'Quiz session not found.');
  const session = sessionSnap.data() ?? {};
  // Class-wide assignments write no pointer docs; the token's classIds claim
  // is the same membership proof the student app uses to list them.
  if (!pointerSnap.exists && !inSessionClass(session, caller.classIds))
    throw new HttpsError(
      'permission-denied',
      'Assignment not found for this student.'
    );
  if (session.status === 'ended')
    throw new HttpsError('failed-precondition', 'This quiz has ended.');
  const override = (pointer.override ?? {}) as Record<string, unknown>;
  if (override.readAloud !== true && session.readAloudAll !== true)
    throw new HttpsError(
      'permission-denied',
      'Read-aloud is not enabled for this assignment.'
    );
  const teacherUid =
    typeof session.teacherUid === 'string' ? session.teacherUid : '';
  if (!teacherUid)
    throw new HttpsError('failed-precondition', 'Session has no teacher.');
  if (!(await deps.isFeatureGranted(teacherUid)))
    throw new HttpsError(
      'permission-denied',
      'Read-aloud is not enabled for this account.'
    );

  const questions = Array.isArray(session.publicQuestions)
    ? (session.publicQuestions as SessionQuestion[])
    : [];
  const question = questions.find((q) => q?.id === request.questionId);
  if (!question) throw new HttpsError('invalid-argument', 'Unknown question.');
  const settings = await loadSettings(db);
  const language =
    typeof session.language === 'string' && session.language
      ? session.language
      : settings.defaultLanguage;
  const voices = voicesForLanguage(settings, language);
  const nowMs = deps.now();
  const manifestBase =
    typeof session.readAloud === 'object' && session.readAloud !== null
      ? {}
      : { status: 'partial', voice: voices.neural2 };

  if (request.part.kind === 'stimulus') {
    const sid = request.part.stimulusId;
    if (!strings(question.stimulusIds).includes(sid))
      throw new HttpsError(
        'invalid-argument',
        'Stimulus is not attached to this question.'
      );
    const byStimulus = (session.readAloudTextByStimulusId ?? {}) as Record<
      string,
      unknown
    >;
    const raw = byStimulus[sid];
    const text = typeof raw === 'string' ? raw : '';
    const chunks = chunkText(normalizeReadAloudText(text));
    if (chunks.length === 0)
      throw new HttpsError(
        'invalid-argument',
        'No read-aloud text for this stimulus.'
      );
    const paths: string[] = [];
    const files: Record<string, string> = {};
    let chars = 0;
    let cached = true;
    let hits = 0;
    const keys: string[] = [];
    for (const [i, chunk] of chunks.entries()) {
      const result = await synthesizePart(deps, {
        subParts: [{ text: chunk }],
        language,
        teacherUid,
        settings,
      });
      const key = stimulusChunkKey(sid, i);
      keys.push(key);
      files[key] = result.path;
      paths.push(result.path);
      chars += result.chars;
      if (result.cached) hits += 1;
      else cached = false;
    }
    await sessionRef.set(
      {
        readAloud: { ...manifestBase, files, stimulusChunks: { [sid]: keys } },
      },
      { merge: true }
    );
    await recordCacheHits(db, hits, nowMs);
    return {
      path: paths[0],
      mimeType: 'audio/mpeg',
      chars,
      cached,
      chunks: paths,
    };
  }

  const subParts = resolvePartText(question, request.part);
  if (!subParts)
    throw new HttpsError('invalid-argument', 'Nothing to read for this part.');
  const result = await synthesizePart(deps, {
    subParts,
    language,
    teacherUid,
    settings,
  });
  const key = partKey(request.questionId, request.part);
  await sessionRef.set(
    {
      readAloud: {
        ...manifestBase,
        files: { [key]: result.path },
        ...(result.timings ? { timings: { [key]: result.timings } } : {}),
      },
    },
    { merge: true }
  );
  if (result.cached) await recordCacheHits(db, 1, nowMs);
  return {
    path: result.path,
    mimeType: 'audio/mpeg',
    chars: result.chars,
    cached: result.cached,
    ...(result.timings ? { parts: result.timings } : {}),
  };
}

// ── Default deps ───────────────────────────────────────────────────────────

let ttsClient: v1beta1.TextToSpeechClient | null = null;

export function buildDefaultDeps(): ReadAloudDeps {
  const db = admin.firestore();
  const bucket = () => admin.storage().bucket();
  return {
    db,
    statFile: async (path) => {
      const file = bucket().file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [meta] = await file.getMetadata();
      const raw = (meta.metadata as Record<string, unknown> | undefined)
        ?.timings;
      if (typeof raw !== 'string') return {};
      try {
        return { timings: JSON.parse(raw) as ReadAloudTiming[] };
      } catch {
        return {};
      }
    },
    saveFile: async (path, bytes, metadata) => {
      await bucket()
        .file(path)
        .save(bytes, {
          contentType: 'audio/mpeg',
          resumable: false,
          metadata: {
            cacheControl: 'public, max-age=31536000, immutable',
            metadata,
          },
        });
    },
    synthesize: async ({ ssml, voice, languageCode }) => {
      ttsClient ??= new v1beta1.TextToSpeechClient();
      const req: protos.google.cloud.texttospeech.v1beta1.ISynthesizeSpeechRequest =
        {
          input: { ssml },
          voice: { languageCode, name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
          enableTimePointing: [
            protos.google.cloud.texttospeech.v1beta1.SynthesizeSpeechRequest
              .TimepointType.SSML_MARK,
          ],
        };
      const [res] = await ttsClient.synthesizeSpeech(req);
      const content = res.audioContent;
      const audio =
        typeof content === 'string'
          ? Buffer.from(content, 'base64')
          : Buffer.from(content ?? new Uint8Array());
      return {
        audio,
        timepoints: (res.timepoints ?? []).map((tp) => ({
          markName: tp.markName ?? '',
          timeSeconds: tp.timeSeconds ?? 0,
        })),
      };
    },
    isFeatureGranted: async (teacherUid) => {
      let email: string | null = null;
      try {
        email = (await admin.auth().getUser(teacherUid)).email ?? null;
      } catch {
        email = null;
      }
      return isGlobalFeatureGranted(
        db,
        QUIZ_READ_ALOUD_FEATURE_ID,
        email,
        teacherUid
      );
    },
    now: () => Date.now(),
  };
}

// ── Callables ──────────────────────────────────────────────────────────────

export const prepareQuizReadAloudV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    if (request.auth.token.studentRole === true)
      throw new HttpsError('permission-denied', 'Teacher account required.');
    const data = (request.data ?? {}) as Record<string, unknown>;
    const sessionId =
      typeof data.sessionId === 'string' ? data.sessionId.trim() : '';
    if (!sessionId || sessionId.includes('/'))
      throw new HttpsError('invalid-argument', 'sessionId is required.');
    return prepareQuizReadAloud(
      { sessionId, callerUid: request.auth.uid },
      buildDefaultDeps(),
      {
        deadlineMs: 270_000,
      }
    );
  }
);

export const synthesizeQuizAudioV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const parsed = parseSynthesizeRequest(request.data);
    return synthesizeQuizAudio(
      parsed,
      {
        uid: request.auth.uid,
        email: request.auth.token.email ?? null,
        studentRole: request.auth.token.studentRole === true,
        classIds: claimClassIds(request.auth.token.classIds),
      },
      buildDefaultDeps()
    );
  }
);

function claimClassIds(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
}
