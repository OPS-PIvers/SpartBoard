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
  addUnsent,
  clearDeviceCopy,
  copyLogFits,
  decideDeviceCopy,
  readDeviceCopy,
  readUnsent,
  removeUnsent,
  writeDeviceCopy,
} from '@/utils/writingDeviceCopy';
import { WritingRecorder, openChunkFromLogs } from '@/utils/writingRecorder';
import {
  deriveWritingStatus,
  isWritingUnlocked,
  timedTurnInDue,
} from '@/utils/writingResponseState';
import {
  LOG_EVERY_MS,
  insertApproved,
  isLogDue,
  refusedSaveAction,
  saveKeyOf,
  turnInFlush,
} from '@/utils/writingSaveFlow';

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const SESSIONS = 'writing_assignment_sessions';
/** Text saves 1.5 s after typing stops, at least every 10 s while typing. */
const SAVE_IDLE_MS = 1_500;
const SAVE_MAX_WAIT_MS = 10_000;
/** A save still waiting after this long means the device copy is what holds the text. */
const SLOW_SAVE_MS = 4_000;
const COPY_DEBOUNCE_MS = 400;
/** A paste or drop decision applies to the input event that follows it. */
const PENDING_KIND_MS = 1_000;
/** Back waits this long for a last save before leaving. */
const LEAVE_WAIT_MS = 2_500;

export type WritingNotice =
  | 'paste-blocked'
  | 'not-saved'
  | 'open-failed'
  | 'turn-in-failed'
  | 'too-short'
  | 'too-long'
  | 'too-large'
  | 'paused'
  | 'closed'
  | 'take-back-feedback'
  | 'take-back-past-due'
  | 'take-back-failed';

/** Writing from this device the server never got, shown to copy out (D24). */
export interface UnsentWriting {
  html: string;
  savedAt: number;
  /** Kept in browser storage apart from the live copy; only Dismiss removes it. */
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
  logs: string[];
}

const codeOf = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
};

const isOnline = () =>
  typeof navigator === 'undefined' ? true : navigator.onLine;

