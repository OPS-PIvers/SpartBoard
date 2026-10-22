// Flashcards Speak reference lookup (docs/multilingual-pronunciation-engine.md §5, S3): term → per-dialect reference tokens, stress and letter spans.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import '../functionsInit';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import { assertViewAsAllowed } from '../viewAsGuard';
import { cmudictStress, disagreesWithCmudict, lookupCmudict } from './cmudict';
import { loadPhonemizer, type Phonemizer } from './espeak';
import { SPEAK_G2P_VERSION, SPEAK_G2P_VOICES_PENDING } from './g2pVersion';
import { computeLetterSpans } from './letterSpans';
import { normalizeEspeakIpa } from './normalize';
import { firstVariant, spokenVariants } from './spokenVariants';
import {
  deriveStress,
  spanishSpellingStress,
  type StressReading,
} from './stressReference';
import { tokenizeIpa, type TokenizeSuccess } from './tokenizeIpa';
import {
  createVoiceReader,
  voiceReference,
  VoiceServiceError,
  type VoiceReader,
} from './voiceRefs';
import { PRONUNCIATION_VOICES, voiceDialect } from './voices';
import type {
  FlashcardCardSpeak,
  FlashcardSpeakReason,
  FlashcardSpeakReference,
  SpeakDialect,
  SpeakLanguage,
  SpeakLookupInput,
  SpeakLookupOutput,
  SpeakLookupTerm,
} from './types';

export const FLASHCARDS_SPEAK_FEATURE_ID = 'flashcards-speak';
export { SPEAK_G2P_VERSION, SPEAK_G2P_VOICES_PENDING };
// About 1 s of model time per voice on 2 vCPU; leaves the callable's 540 s timeout a margin for the last card.
export const DEFAULT_VOICE_BUDGET_MS = 420_000;
export const MAX_LOOKUP_TERMS = 500;
const MAX_TERM_LENGTH = 500;
const MAX_IPA_LENGTH = 200;
// Longer than any real phrase of a few words; also bounds the span aligner's work per card.
const MAX_WORD_LENGTH = 64;

