import { useEffect, useLayoutEffect, useRef } from 'react';
import type { InputSignalCounts } from '@/types';
import {
  InputSignalCollector,
  addSignals,
  readAttemptSignals,
} from '@/utils/inputSignals';
import { isTrustedEvent } from '@/utils/eventTrust';
import { logError } from '@/utils/logError';

export interface UseInputSignalsArgs {
  /** Record: the session asks for it and the attempt is in progress. */
  enabled: boolean;
  /** The response has loaded, so `serverSignals` holds any earlier page load's counts. */
  ready: boolean;
  /** Completed attempts; counters are kept per attempt. */
  attempt: number;
  /** The question on screen; counters are filed under its id. */
  questionId: string | undefined;
  serverSignals: unknown;
  save:
    | ((
        attempt: number,
        counts: Record<string, InputSignalCounts>
      ) => Promise<void>)
    | undefined;
}

const FLUSH_MS = 20_000;
const SCRIPT_TARGETS =
  'button, select, textarea, input:not([type=file]):not([type=color]), [role=button], [role=radio], [role=checkbox], [role=option], [contenteditable=true]';

const isAnswerBox = (target: EventTarget | null): target is HTMLElement => {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement)
    return ['text', 'search', 'number', ''].includes(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
};

const isControl = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(SCRIPT_TARGETS) !== null;

/** Counts how answers are entered and saves the counters to the response; never which keys or what text. */
export function useInputSignals(args: UseInputSignalsArgs): void {
  const { enabled, ready, attempt, questionId } = args;
  const argsRef = useRef(args);
  useLayoutEffect(() => {
    argsRef.current = args;
  });
  const collectorRef = useRef<InputSignalCollector | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  // Outlives a pause and resume, where the response snapshot can lag the last save.
  const writtenRef = useRef<{
    attempt: number;
    counts: Record<string, InputSignalCounts>;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !ready) return;
    const collector = new InputSignalCollector(
      window.matchMedia?.('(pointer: fine)').matches ?? true
    );
    collector.setQuestion(argsRef.current.questionId);
    const base =
      writtenRef.current?.attempt === attempt
        ? writtenRef.current.counts
        : readAttemptSignals(argsRef.current.serverSignals, attempt);
    const flush = () => {
      const save = argsRef.current.save;
      if (!save || !collector.takeDirty()) return;
      const counts = addSignals(base, collector.snapshot());
      writtenRef.current = { attempt, counts };
      save(attempt, counts).catch((err: unknown) =>
        logError('useInputSignals.save', err)
      );
    };
    collectorRef.current = collector;
    flushRef.current = flush;

    const onPointerMove = (e: PointerEvent) => {
      if (!isTrustedEvent(e) || e.pointerType !== 'mouse') return;
      const raw = e.getCoalescedEvents?.() ?? [];
      if (raw.length === 0) collector.pointerMove(e.clientX, e.clientY);
      for (const m of raw) collector.pointerMove(m.clientX, m.clientY);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (isTrustedEvent(e) && e.pointerType === 'mouse' && e.button === 0)
        collector.pointerDown(e.clientX, e.clientY);
    };
    const onClick = (e: MouseEvent) => {
      if (!isTrustedEvent(e) && isControl(e.target)) collector.scripted();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTrustedEvent(e)) {
        if (isControl(e.target)) collector.scripted();
        return;
      }
      if (!isAnswerBox(e.target)) return;
      collector.keyDown({
        code: e.code,
        t: e.timeStamp,
        field: e.target,
        char:
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.repeat &&
          !e.isComposing,
      });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isTrustedEvent(e)) collector.keyUp(e.code, e.timeStamp);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!isTrustedEvent(e)) return;
      collector.paste(
        e.clipboardData?.getData('text/plain').length ?? 0,
        e.timeStamp
      );
    };
    const onDrop = (e: DragEvent) => {
      const text = e.dataTransfer?.getData('text/plain') ?? '';
      if (isTrustedEvent(e) && text && isAnswerBox(e.target))
        collector.paste(text.length, e.timeStamp);
    };
    const onInput = (e: Event) => {
      if (
        !isTrustedEvent(e) ||
        !(e instanceof InputEvent) ||
        !isAnswerBox(e.target)
      )
        return;
      const type = e.inputType;
      const len = e.data === null ? null : [...e.data].length;
      if (type === 'insertFromPaste' || type === 'insertFromDrop') {
        collector.textInput(len, e.timeStamp, 'pasted');
      } else if (type === 'insertText' || type === 'insertCompositionText') {
        collector.textInput(
          len,
          e.timeStamp,
          e.isComposing || type === 'insertCompositionText'
            ? 'composed'
            : 'typed'
        );
      }
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointermove', onPointerMove, opts);
    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('click', onClick, opts);
    document.addEventListener('keydown', onKeyDown, opts);
    document.addEventListener('keyup', onKeyUp, opts);
    document.addEventListener('paste', onPaste, opts);
    document.addEventListener('drop', onDrop, opts);
    document.addEventListener('input', onInput, opts);
    document.addEventListener('visibilitychange', onHidden);
    const id = window.setInterval(flush, FLUSH_MS);
    return () => {
      document.removeEventListener('pointermove', onPointerMove, opts);
      document.removeEventListener('pointerdown', onPointerDown, opts);
      document.removeEventListener('click', onClick, opts);
      document.removeEventListener('keydown', onKeyDown, opts);
      document.removeEventListener('keyup', onKeyUp, opts);
      document.removeEventListener('paste', onPaste, opts);
      document.removeEventListener('drop', onDrop, opts);
      document.removeEventListener('input', onInput, opts);
      document.removeEventListener('visibilitychange', onHidden);
      window.clearInterval(id);
      flush();
      collectorRef.current = null;
      flushRef.current = null;
    };
  }, [enabled, ready, attempt]);

  // Save the question just left, then count under the new one.
  useEffect(() => {
    flushRef.current?.();
    collectorRef.current?.setQuestion(questionId);
  }, [questionId]);
}
