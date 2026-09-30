import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  DEFAULT_ATTEMPT_POLICY,
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  GRADEBOOK_COLLECTIONS,
  ORG_GRADEBOOK_SETTINGS_ID,
  PLC_GRADEBOOK_META_ID,
  gradebookDocId,
  resolveScale,
  type GradebookClassStateDoc,
  type GradebookColumnConfig,
  type GradebookConfigRef,
  type GradebookHistoryEntry,
  type GradebookMark,
  type GradebookSettingsBody,
  type GradeIndexRow,
  type GradingPeriod,
  type GradingPeriodSetDoc,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';

export type GradebookHistoryDraft = Omit<
  GradebookHistoryEntry,
  'ownerUid' | 'byUid' | 'batchId'
>;

export interface GradebookMarkSave {
  mark: GradebookMark;
  history: GradebookHistoryDraft[];
}

export type GradebookClassStatePatch = Partial<
  Pick<
    GradebookClassStateDoc,
    'sort' | 'nameFormat' | 'cellFormat' | 'configRef' | 'cardLayouts'
  >
>;

/** Everything the gradebook reads and writes for one class; Firestore here, fixtures in the dev harness. */
export interface GradebookSource {
  status: 'loading' | 'ready' | 'error';
  rows: GradeIndexRow[];
  marks: GradebookMark[];
  columnConfigs: GradebookColumnConfig[];
  classState: GradebookClassStateDoc | null;
  settings: GradebookSettingsBody;
  scale: ProficiencyScale;
  periods: GradingPeriod[];
  saveMarks: (
    saves: GradebookMarkSave[],
    batchId: string | null
  ) => Promise<void>;
  saveColumn: (config: GradebookColumnConfig) => Promise<void>;
  saveClassState: (patch: GradebookClassStatePatch) => Promise<void>;
}

export function newColumnConfig(
  base: Pick<GradebookColumnConfig, 'kind' | 'sessionId' | 'ownerUid'>
): GradebookColumnConfig {
  return {
    ...base,
    editorUids: [],
    category: null,
    countsTowardOverall: true,
    maxPointsOverride: null,
    attemptPolicy: DEFAULT_ATTEMPT_POLICY,
    targets: [],
    hiddenInRosterIds: [],
    updatedAt: Date.now(),
  };
}

interface Keyed<T> {
  key: string;
  value: T;
}

/** Listen while `key` is non-empty; returns null until the first snapshot for that key. */
function useKeyedListener<T>(
  key: string,
  subscribe: (
    set: (value: T) => void,
    fail: (err: unknown) => void
  ) => () => void
): { value: T | null; loaded: boolean; error: boolean } {
  const [state, setState] = useState<Keyed<T> | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return undefined;
    return subscribe(
      (value) => {
        setState({ key, value });
        setErrorKey((k) => (k === key ? null : k));
      },
      (err) => {
        logError('useGradebookSource', err, { key });
        setErrorKey(key);
      }
    );
    // `subscribe` is rebuilt every render; `key` captures everything it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const loaded = state !== null && state.key === key;
  return {
    value: loaded ? state.value : null,
    loaded,
    error: errorKey === key,
  };
}

const docsOf = <T>(snap: { docs: { data: () => DocumentData }[] }): T[] =>
  snap.docs.map((d) => d.data() as T);

function configDocPath(uid: string, ref: GradebookConfigRef): string[] {
  if (ref.source === 'personal') {
    return ['users', uid, GRADEBOOK_COLLECTIONS.userSettings, ref.configId];
  }
  if (ref.source === 'district') {
    return [GRADEBOOK_COLLECTIONS.districtConfigs, ref.configId];
  }
  return ['plcs', ref.plcId, 'meta', PLC_GRADEBOOK_META_ID];
}

