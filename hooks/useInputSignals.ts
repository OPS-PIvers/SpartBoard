import { useEffect, useLayoutEffect, useRef } from 'react';
import type { InputSignalCounts } from '@/types';
import {
  INPUT_SIGNALS_FLUSH_EVENT,
  type InputSignalsFlushDetail,
  InputSignalCollector,
  addSignals,
  otherLogBytes,
  readAttemptSignals,
} from '@/utils/inputSignals';
import { WRITING_LOG_BUDGET, utf8Length } from '@/utils/writingLog';
import { isTrustedEvent } from '@/utils/eventTrust';
import { detectQuizEnvironment } from '@/utils/quizEnvironment';
import { pingExtension } from '@/components/tours/web/extensionClient';
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
/** Past this many bytes of edit log, timed saves slow to one a minute so an essay isn't re-sent every 20 s. */
const BIG_LOG_BYTES = 30_000;
const BIG_LOG_FLUSH_MS = 60_000;
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

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
]);

/** An answer box's text with one newline per line break; `innerText` doubles paragraph breaks. */
export function editorPlainText(root: Node): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.nodeValue ?? '';
      } else if (child instanceof Element) {
        if (child.tagName === 'BR') {
          // A block's last <br> only holds its line open.
          if (child.nextSibling || !BLOCK_TAGS.has(node.nodeName)) out += '\n';
        } else if (BLOCK_TAGS.has(child.tagName)) {
          if (out !== '' && !out.endsWith('\n')) out += '\n';
          walk(child);
          if (child.nextSibling) out += '\n';
        } else {
          walk(child);
        }
      }
    }
  };
  walk(root);
  return out;
}

const answerText = (el: HTMLElement): string =>
  el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    ? el.value
    : editorPlainText(el);

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
    let logChars = otherLogBytes(argsRef.current.serverSignals, attempt);
    for (const [q, c] of Object.entries(base)) {
      if (!c.log) continue;
      logs[q] = c.log;
      logChars += utf8Length(c.log);
    }
    const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? true;
    const collector = new InputSignalCollector(finePointer, {
      logs,
      logRoom: WRITING_LOG_BUDGET - logChars,
    });
    collector.setQuestion(argsRef.current.questionId);
    const visible = () => document.visibilityState === 'visible';
    collector.clock(performance.now(), visible());
    // `isExtended` is Chrome and Edge only; elsewhere this sign is never raised.
    const screen = window.screen as Screen & {
      isExtended?: boolean;
      addEventListener?: EventTarget['addEventListener'];
      removeEventListener?: EventTarget['removeEventListener'];
    };
    let extended = screen.isExtended === true;
    if (extended) collector.extraScreen();
    const onScreenChange = () => {
      if (screen.isExtended === true && !extended) collector.extraScreen();
      extended = screen.isExtended === true;
    };
    void detectQuizEnvironment(pingExtension).then(
      (env) => collector.setEnvironment(env.browser, env.profile),
      (err: unknown) => logError('useInputSignals.environment', err)
    );
    let lastSaved = performance.now();
    // Only a turn-in, pagehide and unmount skip the large-log throttle (AB-201); the rest stay dirty for a later save.
    const flush = (e?: Event, throttled = false) => {
      const save = argsRef.current.save;
      const now = performance.now();
      collector.clock(now, visible());
      if (
        throttled &&
        collector.logBytes() > BIG_LOG_BYTES &&
        now - lastSaved < BIG_LOG_FLUSH_MS
      )
        return;
      if (!save || !collector.takeDirty()) return;
      lastSaved = now;
      const counts = addSignals(base, collector.snapshot());
      writtenRef.current = { attempt, counts };
      const saved = save(attempt, counts).catch((err: unknown) =>
        logError('useInputSignals.save', err)
      );
      (
        e as CustomEvent<InputSignalsFlushDetail> | undefined
      )?.detail?.saves?.push(saved);
    };
    collectorRef.current = collector;
    flushRef.current = () => flush(undefined, true);
    const onFlushEvent = (e: Event) => flush(e);
    document.addEventListener(INPUT_SIGNALS_FLUSH_EVENT, onFlushEvent);

    const onPointerMove = (e: PointerEvent) => {
      if (!isTrustedEvent(e) || e.pointerType !== 'mouse') return;
      const raw = e.getCoalescedEvents?.() ?? [];
      if (raw.length === 0) collector.pointerMove(e.clientX, e.clientY);
      for (const m of raw) collector.pointerMove(m.clientX, m.clientY);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!isTrustedEvent(e)) return;
      // An on-screen accent key types its letter, so the text it adds is keyed.
      if (e.target instanceof Element && e.target.closest('[data-typing-key]'))
        collector.keyDown({
          code: '',
          t: e.timeStamp,
          field: null,
          char: false,
        });
      if (e.pointerType === 'mouse' && e.button === 0)
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
      if (e.target instanceof Element && e.target.closest('[data-typing-key]'))
        collector.keyDown({
          code: '',
          t: e.timeStamp,
          field: null,
          char: false,
        });
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
      else flush(undefined, true);
    };
    // Closing or leaving the page is the last chance to save, so it skips the throttle.
    const onPageHide = () => flush();
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
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('resize', onResize);
    screen.addEventListener?.('change', onScreenChange);
    const id = window.setInterval(() => flush(undefined, true), FLUSH_MS);
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
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('resize', onResize);
      screen.removeEventListener?.('change', onScreenChange);
      window.clearInterval(id);
      document.removeEventListener(INPUT_SIGNALS_FLUSH_EVENT, onFlushEvent);
      // Once the attempt moves on (a turn-in), the rules refuse its key; the awaited pre-turn-in flush already saved it.
      if (argsRef.current.attempt === attempt) flush();
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