export function useWritingPiece(args: {
  sessionId: string;
  studentUid: string | null;
  allowPaste: boolean;
  /** Past the close and its grace, or ended: nothing more saves, and unsaved text shows as unsent. */
  closed: boolean;
}) {
  const { sessionId, studentUid, allowPaste, closed } = args;
  const [myTabId] = useState(newTabId);
  const [response, setResponse] = useState<WritingResponse | null | undefined>(
    undefined
  );
  const [holding, setHolding] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [everClaimed, setEverClaimed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [slow, setSlow] = useState(false);
  const [refused, setRefused] = useState(false);
  const [copyOk, setCopyOk] = useState(true);
  const [online, setOnline] = useState(isOnline);
  const [unsent, setUnsent] = useState<UnsentWriting[]>(() =>
    studentUid
      ? readUnsent(safeStorage(), studentUid, sessionId).map((u) => ({
          ...u,
          stored: true,
        }))
      : []
  );
  const [notice, setNotice] = useState<WritingNotice | null>(null);
  const [busy, setBusy] = useState<'turn-in' | 'take-back' | null>(null);
  const [turningIn, setTurningIn] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
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
  const approvedAtRef = useRef<number | null>(null);
  const clipboardRef = useRef(new InsideClipboard());
  const allowPasteRef = useRef(allowPaste);
  const closedRef = useRef(closed);
  useLayoutEffect(() => {
    allowPasteRef.current = allowPaste;
    closedRef.current = closed;
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

  /** D24: keeps text the server never got apart from the live copy, until the student dismisses it. */
  const putUnsent = useCallback(
    (text: string) => {
      if (!studentUid || countWords(text) === 0) return;
      const entry = { html: text, savedAt: Date.now() };
      const stored = addUnsent(safeStorage(), studentUid, sessionId, entry);
      setUnsent((prev) => [
        ...prev.filter((u) => u.html !== text),
        { ...entry, stored },
      ]);
    },
    [studentUid, sessionId]
  );

  /** Another tab on this device may own the live copy, so only this tab's goes. */
  const clearMyCopy = useCallback(() => {
    if (!studentUid) return;
    const storage = safeStorage();
    if (readDeviceCopy(storage, studentUid, sessionId)?.tabId === myTabId)
      clearDeviceCopy(storage, studentUid, sessionId);
  }, [studentUid, sessionId, myTabId]);

  /** Ends this tab's hold; text the server never got becomes unsent first (D23, D24). */
  const letGo = useCallback(
    (serverHtml: string | null) => {
      if (!holdingRef.current) return;
      const text = htmlRef.current;
      if (text !== savedHtmlRef.current && text !== serverHtml) putUnsent(text);
      clearMyCopy();
      holdingRef.current = false;
      setHolding(false);
    },
    [putUnsent, clearMyCopy]
  );

  // The response, and D23: another tab's claim or a lock ends this tab's hold.
  const onServer = useEffectEvent((r: WritingResponse | null) => {
    setResponse(r);
    if (!r || !holdingRef.current) return;
    if (r.tabId === myTabId && isWritingUnlocked(deriveWritingStatus(r)))
      return;
    letGo(r.html ?? '');
  });
  useEffect(() => {
    if (!studentUid) return;
    return onSnapshot(
      doc(db, SESSIONS, sessionId, 'responses', studentUid),
      (snap) =>
        onServer(snap.exists() ? (snap.data() as WritingResponse) : null),
      (err) => logError('useWritingPiece.response', err)
    );
  }, [sessionId, studentUid]);

  // A close or end while this tab holds the piece: one last save inside the rules' grace, then let go.
  const closeOut = useEffectEvent(async () => {
    await runSave(true).catch(() => false);
    letGo(null);
  });
  useEffect(() => {
    if (closed && holding) void closeOut();
  }, [closed, holding]);

  /** Writes the device copy of `text`; false (and not "saved on this device") when storage refuses it. */
  const storeCopy = useCallback(
    (text?: string): boolean => {
      const rec = recorderRef.current;
      if (!studentUid || !rec || !holdingRef.current) return true;
      const body = text ?? htmlRef.current;
      const now = Date.now();
      const open = rec.openChunk;
      const ok = writeDeviceCopy(safeStorage(), studentUid, sessionId, {
        v: 1,
        tabId: myTabId,
        html: body,
        summary: rec.summary(countWords(body), now),
        logChunk: open.index,
        log: open.log,
        baseSaveCount: confirmedRef.current,
        savedAt: now,
      });
      setCopyOk(ok);
      return ok;
    },
    [studentUid, sessionId, myTabId]
  );

  /** One save: the text, summary and counter, plus the log when it is due. */
  const commitOnce = useCallback(
    async (forceLog: boolean): Promise<void> => {
      const rec = recorderRef.current;
      if (!responseRef || !rec) return;
      const htmlNow = htmlRef.current;
      const now = Date.now();
      const logDue = isLogDue({
        logDirty: rec.logDirty,
        closing: rec.nextClosing !== null,
        force: forceLog,
        now,
        lastLogAt: lastLogAtRef.current,
        logBytes: rec.logBytes,
      });
      if (htmlNow === savedHtmlRef.current && !logDue) return;
      // D24: the copy holds this exact text before it leaves, so a reload never sends older text over it.
      storeCopy(htmlNow);
      const next = confirmedRef.current + 1;
      const version = rec.logVersion;
      const update: Record<string, unknown> = {
        html: htmlNow,
        summary: rec.summary(countWords(htmlNow), now),
        saveCount: next,
        saveKey: saveKeyOf(myTabId, next),
        tabId: myTabId,
      };
      const batch = writeBatch(db);
      const closing = logDue ? rec.nextClosing : null;
      // A full chunk is closed in the same write that moves the response on; the next chunk opens in a later one.
      if (closing) {
        batch.set(chunkRef(closing.index), {
          log: closing.log,
          closed: true,
          updatedAt: now,
        });
        update.logChunk = closing.index + 1;
      } else if (logDue) {
        const open = rec.openChunk;
        batch.set(chunkRef(open.index), {
          log: open.log,
          closed: false,
          updatedAt: now,
        });
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
    [responseRef, myTabId, chunkRef, storeCopy]
  );

  /** After a refusal: true to retry from the server's counter, else this tab lets the piece go. */
  const resync = useCallback(async (): Promise<boolean> => {
    if (!responseRef) return false;
    let server: WritingResponse | null;
    try {
      const snap = await getDoc(responseRef);
      server = snap.exists() ? (snap.data() as WritingResponse) : null;
    } catch (err) {
      logError('useWritingPiece.resync', err);
      return false;
    }
    const action = refusedSaveAction(
      server
        ? {
            tabId: server.tabId,
            status: deriveWritingStatus(server),
            saveCount:
              typeof server.saveCount === 'number' ? server.saveCount : 0,
          }
        : null,
      myTabId,
      closedRef.current
    );
    if (action === 'retry' && server) {
      confirmedRef.current =
        typeof server.saveCount === 'number' ? server.saveCount : 0;
      return true;
    }
    letGo(server?.html ?? null);
    return false;
  }, [responseRef, myTabId, letGo]);

  /** Saves until nothing is due; `force` also sends the log and keeps going until all of it has landed. */
  const runSave = useCallback(
    async (force: boolean): Promise<boolean> => {
      let retried = false;
      for (let i = 0; i < 12; i += 1) {
        if (inFlightRef.current) {
          await inFlightRef.current.catch(() => undefined);
          continue;
        }
        if (!holdingRef.current) return false;
        const logDirty = recorderRef.current?.logDirty ?? false;
        if (htmlRef.current === savedHtmlRef.current && !logDirty) break;
        const slowTimer = window.setTimeout(() => setSlow(true), SLOW_SAVE_MS);
        const p = commitOnce(force);
        inFlightRef.current = p;
        let failure: unknown = null;
        try {
          await p;
          setRefused(false);
        } catch (err) {
          failure = err;
        } finally {
          inFlightRef.current = null;
          window.clearTimeout(slowTimer);
          setSlow(false);
        }
        if (failure) {
          logError('useWritingPiece.save', failure);
          // A refusal once: the counter may have moved under this tab, so read it and try again if the piece is still ours.
          if (codeOf(failure) === 'permission-denied' && !retried) {
            retried = true;
            if (await resync()) continue;
          }
          setRefused(true);
          return false;
        }
        if (!force) break;
      }
      const textClean = htmlRef.current === savedHtmlRef.current;
      setDirty(!textClean);
      const clean = textClean && !(recorderRef.current?.logDirty ?? false);
      // D24: the device copy goes only once the server has the text and the log.
      if (clean) clearMyCopy();
      return force ? clean : textClean;
    },
    [commitOnce, resync, clearMyCopy]
  );

  /** D23 claim: opens the piece (creating it on first open), sends a device copy that is still this piece's, then holds it. */
  const start = useCallback(async () => {
    if (!studentUid || !responseRef || startingRef.current) return;
    startingRef.current = true;
    setClaiming(true);
    setNotice(null);
    const storage = safeStorage();
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
      const serverCount = typeof s.saveCount === 'number' ? s.saveCount : 0;
      const copy = readDeviceCopy(storage, studentUid, sessionId);
      const decision = decideDeviceCopy(
        copy,
        { tabId: s.tabId, status, html: s.html ?? '', saveCount: serverCount },
        closedRef.current
      );
      // A copy shown after a failed open is settled now, one way or the other.
      setUnsent((prev) => prev.filter((u) => u.stored));
      if (decision === 'landed')
        clearDeviceCopy(storage, studentUid, sessionId);
      if (decision === 'unsent' && copy) {
        putUnsent(copy.html);
        clearDeviceCopy(storage, studentUid, sessionId);
      }
      if (!isWritingUnlocked(status) || closedRef.current) return;
      // Time is up: the timed turn in freezes the server's text, so a copy not sent is kept to copy out.
      if (isNum(s.deadlineAt) && timedTurnInDue(Date.now(), s.deadlineAt)) {
        if (decision === 'send' && copy) {
          putUnsent(copy.html);
          clearDeviceCopy(storage, studentUid, sessionId);
        }
        setTimeUp(true);
        return;
      }
      const logChunk = typeof s.logChunk === 'number' ? s.logChunk : 0;
      const fromServer = openChunkFromLogs(opened.logs);
      if (fromServer.chunk !== logChunk)
        throw new Error('log chunk moved during open');
      const send = decision === 'send' && copy ? copy : null;
      const fromCopy = send && copyLogFits(send, logChunk) ? send : null;
      const rec = new WritingRecorder({
        log: fromCopy ? fromCopy.log : fromServer.log,
        startText: fromServer.startText,
        chunk: logChunk,
        base: send ? send.summary : s.summary,
      });
      const htmlStart = send ? send.html : (s.html ?? '');
      const saveCount = serverCount + 1;
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(responseRef, {
        tabId: myTabId,
        tabAt: serverTimestamp(),
        saveCount,
        saveKey: saveKeyOf(myTabId, saveCount),
        ...(send
          ? {
              html: htmlStart,
              summary: rec.summary(countWords(htmlStart), now),
            }
          : {}),
      });
      if (fromCopy)
        batch.set(chunkRef(logChunk), {
          log: fromCopy.log,
          closed: false,
          updatedAt: now,
        });
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
      setRefused(false);
      setCopyOk(true);
      setHolding(true);
      setEverClaimed(true);
    } catch (err) {
      logError('useWritingPiece.start', err);
      const isClosed = codeOf(err).endsWith('failed-precondition');
      setNotice(isClosed ? 'closed' : 'open-failed');
      // D24: a copy this page can't send still shows to copy out; once closed it moves to unsent for good.
      const copy = readDeviceCopy(storage, studentUid, sessionId);
      if (copy && countWords(copy.html) > 0) {
        if (isClosed) {
          putUnsent(copy.html);
          clearDeviceCopy(storage, studentUid, sessionId);
        } else
          setUnsent((prev) =>
            prev.some((u) => u.html === copy.html)
              ? prev
              : [
                  ...prev,
                  { html: copy.html, savedAt: copy.savedAt, stored: false },
                ]
          );
      }
    } finally {
      startingRef.current = false;
      setClaiming(false);
    }
  }, [studentUid, sessionId, responseRef, myTabId, chunkRef, putUnsent]);

  // Opening the page claims an unlocked piece, as does it unlocking again (take back, Return for revision); a lost claim waits for Continue here.
  const status = response ? deriveWritingStatus(response) : null;
  const lost = everClaimed && !!response && response.tabId !== myTabId;
  const wantsStart =
    !!response &&
    status !== null &&
    isWritingUnlocked(status) &&
    !closed &&
    !holding &&
    !claiming &&
    !lost &&
    !timeUp &&
    notice !== 'open-failed' &&
    notice !== 'closed';
  const autoStart = useEffectEvent(() => void start());
  useEffect(() => {
    if (!wantsStart) return;
    const id = window.setTimeout(autoStart, 0);
    return () => window.clearTimeout(id);
  }, [wantsStart]);

  // A timed piece turns itself in when its clock runs out, carrying this tab's text if it holds the piece.
  const deadlineAt =
    response &&
    status !== null &&
    isWritingUnlocked(status) &&
    isNum(response.deadlineAt)
      ? response.deadlineAt
      : null;
  const timedTries = useRef(0);
  const [timedRetry, setTimedRetry] = useState(0);
  const timedTurnIn = useEffectEvent(async () => {
    setTimeUp(true);
    setTurningIn(true);
    try {
      const held = holdingRef.current;
      const flush = held
        ? turnInFlush({
            html: htmlRef.current,
            savedHtml: savedHtmlRef.current,
            confirmed: confirmedRef.current,
          })
        : null;
      const summary = flush
        ? recorderRef.current?.summary(countWords(flush.html), Date.now())
        : undefined;
      await httpsCallable(
        functions,
        'turnInTimedWritingV1'
      )({
        sessionId,
        ...(flush
          ? {
              tabId: myTabId,
              html: flush.html,
              saveCount: flush.saveCount,
              ...(summary ? { summary } : {}),
            }
          : {}),
      });
    } catch (err) {
      logError('useWritingPiece.timedTurnIn', err);
      timedTries.current += 1;
      if (timedTries.current < 6)
        window.setTimeout(() => setTimedRetry((n) => n + 1), 5_000);
    } finally {
      setTurningIn(false);
    }
  });
  useEffect(() => {
    if (deadlineAt === null || !studentUid) return;
    const wait = Math.max(0, deadlineAt - Date.now());
    const id = window.setTimeout(() => void timedTurnIn(), wait);
    return () => window.clearTimeout(id);
  }, [deadlineAt, studentUid, timedRetry]);

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
    const onPageHide = () => {
      storeCopy();
      void runSave(false);
    };
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
      setDirty(next !== savedHtmlRef.current);
      scheduleSave();
    },
    [scheduleSave]
  );

  // The edit log: plain text before and after each input; D8: a native paste or drop the page never approved is cancelled.
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
      if (!el) return;
      const type = e instanceof InputEvent ? e.inputType : '';
      if (!insertApproved(type, approvedAtRef.current, Date.now())) {
        e.preventDefault();
        setNotice('paste-blocked');
        return;
      }
      primeRef.current = editorPlainText(el);
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
        approvedAtRef.current = null;
        setNotice('paste-blocked');
        return false;
      }
      const now = Date.now();
      pendingKindRef.current = { kind, at: now };
      approvedAtRef.current = now;
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

  const dismissUnsent = useCallback(
    (savedAt: number) => {
      if (studentUid)
        removeUnsent(safeStorage(), studentUid, sessionId, savedAt);
      setUnsent((prev) => prev.filter((u) => u.savedAt !== savedAt));
    },
    [studentUid, sessionId]
  );

  /** Back: one last save, waiting a moment at most; the device copy covers the rest. */
  const flushBeforeLeave = useCallback(async (): Promise<void> => {
    if (!holdingRef.current) return;
    storeCopy();
    let timer: number | undefined;
    await Promise.race([
      runSave(false).catch(() => false),
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, LEAVE_WAIT_MS);
      }),
    ]);
    window.clearTimeout(timer);
  }, [runSave, storeCopy]);

  /** D12: the editor holds still, and the call carries the text on screen so nothing typed is lost. */
  const turnIn = useCallback(async () => {
    setBusy('turn-in');
    setTurningIn(true);
    setNotice(null);
    try {
      await runSave(true);
      if (!isOnline()) {
        setNotice('not-saved');
        return;
      }
      const flush = turnInFlush({
        html: htmlRef.current,
        savedHtml: savedHtmlRef.current,
        confirmed: confirmedRef.current,
      });
      const summary = recorderRef.current?.summary(
        countWords(flush.html),
        Date.now()
      );
      await httpsCallable(
        functions,
        'turnInWritingV1'
      )({
        sessionId,
        tabId: myTabId,
        html: flush.html,
        saveCount: flush.saveCount,
        ...(summary ? { summary } : {}),
      });
      savedHtmlRef.current = flush.html;
      confirmedRef.current = flush.saveCount;
      setDirty(false);
      clearMyCopy();
    } catch (err) {
      const reason = reasonOf(err);
      setNotice(
        reason === 'too-short' ||
          reason === 'too-long' ||
          reason === 'too-large' ||
          reason === 'paused' ||
          reason === 'closed'
          ? reason
          : codeOf(err).endsWith('invalid-argument')
            ? 'too-large'
            : 'turn-in-failed'
      );
      logError('useWritingPiece.turnIn', err);
    } finally {
      setTurningIn(false);
      setBusy(null);
    }
  }, [runSave, sessionId, myTabId, clearMyCopy]);

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
            : reason === 'closed'
              ? 'closed'
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
    refused,
    copyOk,
    turningIn,
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
    flushBeforeLeave,
    clearNotice: () => setNotice(null),
    onEditorChange,
    bindEditor,
    allowInsert,
    onEditorCopy,
    onUnsentCopy,
    recordAway,
  };
}
