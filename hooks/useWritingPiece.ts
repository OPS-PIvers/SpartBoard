// The student's Writing piece in this tab: open and claim (D23), autosave with the edit log, the device copy (D24), turn in and take back.
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import type { WritingResponse } from '@/types';
import { editorPlainText } from '@/hooks/useInputSignals';
import { countWords } from '@/utils/wordCount';
import { logError } from '@/utils/logError';
import {
  InsideClipboard,
  insertKind,
  type InsertKind,
} from '@/utils/writingClipboard';
import {
  clearDeviceCopy,
  copyLogFits,
  decideDeviceCopy,
  readDeviceCopy,
  writeDeviceCopy,
} from '@/utils/writingDeviceCopy';
import { WritingRecorder } from '@/utils/writingRecorder';
import {
  deriveWritingStatus,
  isWritingUnlocked,
} from '@/utils/writingResponseState';

const SESSIONS = 'writing_assignment_sessions';
/** Text saves 1.5 s after typing stops, at least every 10 s while typing. */
const SAVE_IDLE_MS = 1_500;
const SAVE_MAX_WAIT_MS = 10_000;
/** The log goes up every 20 s, slowing to once a minute past 30 KB (AB-201). */
const LOG_EVERY_MS = 20_000;
const BIG_LOG_BYTES = 30_000;
const BIG_LOG_EVERY_MS = 60_000;
/** A save still waiting after this long means the device copy is what holds the text. */
const SLOW_SAVE_MS = 4_000;
const COPY_DEBOUNCE_MS = 400;
/** A paste or drop decision applies to the input event that follows it. */
const PENDING_KIND_MS = 1_000;

export type WritingNotice =
  | 'paste-blocked'
  | 'offline'
  | 'open-failed'
  | 'turn-in-failed'
  | 'too-short'
  | 'too-long'
  | 'closed'
  | 'take-back-feedback'
  | 'take-back-past-due'
  | 'take-back-failed';

/** Writing from this device the server never got, shown to copy out (D24). */
export interface UnsentWriting {
  html: string;
  savedAt: number;
  /** Set when it came from browser storage, so dismissing clears that copy. */
  stored: boolean;
}

