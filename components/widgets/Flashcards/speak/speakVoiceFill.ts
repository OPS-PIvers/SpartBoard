// Fills Speak voice readings after a save, in small parallel batches, so Save never waits on them.
import { useSyncExternalStore } from 'react';
import type { FlashcardCard, FlashcardCardSpeak, FlashcardSet } from '@/types';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { SPEAK_G2P_VOICES_PENDING } from '@/utils/pronunciation/g2pVersion';
import { logError } from '@/utils/logError';
import { callVoiceLookup, type SpeakLookupCall } from './lookupSpeakReferences';
import { keepSpeakConfirmation, speakForTerm } from './speakEditorState';

export const VOICE_BATCH_SIZE = 5;
export const VOICE_PARALLEL_CALLS = 3;

export interface VoiceFillProgress {
  done: number;
  total: number;
}

/** Writes `merge` of the set's latest saved copy; `final` is the job's last write. */
export type VoiceFillWrite = (
  merge: (latest: FlashcardSet) => FlashcardSet,
  final: boolean
) => Promise<void>;

interface Job {
  queue: FlashcardCard[];
  keys: Map<string, string>;
  done: number;
  total: number;
  running: number;
  writing: Promise<void>;
  writeQueued: boolean;
  write: VoiceFillWrite;
  call: SpeakLookupCall;
  language: NonNullable<ReturnType<typeof speakLanguageOf>>;
}

const jobs = new Map<string, Job>();
// Finished readings stay for the session, so a save from an editor opened mid-fill keeps them.
const results = new Map<string, Map<string, FlashcardCardSpeak>>();
const listeners = new Set<() => void>();
const progress = new Map<string, VoiceFillProgress>();

let snapshot: ReadonlyMap<string, VoiceFillProgress> = new Map();