const DIALECTS: Record<SpeakLanguage, readonly SpeakDialect[]> = {
  es: ['es-419', 'es-ES'],
  de: ['de-DE'],
  en: ['en-US'],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates callable input; throws `invalid-argument` on anything outside the §5 contract. */
export function parseLookupInput(raw: unknown): SpeakLookupInput {
  const bad = (msg: string): never => {
    throw new HttpsError('invalid-argument', msg);
  };
  if (!isRecord(raw)) return bad('Expected an object.');
  const language = raw.language;
  if (language !== 'es' && language !== 'de' && language !== 'en')
    return bad('language must be es, de or en.');
  const allowed = DIALECTS[language];
  if (!Array.isArray(raw.dialects) || raw.dialects.length === 0)
    return bad('dialects must be a non-empty array.');
  const dialects = [...new Set(raw.dialects)];
  if (
    !dialects.every((d): d is SpeakDialect =>
      allowed.includes(d as SpeakDialect)
    )
  )
    return bad(`dialects must be among ${allowed.join(', ')}.`);
  if (!Array.isArray(raw.terms) || raw.terms.length > MAX_LOOKUP_TERMS)
    return bad(`terms must be an array of at most ${MAX_LOOKUP_TERMS}.`);
  const seen = new Set<string>();
  const terms = raw.terms.map((t): SpeakLookupTerm => {
    if (!isRecord(t)) return bad('Each term must be an object.');
    const { cardId, term, ipaOverride } = t;
    if (
      typeof cardId !== 'string' ||
      !cardId ||
      cardId.length > 128 ||
      seen.has(cardId)
    )
      return bad('Each term needs a unique cardId.');
    seen.add(cardId);
    if (typeof term !== 'string' || term.length > MAX_TERM_LENGTH)
      return bad('term must be a string.');
    if (ipaOverride === undefined) return { cardId, term };
    if (!isRecord(ipaOverride)) return bad('ipaOverride must be an object.');
    const override: Partial<Record<SpeakDialect, string>> = {};
    for (const [d, ipa] of Object.entries(ipaOverride)) {
      if (!allowed.includes(d as SpeakDialect))
        return bad('ipaOverride has a dialect outside the language.');
      if (typeof ipa !== 'string' || ipa.length > MAX_IPA_LENGTH)
        return bad('ipaOverride values must be short strings.');
      if (ipa.trim()) override[d as SpeakDialect] = ipa;
    }
    return Object.keys(override).length > 0
      ? { cardId, term, ipaOverride: override }
      : { cardId, term };
  });
  return { language, dialects, terms };
}

interface DialectResult {
  ref?: FlashcardSpeakReference;
  reasons: FlashcardSpeakReason[];
}

function failureReason(
  tok: ReturnType<typeof tokenizeIpa>
): FlashcardSpeakReason {
  return !tok.ok && tok.reason === 'unrenderable'
    ? 'unrenderable'
    : 'untokenizable';
}

function crossCheckFor(
  language: SpeakLanguage,
  word: string,
  tok: TokenizeSuccess,
  ipa: string,
  reasons: FlashcardSpeakReason[]
): StressReading | null {
  // Spelling rules and dictionary keys see letters only (`¡Hola!` is `hola`).
  const letters = word.replace(/[^\p{L}\p{M}']/gu, '').replace(/^'+|'+$/g, '');
  if (language === 'es') return spanishSpellingStress(letters);
  if (language !== 'en') return null;
  const variants = lookupCmudict(letters);
  if (!variants) return null;
  if (disagreesWithCmudict(ipa, variants)) reasons.push('g2p-disagree');
  return cmudictStress(variants, tok.syllableCount);
}

function lookupDialect(
  phonemizer: Phonemizer,
  language: SpeakLanguage,
  dialect: SpeakDialect,
  text: string,
  override: string | undefined
): DialectResult {
  const reasons: FlashcardSpeakReason[] = [];
  const words = text.split(' ');
  let chunks: string[];
  if (override !== undefined) {
    // A teacher's IPA is authoritative: no cross-check and no flags.
    // Dictionary notation (`/ˈʃʏtsə/`, syllable dots) is accepted; ʏ maps to y as on the espeak path.
    const parts = override
      .replace(/[/[\].]/g, '')
      .replaceAll('ʏ', 'y')
      .trim()
      .split(/\s+/u);
    // Spaces that don't line up with the words carry no word boundaries.
    chunks = parts.length === words.length ? parts : [parts.join('')];
  } else {
    let ipa: string;
    try {
      // espeak drops a separate combining accent, so it hears NFC; spans still index the original text.
      ipa = normalizeEspeakIpa(
        phonemizer.phonemize(dialect, text.normalize('NFC')),
        language
      );
    } catch (err) {
      logger.warn('[speakLookup] espeak failed', { dialect, err: String(err) });
      return { reasons: ['lookup-failed'] };
    }
    chunks = ipa.split(/\s+/u);
    // espeak read a word as several (`hello,world`, `42`).
    if (chunks.length !== words.length) {
      return { reasons: [words.length === 1 ? 'multi-word' : 'untokenizable'] };
    }
  }
  const toks: TokenizeSuccess[] = [];
  for (const chunk of chunks) {
    const tok = tokenizeIpa(chunk);
    if (!tok.ok) return { reasons: [failureReason(tok)] };
    toks.push(tok);
  }
  let stress: number[] = [];
  if (override !== undefined) {
    if (words.length === 1) stress = deriveStress(language, toks[0]).stress;
  } else {
    toks.forEach((tok, i) => {
      if (tok.languageSwitches.length > 0) reasons.push('language-switch');
      const crossCheck = crossCheckFor(
        language,
        words[i].normalize('NFC'),
        tok,
        chunks[i],
        reasons
      );
      // A phrase isn't stress-judged: each of its words carries a stress of its own.
      if (toks.length > 1) return;
      const derived = deriveStress(language, tok, crossCheck);
      if (derived.flagged) reasons.push('stress-disagree');
      stress = derived.stress;
    });
  }
  const tokens = toks.flatMap((tok) => tok.tokens);
  const wordEnds: number[] = [];
  let at = 0;
  for (const tok of toks.slice(0, -1)) {
    at += tok.tokens.length;
    wordEnds.push(at - 1);
  }
  const letterSpans = phraseLetterSpans(words, toks, language);
  return {
    ref: {
      dialect,
      tokens,
      stress,
      ...(letterSpans ? { letterSpans } : {}),
      ...(wordEnds.length > 0 ? { wordEnds } : {}),
    },
    reasons: [...new Set(reasons)],
  };
}

// Each word's spans, shifted to where the word starts in the phrase; null unless every word aligns.
function phraseLetterSpans(
  words: readonly string[],
  toks: readonly TokenizeSuccess[],
  language: SpeakLanguage
): number[] | null {
  if (words.length === 1) {
    return computeLetterSpans(
      words[0],
      toks.flatMap((tok) => tok.tokens),
      language
    );
  }
  if (toks.length !== words.length) return null;
  const spans: number[] = [];
  let offset = 0;
  for (let i = 0; i < words.length; i++) {
    const own = computeLetterSpans(words[i], toks[i].tokens, language);
    if (!own) return null;
    spans.push(...own.map((edge) => edge + offset));
    offset += words[i].length + 1;
  }
  return spans;
}

interface VoiceRun {
  reader: VoiceReader;
  deadline: number;
  stopped: boolean;
}

/** Adds each distinct voice reading for the dialects espeak read; a card whose voices didn't all finish is marked pending. */
async function addVoiceReferences(
  language: SpeakLanguage,
  card: SpeakLookupTerm,
  speak: FlashcardCardSpeak,
  run: VoiceRun
): Promise<FlashcardCardSpeak> {
  // A teacher's IPA is authoritative, so an overridden dialect gets no voice readings.
  const bases = speak.refs.filter((ref) => !card.ipaOverride?.[ref.dialect]);
  const first = firstVariant(card.term);
  const reads = PRONUNCIATION_VOICES[language].flatMap((voice) =>
    bases
      .filter((base) => base.dialect === voiceDialect(voice))
      .map((base) => ({ base, voice }))
  );
  if (reads.length === 0) return speak;
  if (run.stopped || Date.now() >= run.deadline) {
    return { ...speak, g2pVersion: SPEAK_G2P_VOICES_PENDING };
  }
  const results = await Promise.allSettled(
    reads.map(({ base, voice }) =>
      run.reader.read(voice, (base.text ?? first).normalize('NFC'))
    )
  );
  const refs = [...speak.refs];
  const readingKey = (ref: FlashcardSpeakReference) =>
    `${ref.text ?? ''}\u0000${ref.tokens.join(' ')}`;
  const seen = new Set(refs.map(readingKey));
  let complete = true;
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      complete = false;
      if (result.reason instanceof VoiceServiceError) {
        if (!run.stopped) {
          logger.error('[speakLookup] voices unavailable', {
            err: result.reason.message,
          });
        }
        run.stopped = true;
      } else {
        logger.warn('[speakLookup] voice failed', {
          voice: reads[i].voice,
          err: String(result.reason),
        });
      }
      return;
    }
    const { base } = reads[i];
    const reading = voiceReference(base, result.value);
    // Word ends carry over only when the reading lines up sound for sound.
    const wordEnds =
      reading && base.wordEnds && reading.tokens.length === base.tokens.length
        ? { wordEnds: base.wordEnds }
        : {};
    const ref = reading && {
      ...reading,
      ...(base.text !== undefined ? { text: base.text } : {}),
      ...wordEnds,
    };
    if (!ref || seen.has(readingKey(ref))) return;
    seen.add(readingKey(ref));
    refs.push(ref);
  });
  return {
    ...speak,
    refs,
    ...(complete ? {} : { g2pVersion: SPEAK_G2P_VOICES_PENDING }),
  };
}