/** Firestore reads and writes for one gradebook class (D9, D10, D16, D18). */
export function useGradebookSource(
  uid: string | null,
  rosterId: string | null,
  orgId: string | null,
  buildingIds: readonly string[]
): GradebookSource {
  const classKey = uid && rosterId ? `${uid}|${rosterId}` : '';
  const userKey = uid ?? '';

  const rows = useKeyedListener<GradeIndexRow[]>(classKey, (set, fail) =>
    onSnapshot(
      query(
        collection(db, GRADEBOOK_COLLECTIONS.index),
        where('ownerUid', '==', uid),
        where('rosterIds', 'array-contains', rosterId)
      ),
      (snap) => set(docsOf<GradeIndexRow>(snap)),
      fail
    )
  );
  const marks = useKeyedListener<GradebookMark[]>(classKey, (set, fail) =>
    onSnapshot(
      query(
        collection(db, GRADEBOOK_COLLECTIONS.marks),
        where('ownerUid', '==', uid),
        where('rosterIds', 'array-contains', rosterId)
      ),
      (snap) => set(docsOf<GradebookMark>(snap)),
      fail
    )
  );
  const columns = useKeyedListener<GradebookColumnConfig[]>(
    userKey,
    (set, fail) =>
      onSnapshot(
        query(
          collection(db, GRADEBOOK_COLLECTIONS.columns),
          where('ownerUid', '==', uid)
        ),
        (snap) => set(docsOf<GradebookColumnConfig>(snap)),
        fail
      )
  );
  const classState = useKeyedListener<GradebookClassStateDoc | null>(
    classKey,
    (set, fail) =>
      onSnapshot(
        doc(
          db,
          'users',
          uid ?? '',
          GRADEBOOK_COLLECTIONS.userClasses,
          rosterId ?? ''
        ),
        (snap) =>
          set(snap.exists() ? (snap.data() as GradebookClassStateDoc) : null),
        fail
      )
  );

  const configRef = classState.value?.configRef ?? null;
  const configKey =
    uid && configRef ? `${uid}|${configDocPath(uid, configRef).join('/')}` : '';
  const config = useKeyedListener<GradebookSettingsBody | null>(
    configKey,
    (set, fail) => {
      if (!uid || !configRef) return () => undefined;
      const [first, ...rest] = configDocPath(uid, configRef);
      return onSnapshot(
        doc(db, first, ...rest),
        (snap) =>
          set(snap.exists() ? (snap.data() as GradebookSettingsBody) : null),
        fail
      );
    }
  );
  const settings = config.value ?? DEFAULT_GRADEBOOK_SETTINGS;

  const org = useKeyedListener<ProficiencyScale | null>(userKey, (set, fail) =>
    onSnapshot(
      doc(db, 'admin_settings', ORG_GRADEBOOK_SETTINGS_ID),
      (snap) => {
        const d = snap.exists() ? (snap.data() as ProficiencyScale) : null;
        set(
          d && typeof d.proficient === 'number'
            ? {
                proficient: d.proficient,
                approaching: d.approaching,
                levelNames:
                  d.levelNames ?? DEFAULT_PROFICIENCY_SCALE.levelNames,
              }
            : null
        );
      },
      fail
    )
  );
  const plcId = settings.scale.source === 'plc' ? settings.scale.plcId : '';
  const plcCutoffs = useKeyedListener<{
    proficient: number;
    approaching: number;
  } | null>(plcId, (set, fail) =>
    onSnapshot(
      doc(db, 'plcs', plcId, 'meta', 'learningTargets'),
      (snap) => {
        const c = snap.exists()
          ? (
              snap.data() as {
                masteryCutoffs?: { proficient: number; approaching: number };
              }
            ).masteryCutoffs
          : undefined;
        set(c ?? null);
      },
      fail
    )
  );
  const scale = resolveScale(
    settings.scale,
    org.value ?? DEFAULT_PROFICIENCY_SCALE,
    plcCutoffs.value
  );

  const periodSets = useKeyedListener<GradingPeriodSetDoc[]>(
    orgId ?? '',
    (set, fail) =>
      onSnapshot(
        query(
          collection(db, GRADEBOOK_COLLECTIONS.periodSets),
          where('orgId', '==', orgId)
        ),
        (snap) => set(docsOf<GradingPeriodSetDoc>(snap)),
        fail
      )
  );
  const buildingKey = buildingIds.join('|');
  const periods = useMemo(() => {
    const sets = periodSets.value ?? [];
    const buildings = buildingKey ? buildingKey.split('|') : [];
    const match =
      sets.find((s) => s.buildingIds.some((b) => buildings.includes(b))) ??
      null;
    return [...(match?.periods ?? [])].sort((a, b) =>
      a.start.localeCompare(b.start)
    );
  }, [periodSets.value, buildingKey]);

  const error = rows.error || marks.error;
  const loading =
    !rows.loaded ||
    !marks.loaded ||
    !columns.loaded ||
    !classState.loaded ||
    (configKey !== '' && !config.loaded);

  return {
    status: error ? 'error' : loading ? 'loading' : 'ready',
    rows: rows.value ?? [],
    marks: marks.value ?? [],
    columnConfigs: columns.value ?? [],
    classState: classState.value ?? null,
    settings,
    scale,
    periods,
    saveMarks: async (saves, batchId) => {
      if (!uid) return;
      // A history create reads its mark with getAfter, so each mark and its history share a batch.
      for (let i = 0; i < saves.length; i += 100) {
        const batch = writeBatch(db);
        for (const s of saves.slice(i, i + 100)) {
          const id = gradebookDocId(s.mark.sessionId, s.mark.studentUid);
          const markRef = doc(db, GRADEBOOK_COLLECTIONS.marks, id);
          batch.set(markRef, s.mark);
          for (const h of s.history) {
            batch.set(doc(collection(markRef, GRADEBOOK_COLLECTIONS.history)), {
              ...h,
              ownerUid: uid,
              byUid: uid,
              batchId,
            });
          }
        }
        await batch.commit();
      }
    },
    saveColumn: async (cfg) => {
      if (!uid) return;
      await setDoc(doc(db, GRADEBOOK_COLLECTIONS.columns, cfg.sessionId), cfg);
    },
    saveClassState: async (patch) => {
      if (!uid || !rosterId) return;
      await setDoc(
        doc(db, 'users', uid, GRADEBOOK_COLLECTIONS.userClasses, rosterId),
        {
          ...patch,
          rosterId,
          ownerUid: uid,
          editorUids: [],
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    },
  };
}
