import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  GuidedLearningTourBinding,
} from '@/types';
import { saveBuildingSetDoc } from '@/hooks/useGuidedLearning';
import { GuidedLearningSaveConflictError } from '@/components/widgets/GuidedLearning/utils/saveConflict';
import {
  getTourEdit,
  setTourEdit,
  useTourEditTarget,
  selectTourEditStep,
  type TourEditTarget,
} from './tourEditStore';

export type TourEditorSaveState = 'saved' | 'saving' | 'error' | 'conflict';

/** Delay after the last edit before the draft is written. */
export const AUTOSAVE_MS = 800;
/** Edits to the same field this close together undo as one. */
const COALESCE_MS = 1000;
const HISTORY_LIMIT = 50;

export interface TourEditorSession {
  set: GuidedLearningSet;
  selected: number;
  select: (index: number) => void;
  updateStep: (
    stepId: string,
    patch: Partial<GuidedLearningStep>,
    /** Field name, so a run of keystrokes undoes in one step. */
    coalesce?: string
  ) => void;
  /** Replaces a step's binding; undefined makes it a plain step. */
  setBinding: (
    stepId: string,
    binding: GuidedLearningTourBinding | undefined
  ) => void;
  /** Inserts a step after `afterStepId` (or first when null) and selects it. */
  insertStepAfter: (
    afterStepId: string | null,
    step?: Partial<GuidedLearningStep>
  ) => GuidedLearningStep;
  deleteStep: (stepId: string) => void;
  moveStep: (stepId: string, toIndex: number) => void;
  updateSet: (patch: Partial<GuidedLearningSet>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: TourEditorSaveState;
  /** Writes any unsaved edits now; false when the draft could not be saved. */
  flush: () => Promise<boolean>;
}

/** A new tour step: bound to nothing yet, waiting for its click. */
export const newTourStep = (
  patch: Partial<GuidedLearningStep> = {}
): GuidedLearningStep => ({
  id: crypto.randomUUID(),
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'text-popover',
  tour: { anchor: '', action: 'click' },
  ...patch,
});

const stepOrder = (set: GuidedLearningSet) =>
  set.steps.map((s) => s.id).join('\n');

/** The selection that keeps `stepId` selected in `next`, else the nearest step. */
const reselect = (
  next: GuidedLearningSet,
  stepId: string | undefined,
  fallback: number
): number => {
  const at = stepId ? next.steps.findIndex((s) => s.id === stepId) : -1;
  if (at >= 0) return at;
  return Math.min(Math.max(fallback, 0), Math.max(next.steps.length - 1, 0));
};

/** Applies an edit: history, selection, and a replay when the step order changed. */
const applyEdit = (
  cur: TourEditTarget,
  next: GuidedLearningSet,
  selectId?: string
): TourEditTarget => {
  const keepId = selectId ?? cur.set.steps[cur.selected]?.id;
  const selected = reselect(next, keepId, cur.selected);
  const reordered = stepOrder(next) !== stepOrder(cur.set);
  return {
    ...cur,
    set: next,
    selected,
    replay: reordered ? cur.replay + 1 : cur.replay,
  };
};

/** The board editor's draft: edits, undo, and debounced autosave to the set doc. */
export function useTourEditorSession(): TourEditorSession | null {
  const target = useTourEditTarget();
  const history = useRef({
    past: [] as GuidedLearningSet[],
    future: [] as GuidedLearningSet[],
    last: null as { key: string; at: number } | null,
  });
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const [saveState, setSaveState] = useState<TourEditorSaveState>('saved');

  // The last revision written, so each save conflicts with edits made elsewhere.
  const opened = getTourEdit()?.set ?? null;
  const saved = useRef<{ set: GuidedLearningSet | null; updatedAt?: number }>({
    set: opened,
    updatedAt: opened?.updatedAt,
  });
  const saving = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);

  const commit = useCallback(
    (
      build: (set: GuidedLearningSet) => GuidedLearningSet | null,
      opts: { coalesce?: string; selectId?: string } = {}
    ) => {
      const cur = getTourEdit();
      if (!cur) return;
      const next = build(cur.set);
      if (!next || next === cur.set) return;
      const h = history.current;
      const now = Date.now();
      const merge =
        !!opts.coalesce &&
        h.last?.key === opts.coalesce &&
        now - h.last.at < COALESCE_MS;
      if (!merge) h.past = [...h.past, cur.set].slice(-HISTORY_LIMIT);
      h.last = opts.coalesce ? { key: opts.coalesce, at: now } : null;
      h.future = [];
      setTourEdit(applyEdit(cur, next, opts.selectId));
      setDepth({ past: h.past.length, future: 0 });
    },
    []
  );

