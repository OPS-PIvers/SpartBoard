// PLC Flashcards: shared sets at plcs/{plcId}/flashcard_sets and class results at plcs/{plcId}/flashcard_results.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type {
  FlashcardCard,
  FlashcardSession,
  FlashcardSet,
  PlcFlashcardCardTally,
  PlcFlashcardResultEntry,
  PlcFlashcardSetEntry,
} from '@/types';
import { logError } from '@/utils/logError';
import {
  FC_CONTENT_COLLECTION,
  FC_CONTENT_DOC,
  mergeFlashcardSessionContent,
  type FlashcardSessionContent,
} from '@/utils/flashcardSessionContent';
import {
  buildPlcFlashcardResultSummary,
  type PlcFlashcardResultSummary,
} from '@/utils/plcFlashcardResults';
import type { FlashcardResultRecord } from '@/utils/flashcardResults';
import {
  FLASHCARD_PROGRESS_SUBCOLLECTION,
  FLASHCARD_SESSIONS_COLLECTION,
} from './useFlashcardAssignments';

const PLCS = 'plcs';
export const PLC_FLASHCARD_SETS = 'flashcard_sets';
export const PLC_FLASHCARD_RESULTS = 'flashcard_results';

export type SharePlcFlashcardSetOutcome =
  | 'created'
  | 'restored'
  | 'already-shared';

export interface SharePlcFlashcardSetInput {
  set: FlashcardSet;
  sharedByName: string;
  sharedByEmail: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

function parseCards(raw: unknown): FlashcardCard[] | null {
  if (!Array.isArray(raw)) return null;
  const cards: FlashcardCard[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') return null;
    const rec = c as Record<string, unknown>;
    if (typeof rec.id !== 'string') return null;
    cards.push({
      id: rec.id,
      term: str(rec.term),
      definition: str(rec.definition),
    });
  }
  return cards;
}

export function parsePlcFlashcardSetEntry(
  id: string,
  data: Record<string, unknown>
): PlcFlashcardSetEntry | null {
  const cards = parseCards(data.cards);
  if (
    typeof data.title !== 'string' ||
    !cards ||
    typeof data.sharedBy !== 'string' ||
    typeof data.sharedAt !== 'number'
  ) {
    return null;
  }
  const entry: PlcFlashcardSetEntry = {
    id,
    title: data.title,
    termLanguage: str(data.termLanguage) || 'en-US',
    definitionLanguage: str(data.definitionLanguage) || 'en-US',
    cards,
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
    sharedBy: data.sharedBy,
    sharedByEmail: str(data.sharedByEmail),
    sharedByName: str(data.sharedByName),
    sharedAt: data.sharedAt,
  };
  if (typeof data.description === 'string')
    entry.description = data.description;
  if (typeof data.deletedAt === 'number') entry.deletedAt = data.deletedAt;
  return entry;
}

function parseTallies(raw: unknown): PlcFlashcardCardTally[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      term: str(c.term),
      definition: str(c.definition),
      correct: num(c.correct),
      answered: num(c.answered),
    }));
}

export function parsePlcFlashcardResultEntry(
  id: string,
  data: Record<string, unknown>
): PlcFlashcardResultEntry | null {
  if (
    typeof data.setTitle !== 'string' ||
    (data.kind !== 'check' && data.kind !== 'study') ||
    typeof data.sharedBy !== 'string'
  ) {
    return null;
  }
  return {
    id,
    setId: str(data.setId),
    setTitle: data.setTitle,
    kind: data.kind,
    classLabel: str(data.classLabel),
    students: num(data.students),
    completed: num(data.completed),
    averagePercent: num(data.averagePercent),
    cards: parseTallies(data.cards),
    sharedBy: data.sharedBy,
    sharedByEmail: str(data.sharedByEmail),
    sharedByName: str(data.sharedByName),
    sharedAt: num(data.sharedAt),
    updatedAt: num(data.updatedAt),
  };
}

/** Portable copy for "Add to my library": fresh id, no attribution. */
export function toPersonalFlashcardSet(
  entry: PlcFlashcardSetEntry
): FlashcardSet {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: entry.title,
    termLanguage: entry.termLanguage,
    definitionLanguage: entry.definitionLanguage,
    cards: entry.cards.map((card) => ({ ...card })),
    folderId: null,
    createdAt: now,
    updatedAt: now,
    ...(entry.description !== undefined
      ? { description: entry.description }
      : {}),
  };
}