const notify = (): void => {
  snapshot = new Map(progress);
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

/** Progress per set id for sets whose voices are still filling. */
export const useVoiceFillProgress = (): ReadonlyMap<
  string,
  VoiceFillProgress
> => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

const overrideKey = (speak: FlashcardCardSpeak): string =>
  JSON.stringify(
    Object.entries(speak.ipaOverride ?? {}).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  );

// What a voice reading was computed for: the term, its accents and the teacher's IPA.
const fillKey = (speak: FlashcardCardSpeak): string =>
  JSON.stringify([
    speak.term,
    [...(speak.dialects ?? [])].sort(),
    overrideKey(speak),
  ]);

/** The card's saved references are waiting on voice readings. */
export const cardWaitsOnVoices = (card: FlashcardCard): boolean => {
  const speak = speakForTerm(card);
  return (
    !!speak &&
    speak.g2pVersion === SPEAK_G2P_VOICES_PENDING &&
    Array.isArray(speak.refs) &&
    Array.isArray(speak.dialects) &&
    speak.dialects.length > 0
  );
};

/** Puts finished voice readings onto cards still waiting for exactly those readings. */
export function applyVoiceResults<T extends Pick<FlashcardSet, 'id' | 'cards'>>(
  set: T
): T {
  const found = results.get(set.id);
  if (!found) return set;
  let changed = false;
  const cards = set.cards.map((card) => {
    const next = found.get(card.id);
    const speak = speakForTerm(card);
    if (
      !next ||
      next.g2pVersion === SPEAK_G2P_VOICES_PENDING ||
      !speak ||
      !cardWaitsOnVoices(card) ||
      fillKey(speak) !== fillKey(next)
    )
      return card;
    changed = true;
    return { ...card, speak: keepSpeakConfirmation(speak, next) };
  });
  return changed ? { ...set, cards } : set;
}

const scheduleWrite = (
  setId: string,
  job: Job,
  final = false
): Promise<void> => {
  if (job.writeQueued && !final) return job.writing;
  job.writeQueued = true;
  job.writing = job.writing
    .then(async () => {
      job.writeQueued = false;
      await job.write((latest) => applyVoiceResults(latest), final);
    })
    .catch((err: unknown) => logError('speakVoiceFill.write', err, { setId }));
  return job.writing;
};

// Each answer variant is read by every voice, so a card counts once per variant.
const variantCount = (card: FlashcardCard): number => {
  const speak = speakForTerm(card);
  const espeak = speak?.refs.filter((ref) => ref.source !== 'voice').length;
  return Math.max(
    1,
    Math.ceil((espeak ?? 0) / Math.max(1, speak?.dialects?.length ?? 1))
  );
};

const takeBatch = (job: Job): FlashcardCard[] => {
  const first = job.queue.shift();
  if (!first) return [];
  const dialects = JSON.stringify(speakForTerm(first)?.dialects);
  const batch = [first];
  let weight = variantCount(first);
  for (let i = 0; i < job.queue.length && weight < VOICE_BATCH_SIZE;) {
    const next = job.queue[i];
    if (
      JSON.stringify(speakForTerm(next)?.dialects) === dialects &&
      weight + variantCount(next) <= VOICE_BATCH_SIZE
    ) {
      batch.push(...job.queue.splice(i, 1));
      weight += variantCount(next);
    } else {
      i++;
    }
  }
  return batch;
};

async function runWorker(setId: string, job: Job): Promise<void> {
  for (let batch = takeBatch(job); batch.length > 0; batch = takeBatch(job)) {
    try {
      const dialects = speakForTerm(batch[0])?.dialects ?? [];
      const sent = new Map(
        batch.map((card) => [card.id, job.keys.get(card.id)] as const)
      );
      const out = await job.call({
        language: job.language,
        dialects,
        terms: batch.map((card) => {
          const ipaOverride = speakForTerm(card)?.ipaOverride;
          return {
            cardId: card.id,
            term: card.term,
            ...(ipaOverride ? { ipaOverride } : {}),
          };
        }),
      });
      const found = results.get(setId) ?? new Map<string, FlashcardCardSpeak>();
      results.set(setId, found);
      for (const card of batch) {
        const speak = out.cards[card.id];
        // A reading for a term edited since it was sent is dropped; the newer one is queued.
        if (speak && job.keys.get(card.id) === sent.get(card.id)) {
          found.set(card.id, speak);
        }
      }
      void scheduleWrite(setId, job);
    } catch (err) {
      // Those cards stay pending; the next save or edit opening tries again.
      logError('speakVoiceFill.lookup', err, { setId });
    }
    job.done += batch.length;
    progress.set(setId, { done: job.done, total: job.total });
    notify();
  }
}

async function finish(setId: string, job: Job): Promise<void> {
  job.running--;
  if (job.running > 0 || job.queue.length > 0) return;
  await scheduleWrite(setId, job, true);
  // A save during the last write can add cards to this job.
  if (jobs.get(setId) !== job || job.running > 0 || job.queue.length > 0)
    return;
  jobs.delete(setId);
  progress.delete(setId);
  notify();
}

/** Starts (or extends) the background voice fill for a just-saved set's waiting cards. */
export function startVoiceFill(
  set: Pick<FlashcardSet, 'id' | 'cards' | 'termLanguage'>,
  write: VoiceFillWrite,
  call: SpeakLookupCall = callVoiceLookup
): void {
  const language = speakLanguageOf(set.termLanguage);
  if (!language) return;
  const waiting = applyVoiceResults(set).cards.filter(cardWaitsOnVoices);
  if (waiting.length === 0) return;
  const job: Job = jobs.get(set.id) ?? {
    queue: [],
    keys: new Map(),
    done: 0,
    total: 0,
    running: 0,
    writing: Promise.resolve(),
    writeQueued: false,
    write,
    call,
    language,
  };
  job.write = write;
  job.call = call;
  job.language = language;
  for (const card of waiting) {
    const speak = speakForTerm(card);
    if (!speak) continue;
    const key = fillKey(speak);
    if (job.keys.get(card.id) === key) continue;
    job.keys.set(card.id, key);
    const queued = job.queue.length;
    job.queue = job.queue.filter((other) => other.id !== card.id);
    job.queue.push(card);
    if (job.queue.length > queued) job.total++;
  }
  if (job.queue.length === 0) return;
  jobs.set(set.id, job);
  progress.set(set.id, { done: job.done, total: job.total });
  notify();
  const batches = Math.ceil(
    job.queue.reduce((n, card) => n + variantCount(card), 0) / VOICE_BATCH_SIZE
  );
  while (job.running < Math.min(VOICE_PARALLEL_CALLS, batches)) {
    job.running++;
    void runWorker(set.id, job).finally(() => void finish(set.id, job));
  }
}

/** Test reset. */
export function resetVoiceFillForTests(): void {
  jobs.clear();
  results.clear();
  progress.clear();
  notify();
}
