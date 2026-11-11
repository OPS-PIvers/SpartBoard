import { useEffect, useLayoutEffect, useRef } from 'react';
import type { InputSignalCounts } from '@/types';
import {
  InputSignalCollector,
  addSignals,
  otherLogChars,
  readAttemptSignals,
} from '@/utils/inputSignals';
import { WRITING_LOG_BUDGET } from '@/utils/writingLog';
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

/** Long answers keep an edit log for playback; one-line blanks only keep counts. */
const isLongAnswer = (el: HTMLElement): boolean =>
  el instanceof HTMLTextAreaElement || el.isContentEditable;

const answerText = (el: HTMLElement): string =>
  el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    ? el.value
    : el.innerText;

/** A side panel takes at least this much width, in px. */
const PANEL_MIN_PX = 200;

const isControl = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(SCRIPT_TARGETS) !== null;

/** Counts how answers are entered and logs edits to written answers, saved to the response; never keys pressed outside an answer box. */
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
    const base =
      writtenRef.current?.attempt === attempt
        ? writtenRef.current.counts
        : readAttemptSignals(argsRef.current.serverSignals, attempt);
    const logs: Record<string, string> = {};
    let logChars = otherLogChars(argsRef.current.serverSignals, attempt);
    for (const [q, c] of Object.entries(base)) {
      if (!c.log) continue;
      logs[q] = c.log;
      logChars += c.log.length;
    }
    const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? true;
    const collector = new InputSignalCollector(finePointer, {
      logs,
      logRoom: WRITING_LOG_BUDGET - logChars,
    });
    collector.setQuestion(argsRef.current.questionId);
    const visible = () => document.visibilityState === 'visible';
    collector.clock(performance.now(), visible());
    if ((window.screen as Screen & { isExtended?: boolean }).isExtended)
      collector.extraScreen();
    const flush = () => {
      const save = argsRef.current.save;
      collector.clock(performance.now(), visible());
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
    const onBeforeInput = (e: Event) => {
      if (isAnswerBox(e.target))
        collector.primeText(e.target, answerText(e.target));
    };
    const onInput = (e: Event) => {
      if (
        !isTrustedEvent(e) ||
        !(e instanceof InputEvent) ||
        !isAnswerBox(e.target)
      )
        return;
      const type = e.inputType;
      const pasted = type === 'insertFromPaste' || type === 'insertFromDrop';
      collector.textEdit(
        e.target,
        answerText(e.target),
        e.timeStamp,
        pasted ? 'pasted' : 'typed',
        {
          log: isLongAnswer(e.target),
          composing: e.isComposing || type === 'insertCompositionText',
        }
      );
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
      if (visible()) collector.clock(performance.now(), true);
      else flush();
    };
    let size = {
      inner: window.innerWidth,
      outer: window.outerWidth,
      zoom: window.devicePixelRatio,
    };
    const onResize = () => {
      const next = {
        inner: window.innerWidth,
        outer: window.outerWidth,
        zoom: window.devicePixelRatio,
      };
      // Zooming and resizing the window narrow the page too; neither is a panel.
      if (
        finePointer &&
        size.inner - next.inner >= PANEL_MIN_PX &&
        Math.abs(size.outer - next.outer) < 20 &&
        size.zoom === next.zoom
      )
        collector.panelOpened();
      size = next;
    };

    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointermove', onPointerMove, opts);
    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('click', onClick, opts);
    document.addEventListener('keydown', onKeyDown, opts);
    document.addEventListener('keyup', onKeyUp, opts);
    document.addEventListener('paste', onPaste, opts);
    document.addEventListener('drop', onDrop, opts);
    document.addEventListener('beforeinput', onBeforeInput, opts);
    document.addEventListener('input', onInput, opts);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('resize', onResize);
    const id = window.setInterval(flush, FLUSH_MS);
    return () => {
      document.removeEventListener('pointermove', onPointerMove, opts);
      document.removeEventListener('pointerdown', onPointerDown, opts);
      document.removeEventListener('click', onClick, opts);
      document.removeEventListener('keydown', onKeyDown, opts);
      document.removeEventListener('keyup', onKeyUp, opts);
      document.removeEventListener('paste', onPaste, opts);
      document.removeEventListener('drop', onDrop, opts);
      document.removeEventListener('beforeinput', onBeforeInput, opts);
      document.removeEventListener('input', onInput, opts);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('resize', onResize);
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
