// Student read-aloud player (docs/plans/QUIZ_READ_ALOUD.md §6.2): one audio element,
// manifest-first playback with the callable as fallback, prefetch of the current and
// next question, stimulus chunk playlists, rate + auto-read persisted per device.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FunctionsError } from 'firebase/functions';
import type {
  QuizPublicQuestion,
  QuizReadAloudManifest,
  QuizReadAloudPart,
  QuizReadAloudTiming,
} from '@/types';
import {
  readAloudPartKey,
  resolveReadAloudUrl,
  synthesizeQuizAudio,
} from '@/utils/quizReadAloudApi';
import { sameReadAloudPart } from './readAloudHighlight';

export const READ_ALOUD_RATES = [1, 1.25, 1.5, 0.75] as const;
export const RATE_STORAGE_KEY = 'quiz_read_aloud_rate';
export const AUTO_STORAGE_KEY = 'quiz_read_aloud_auto';

export type ReadAloudItemKind =
  | 'matchingLeft'
  | 'matchingRight'
  | 'orderingItem';
export type ReadAloudStatus = 'idle' | 'loading' | 'playing';
export type ReadAloudError = 'load' | 'unavailable' | null;

/** Text-keyed controls for shuffled rows; indexes resolve against the session's canonical question. */
export interface ReadAloudItemControls {
  partFor: (kind: ReadAloudItemKind, text: string) => QuizReadAloudPart | null;
  play: (kind: ReadAloudItemKind, text: string) => void;
  status: (kind: ReadAloudItemKind, text: string) => ReadAloudStatus;
  highlighted: (kind: ReadAloudItemKind, text: string) => boolean;
  stop: () => void;
}

export interface QuizReadAloudController {
  enabled: boolean;
  playingPart: QuizReadAloudPart | null;
  loadingPart: QuizReadAloudPart | null;
  /** The sub-part being spoken inside a `whole` recording, else `playingPart`. */
  highlightedPart: QuizReadAloudPart | null;
  error: ReadAloudError;
  play: (part: QuizReadAloudPart) => void;
  stop: () => void;
  rate: number;
  cycleRate: () => void;
  auto: boolean;
  setAuto: (next: boolean) => void;
  /** `choice` part for a shown option, resolved against the canonical question. */
  choicePart: (text: string) => QuizReadAloudPart | null;
  items: ReadAloudItemControls;
  statusOf: (part: QuizReadAloudPart | null) => ReadAloudStatus;
  /** D9: attached stimulus passages first, then the `whole` recording. */
  readQuestion: () => void;
  /** True from readQuestion() until its last part ends or stop(). */
  readingQuestion: boolean;
  /** Index of the stimulus chunk being spoken, else null (R5 pane highlight). */
  chunkIndex: number | null;
  /** Reviewed text for an attached stimulus, else undefined (no speaker). */
  stimulusText: (stimulusId: string) => string | undefined;
}

interface Args {
  enabled: boolean;
  sessionId: string;
  manifest: QuizReadAloudManifest | undefined;
  /** The session's canonical public questions (pre-shuffle, pre-hidden-options). */
  canonicalQuestions: QuizPublicQuestion[];
  question: QuizPublicQuestion | undefined;
  nextQuestion: QuizPublicQuestion | undefined;
  /** `session.readAloudTextByStimulusId`; only attached ids with text get a speaker. */
  stimulusTextById?: Record<string, string>;
}

interface Resolved {
  urls: string[];
  timings?: QuizReadAloudTiming[];
}

const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};

const initialRate = (): number => {
  const n = Number(readStorage(RATE_STORAGE_KEY));
  return (READ_ALOUD_RATES as readonly number[]).includes(n) ? n : 1;
};

