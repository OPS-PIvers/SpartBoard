import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { ClassRoster, Student } from '@/types';
import {
  computeOverall,
  gradebookDocId,
  isPublishedFor,
  resolveFinalScore,
  type GradebookColumnConfig,
  type GradebookHistoryField,
  type GradebookMark,
  type GradeIndexRow,
  type OverallCell,
  type OverallResult,
} from '@/utils/gradebook/gradebookCore';
import {
  DEFAULT_GRADEBOOK_SORT,
  buildColumns,
  columnInPeriod,
  periodForDate,
  sortStudents,
  studentName,
} from '@/utils/gradebook/gradebookModel';
import {
  newColumnConfig,
  type GradebookHistoryDraft,
  type GradebookSource,
} from '@/hooks/useGradebookSource';
import {
  GradebookContext,
  type GradebookCell,
  type GradebookContextValue,
  type GradebookFilters,
  type GradebookMarkWriter,
  type GradebookPopover,
  type GradebookStudentRow,
  type GradebookViewState,
  type MarkPatch,
} from './GradebookContext';

const PRIVACY_KEY = 'gradebook-privacy';
const TINT_KEY = 'gradebook-tint';

function readStorage(store: 'session' | 'local', key: string): boolean {
  try {
    const s = store === 'session' ? window.sessionStorage : window.localStorage;
    return s.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeStorage(store: 'session' | 'local', key: string, on: boolean) {
  try {
    const s = store === 'session' ? window.sessionStorage : window.localStorage;
    if (on) s.setItem(key, '1');
    else s.removeItem(key);
  } catch {
    // Storage can be blocked; the toggle still works for this page.
  }
}

const PATCH_FIELD: Record<keyof MarkPatch, GradebookHistoryField> = {
  override: 'override',
  comment: 'comment',
  flags: 'flags',
  suppressedAuto: 'flags',
  publishOverride: 'publish',
};

const newBatchId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b${Date.now()}${Math.random().toString(36).slice(2)}`;

interface UndoStep {
  at: number;
  label: string;
  field: GradebookHistoryField | null;
  before: GradebookMark[];
}

interface GradebookProviderProps {
  uid: string;
  source: GradebookSource;
  roster: ClassRoster;
  rosters: ClassRoster[];
  studentByUid: ReadonlyMap<string, Student>;
  toast: (message: string, undo?: () => void) => void;
  /** Fixed clock for fixtures and tests. */
  now?: number;
  children: React.ReactNode;
}

export const GradebookProvider: React.FC<GradebookProviderProps> = ({
  uid,
  source,
  roster,
  rosters,
  studentByUid,
  toast,
  now: fixedNow,
  children,
}) => {
  const rosterId = roster.id;
  const { settings, periods, classState } = source;
  const [now] = useState(() => fixedNow ?? Date.now());

  const [privacy, setPrivacyState] = useState(() =>
    readStorage('session', PRIVACY_KEY)
  );
  const setPrivacy = useCallback((on: boolean) => {
    writeStorage('session', PRIVACY_KEY, on);
    setPrivacyState(on);
  }, []);
  const [tint, setTint] = useState(() => readStorage('local', TINT_KEY));

  // Local view state wins until the class-state doc echoes it back.
  const [localView, setLocalView] = useState<{
    rosterId: string;
    patch: Partial<GradebookViewState>;
  }>({ rosterId, patch: {} });
  const viewPatch = localView.rosterId === rosterId ? localView.patch : {};
  const view: GradebookViewState = {
    cellFormat: viewPatch.cellFormat ?? classState?.cellFormat ?? 'percent',
    nameFormat: viewPatch.nameFormat ?? classState?.nameFormat ?? 'last-first',
    sort: viewPatch.sort ?? classState?.sort ?? DEFAULT_GRADEBOOK_SORT,
    tint,
  };
  const saveClassState = source.saveClassState;
  const setView = useCallback(
    (patch: Partial<GradebookViewState>) => {
      const { tint: nextTint, ...rest } = patch;
      if (nextTint !== undefined) {
        writeStorage('local', TINT_KEY, nextTint);
        setTint(nextTint);
      }
      if (Object.keys(rest).length === 0) return;
      setLocalView((prev) => ({
        rosterId,
        patch: {
          ...(prev.rosterId === rosterId ? prev.patch : {}),
          ...rest,
        },
      }));
      saveClassState(rest).catch(() =>
        toast('Could not save the view for this class')
      );
    },
    [rosterId, saveClassState, toast]
  );

  const [filterState, setFilterState] = useState<{
    rosterId: string;
    filters: GradebookFilters;
  }>({
    rosterId,
    filters: { categoryId: null, kind: null, needsGrading: false },
  });
  const filters = useMemo<GradebookFilters>(
    () =>
      filterState.rosterId === rosterId
        ? filterState.filters
        : { categoryId: null, kind: null, needsGrading: false },
    [filterState, rosterId]
  );
  const setFilters = useCallback(
    (patch: Partial<GradebookFilters>) =>
      setFilterState((prev) => ({
        rosterId,
        filters: {
          ...(prev.rosterId === rosterId
            ? prev.filters
            : { categoryId: null, kind: null, needsGrading: false }),
          ...patch,
        },
      })),
    [rosterId]
  );

  const defaultPeriodId = periodForDate(periods, now)?.id ?? null;
  const [chosenPeriod, setChosenPeriod] = useState<{
    id: string | null;
    chosen: boolean;
  }>({ id: null, chosen: false });
  const periodId = chosenPeriod.chosen ? chosenPeriod.id : defaultPeriodId;
  const period = periods.find((p) => p.id === periodId) ?? null;
  const setPeriodId = useCallback(
    (id: string | null) => setChosenPeriod({ id, chosen: true }),
    []
  );

  const rowsByKey = useMemo(() => {
    const m = new Map<string, GradeIndexRow>();
    for (const r of source.rows)
      m.set(gradebookDocId(r.sessionId, r.studentUid), r);
    return m;
  }, [source.rows]);
  const marksByKey = useMemo(() => {
    const m = new Map<string, GradebookMark>();
    for (const k of source.marks)
      m.set(gradebookDocId(k.sessionId, k.studentUid), k);
    return m;
  }, [source.marks]);
  const configsById = useMemo(() => {
    const m = new Map<string, GradebookColumnConfig>();
    for (const c of source.columnConfigs) m.set(c.sessionId, c);
    return m;
  }, [source.columnConfigs]);

  const allColumns = useMemo(
    () =>
      buildColumns(source.rows, configsById, marksByKey, rosterId, settings),
    [source.rows, configsById, marksByKey, rosterId, settings]
  );
  const periodColumns = useMemo(
    () => allColumns.filter((c) => columnInPeriod(c, period)),
    [allColumns, period]
  );
  const columns = useMemo(
    () =>
      periodColumns.filter(
        (c) =>
          !c.hidden &&
          (!filters.categoryId ||
            (!c.completionOnly && c.categoryId === filters.categoryId)) &&
          (!filters.kind || c.kind === filters.kind) &&
          (!filters.needsGrading || c.ungradedCount > 0)
      ),
    [periodColumns, filters]
  );
  const columnById = useMemo(
    () => new Map(allColumns.map((c) => [c.sessionId, c])),
    [allColumns]
  );

  const computeCell = useCallback(
    (sessionId: string, studentUid: string): GradebookCell => {
      const key = gradebookDocId(sessionId, studentUid);
      const row = rowsByKey.get(key) ?? null;
      const mark = marksByKey.get(key) ?? null;
      const column = columnById.get(sessionId);
      const config =
        column?.config ??
        (column
          ? newColumnConfig({ kind: column.kind, sessionId, ownerUid: uid })
          : null);
      const final = resolveFinalScore(
        row,
        mark,
        // A cell with no row (or no max) borrows the column's max so a valued flag can score it.
        config && column?.max && !config.maxPointsOverride && !row?.max
          ? { ...config, maxPointsOverride: column.max }
          : config,
        { flagDefs: settings.flags, autoFlags: settings.autoFlags, now }
      );
      return {
        sessionId,
        studentUid,
        row,
        mark,
        final,
        published: row ? isPublishedFor(row, mark) : false,
      };
    },
    [rowsByKey, marksByKey, columnById, settings, now, uid]
  );
  const cells = useMemo(() => {
    const m = new Map<string, GradebookCell>();
    for (const studentUid of studentByUid.keys()) {
      for (const c of allColumns) {
        m.set(
          gradebookDocId(c.sessionId, studentUid),
          computeCell(c.sessionId, studentUid)
        );
      }
    }
    return m;
  }, [studentByUid, allColumns, computeCell]);
  const getCell = useCallback(
    (sessionId: string, studentUid: string): GradebookCell =>
      cells.get(gradebookDocId(sessionId, studentUid)) ??
      computeCell(sessionId, studentUid),
    [cells, computeCell]
  );

  const overallByUid = useMemo(() => {
    const m = new Map<string, OverallResult>();
    for (const studentUid of studentByUid.keys()) {
      const list: OverallCell[] = periodColumns.map((c) => ({
        final: getCell(c.sessionId, studentUid).final,
        category: c.categoryId,
        countsTowardOverall: c.config?.countsTowardOverall ?? true,
      }));
      m.set(
        studentUid,
        computeOverall(list, settings.categoriesEnabled, settings.categories)
      );
    }
    return m;
  }, [studentByUid, periodColumns, getCell, settings]);
  const overall = useCallback(
    (studentUid: string): OverallResult =>
      overallByUid.get(studentUid) ?? { pct: null, points: 0, max: 0 },
    [overallByUid]
  );

  const baseStudents = useMemo(() => {
    const out: Omit<GradebookStudentRow, 'displayName' | 'missing'>[] = [];
    for (const [studentUid, student] of studentByUid) {
      out.push({
        uid: studentUid,
        firstName: student.firstName,
        lastName: student.lastName,
        student,
      });
    }
    return out;
  }, [studentByUid]);

  const missingCount = useCallback(
    (studentUid: string) =>
      periodColumns.filter((c) =>
        getCell(c.sessionId, studentUid).final.flags.some(
          (f) => f.id === 'missing'
        )
      ).length,
    [periodColumns, getCell]
  );

  const students = useMemo(() => {
    const groups = roster.groups ?? [];
    const withMeta: GradebookStudentRow[] = baseStudents.map((s) => ({
      ...s,
      displayName: studentName(s, view.nameFormat),
      missing: missingCount(s.uid),
    }));
    const missingByUid = new Map(withMeta.map((s) => [s.uid, s.missing]));
    return sortStudents(withMeta, view.sort, {
      overall: (u) => overall(u).pct,
      column: (sessionId, u) => {
        const f = getCell(sessionId, u).final;
        return f.status === 'scored' ? f.pct : null;
      },
      missing: (u) => missingByUid.get(u) ?? 0,
      hasFlag: (flagId, u) =>
        periodColumns.filter((c) =>
          getCell(c.sessionId, u).final.flags.some((f) => f.id === flagId)
        ).length,
      inGroup: (groupId, u) => {
        const sid = studentByUid.get(u)?.id;
        const g = groups.find((x) => x.id === groupId);
        return Boolean(sid && g?.studentIds.includes(sid));
      },
    });
  }, [
    baseStudents,
    view.nameFormat,
    view.sort,
    missingCount,
    overall,
    getCell,
    periodColumns,
    roster.groups,
    studentByUid,
  ]);

  // ---- Mark writes, history and undo (D9, D24) ----
  const undoStack = useRef<UndoStep[]>([]);
  const [undoTop, setUndoTop] = useState({ depth: 0, at: 0 });
  const syncUndoTop = useCallback(() => {
    const s = undoStack.current;
    setUndoTop({ depth: s.length, at: s[s.length - 1]?.at ?? 0 });
  }, []);
  const saveMarks = source.saveMarks;

  const baseMark = useCallback(
    (sessionId: string, studentUid: string): GradebookMark => {
      const key = gradebookDocId(sessionId, studentUid);
      const existing = marksByKey.get(key);
      if (existing) return existing;
      const row = rowsByKey.get(key);
      const kind = row?.kind ?? columnById.get(sessionId)?.kind ?? 'quiz';
      return {
        kind,
        sessionId,
        studentUid,
        ownerUid: uid,
        editorUids: [],
        rosterIds: row?.rosterIds.length
          ? row.rosterIds.slice(0, 20)
          : [rosterId],
        override: null,
        comment: null,
        flags: [],
        suppressedAuto: [],
        publishOverride: null,
        updatedAt: 0,
      };
    },
    [marksByKey, rowsByKey, columnById, uid, rosterId]
  );

  const writeMarks = useCallback(
    async (
      items: { before: GradebookMark; after: GradebookMark }[],
      field: GradebookHistoryField | null,
      batchId: string | null
    ) => {
      const at = Date.now();
      await saveMarks(
        items.map(({ before, after }) => {
          const changed = (
            Object.keys(PATCH_FIELD) as (keyof MarkPatch)[]
          ).filter(
            (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
          );
          // A forced field (a fill) logs one entry holding every changed key.
          const history: GradebookHistoryDraft[] = field
            ? changed.length
              ? [
                  {
                    at,
                    field,
                    before: Object.fromEntries(
                      changed.map((k) => [k, before[k]])
                    ),
                    after: Object.fromEntries(
                      changed.map((k) => [k, after[k]])
                    ),
                  },
                ]
              : []
            : changed.map((k) => ({
                at,
                field: PATCH_FIELD[k],
                before: { [k]: before[k] },
                after: { [k]: after[k] },
              }));
          return { mark: { ...after, updatedAt: at }, history };
        }),
        batchId
      );
    },
    [saveMarks]
  );

  const undo = useCallback(async () => {
    const step = undoStack.current.pop();
    syncUndoTop();
    if (!step) return;
    const pairs = step.before.map((b) => ({
      before: baseMark(b.sessionId, b.studentUid),
      after: b,
    }));
    try {
      await writeMarks(
        pairs,
        step.field,
        pairs.length > 1 ? newBatchId() : null
      );
      toast('Undone');
    } catch {
      undoStack.current.push(step);
      syncUndoTop();
      toast('Could not undo that change');
    }
  }, [baseMark, writeMarks, toast, syncUndoTop]);

  const applyPatches = useCallback(
    async (
      items: { sessionId: string; studentUid: string; patch: MarkPatch }[],
      field: GradebookHistoryField | null,
      label: string | null
    ) => {
      const pairs = items.map(({ sessionId, studentUid, patch }) => {
        const before = baseMark(sessionId, studentUid);
        return { before, after: { ...before, ...patch } };
      });
      const batchId = pairs.length > 1 ? newBatchId() : null;
      try {
        await writeMarks(pairs, field, batchId);
      } catch {
        toast('Could not save that change');
        return;
      }
      undoStack.current.push({
        at: Date.now(),
        label: label ?? 'Change',
        field,
        before: pairs.map((p) => p.before),
      });
      syncUndoTop();
      if (label) toast(label, () => void undo());
    },
    [baseMark, writeMarks, toast, undo, syncUndoTop]
  );

  const toggleFlag = useCallback(
    async (sessionId: string, studentUid: string, flagId: string) => {
      const def = settings.flags.find((f) => f.id === flagId);
      if (!def || def.visibility === 'off') return;
      const cell = getCell(sessionId, studentUid);
      if (cell.final.status === 'not-assigned') return;
      const mark = baseMark(sessionId, studentUid);
      const active = cell.final.flags.find((f) => f.id === flagId);
      const name = studentByUid.get(studentUid)?.firstName ?? '';
      let patch: MarkPatch;
      let label: string;
      if (active) {
        patch = active.auto
          ? { suppressedAuto: [...new Set([...mark.suppressedAuto, flagId])] }
          : { flags: mark.flags.filter((f) => f !== flagId) };
        label = `Cleared ${def.name} for ${name}`;
      } else {
        patch = {
          flags: [...mark.flags, flagId],
          suppressedAuto: mark.suppressedAuto.filter((f) => f !== flagId),
        };
        label = `Marked ${def.name} for ${name}`;
      }
      await applyPatches([{ sessionId, studentUid, patch }], 'flags', label);
    },
    [settings.flags, getCell, baseMark, studentByUid, applyPatches]
  );

  const marks: GradebookMarkWriter = useMemo(
    () => ({
      update: (sessionId, studentUid, patch, opts) =>
        applyPatches(
          [{ sessionId, studentUid, patch }],
          opts?.field ?? null,
          opts?.label ?? null
        ),
      bulk: (items, opts) => applyPatches(items, opts.field, opts.label),
      toggleFlag,
      undo,
      canUndo: undoTop.depth > 0,
      lastUndoAt: undoTop.at,
    }),
    [applyPatches, toggleFlag, undo, undoTop]
  );

  const saveColumn = source.saveColumn;
  const updateColumn = useCallback(
    async (sessionId: string, patch: Partial<GradebookColumnConfig>) => {
      const column = columnById.get(sessionId);
      if (!column) return;
      const base =
        column.config ??
        newColumnConfig({ kind: column.kind, sessionId, ownerUid: uid });
      await saveColumn({
        ...base,
        ...patch,
        kind: base.kind,
        sessionId,
        ownerUid: base.ownerUid,
        editorUids: base.editorUids,
        updatedAt: Date.now(),
      });
    },
    [columnById, saveColumn, uid]
  );

  const [popover, setPopover] = useState<GradebookPopover>(null);
  const openCell = useCallback(
    (sessionId: string, studentUid: string, prefill?: string) =>
      setPopover({
        type: 'cell',
        sessionId,
        studentUid,
        prefill: prefill ?? null,
      }),
    []
  );
  const openHeader = useCallback(
    (sessionId: string) => setPopover({ type: 'header', sessionId }),
    []
  );
  const closePopover = useCallback(() => setPopover(null), []);

  const value: GradebookContextValue = {
    rosterId,
    roster,
    rosters,
    status: source.status,
    settings,
    scale: source.scale,
    classState,
    periods,
    periodId,
    setPeriodId,
    students,
    columns,
    allColumns,
    getCell,
    overall,
    now,
    privacy,
    setPrivacy,
    view,
    setView,
    filters,
    setFilters,
    marks,
    updateColumn,
    popover,
    openCell,
    openHeader,
    closePopover,
    toast,
  };

  return (
    <GradebookContext.Provider value={value}>
      {children}
    </GradebookContext.Provider>
  );
};
