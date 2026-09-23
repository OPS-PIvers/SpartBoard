import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions {
  /**
   * The draft's fields, as a dependency-array-shaped value. Outstanding work is
   * measured against what was last written rather than against what the editor
   * opened with, so a field edited, autosaved, and then typed back to its
   * original wording is still owed a write. A caller's `isDirty` cannot do that
   * job — its baseline goes stale the moment autosave persists anything.
   */
  draftToken: unknown;
  /**
   * Identifies what is being edited. When it changes the editor has been
   * pointed at a different record, so the baseline moves to the incoming
   * draft and an untouched record is never written back.
   */
  resetKey?: unknown;
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

// Element-wise, so a scalar field typed back to its original value is clean
// again; a nested edit yields a fresh array and still counts as outstanding.
const sameDraft = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
    return false;
  return a.every((value, i) => Object.is(value, b[i]));
};

/**
 * Debounced autosave for an editor that owns its draft state.
 *
 * Saves once the draft has been still for `delayMs`, never runs two writes at
 * once, and re-runs if edits landed while a write was in flight.
 */
export const useAutosave = ({
  draftToken,
  resetKey,
  enabled,
  delayMs = DEFAULT_DELAY_MS,
  onSave,
}: UseAutosaveOptions): AutosaveController => {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  // Bumped after each write so the scheduling effect re-runs and can queue
  // another pass when edits arrived while that write was in flight.
  const [cycle, setCycle] = useState(0);

  // The draft as it stood when the last write started, seeded with the draft
  // the editor opened on so an untouched record is never written back. Held as
  // state because `outstanding` is read during render, and mirrored into a ref
  // because `flush` has to read it synchronously mid-promise.
  const [savedToken, setSavedToken] = useState<unknown>(draftToken);
  const savedTokenRef = useRef<unknown>(draftToken);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  const onSaveRef = useRef(onSave);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const enabledRef = useRef(enabled);
  const draftTokenRef = useRef(draftToken);
  // Set synchronously inside the write; `status` lags it by a React render, so
  // reading that instead would call a just-failed write a success.
  const lastWriteOkRef = useRef(true);
  // What the footer should fall back to when a scheduled write is called off.
  const settledStatusRef = useRef<AutosaveStatus>('idle');
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
    onSaveRef.current = onSave;
    enabledRef.current = enabled;
    draftTokenRef.current = draftToken;
  });

  if (!Object.is(resetKey, prevResetKey)) {
    setPrevResetKey(resetKey);
    setSavedToken(draftToken);
    savedTokenRef.current = draftToken;
    // A different record starts clean, so the previous one's failure must not
    // follow it here and leave it reading "Couldn't save" untouched.
    setStatus('idle');
    setError(null);
    lastWriteOkRef.current = true;
    settledStatusRef.current = 'idle';
  }

  const runSave = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    savedTokenRef.current = draftTokenRef.current;
    setSavedToken(draftTokenRef.current);
    setStatus('saving');
    const run = (async () => {
      try {
        await onSaveRef.current();
        lastWriteOkRef.current = true;
        settledStatusRef.current = 'saved';
        setError(null);
        setStatus('saved');
      } catch (err) {
        console.error('Autosave failed.', err);
        lastWriteOkRef.current = false;
        settledStatusRef.current = 'error';
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

  const outstanding = !sameDraft(draftToken, savedToken);

  useEffect(() => {
    if (!enabled || !outstanding) {
      // An edit that was undone before the quiet period elapsed: drop the
      // "Unsaved changes" the scheduled write had already put on the footer.
      setStatus((current) =>
        current === 'pending' ? settledStatusRef.current : current
      );
      return undefined;
    }
    // Skipping the no-op update saves a commit per keystroke.
    if (statusRef.current !== 'pending' && statusRef.current !== 'saving') {
      setStatus((current) => (current === 'saving' ? current : 'pending'));
    }
    const timer = window.setTimeout(() => void runSave(), delayMs);
    return () => window.clearTimeout(timer);
    // `draftToken` restarts the quiet period on every edit; `cycle` re-checks
    // once a write settles, in case the draft moved on while it was running.
  }, [enabled, outstanding, draftToken, delayMs, cycle, runSave]);

  const flush = useCallback(async (): Promise<boolean> => {
    // Wait out an in-flight write first — it may be persisting stale content.
    if (inFlightRef.current) await inFlightRef.current;
    if (!enabledRef.current) return true;
    const unsaved = !sameDraft(draftTokenRef.current, savedTokenRef.current);
    if (!unsaved && lastWriteOkRef.current) return true;
    await runSave();
    return lastWriteOkRef.current;
  }, [runSave]);

  const hasUnsavedWork = status === 'error' || outstanding;

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