/** Manifest keys for every part of a question, in reading order. */
export function questionPartKeys(q: QuizPublicQuestion): string[] {
  const keys = [readAloudPartKey(q.id, { kind: 'question' })];
  const listed = (kind: 'choice' | ReadAloudItemKind, items?: string[]) =>
    (items ?? []).forEach((_t, index) =>
      keys.push(readAloudPartKey(q.id, { kind, index } as QuizReadAloudPart))
    );
  if (q.type === 'MC') listed('choice', q.choices);
  if (q.type === 'Matching') {
    listed('matchingLeft', q.matchingLeft);
    listed('matchingRight', q.matchingRight);
  }
  if (q.type === 'Ordering') listed('orderingItem', q.orderingItems);
  keys.push(readAloudPartKey(q.id, { kind: 'whole' }));
  return keys;
}

const ITEM_FIELD: Record<
  ReadAloudItemKind,
  'matchingLeft' | 'matchingRight' | 'orderingItems'
> = {
  matchingLeft: 'matchingLeft',
  matchingRight: 'matchingRight',
  orderingItem: 'orderingItems',
};

export function useQuizReadAloud({
  enabled,
  sessionId,
  manifest,
  canonicalQuestions,
  question,
  nextQuestion,
  stimulusTextById,
}: Args): QuizReadAloudController {
  const [playingPart, setPlayingPart] = useState<QuizReadAloudPart | null>(
    null
  );
  const [loadingPart, setLoadingPart] = useState<QuizReadAloudPart | null>(
    null
  );
  const [subPart, setSubPart] = useState<QuizReadAloudPart | null>(null);
  const [chunkIndex, setChunkIndex] = useState<number | null>(null);
  const [readingQuestion, setReadingQuestion] = useState(false);
  const [error, setError] = useState<ReadAloudError>(null);
  const [denied, setDenied] = useState(false);
  const [rate, setRate] = useState<number>(initialRate);
  const [auto, setAutoState] = useState<boolean>(
    () => readStorage(AUTO_STORAGE_KEY) === 'true'
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlCache = useRef(new Map<string, string>());
  const prefetched = useRef(new Map<string, HTMLAudioElement>());
  const requestSeq = useRef(0);
  const playlistRef = useRef<{ urls: string[]; index: number } | null>(null);
  const timingsRef = useRef<QuizReadAloudTiming[] | null>(null);
  const queueRef = useRef<QuizReadAloudPart[]>([]);
  const questionId = question?.id;
  const canonical = useMemo(
    () => canonicalQuestions.find((q) => q.id === questionId),
    [canonicalQuestions, questionId]
  );

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  const stop = useCallback(() => {
    requestSeq.current += 1;
    playlistRef.current = null;
    timingsRef.current = null;
    queueRef.current = [];
    setReadingQuestion(false);
    setChunkIndex(null);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPlayingPart(null);
    setLoadingPart(null);
    setSubPart(null);
  }, []);

  const urlFor = useCallback(async (path: string): Promise<string> => {
    const hit = urlCache.current.get(path);
    if (hit) return hit;
    const url = await resolveReadAloudUrl(path);
    urlCache.current.set(path, url);
    return url;
  }, []);

  const resolvePart = useCallback(
    async (qid: string, part: QuizReadAloudPart): Promise<Resolved> => {
      const key = readAloudPartKey(qid, part);
      if (part.kind === 'stimulus') {
        const chunkKeys = manifest?.stimulusChunks?.[part.stimulusId];
        const paths = chunkKeys?.map((k) => manifest?.files[k]);
        if (paths && paths.length > 0 && paths.every(Boolean)) {
          return { urls: await Promise.all((paths as string[]).map(urlFor)) };
        }
      } else {
        const path = manifest?.files[key];
        if (path) {
          return {
            urls: [await urlFor(path)],
            timings: manifest?.timings?.[key],
          };
        }
      }
      // R1/R14 fallback: assign-then-start race, partial manifests, pre-feature sessions.
      const res = await synthesizeQuizAudio({
        mode: 'student',
        sessionId,
        questionId: qid,
        part,
      });
      const paths = res.chunks ?? [res.path];
      return { urls: await Promise.all(paths.map(urlFor)), timings: res.parts };
    },
    [manifest, sessionId, urlFor]
  );

  const start = useCallback(
    (part: QuizReadAloudPart, keepQueue: boolean) => {
      if (!enabled || !questionId || denied) return;
      const queue = keepQueue ? queueRef.current : [];
      const wasReading = keepQueue && readingQuestion;
      stop();
      queueRef.current = queue;
      if (wasReading) setReadingQuestion(true);
      const seq = requestSeq.current;
      const qid = questionId;
      setError(null);
      setLoadingPart(part);
      void (async () => {
        try {
          const resolved = await resolvePart(qid, part);
          if (seq !== requestSeq.current) return;
          const audio = getAudio();
          playlistRef.current = { urls: resolved.urls, index: 0 };
          timingsRef.current = resolved.timings ?? null;
          audio.src = resolved.urls[0];
          audio.playbackRate = rate;
          await audio.play();
          if (seq !== requestSeq.current) return;
          setLoadingPart(null);
          setPlayingPart(part);
          setChunkIndex(part.kind === 'stimulus' ? 0 : null);
          if (part.kind !== 'whole') setSubPart(part);
        } catch (err) {
          if (seq !== requestSeq.current) return;
          queueRef.current = [];
          setReadingQuestion(false);
          setLoadingPart(null);
          setPlayingPart(null);
          if (err instanceof FunctionsError) {
            if (err.code === 'functions/permission-denied') {
              setDenied(true);
              return;
            }
            setError(
              err.code === 'functions/unavailable' ? 'unavailable' : 'load'
            );
            return;
          }
          // Autoplay refusal on a page with no gesture yet is not an error worth showing.
          if (err instanceof DOMException && err.name === 'NotAllowedError')
            return;
          setError('load');
        }
      })();
    },
    [
      enabled,
      questionId,
      denied,
      readingQuestion,
      stop,
      resolvePart,
      getAudio,
      rate,
    ]
  );

  const play = useCallback(
    (part: QuizReadAloudPart) => start(part, false),
    [start]
  );

  const stimulusText = useCallback(
    (stimulusId: string): string | undefined => {
      if (!question?.stimulusIds?.includes(stimulusId)) return undefined;
      const text = stimulusTextById?.[stimulusId]?.trim() ?? '';
      return text.length > 0 ? text : undefined;
    },
    [question, stimulusTextById]
  );

  const readQuestion = useCallback(() => {
    if (!enabled || !questionId || denied) return;
    const parts: QuizReadAloudPart[] = [];
    for (const sid of question?.stimulusIds ?? []) {
      if (stimulusText(sid)) parts.push({ kind: 'stimulus', stimulusId: sid });
    }
    parts.push({ kind: 'whole' });
    stop();
    queueRef.current = parts.slice(1);
    setReadingQuestion(true);
    start(parts[0], true);
  }, [enabled, questionId, denied, question, stimulusText, stop, start]);

  // The ended handler below starts queued parts through this ref.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  // Audio element events: chunk playlists advance, timings drive the whole-read highlight.
  useEffect(() => {
    if (!enabled) return;
    const audio = getAudio();
    const onEnded = () => {
      const list = playlistRef.current;
      if (list && list.index + 1 < list.urls.length) {
        list.index += 1;
        setChunkIndex(list.index);
        audio.src = list.urls[list.index];
        audio.playbackRate = rate;
        void audio.play().catch(() => setError('load'));
        return;
      }
      playlistRef.current = null;
      timingsRef.current = null;
      setPlayingPart(null);
      setSubPart(null);
      setChunkIndex(null);
      const next = queueRef.current.shift();
      if (next) {
        startRef.current(next, true);
        return;
      }
      setReadingQuestion(false);
    };
    const onTimeUpdate = () => {
      const timings = timingsRef.current;
      if (!timings || timings.length === 0) return;
      const ms = audio.currentTime * 1000;
      let current: QuizReadAloudTiming | null = null;
      for (const t of timings) if (t.startMs <= ms + 50) current = t;
      if (!current) return;
      const next: QuizReadAloudPart =
        current.index === undefined
          ? ({ kind: current.kind } as QuizReadAloudPart)
          : ({ kind: current.kind, index: current.index } as QuizReadAloudPart);
      setSubPart((prev) => (sameReadAloudPart(prev, next) ? prev : next));
    };
    const onError = () => {
      queueRef.current = [];
      setReadingQuestion(false);
      setChunkIndex(null);
      setPlayingPart(null);
      setLoadingPart(null);
      setError('load');
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
    };
  }, [enabled, getAudio, rate]);

  // Rate applies live to whatever is playing.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  // Stop on question change and unmount; auto-read the new prompt when opted in.
  const autoRef = useRef(auto);
  const playRef = useRef(play);
  useEffect(() => {
    autoRef.current = auto;
    playRef.current = play;
  });
  useEffect(() => {
    if (!enabled) return;
    if (questionId && autoRef.current) playRef.current({ kind: 'question' });
    return () => stop();
  }, [enabled, questionId, stop]);

  // Prefetch the current question's parts, then the next question's.
  useEffect(() => {
    if (!enabled || !manifest) return;
    const wanted: string[] = [];
    for (const q of [question, nextQuestion]) {
      if (!q) continue;
      for (const key of questionPartKeys(q)) {
        const path = manifest.files[key];
        if (path) wanted.push(path);
      }
      for (const sid of q.stimulusIds ?? []) {
        for (const k of manifest.stimulusChunks?.[sid] ?? []) {
          const path = manifest.files[k];
          if (path) wanted.push(path);
        }
      }
    }
    let cancelled = false;
    const pool = prefetched.current;
    for (const key of [...pool.keys()]) {
      if (!wanted.includes(key)) {
        pool.get(key)?.removeAttribute('src');
        pool.delete(key);
      }
    }
    void (async () => {
      for (const path of wanted) {
        if (cancelled || pool.has(path)) continue;
        try {
          const url = await urlFor(path);
          if (cancelled) return;
          const el = new Audio();
          el.preload = 'auto';
          el.src = url;
          pool.set(path, el);
        } catch {
          /* prefetch is best effort */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, manifest, question, nextQuestion, urlFor]);

  useEffect(() => () => stop(), [stop]);

  const cycleRate = useCallback(() => {
    setRate((prev) => {
      const i = (READ_ALOUD_RATES as readonly number[]).indexOf(prev);
      const next = READ_ALOUD_RATES[(i + 1) % READ_ALOUD_RATES.length];
      writeStorage(RATE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const setAuto = useCallback((next: boolean) => {
    setAutoState(next);
    writeStorage(AUTO_STORAGE_KEY, String(next));
  }, []);

  const statusOf = useCallback(
    (part: QuizReadAloudPart | null): ReadAloudStatus => {
      if (sameReadAloudPart(part, loadingPart)) return 'loading';
      if (sameReadAloudPart(part, playingPart)) return 'playing';
      return 'idle';
    },
    [loadingPart, playingPart]
  );

  const highlightedPart = playingPart ? (subPart ?? playingPart) : null;

  const choicePart = useCallback(
    (text: string): QuizReadAloudPart | null => {
      const index = canonical?.choices?.indexOf(text) ?? -1;
      return index >= 0 ? { kind: 'choice', index } : null;
    },
    [canonical]
  );

  const items = useMemo<ReadAloudItemControls>(() => {
    const partFor = (kind: ReadAloudItemKind, text: string) => {
      const list = canonical?.[ITEM_FIELD[kind]];
      const index = Array.isArray(list) ? list.indexOf(text) : -1;
      return index >= 0 ? ({ kind, index } as QuizReadAloudPart) : null;
    };
    return {
      partFor,
      play: (kind, text) => {
        const part = partFor(kind, text);
        if (part) play(part);
      },
      status: (kind, text) => statusOf(partFor(kind, text)),
      highlighted: (kind, text) =>
        sameReadAloudPart(partFor(kind, text), highlightedPart),
      stop,
    };
  }, [canonical, play, statusOf, highlightedPart, stop]);

  return {
    enabled: enabled && !denied,
    playingPart,
    loadingPart,
    highlightedPart,
    error,
    play,
    stop,
    rate,
    cycleRate,
    auto,
    setAuto,
    choicePart,
    items,
    statusOf,
    readQuestion,
    readingQuestion,
    chunkIndex,
    stimulusText,
  };
}