function lookupCard(
  phonemizer: Phonemizer,
  input: SpeakLookupInput,
  card: SpeakLookupTerm
): FlashcardCardSpeak {
  const base = {
    term: card.term,
    g2pVersion: SPEAK_G2P_VERSION,
    dialects: [...input.dialects],
    ...(card.ipaOverride ? { ipaOverride: card.ipaOverride } : {}),
  };
  const { texts, tooManyWords } = spokenVariants(card.term, input.language);
  const fitting = texts.filter((text) => text.length <= MAX_WORD_LENGTH);
  if (fitting.length === 0) {
    return {
      ...base,
      refs: [],
      status: 'unavailable',
      reasons: [
        tooManyWords && texts.length === 0 ? 'multi-word' : 'untokenizable',
      ],
    };
  }
  const first = firstVariant(card.term);
  const refs: FlashcardSpeakReference[] = [];
  const reasons = new Set<FlashcardSpeakReason>();
  for (const dialect of input.dialects) {
    const override = card.ipaOverride?.[dialect];
    // A teacher's IPA stands for the card in that accent, so its other variants aren't looked up there.
    for (const text of override === undefined ? fitting : fitting.slice(0, 1)) {
      const result = lookupDialect(
        phonemizer,
        input.language,
        dialect,
        text,
        override
      );
      if (result.ref) {
        refs.push(text === first ? result.ref : { ...result.ref, text });
      }
      result.reasons.forEach((r) => reasons.add(r));
    }
  }
  const status =
    refs.length === 0
      ? 'unavailable'
      : reasons.size > 0
        ? 'needs-review'
        : 'ready';
  return {
    ...base,
    refs,
    status,
    ...(reasons.size > 0 ? { reasons: [...reasons] } : {}),
  };
}