function usePlcSubscription<T>(
  plcId: string | null,
  sub: string,
  parse: (id: string, data: Record<string, unknown>) => T | null,
  keep: (item: T) => boolean
): { items: T[]; loading: boolean; error: Error | null } {
  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setItems([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setItems([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    return onSnapshot(
      query(collection(db, PLCS, plcId, sub), orderBy('updatedAt', 'desc')),
      (snap) => {
        const list: T[] = [];
        snap.forEach((d) => {
          const parsed = parse(d.id, d.data() as Record<string, unknown>);
          if (parsed && keep(parsed)) list.push(parsed);
        });
        setItems(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError(`usePlcFlashcards.${sub}`, err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
  }, [plcId, user, sub, parse, keep]);

  return { items, loading, error };
}

const isLiveSet = (entry: PlcFlashcardSetEntry): boolean =>
  entry.deletedAt == null;
const keepAll = (): boolean => true;

export const usePlcFlashcardSets = (plcId: string | null) => {
  const { user } = useAuth();
  const { items, loading, error } = usePlcSubscription(
    plcId,
    PLC_FLASHCARD_SETS,
    parsePlcFlashcardSetEntry,
    isLiveSet
  );
  const unshareSet = useCallback(
    async (setId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      const now = Date.now();
      await updateDoc(doc(db, PLCS, plcId, PLC_FLASHCARD_SETS, setId), {
        deletedAt: now,
        updatedAt: now,
      });
    },
    [plcId, user]
  );
  return useMemo(
    () => ({ sets: items, loading, error, unshareSet }),
    [items, loading, error, unshareSet]
  );
};

export const usePlcFlashcardResults = (plcId: string | null) => {
  const { items, loading, error } = usePlcSubscription(
    plcId,
    PLC_FLASHCARD_RESULTS,
    parsePlcFlashcardResultEntry,
    keepAll
  );
  return useMemo(
    () => ({ results: items, loading, error }),
    [items, loading, error]
  );
};

/** Share a set with a PLC; the doc id is the set id, so a re-share revives its tombstone. */
export async function writePlcFlashcardSetEntry(
  plcId: string,
  uid: string,
  input: SharePlcFlashcardSetInput
): Promise<SharePlcFlashcardSetOutcome> {
  const now = Date.now();
  const { set } = input;
  const ref = doc(db, PLCS, plcId, PLC_FLASHCARD_SETS, set.id);
  const existing = await getDoc(ref);
  const cards = set.cards.map(({ id, term, definition }) => ({
    id,
    term,
    definition,
  }));
  if (existing.exists()) {
    if ((existing.data() as Record<string, unknown>).deletedAt == null) {
      return 'already-shared';
    }
    await updateDoc(ref, {
      title: set.title,
      termLanguage: set.termLanguage,
      definitionLanguage: set.definitionLanguage,
      cards,
      description: set.description?.trim() ? set.description : deleteField(),
      updatedAt: now,
      deletedAt: deleteField(),
    });
    return 'restored';
  }
  await setDoc(ref, {
    id: set.id,
    title: set.title,
    termLanguage: set.termLanguage,
    definitionLanguage: set.definitionLanguage,
    cards,
    createdAt: set.createdAt,
    updatedAt: now,
    sharedBy: uid,
    sharedByEmail: input.sharedByEmail,
    sharedByName: input.sharedByName,
    sharedAt: now,
    ...(set.description ? { description: set.description } : {}),
  });
  return 'created';
}

/** One-shot read of an assignment's session and progress, summarized for a PLC. */
export async function loadFlashcardResultSummary(
  sessionId: string
): Promise<PlcFlashcardResultSummary> {
  const sessionRef = doc(db, FLASHCARD_SESSIONS_COLLECTION, sessionId);
  const [sessionSnap, progressSnap] = await Promise.all([
    getDoc(sessionRef),
    getDocs(collection(db, sessionRef.path, FLASHCARD_PROGRESS_SUBCOLLECTION)),
  ]);
  if (!sessionSnap.exists()) throw new Error('Assignment not found.');
  let session = {
    ...sessionSnap.data(),
    id: sessionSnap.id,
  } as FlashcardSession;
  if (session.cardsInContent) {
    const contentSnap = await getDoc(
      doc(db, sessionRef.path, FC_CONTENT_COLLECTION, FC_CONTENT_DOC)
    );
    session = mergeFlashcardSessionContent(
      session,
      contentSnap.exists()
        ? (contentSnap.data() as FlashcardSessionContent)
        : null
    );
  }
  const results = progressSnap.docs.map(
    (d) => ({ ...d.data(), studentUid: d.id }) as FlashcardResultRecord
  );
  return buildPlcFlashcardResultSummary(session, results);
}

export interface WritePlcFlashcardResultInput {
  assignmentId: string;
  setId: string;
  setTitle: string;
  classLabel: string;
  summary: PlcFlashcardResultSummary;
  sharedByName: string;
  sharedByEmail: string;
  /** Kept from the first share on refresh. */
  sharedAt?: number;
}

export async function writePlcFlashcardResult(
  plcId: string,
  uid: string,
  input: WritePlcFlashcardResultInput
): Promise<void> {
  const now = Date.now();
  const entry: PlcFlashcardResultEntry = {
    id: input.assignmentId,
    setId: input.setId,
    setTitle: input.setTitle,
    classLabel: input.classLabel,
    ...input.summary,
    sharedBy: uid,
    sharedByEmail: input.sharedByEmail,
    sharedByName: input.sharedByName,
    sharedAt: input.sharedAt ?? now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, PLCS, plcId, PLC_FLASHCARD_RESULTS, input.assignmentId),
    entry
  );
}

export async function deletePlcFlashcardResult(
  plcId: string,
  assignmentId: string
): Promise<void> {
  await deleteDoc(doc(db, PLCS, plcId, PLC_FLASHCARD_RESULTS, assignmentId));
}
