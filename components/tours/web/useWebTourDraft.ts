import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GuidedLearningSet } from '@/types';
import { logError } from '@/utils/logError';
import {
  setWebTourCheckRun,
  setWebTourFixes,
  sweepWebTourPictures,
} from '@/components/tours/webTours';
import { webTourEditorDevSeed } from './webEditorDevSeed';
import { saveStepDraft } from './webPictures';
import {
  newTourHistory,
  pushTourEdit,
  stepTourHistory,
  type TourHistory,
} from '@/components/tours/editor/shell/tourHistory';
import type { TourShellSaveState } from '@/components/tours/editor/shell/types';

export const SAVE_DELAY_MS = 800;

type Update = (s: GuidedLearningSet) => GuidedLearningSet;

/** Fields saved on their own (check runs, fixes, picture confirms); undo never rolls them back. */
const keepOnUndo = (
  restored: GuidedLearningSet,
  now: GuidedLearningSet
): GuidedLearningSet => {
  const out: GuidedLearningSet = { ...restored };
  for (const key of [
    'webTourChecked',
    'webSuggestions',
    'webFixDismissed',
    'webPicturesChecked',
  ] as const) {
    if (now[key] === undefined) delete out[key];
    else (out as unknown as Record<string, unknown>)[key] = now[key];
  }
  return out;
};

// Every file a version uses, its uncropped capture included, so the sweeps cover captures too.
const picturePaths = (set: GuidedLearningSet): string[] =>
  set.steps.flatMap((s) => {
    const p = s.web?.picture;
    if (!p) return [];
    return p.original ? [p.path, p.original.path] : [p.path];
  });

/** Clears out the tour's unused pictures; never in the dev harness, which has no Storage. */
const sweep = (
  setId: string,
  opts: Parameters<typeof sweepWebTourPictures>[1]
): Promise<void> =>
  webTourEditorDevSeed()
    ? Promise.resolve()
    : sweepWebTourPictures(setId, opts).then(
        () => undefined,
        (err: unknown) => logError('web tour picture sweep', err, { setId })
      );

/** A web tour draft being edited: undoable edits, debounced autosave, and the side saves that never count as edits. */
export function useWebTourDraft(initial: GuidedLearningSet) {
  const [set, setSet] = useState<GuidedLearningSet>(initial);
  const [saveState, setSaveState] = useState<TourShellSaveState>('saved');
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const latest = useRef(set);
  const dirty = useRef(false);
  const deleted = useRef(false);
  const history = useRef<TourHistory<GuidedLearningSet>>(newTourHistory());
  // Every picture an earlier version in this session used; once the editor closes, undo can't bring them back.
  const replaced = useRef(new Set<string>());

  const pushHistory = (prev: GuidedLearningSet, coalesce?: string) => {
    picturePaths(prev).forEach((p) => replaced.current.add(p));
    const h = pushTourEdit(history.current, prev, coalesce, Date.now());
    history.current = h;
    setDepth({ past: h.past.length, future: 0 });
  };

  useLayoutEffect(() => {
    latest.current = set;
  }, [set]);

  const markDirty = (next: GuidedLearningSet) => {
    latest.current = next;
    dirty.current = true;
    setSaveState('saving');
    setSet(next);
  };

  // Built on the latest set, so a step the recorder just added is never overwritten.
  const change = (update: Update, coalesce?: string) => {
    const prev = latest.current;
    const next = update(prev);
    if (next === prev) return;
    pushHistory(prev, coalesce);
    markDirty(next);
  };

  const restore = (from: 'past' | 'future') => {
    const stepped = stepTourHistory(history.current, from, latest.current);
    if (!stepped) return;
    history.current = stepped.history;
    setDepth({
      past: stepped.history.past.length,
      future: stepped.history.future.length,
    });
    markDirty(keepOnUndo(stepped.value, latest.current));
  };

  // Debounced draft save while the admin edits.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      if (deleted.current) return;
      dirty.current = false;
      saveStepDraft(set).then(
        () => {
          if (!dirty.current) setSaveState('saved');
        },
        (err: unknown) => {
          logError('web tour draft save', err, { setId: set.id });
          setSaveState('error');
        }
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [set]);

  // Opening sweeps pictures an earlier session left behind (a tab closed without Close).
  useEffect(() => {
    void sweep(initial.id, { keep: picturePaths(initial) });
  }, [initial]);

  // Closing saves the last change, then deletes pictures only the closed undo history used.
  useEffect(
    () => () => {
      if (deleted.current) return;
      const last = latest.current;
      const saving = dirty.current ? saveStepDraft(last) : Promise.resolve();
      dirty.current = false;
      saving.then(
        () =>
          deleted.current
            ? undefined
            : sweep(last.id, {
                keep: picturePaths(last),
                replaced: replaced.current,
              }),
        (err: unknown) =>
          logError('web tour draft save', err, { setId: last.id })
      );
    },
    []
  );

  /** Saves `next` now, as an undoable edit unless `edit` is false. */
  const saveNow = async (next: GuidedLearningSet, edit = true) => {
    if (edit && next !== latest.current) pushHistory(latest.current);
    latest.current = next;
    dirty.current = false;
    setSet(next);
    setSaveState('saving');
    try {
      await saveStepDraft(next);
      if (!dirty.current) setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      throw err;
    }
  };

  // Write with Claude reads the saved draft, so it saves first.
  const flush = async () => {
    if (deleted.current) throw new Error('Tour deleted');
    if (!dirty.current) return latest.current;
    await saveNow(latest.current, false);
    return latest.current;
  };

  // Check results save on their own, so a check never counts as an edit of the published tour.
  const saveCheck = (update: Update) => {
    const next = update(latest.current);
    if (next === latest.current || !next.webTourChecked || deleted.current)
      return;
    latest.current = next;
    setSet(next);
    void setWebTourCheckRun(next.id, next.webTourChecked).catch(
      (err: unknown) => logError('web tour check save', err, { setId: next.id })
    );
  };

  // Suggested fixes and dismissals save on their own too; using one is an edit.
  const saveFixes = (update: Update) => {
    const next = update(latest.current);
    if (next === latest.current || deleted.current) return;
    latest.current = next;
    setSet(next);
    void setWebTourFixes(next).catch((err: unknown) =>
      logError('web tour fixes save', err, { setId: next.id })
    );
  };

  return {
    set,
    latest,
    deleted,
    saveState,
    change,
    saveNow,
    flush,
    saveCheck,
    saveFixes,
    /** Stops any pending save, before Delete. */
    drop: () => {
      deleted.current = true;
      dirty.current = false;
    },
    /** Lets saves run again after a Delete that failed. */
    undrop: () => {
      deleted.current = false;
    },
    /** Every picture a draft in the undo history uses, so publishing never deletes one undo can bring back. */
    historyPicturePaths: (): string[] => {
      const h = history.current;
      return [...h.past, ...h.future].flatMap(picturePaths);
    },
    /** After a publish: deletes the tour's pictures nothing uses, keeping what undo can still bring back. */
    sweepAfterPublish: () => {
      const h = history.current;
      return sweep(latest.current.id, {
        keep: [...h.past, ...h.future, latest.current].flatMap(picturePaths),
      });
    },
    undo: () => restore('past'),
    redo: () => restore('future'),
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