const newTabId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const reasonOf = (err: unknown): string | null => {
  const details = (err as { details?: unknown } | null)?.details;
  const reason = (details as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' ? reason : null;
};

interface OpenResult {
  logChunk: number;
  log: string;
  logStartText: string;
}

export function useWritingPiece(args: {
  sessionId: string;
  studentUid: string | null;
  allowPaste: boolean;
}) {
  const { sessionId, studentUid, allowPaste } = args;
  const [myTabId] = useState(newTabId);
  const [response, setResponse] = useState<WritingResponse | null | undefined>(
    undefined
  );
  const [holding, setHolding] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [everClaimed, setEverClaimed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [slow, setSlow] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [unsent, setUnsent] = useState<UnsentWriting | null>(null);
  const [notice, setNotice] = useState<WritingNotice | null>(null);
  const [busy, setBusy] = useState<'turn-in' | 'take-back' | null>(null);
  const [html, setHtml] = useState('');
  const [seed, setSeed] = useState({ key: 0, html: '' });

  const holdingRef = useRef(false);
  const recorderRef = useRef<WritingRecorder | null>(null);
  const htmlRef = useRef('');
  const savedHtmlRef = useRef('');
  const confirmedRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastLogAtRef = useRef(0);
  const startingRef = useRef(false);
  const primeRef = useRef<string | null>(null);
  const pendingKindRef = useRef<{ kind: InsertKind; at: number } | null>(null);
  const clipboardRef = useRef(new InsideClipboard());
  const allowPasteRef = useRef(allowPaste);
  useLayoutEffect(() => {
    allowPasteRef.current = allowPaste;
  });

  const responseRef = useMemo(
    () =>
      studentUid ? doc(db, SESSIONS, sessionId, 'responses', studentUid) : null,
    [sessionId, studentUid]
  );
  const chunkRef = useCallback(
    (n: number) =>
      doc(
        db,
        SESSIONS,
        sessionId,
        'responses',
        studentUid ?? '_',
        'log',
        String(n)
      ),
    [sessionId, studentUid]
  );

  const dropHolding = useCallback(() => {
    holdingRef.current = false;
    setHolding(false);
  }, []);

  // The response, and D23: another tab's claim or a lock ends this tab's hold, keeping unsaved text to copy out.
  useEffect(() => {
    if (!studentUid) return;
    const ref = doc(db, SESSIONS, sessionId, 'responses', studentUid);
    return onSnapshot(
      ref,
      (snap) => {
        const r = snap.exists() ? (snap.data() as WritingResponse) : null;
        setResponse(r);
        if (!r || !holdingRef.current) return;
        const lostTab = r.tabId !== myTabId;
        if (!lostTab && isWritingUnlocked(deriveWritingStatus(r))) return;
        if (htmlRef.current !== savedHtmlRef.current && htmlRef.current !== r.html)
          setUnsent({ html: htmlRef.current, savedAt: Date.now(), stored: false });
        dropHolding();
      },
      (err) => logError('useWritingPiece.response', err)
    );
  }, [sessionId, studentUid, myTabId, dropHolding]);

  const storeCopy = useCallback(() => {
    const rec = recorderRef.current;
    if (!studentUid || !rec || !holdingRef.current) return;
    const open = rec.openChunk;
    writeDeviceCopy(safeStorage(), studentUid, sessionId, {
      v: 1,
      tabId: myTabId,
      html: htmlRef.current,
      summary: rec.summary(countWords(htmlRef.current), Date.now()),
      logChunk: open.index,
      log: open.log,
      logStartText: open.startText,
      savedAt: Date.now(),
    });
  }, [studentUid, sessionId, myTabId]);

  const isDirty = useCallback(
    () =>
      htmlRef.current !== savedHtmlRef.current ||
      (recorderRef.current?.logDirty ?? false),
    []
  );

  /** One save: the text, summary and counter, plus the log when it is due. */
  const commitOnce = useCallback(
    async (forceLog: boolean): Promise<void> => {
      const rec = recorderRef.current;
      if (!responseRef || !rec) return;
      const htmlNow = htmlRef.current;
      const now = Date.now();
      const logDue =
        rec.logDirty &&
        (forceLog ||
          rec.nextClosing !== null ||
          now - lastLogAtRef.current >=
            (rec.logBytes > BIG_LOG_BYTES ? BIG_LOG_EVERY_MS : LOG_EVERY_MS));
      if (htmlNow === savedHtmlRef.current && !logDue) return;
      const next = confirmedRef.current + 1;
      const version = rec.logVersion;
      const update: Record<string, unknown> = {
        html: htmlNow,
        summary: rec.summary(countWords(htmlNow), now),
        saveCount: next,
        tabId: myTabId,
      };
      const batch = writeBatch(db);
      const closing = logDue ? rec.nextClosing : null;
      const open = rec.openChunk;
      // A full chunk is closed in the same write that moves the response on; the next chunk opens in a later one.
      if (closing) {
        batch.set(
          chunkRef(closing.index),
          { log: closing.log, closed: true, updatedAt: now },
          { merge: true }
        );
        update.logChunk = closing.index + 1;
      } else if (logDue) {
        batch.set(
          chunkRef(open.index),
          {
            log: open.log,
            closed: false,
            updatedAt: now,
            ...(open.index > 0 ? { startText: open.startText } : {}),
          },
          { merge: true }
        );
      }
      batch.update(responseRef, update);
      await batch.commit();
      confirmedRef.current = next;
      savedHtmlRef.current = htmlNow;
      if (closing) rec.confirmClosed(closing.index);
      else if (logDue) {
        rec.markLogSaved(version);
        lastLogAtRef.current = now;
      }
    },
    [responseRef, myTabId, chunkRef]
  );

  /** Saves until nothing is due; `force` also sends the log and keeps going until all of it has landed. */
  const runSave = useCallback(
    async (force: boolean): Promise<boolean> => {
      for (let i = 0; i < 12; i += 1) {
        if (inFlightRef.current) {
          await inFlightRef.current.catch(() => undefined);
          continue;
        }
        if (!holdingRef.current) return false;
        if (!isDirty()) break;
        const slowTimer = window.setTimeout(() => setSlow(true), SLOW_SAVE_MS);
        const p = commitOnce(force);
        inFlightRef.current = p;
        try {
          await p;
        } catch (err) {
          logError('useWritingPiece.save', err);
          return false;
        } finally {
          inFlightRef.current = null;
          window.clearTimeout(slowTimer);
          setSlow(false);
        }
        if (!force) break;
      }
      const clean = !isDirty();
      setDirty(!clean);
      // D24: the device copy goes only once the server has everything it held.
      if (clean && studentUid)
        clearDeviceCopy(safeStorage(), studentUid, sessionId);
      return clean || !force;
    },
    [commitOnce, isDirty, studentUid, sessionId]
  );

  /** D23 claim: opens the piece (creating it on first open), sends a device copy that is still this piece's, then holds it. */
  const start = useCallback(async () => {
    if (!studentUid || !responseRef || startingRef.current) return;
    startingRef.current = true;
    setClaiming(true);
    setNotice(null);
    try {
      const opened = (
        await httpsCallable<{ sessionId: string; tabId: string }, OpenResult>(
          functions,
          'openWritingV1'
        )({ sessionId, tabId: myTabId })
      ).data;
      const snap = await getDoc(responseRef);
      if (!snap.exists()) throw new Error('response missing after open');
      const s = snap.data() as WritingResponse;
      const status = deriveWritingStatus(s);
      const storage = safeStorage();
      const copy = readDeviceCopy(storage, studentUid, sessionId);
      const decision = decideDeviceCopy(copy, {
        tabId: s.tabId,
        status,
        html: s.html ?? '',
      });
      if (decision === 'landed') clearDeviceCopy(storage, studentUid, sessionId);
      if (decision === 'unsent' && copy)
        setUnsent({ html: copy.html, savedAt: copy.savedAt, stored: true });
      if (!isWritingUnlocked(status)) return;
      const send = decision === 'send' && copy ? copy : null;
      const logChunk = typeof s.logChunk === 'number' ? s.logChunk : 0;
      const logFits = send !== null && copyLogFits(send, logChunk);
      const fromCopy = logFits && send ? send : null;
      const rec = new WritingRecorder({
        log: fromCopy ? fromCopy.log : opened.log,
        startText: fromCopy ? fromCopy.logStartText : opened.logStartText,
        chunk: logChunk,
        base: send ? send.summary : s.summary,
      });
      const htmlStart = send ? send.html : (s.html ?? '');
      const saveCount = (typeof s.saveCount === 'number' ? s.saveCount : 0) + 1;
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(responseRef, {
        tabId: myTabId,
        tabAt: serverTimestamp(),
        saveCount,
        ...(send
          ? { html: htmlStart, summary: rec.summary(countWords(htmlStart), now) }
          : {}),
      });
      if (fromCopy)
        batch.set(
          chunkRef(logChunk),
          {
            log: fromCopy.log,
            closed: false,
            updatedAt: now,
            ...(logChunk > 0 ? { startText: fromCopy.logStartText } : {}),
          },
          { merge: true }
        );
      await batch.commit();
      if (send) clearDeviceCopy(storage, studentUid, sessionId);
      confirmedRef.current = saveCount;
      recorderRef.current = rec;
      rec.markLogSaved(rec.logVersion);
      lastLogAtRef.current = now;
      htmlRef.current = htmlStart;
      savedHtmlRef.current = htmlStart;
      primeRef.current = null;
      holdingRef.current = true;
      setHtml(htmlStart);
      setSeed((prev) => ({ key: prev.key + 1, html: htmlStart }));
      setDirty(false);
      setHolding(true);
      setEverClaimed(true);
    } catch (err) {
      logError('useWritingPiece.start', err);
      const code = (err as { code?: unknown } | null)?.code;
      setNotice(
        typeof code === 'string' && code.endsWith('failed-precondition')
          ? 'closed'
          : 'open-failed'
      );
    } finally {
      startingRef.current = false;
      setClaiming(false);
    }
  }, [studentUid, sessionId, responseRef, myTabId, chunkRef]);

  // Opening the page claims an unlocked piece, as does it unlocking again (take back, Return for revision); a lost claim waits for Continue here.
  const status = response ? deriveWritingStatus(response) : null;
  const lost = everClaimed && !!response && response.tabId !== myTabId;
  const wantsStart =
    !!response &&
    status !== null &&
    isWritingUnlocked(status) &&
    !holding &&
    !claiming &&
    !lost &&
    notice !== 'open-failed' &&
    notice !== 'closed';
  const autoStart = useEffectEvent(() => void start());
  useEffect(() => {
    if (wantsStart) autoStart();
  }, [wantsStart]);

  // Timers: debounced text saves, the log cadence, and saves on hide and reconnect; the device copy on hide and close.
  const saveTimer = useRef<{ idle: number | null; firstAt: number | null }>({
    idle: null,
    firstAt: null,
  });
  const copyTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!holding) return;
    const tick = window.setInterval(() => void runSave(false), LOG_EVERY_MS);
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      storeCopy();
      void runSave(false);
    };
    const onPageHide = () => storeCopy();
    const onOnline = () => {
      setOnline(true);
      void runSave(false);
    };
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const timers = saveTimer.current;
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (timers.idle !== null) window.clearTimeout(timers.idle);
      timers.idle = null;
      timers.firstAt = null;
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = null;
      storeCopy();
    };
  }, [holding, runSave, storeCopy]);

  const scheduleSave = useCallback(() => {
    const t = saveTimer.current;
    const now = Date.now();
    t.firstAt ??= now;
    if (t.idle !== null) window.clearTimeout(t.idle);
    const wait = Math.max(
      0,
      Math.min(SAVE_IDLE_MS, t.firstAt + SAVE_MAX_WAIT_MS - now)
    );
    t.idle = window.setTimeout(() => {
      t.idle = null;
      t.firstAt = null;
      void runSave(false);
    }, wait);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = null;
      storeCopy();
    }, COPY_DEBOUNCE_MS);
  }, [runSave, storeCopy]);

  /** The editor's sanitized HTML after each change. */
  const onEditorChange = useCallback(
    (next: string) => {
      if (!holdingRef.current) return;
      htmlRef.current = next;
      setHtml(next);
      setDirty(true);
      scheduleSave();
    },
    [scheduleSave]
  );

  // The edit log: plain text before and after each input in the editor.
  const listeners = useRef<(() => void) | null>(null);
  const bindEditor = useCallback((root: HTMLElement | null) => {
    listeners.current?.();
    listeners.current = null;
    if (!root) return;
    const host = (t: EventTarget | null): HTMLElement | null =>
      t instanceof HTMLElement && t.isContentEditable
        ? (t.closest<HTMLElement>('[contenteditable="true"]') ?? t)
        : null;
    const onBefore = (e: Event) => {
      const el = host(e.target);
      if (el) primeRef.current = editorPlainText(el);
    };
    const onInput = (e: Event) => {
      const el = host(e.target);
      const rec = recorderRef.current;
      if (!el || !rec || !holdingRef.current) return;
      const next = editorPlainText(el);
      const prev = primeRef.current ?? rec.text;
      primeRef.current = null;
      const pending = pendingKindRef.current;
      pendingKindRef.current = null;
      const type = e instanceof InputEvent ? e.inputType : '';
      const inserted =
        type === 'insertText' ||
        type === 'insertFromPaste' ||
        type === 'insertFromDrop';
      let kind: NonNullable<InsertKind> = 'typed';
      if (
        pending?.kind &&
        inserted &&
        Date.now() - pending.at < PENDING_KIND_MS
      )
        kind = pending.kind;
      rec.edit(prev, next, e.timeStamp, kind, Date.now());
    };
    root.addEventListener('beforeinput', onBefore, true);
    root.addEventListener('input', onInput, true);
    listeners.current = () => {
      root.removeEventListener('beforeinput', onBefore, true);
      root.removeEventListener('input', onInput, true);
    };
  }, []);

  /** D8: a move inside the piece always lands; outside text needs the paste setting. */
  const allowInsert = useCallback(
    (text: string, via: 'paste' | 'drop' | 'drag-inside'): boolean => {
      const kind: InsertKind =
        via === 'drag-inside'
          ? 'typed'
          : insertKind(
              clipboardRef.current.sourceOf(text),
              allowPasteRef.current
            );
      if (kind === null) {
        setNotice('paste-blocked');
        return false;
      }
      pendingKindRef.current = { kind, at: Date.now() };
      return true;
    },
    []
  );

  const onEditorCopy = useCallback((text: string) => {
    clipboardRef.current.noteCopy(text, 'inside');
  }, []);

  const onUnsentCopy = useCallback((text: string) => {
    clipboardRef.current.noteCopy(text, 'own-unsent');
  }, []);

  const recordAway = useCallback((ms: number) => {
    recorderRef.current?.away(ms);
  }, []);

  const dismissUnsent = useCallback(() => {
    if (unsent?.stored && studentUid) {
      const copy = readDeviceCopy(safeStorage(), studentUid, sessionId);
      if (copy && copy.savedAt === unsent.savedAt)
        clearDeviceCopy(safeStorage(), studentUid, sessionId);
    }
    setUnsent(null);
  }, [unsent, studentUid, sessionId]);

  const turnIn = useCallback(async () => {
    setBusy('turn-in');
    setNotice(null);
    try {
      if (!(await runSave(true))) {
        setNotice('offline');
        return;
      }
      await httpsCallable(functions, 'turnInWritingV1')({
        sessionId,
        tabId: myTabId,
      });
      if (studentUid) clearDeviceCopy(safeStorage(), studentUid, sessionId);
    } catch (err) {
      const reason = reasonOf(err);
      setNotice(
        reason === 'too-short' || reason === 'too-long' || reason === 'closed'
          ? reason
          : 'turn-in-failed'
      );
      logError('useWritingPiece.turnIn', err);
    } finally {
      setBusy(null);
    }
  }, [runSave, sessionId, myTabId, studentUid]);

  const takeBack = useCallback(async () => {
    setBusy('take-back');
    setNotice(null);
    try {
      await httpsCallable(functions, 'takeBackWritingV1')({ sessionId });
    } catch (err) {
      const reason = reasonOf(err);
      setNotice(
        reason === 'feedback'
          ? 'take-back-feedback'
          : reason === 'past-due'
            ? 'take-back-past-due'
            : 'take-back-failed'
      );
    } finally {
      setBusy(null);
    }
  }, [sessionId]);

  return {
    myTabId,
    response,
    holding,
    claiming: claiming || wantsStart,
    dirty,
    slow,
    online,
    unsent,
    notice,
    busy,
    html,
    seed,
    start,
    turnIn,
    takeBack,
    dismissUnsent,
    clearNotice: () => setNotice(null),
    onEditorChange,
    bindEditor,
    allowInsert,
    onEditorCopy,
    onUnsentCopy,
    recordAway,
  };
}