export interface SpeakLookupOptions {
  /** Defaults to Cloud TTS and the pinned model; false leaves voice-eligible cards pending. */
  voices?: VoiceReader | false;
  /** Cards not started within this many ms come back pending. */
  voiceBudgetMs?: number;
}

/** Lookup used by the callable and, in-process, by the connector (S10); input must already be valid. */
export async function computeSpeakReferences(
  input: SpeakLookupInput,
  phonemizer?: Phonemizer,
  options: SpeakLookupOptions = {}
): Promise<SpeakLookupOutput> {
  const p = phonemizer ?? (await loadPhonemizer());
  const run: VoiceRun = {
    reader: options.voices || createVoiceReader(),
    deadline: Date.now() + (options.voiceBudgetMs ?? DEFAULT_VOICE_BUDGET_MS),
    stopped: options.voices === false,
  };
  const entries: [string, FlashcardCardSpeak][] = [];
  for (const term of input.terms) {
    const speak = lookupCard(p, input, term);
    entries.push([
      term.cardId,
      await addVoiceReferences(input.language, term, speak, run),
    ]);
  }
  // fromEntries defines own keys, so even a `__proto__` card id survives.
  const cards: Record<string, FlashcardCardSpeak> = Object.fromEntries(entries);
  return { g2pVersion: SPEAK_G2P_VERSION, cards };
}

export const lookupSpeakReferencesV1 = onCall(
  // The voice model holds about 1 GB and is read one take at a time, so one request per instance.
  {
    memory: '4GiB',
    cpu: 2,
    concurrency: 1,
    maxInstances: 10,
    timeoutSeconds: 540,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<SpeakLookupOutput> => {
    assertViewAsAllowed(request, { read: true });
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    if (
      auth.token.firebase?.sign_in_provider === 'anonymous' ||
      auth.token.studentRole === true
    ) {
      throw new HttpsError('permission-denied', 'Teachers only.');
    }
    const email =
      typeof auth.token.email === 'string' ? auth.token.email : null;
    const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
    if (
      !(await isGlobalFeatureGranted(
        admin.firestore(),
        FLASHCARDS_SPEAK_FEATURE_ID,
        email,
        auth.uid
      ))
    ) {
      throw new HttpsError('permission-denied', 'Speak is not turned on.');
    }
    const input = parseLookupInput(request.data);
    // The editor saves without voices, then fills them in small background batches.
    const skipVoices = isRecord(request.data) && request.data.voices === false;
    const started = Date.now();
    const out = await computeSpeakReferences(
      input,
      undefined,
      skipVoices ? { voices: false } : {}
    );
    logger.info('[speakLookup] done', {
      terms: input.terms.length,
      dialects: input.dialects.length,
      voices: !skipVoices,
      ms: Date.now() - started,
      rssMB: Math.round(process.memoryUsage().rss / 1e6),
    });
    return out;
  }
);
