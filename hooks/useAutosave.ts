import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions {
  /** Whether the draft differs from what was last persisted. */
  isDirty: boolean;
  /**
   * Any value whose identity changes on every draft edit. It restarts the
   * quiet period, so continuous typing produces one write instead of one per
   * second. `isDirty` alone can't do this — it stays `true` across keystrokes.
   */
  draftToken: unknown;
  /** Off while the editor can't persist yet (no record, an upload in flight). */
  enabled: boolean;
  /** Quiet period after the last edit. */
  delayMs?: number;
  /** Persists the draft. Must not close the editor. */
  onSave: () => void | Promise<void>;
}

export interface AutosaveController {
  status: AutosaveStatus;
  error: Error | null;
  /**
   * Persists now if anything is outstanding. Resolves `true` when nothing is
   * owed any more, `false` when the write failed.
   */
  flush: () => Promise<boolean>;
  /** True while a write is outstanding or the last one failed. */
  hasUnsavedWork: boolean;
}

const DEFAULT_DELAY_MS = 1200;

/** Sentinel so a token of `undefined` still counts as never written. */
const NEVER_SAVED = Symbol('never-saved');

/**
 * Debounced autosave for an editor that owns its draft state.
 *
 * Saves once the draft has been still for `delayMs`, never runs two writes at
 * once, and re-runs if edits landed while a write was in flight.
 */
export const useAutosave = ({
  isDirty,
  draftToken,
  enabled,
  delayMs = DEFAULT_DELAY_MS,
  onSave,
}: UseAutosaveOptions): AutosaveController => {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  // Bumped after each write so the scheduling effect re-runs and can queue
  // another pass when edits arrived while that write was in flight.
  const [cycle, setCycle] = useState(0);

  const onSaveRef = useRef(onSave);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const isDirtyRef = useRef(isDirty);
  const enabledRef = useRef(enabled);
  const statusRef = useRef(status);
  const draftTokenRef = useRef(draftToken);
  // The draft as it stood when the last write started. An editor whose
  // `isDirty` can't settle back to false — because what it persists is a
  // normalized copy of the draft rather than the draft itself — would
  // otherwise be written again every cycle, forever.
  const savedTokenRef = useRef<unknown>(NEVER_SAVED);
  // Set synchronously inside the write; `status` lags it by a React render, and
  // `flush`'s caller needs the outcome the moment the promise settles.
  const lastWriteOkRef = useRef(true);
  useLayoutEffect(() => {
    onSaveRef.current = onSave;
    isDirtyRef.current = isDirty;
    enabledRef.current = enabled;
    statusRef.current = status;
    draftTokenRef.current = draftToken;
  });

  const runSave = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    savedTokenRef.current = draftTokenRef.current;
    setStatus('saving');
    const run = (async () => {
      try {
        await onSaveRef.current();
        lastWriteOkRef.current = true;
        setError(null);
        setStatus('saved');
      } catch (err) {
        console.error('Autosave failed.', err);
        lastWriteOkRef.current = false;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
      } finally {
        inFlightRef.current = null;
        setCycle((c) => c + 1);
      }
    })();
    inFlightRef.current = run;
    return run;
  }, []);

  const outstanding = isDirty && !Object.is(draftToken, savedTokenRef.current);

  useEffect(() => {
    if (!enabled || !outstanding) return undefined;
    setStatus((current) => (current === 'saving' ? current : 'pending'));
    const timer = window.setTimeout(() => void runSave(), delayMs);
    return () => window.clearTimeout(timer);
    // `draftToken` restarts the quiet period on every edit; `cycle` re-checks
    // once a write settles, in case the draft moved on while it was running.
  }, [enabled, outstanding, draftToken, delayMs, cycle, runSave]);

  const flush = useCallback(async (): Promise<boolean> => {
    // Wait out an in-flight write first — it may be persisting stale content.
    if (inFlightRef.current) await inFlightRef.current;
    if (!enabledRef.current || !isDirtyRef.current) return true;
    const unsaved = !Object.is(draftTokenRef.current, savedTokenRef.current);
    if (!unsaved && statusRef.current !== 'error') return true;
    await runSave();
    return lastWriteOkRef.current;
  }, [runSave]);

  const hasUnsavedWork =
    status === 'error' ||
    ((status === 'pending' || status === 'saving') && outstanding);

  // Last line of defence: a reload or tab close with a write still owed.
  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedWork]);

  return { status, error, flush, hasUnsavedWork };
};
