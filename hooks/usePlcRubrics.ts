/**
 * usePlcRubrics — live subscription to a PLC's shared rubric library at
 * `/plcs/{plcId}/rubrics/{id}` (M12 Phase 3-I).
 *
 * Mirrors `usePlcQuizzes`: parser-drops-malformed defense, render-time
 * `prevPlcId` reset, soft-delete tombstones excluded from the live list.
 * Unlike quizzes there is no canonical synced doc — the full rubric payload
 * is inlined on the PLC doc, so sharing is a single write.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcRubricEntry, Rubric, RubricCriterion } from '@/types';
import { logError } from '@/utils/logError';

const PLCS_COLLECTION = 'plcs';
const RUBRICS_SUBCOLLECTION = 'rubrics';

export interface ShareRubricWithPlcInput {
  /** The teacher's personal rubric, shared verbatim (id preserved). */
  rubric: Rubric;
  /** Display name snapshot for attribution. */
  sharedByName: string;
  /** Lowercased email snapshot for display. */
  sharedByEmail: string;
}

/** What a share attempt did — re-sharing an unshared rubric revives its tombstone. */
export type ShareRubricOutcome = 'created' | 'restored' | 'already-shared';

interface UsePlcRubricsResult {
  rubrics: PlcRubricEntry[];
  loading: boolean;
  /** Non-null means the empty list is "couldn't load," not "no items yet." */
  error: Error | null;
  /** Write a PLC rubric entry; the signed-in user is stamped as `sharedBy`. */
  shareRubricWithPlc: (
    input: ShareRubricWithPlcInput
  ) => Promise<ShareRubricOutcome>;
  /** Soft-delete (tombstone) a PLC rubric entry — any non-viewer member. */
  unshareRubricFromPlc: (rubricId: string) => Promise<void>;
  /** Restore a soft-deleted PLC rubric entry by clearing its `deletedAt`. */
  restoreRubricInPlc: (rubricId: string) => Promise<void>;
}

function parseLevels(raw: unknown): RubricCriterion['levels'] | null {
  if (!Array.isArray(raw)) return null;
  const levels: RubricCriterion['levels'] = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') return null;
    const rec = l as Record<string, unknown>;
    if (
      typeof rec.id !== 'string' ||
      typeof rec.label !== 'string' ||
      typeof rec.points !== 'number'
    ) {
      return null;
    }
    levels.push({
      id: rec.id,
      label: rec.label,
      points: rec.points,
      ...(typeof rec.description === 'string'
        ? { description: rec.description }
        : {}),
    });
  }
  return levels;
}

function parseCriteria(raw: unknown): RubricCriterion[] | null {
  if (!Array.isArray(raw)) return null;
  const criteria: RubricCriterion[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') return null;
    const rec = c as Record<string, unknown>;
    const levels = parseLevels(rec.levels);
    if (typeof rec.id !== 'string' || typeof rec.name !== 'string' || !levels) {
      return null;
    }
    criteria.push({
      id: rec.id,
      name: rec.name,
      levels,
      ...(typeof rec.description === 'string'
        ? { description: rec.description }
        : {}),
    });
  }
  return criteria;
}

export function parsePlcRubricEntry(
  id: string,
  data: Record<string, unknown>
): PlcRubricEntry | null {
  const criteria = parseCriteria(data.criteria);
  if (
    typeof data.title !== 'string' ||
    !criteria ||
    typeof data.sharedBy !== 'string' ||
    typeof data.sharedAt !== 'number' ||
    typeof data.createdAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return null;
  }
  const entry: PlcRubricEntry = {
    id,
    title: data.title,
    criteria,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sharedBy: data.sharedBy,
    sharedByEmail:
      typeof data.sharedByEmail === 'string' ? data.sharedByEmail : '',
    sharedByName:
      typeof data.sharedByName === 'string' ? data.sharedByName : '',
    sharedAt: data.sharedAt,
  };
  if (typeof data.description === 'string')
    entry.description = data.description;
  if (typeof data.deletedAt === 'number') {
    entry.deletedAt = data.deletedAt;
  } else if (data.deletedAt === null) {
    entry.deletedAt = null;
  }
  return entry;
}