  // The newest draft, kept after the editor closes so the closing save still has it.
  const lastSet = useRef<GuidedLearningSet | null>(opened);

  const save = useCallback(async (): Promise<boolean> => {
    while (saving.current) await saving.current;
    const set = getTourEdit()?.set ?? lastSet.current;
    if (!set || blocked.current) return false;
    if (set === saved.current.set) return true;
    const updatedAt = Date.now();
    setSaveState('saving');
    let ok = false;
    const run = saveBuildingSetDoc(
      { ...set, updatedAt },
      { expectedUpdatedAt: saved.current.updatedAt }
    )
      .then(() => {
        ok = true;
        saved.current = { set, updatedAt };
        setSaveState(lastSet.current === set ? 'saved' : 'saving');
      })
      .catch((err: unknown) => {
        if (err instanceof GuidedLearningSaveConflictError) {
          // Someone else saved this tour; stop before overwriting their work.
          blocked.current = true;
          setSaveState('conflict');
        } else {
          console.error('Tour editor: save failed', err);
          setSaveState('error');
        }
      })
      .finally(() => {
        saving.current = null;
      });
    saving.current = run;
    await run;
    return ok;
  }, []);

  const draft = target?.set;
  useEffect(() => {
    if (draft) lastSet.current = draft;
  }, [draft]);
  useEffect(() => {
    if (!draft || draft === saved.current.set || blocked.current) return;
    const id = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [draft, save]);

  // Closing the editor writes whatever is still pending.
  useEffect(
    () => () => {
      void save();
    },
    [save]
  );

  const step = useCallback(
    (
      stepId: string,
      change: (s: GuidedLearningStep) => GuidedLearningStep,
      coalesce?: string
    ) =>
      commit(
        (set) => {
          const at = set.steps.findIndex((s) => s.id === stepId);
          if (at < 0) return null;
          const steps = [...set.steps];
          steps[at] = change(steps[at]);
          return { ...set, steps };
        },
        { coalesce: coalesce ? `${stepId}:${coalesce}` : undefined }
      ),
    [commit]
  );

  const restore = (from: 'past' | 'future') => {
    const cur = getTourEdit();
    const h = history.current;
    const stack = h[from];
    const prev = stack[stack.length - 1];
    if (!cur || !prev) return;
    h[from] = stack.slice(0, -1);
    const other = from === 'past' ? 'future' : 'past';
    h[other] = [...h[other], cur.set];
    h.last = null;
    setTourEdit(applyEdit(cur, prev));
    setDepth({ past: h.past.length, future: h.future.length });
  };

  if (!target) return null;
  return {
    set: target.set,
    selected: target.selected,
    select: selectTourEditStep,
    updateStep: (stepId, patch, coalesce) =>
      step(stepId, (s) => ({ ...s, ...patch }), coalesce),
    setBinding: (stepId, binding) =>
      step(stepId, (s) => {
        const next = { ...s };
        if (binding) next.tour = binding;
        else delete next.tour;
        return next;
      }),
    insertStepAfter: (afterStepId, patch) => {
      const created = newTourStep(patch);
      commit(
        (set) => {
          const at = afterStepId
            ? set.steps.findIndex((s) => s.id === afterStepId) + 1
            : 0;
          const steps = [...set.steps];
          steps.splice(at, 0, created);
          return { ...set, steps };
        },
        { selectId: created.id }
      );
      return created;
    },
    deleteStep: (stepId) =>
      commit((set) =>
        set.steps.some((s) => s.id === stepId)
          ? { ...set, steps: set.steps.filter((s) => s.id !== stepId) }
          : null
      ),
    moveStep: (stepId, toIndex) =>
      commit((set) => {
        const from = set.steps.findIndex((s) => s.id === stepId);
        const to = Math.min(Math.max(toIndex, 0), set.steps.length - 1);
        if (from < 0 || from === to) return null;
        const steps = [...set.steps];
        const [moved] = steps.splice(from, 1);
        steps.splice(to, 0, moved);
        return { ...set, steps };
      }),
    updateSet: (patch) => commit((set) => ({ ...set, ...patch })),
    undo: () => restore('past'),
    redo: () => restore('future'),
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
    saveState,
    flush: save,
  };
}
