import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import { LearningTarget, LearningTargetList } from '@/types';
import { logError } from '@/utils/logError';
import i18n from '@/i18n/index';

const PLCS_COLLECTION = 'plcs';
const USERS_COLLECTION = 'users';

export interface LearningTargetSource {
  kind: 'personal' | 'plc';
  ownerId?: string;
  name: string;
  list: LearningTargetList | null;
}

interface UseLearningTargetsResult {
  list: LearningTargetList | null;
  loading: boolean;
  save: (list: LearningTargetList) => Promise<void>;
}

function parseTarget(raw: unknown): LearningTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.label !== 'string') return null;
  const t: LearningTarget = {
    id: r.id,
    label: r.label,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
  if (typeof r.code === 'string' && r.code) t.code = r.code;
  if (Array.isArray(r.standardIds)) {
    t.standardIds = r.standardIds.filter(
      (s): s is string => typeof s === 'string'
    );
  }
  if (r.archived === true) t.archived = true;
  return t;
}

export function parseLearningTargetList(
  raw: Record<string, unknown> | undefined
): LearningTargetList {
  if (!raw) return { targets: [], updatedAt: 0 };
  const targets = Array.isArray(raw.targets)
    ? raw.targets
        .map(parseTarget)
        .filter((t): t is LearningTarget => t !== null)
    : [];
  const list: LearningTargetList = {
    targets,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
  const mc = raw.masteryCutoffs as Record<string, unknown> | undefined;
  if (
    mc &&
    typeof mc.proficient === 'number' &&
    typeof mc.approaching === 'number'
  ) {
    list.masteryCutoffs = {
      proficient: mc.proficient,
      approaching: mc.approaching,
    };
  }
  return list;
}

/** Strips undefined values so setDoc never rejects on optional fields. */
function serializeList(list: LearningTargetList): Record<string, unknown> {
  const out: Record<string, unknown> = {
    targets: list.targets.map((t) => {
      const clean: Record<string, unknown> = {
        id: t.id,
        label: t.label,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
      if (t.code) clean.code = t.code;
      if (t.standardIds && t.standardIds.length > 0)
        clean.standardIds = t.standardIds;
      if (t.archived) clean.archived = true;
      return clean;
    }),
    updatedAt: Date.now(),
  };
  if (list.masteryCutoffs) out.masteryCutoffs = list.masteryCutoffs;
  return out;
}

/** Shared per-doc listener; `path` null ⇒ idle (list null, loading false). */
function useLearningTargetDoc(path: string[] | null): UseLearningTargetsResult {
  const { user } = useAuth();
  const key = path ? path.join('/') : null;
  const [state, setState] = useState<{
    key: string | null;
    list: LearningTargetList | null;
  }>({
    key: null,
    list: null,
  });
  const active = Boolean(key && user && !isAuthBypass);

  useEffect(() => {
    if (!key || !user || isAuthBypass) return;
    const segments = key.split('/');
    const unsub = onSnapshot(
      doc(db, segments[0], ...segments.slice(1)),
      (snap) => {
        setState({
          key,
          list: parseLearningTargetList(
            snap.data() as Record<string, unknown> | undefined
          ),
        });
      },
      (err) => {
        logError('useLearningTargets', err, { path: key });
        setState({ key, list: { targets: [], updatedAt: 0 } });
      }
    );
    return () => unsub();
  }, [key, user]);

  const save = useCallback(
    async (list: LearningTargetList) => {
      if (!key || !user) throw new Error('Not signed in');
      const segments = key.split('/');
      await setDoc(
        doc(db, segments[0], ...segments.slice(1)),
        serializeList(list)
      );
    },
    [key, user]
  );

  const current = active && state.key === key ? state.list : null;
  return { list: current, loading: active && state.key !== key, save };
}

export function usePersonalLearningTargets(): UseLearningTargetsResult {
  const { user } = useAuth();
  const path = useMemo(
    () =>
      user
        ? [USERS_COLLECTION, user.uid, 'userProfile', 'learningTargets']
        : null,
    [user]
  );
  return useLearningTargetDoc(path);
}

export function usePlcLearningTargets(
  plcId: string | null
): UseLearningTargetsResult {
  const path = useMemo(
    () => (plcId ? [PLCS_COLLECTION, plcId, 'meta', 'learningTargets'] : null),
    [plcId]
  );
  return useLearningTargetDoc(path);
}

interface UseLearningTargetSourcesResult {
  sources: LearningTargetSource[];
  loading: boolean;
}

/** Personal list plus one listener per PLC the teacher belongs to. */
export function useLearningTargetSources(): UseLearningTargetSourcesResult {
  const { user } = useAuth();
  const personal = usePersonalLearningTargets();
  const { plcs, loading: plcsLoading } = usePlcs();
  const plcKey = plcs.map((p) => p.id).join('|');
  const [plcLists, setPlcLists] = useState<Record<string, LearningTargetList>>(
    {}
  );

  useEffect(() => {
    if (!user || isAuthBypass || !plcKey) return;
    const ids = plcKey.split('|');
    const unsubs = ids.map((plcId) =>
      onSnapshot(
        doc(db, PLCS_COLLECTION, plcId, 'meta', 'learningTargets'),
        (snap) => {
          const list = parseLearningTargetList(
            snap.data() as Record<string, unknown> | undefined
          );
          setPlcLists((prev) => ({ ...prev, [plcId]: list }));
        },
        (err) => {
          logError('useLearningTargetSources', err, { plcId });
          setPlcLists((prev) => ({
            ...prev,
            [plcId]: { targets: [], updatedAt: 0 },
          }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [user, plcKey]);

  const sources = useMemo<LearningTargetSource[]>(() => {
    const out: LearningTargetSource[] = [
      {
        kind: 'personal',
        name: i18n.t('learningTargets.personal.sourceName', {
          defaultValue: 'My learning targets',
        }),
        list: personal.list,
      },
    ];
    for (const plc of plcs) {
      out.push({
        kind: 'plc',
        ownerId: plc.id,
        name: plc.name,
        list: plcLists[plc.id] ?? null,
      });
    }
    return out;
  }, [personal.list, plcs, plcLists]);

  const plcPending = plcs.some((p) => !plcLists[p.id]);
  return { sources, loading: personal.loading || plcsLoading || plcPending };
}