/** Strip PLC attribution, leaving the portable rubric payload. */
export function toPortableRubric(entry: PlcRubricEntry): Rubric {
  const rubric: Rubric = {
    id: entry.id,
    title: entry.title,
    criteria: entry.criteria,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  if (entry.description !== undefined) rubric.description = entry.description;
  return rubric;
}

export const usePlcRubrics = (plcId: string | null): UsePlcRubricsResult => {
  const { user } = useAuth();
  const [rubrics, setRubrics] = useState<PlcRubricEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setRubrics([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setRubrics([]);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const ref = collection(db, PLCS_COLLECTION, plcId, RUBRICS_SUBCOLLECTION);
    const unsub = onSnapshot(
      query(ref, orderBy('updatedAt', 'desc')),
      (snap) => {
        const list: PlcRubricEntry[] = [];
        snap.forEach((d) => {
          const parsed = parsePlcRubricEntry(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed && parsed.deletedAt == null) list.push(parsed);
        });
        setRubrics(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('usePlcRubrics.snapshot', err, { plcId });
        setLoading(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [plcId, user]);

  const shareRubricWithPlc = useCallback(
    async (input: ShareRubricWithPlcInput): Promise<ShareRubricOutcome> => {
      if (!plcId || !user) throw new Error('Not signed in');
      return writePlcRubricEntry(plcId, user.uid, input);
    },
    [plcId, user]
  );

  const unshareRubricFromPlc = useCallback(
    async (rubricId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, RUBRICS_SUBCOLLECTION, rubricId),
        { deletedAt: Date.now(), updatedAt: Date.now() }
      );
    },
    [plcId, user]
  );

  const restoreRubricInPlc = useCallback(
    async (rubricId: string): Promise<void> => {
      if (!plcId || !user) throw new Error('Not signed in');
      await updateDoc(
        doc(db, PLCS_COLLECTION, plcId, RUBRICS_SUBCOLLECTION, rubricId),
        { deletedAt: null, updatedAt: Date.now() }
      );
    },
    [plcId, user]
  );

  return useMemo(
    () => ({
      rubrics,
      loading,
      error,
      shareRubricWithPlc,
      unshareRubricFromPlc,
      restoreRubricInPlc,
    }),
    [
      rubrics,
      loading,
      error,
      shareRubricWithPlc,
      unshareRubricFromPlc,
      restoreRubricInPlc,
    ]
  );
};

/**
 * One-shot write of a PLC rubric entry. Mirrors `writePlcQuizEntry` — used
 * from surfaces (e.g. the rubric builder) that know the target PLC but aren't
 * subscribed to it.
 *
 * The doc id is the rubric id, so an unshared rubric leaves a tombstone that
 * a re-share must revive with an update: the rules freeze `sharedBy*` /
 * `sharedAt` / `createdAt` after create, so a fresh create payload is denied.
 */
export async function writePlcRubricEntry(
  plcId: string,
  uid: string,
  input: ShareRubricWithPlcInput
): Promise<ShareRubricOutcome> {
  const now = Date.now();
  const { rubric } = input;
  const ref = doc(db, PLCS_COLLECTION, plcId, RUBRICS_SUBCOLLECTION, rubric.id);
  const existing = await getDoc(ref);

  if (existing.exists()) {
    const deletedAt = (existing.data() as Record<string, unknown>).deletedAt;
    if (deletedAt == null) return 'already-shared';
    // Content-only revive; original attribution stands (PLC-owned model).
    await updateDoc(ref, {
      title: rubric.title,
      criteria: rubric.criteria,
      description: rubric.description ?? deleteField(),
      updatedAt: now,
      deletedAt: deleteField(),
    });
    return 'restored';
  }

  const entry: PlcRubricEntry = {
    id: rubric.id,
    title: rubric.title,
    criteria: rubric.criteria,
    createdAt: rubric.createdAt,
    updatedAt: now,
    sharedBy: uid,
    sharedByEmail: input.sharedByEmail,
    sharedByName: input.sharedByName,
    sharedAt: now,
    ...(rubric.description !== undefined
      ? { description: rubric.description }
      : {}),
  };
  await setDoc(ref, entry);
  return 'created';
}
