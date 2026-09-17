import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import * as Y from 'yjs';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { PlcActionItem } from '@/types';
import { logError } from '@/utils/logError';
import {
  parseActionItems,
  sanitizeActionItemsForWrite,
} from '@/utils/plcActionItems';
import {
  applyActionItems,
  applyTextEdit,
  decodeUpdate,
  encodeDocSnapshot,
  encodeUpdate,
  noteActionItems,
  noteBody,
  noteTitle,
  readNoteContent,
  seedNoteDoc,
  type PlcNoteCrdtContent,
} from '@/utils/plcNoteCrdt';

/**
 * Firestore transport for a note's CRDT document.
 *
 * There is no Realtime Database in this project, so Yjs updates ride in a
 * subcollection: `plcs/{plcId}/notes/{noteId}/yUpdates/{updateId}`, each doc one
 * base64 update, streamed to every member by `onSnapshot`. Local edits are
 * batched for ~400ms and merged into a single update doc, so a burst of typing
 * costs one small write rather than one per keystroke.
 *
 * Two derived writes land back on the note doc itself:
 *
 *   - `yState`, a compacted snapshot, so a new reader replays one document
 *     instead of the whole update log. Compaction deletes only the update ids it
 *     actually merged, so an update written mid-compaction survives.
 *   - `title` / `body` / `actionItems`, a plain-text mirror, so search snippets,
 *     action-item rollups, markdown preview, trash/restore and the OLF converter
 *     keep reading the fields they always read.
 *
 * Every note-doc write still bumps `version`, because the security rule requires
 * `new == old + 1`. Losing that race used to mean losing an edit; now the CRDT
 * has already merged the content, so both writers are trying to write the same
 * thing and the loser simply retries against the fresh version. That is why this
 * hook retries where the old editor raised a conflict toast.
 */

const PLCS_COLLECTION = 'plcs';
const NOTES_SUBCOLLECTION = 'notes';
const UPDATES_SUBCOLLECTION = 'yUpdates';

const REMOTE_ORIGIN = 'plc-note-remote';
const LOCAL_ORIGIN = 'plc-note-local';

const PUBLISH_DEBOUNCE_MS = 400;
const MIRROR_DEBOUNCE_MS = 2000;
/** Replay cost past this many update docs outweighs a compaction write. */
const COMPACT_THRESHOLD = 150;
/** Firestore caps a document at 1 MiB; leave room for the mirrored fields. */
const MAX_SNAPSHOT_BYTES = 700_000;
const VERSION_WRITE_ATTEMPTS = 5;

export type PlcNoteCrdtStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UsePlcNoteCrdtOptions {
  plcId: string | null;
  noteId: string | null;
  enabled: boolean;
  /** Runs immediately before a remote update is applied — capture the caret. */
  onBeforeRemoteApply?: (doc: Y.Doc) => void;
  /** Runs immediately after — restore it. */
  onAfterRemoteApply?: (doc: Y.Doc) => void;
}

export interface UsePlcNoteCrdtResult {
  status: PlcNoteCrdtStatus;
  content: PlcNoteCrdtContent;
  setTitle: (next: string) => void;
  setBody: (next: string) => void;
  setActionItems: (next: PlcActionItem[]) => void;
}

const EMPTY_CONTENT: PlcNoteCrdtContent = {
  title: '',
  body: '',
  actionItems: [],
};

const noteRefFor = (plcId: string, noteId: string) =>
  doc(db, PLCS_COLLECTION, plcId, NOTES_SUBCOLLECTION, noteId);

const updatesRefFor = (plcId: string, noteId: string) =>
  collection(
    db,
    PLCS_COLLECTION,
    plcId,
    NOTES_SUBCOLLECTION,
    noteId,
    UPDATES_SUBCOLLECTION
  );

/**
 * Write note fields under the rule's `new == old + 1` version precondition,
 * re-reading and retrying when a teammate's write lands first.
 *
 * Safe to retry only because every caller here writes content the CRDT has
 * already converged on — the retry rewrites the same bytes, it doesn't resurrect
 * a stale draft.
 */
export async function writeVersionedNoteFields(
  plcId: string,
  noteId: string,
  uid: string,
  build: () => Record<string, unknown>
): Promise<void> {
  const ref = noteRefFor(plcId, noteId);
  for (let attempt = 0; attempt < VERSION_WRITE_ATTEMPTS; attempt += 1) {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const current = snap.data();
    const fields: Record<string, unknown> = {
      ...build(),
      lastEditedBy: uid,
      lastEditedAt: serverTimestamp(),
    };
    // A legacy note that never carried `version` must not gain one — the rule
    // rejects introducing the field.
    if (typeof current.version === 'number') {
      fields.version = current.version + 1;
    }
    try {
      await updateDoc(ref, fields);
      return;
    } catch (err) {
      if (attempt === VERSION_WRITE_ATTEMPTS - 1) throw err;
      // Jitter so two clients retrying don't collide in lockstep.
      await new Promise((resolve) =>
        setTimeout(resolve, 60 + Math.random() * 140)
      );
    }
  }
}

export function usePlcNoteCrdt({
  plcId,
  noteId,
  enabled,
  onBeforeRemoteApply,
  onAfterRemoteApply,
}: UsePlcNoteCrdtOptions): UsePlcNoteCrdtResult {
  const { user } = useAuth();
  const uid = user?.uid ?? '';

  const [status, setStatus] = useState<PlcNoteCrdtStatus>('idle');
  const [content, setContent] = useState<PlcNoteCrdtContent>(EMPTY_CONTENT);

  const docRef = useRef<Y.Doc | null>(null);
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mirrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);
  const appliedUpdateIdsRef = useRef<Set<string>>(new Set());
  const compactingRef = useRef(false);

  // Latest-refs so the long-lived subscription effect doesn't re-run when a
  // caller passes fresh callback identities (house rule: assign in render).
  const beforeApplyRef = useRef(onBeforeRemoteApply);
  const afterApplyRef = useRef(onAfterRemoteApply);

  beforeApplyRef.current = onBeforeRemoteApply;
  afterApplyRef.current = onAfterRemoteApply;

  const active = enabled && !!plcId && !!noteId && !!uid;

  /** Push buffered local updates as one merged update doc. */
  const publishPending = useCallback(() => {
    if (publishTimerRef.current) {
      clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
    }
    const buffered = pendingUpdatesRef.current;
    pendingUpdatesRef.current = [];
    if (buffered.length === 0 || !plcId || !noteId || !uid) return;

    const merged =
      buffered.length === 1 ? buffered[0] : Y.mergeUpdates(buffered);
    const ref = doc(updatesRefFor(plcId, noteId));
    void setDoc(ref, {
      u: encodeUpdate(merged),
      uid,
      at: serverTimestamp(),
    }).catch((err: unknown) => {
      logError('usePlcNoteCrdt.publish', err, { plcId, noteId });
    });
  }, [plcId, noteId, uid]);

  /** Mirror the converged text back onto the note doc's plain fields. */
  const mirrorPending = useCallback(() => {
    if (mirrorTimerRef.current) {
      clearTimeout(mirrorTimerRef.current);
      mirrorTimerRef.current = null;
    }
    const yDoc = docRef.current;
    if (!yDoc || !plcId || !noteId || !uid) return;
    const snapshot = readNoteContent(yDoc);
    void writeVersionedNoteFields(plcId, noteId, uid, () => ({
      title: snapshot.title,
      body: snapshot.body,
      actionItems: sanitizeActionItemsForWrite(snapshot.actionItems),
    })).catch((err: unknown) => {
      logError('usePlcNoteCrdt.mirror', err, { plcId, noteId });
    });
  }, [plcId, noteId, uid]);

  const scheduleMirror = useCallback(() => {
    if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
    mirrorTimerRef.current = setTimeout(mirrorPending, MIRROR_DEBOUNCE_MS);
  }, [mirrorPending]);

  /** Fold the update log into a `yState` snapshot and drop the merged docs. */
  const compact = useCallback(
    async (mergedIds: string[]) => {
      const yDoc = docRef.current;
      if (!yDoc || !plcId || !noteId || !uid || compactingRef.current) return;
      compactingRef.current = true;
      try {
        const encoded = encodeDocSnapshot(yDoc);
        if (encoded.length > MAX_SNAPSHOT_BYTES) {
          logError(
            'usePlcNoteCrdt.compact',
            new Error('Note CRDT snapshot exceeds the document budget'),
            { plcId, noteId, bytes: encoded.length }
          );
          return;
        }
        await writeVersionedNoteFields(plcId, noteId, uid, () => ({
          yState: encoded,
        }));
        // Only ids folded into the snapshot above — an update written during
        // compaction is not in this list and survives.
        await Promise.all(
          mergedIds.map((id) =>
            deleteDoc(doc(updatesRefFor(plcId, noteId), id)).catch(() => {
              // Another client compacted the same id first; nothing to do.
            })
          )
        );
      } catch (err) {
        logError('usePlcNoteCrdt.compact', err, { plcId, noteId });
      } finally {
        compactingRef.current = false;
      }
    },
    [plcId, noteId, uid]
  );

  useEffect(() => {
    if (!active || !plcId || !noteId) {
      setStatus('idle');
      setContent(EMPTY_CONTENT);
      return;
    }

    let cancelled = false;
    const yDoc = new Y.Doc();
    docRef.current = yDoc;
    appliedUpdateIdsRef.current = new Set();
    pendingUpdatesRef.current = [];
    setStatus('loading');

    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      setContent(readNoteContent(yDoc));
      if (origin === REMOTE_ORIGIN) return;
      pendingUpdatesRef.current.push(update);
      if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
      publishTimerRef.current = setTimeout(publishPending, PUBLISH_DEBOUNCE_MS);
      scheduleMirror();
    };
    yDoc.on('update', onDocUpdate);

    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      // Load the compacted snapshot, seeding it from the note's plain fields
      // the first time this note is opened collaboratively. Seeding runs in a
      // transaction so two teachers opening at once can't both insert the body
      // and converge on a doubled note.
      try {
        await runTransaction(db, async (tx) => {
          const ref = noteRefFor(plcId, noteId);
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          if (typeof data.yState === 'string' && data.yState.length > 0) return;
          const seed = new Y.Doc();
          seedNoteDoc(seed, {
            title: typeof data.title === 'string' ? data.title : '',
            body: typeof data.body === 'string' ? data.body : '',
            actionItems: parseActionItems(data.actionItems),
          });
          const fields: Record<string, unknown> = {
            yState: encodeDocSnapshot(seed),
            lastEditedBy: uid,
            lastEditedAt: serverTimestamp(),
          };
          if (typeof data.version === 'number') {
            fields.version = data.version + 1;
          }
          tx.update(ref, fields);
        });
      } catch (err) {
        // A lost seeding race is expected and harmless — the winner's snapshot
        // is read below.
        logError('usePlcNoteCrdt.seed', err, { plcId, noteId });
      }
      if (cancelled) return;

      try {
        const snap = await getDoc(noteRefFor(plcId, noteId));
        const state: unknown = snap.data()?.yState;
        if (!cancelled && typeof state === 'string' && state.length > 0) {
          Y.applyUpdate(yDoc, decodeUpdate(state), REMOTE_ORIGIN);
        }
      } catch (err) {
        logError('usePlcNoteCrdt.loadSnapshot', err, { plcId, noteId });
        if (!cancelled) setStatus('error');
        return;
      }
      if (cancelled) return;

      unsubscribe = onSnapshot(
        updatesRefFor(plcId, noteId),
        (snapshot) => {
          const applied = appliedUpdateIdsRef.current;
          const incoming = snapshot
            .docChanges()
            .filter((change) => change.type === 'added')
            .filter((change) => !applied.has(change.doc.id));

          if (incoming.length > 0) {
            beforeApplyRef.current?.(yDoc);
            for (const change of incoming) {
              applied.add(change.doc.id);
              const raw: unknown = change.doc.data().u;
              if (typeof raw !== 'string') continue;
              try {
                Y.applyUpdate(yDoc, decodeUpdate(raw), REMOTE_ORIGIN);
              } catch (err) {
                logError('usePlcNoteCrdt.applyUpdate', err, {
                  plcId,
                  noteId,
                  updateId: change.doc.id,
                });
              }
            }
            afterApplyRef.current?.(yDoc);
          }

          setStatus('ready');

          // One client compacts: the author of the newest update. Everyone
          // else would write an identical snapshot for nothing.
          if (snapshot.size >= COMPACT_THRESHOLD && !compactingRef.current) {
            const docs = snapshot.docs;
            const newest = docs[docs.length - 1];
            const author: unknown = newest.data().uid;
            if (author === uid) {
              void compact(docs.map((d) => d.id));
            }
          }
        },
        (err: unknown) => {
          logError('usePlcNoteCrdt.subscribe', err, { plcId, noteId });
          setStatus('error');
        }
      );
    };

    void start();

    return () => {
      cancelled = true;
      // Flush before teardown so closing the tab mid-sentence doesn't drop the
      // last burst.
      publishPending();
      mirrorPending();
      unsubscribe?.();
      yDoc.off('update', onDocUpdate);
      yDoc.destroy();
      docRef.current = null;
      setContent(EMPTY_CONTENT);
    };
    // `publishPending` / `mirrorPending` / `compact` are all keyed off the same
    // plcId+noteId+uid identity as `active`, so they never change within a
    // session — listing them would not re-run this effect but does satisfy the
    // exhaustive-deps rule.
  }, [
    active,
    plcId,
    noteId,
    uid,
    publishPending,
    mirrorPending,
    scheduleMirror,
    compact,
  ]);

  const setTitle = useCallback((next: string) => {
    const yDoc = docRef.current;
    if (!yDoc) return;
    Y.transact(yDoc, () => applyTextEdit(noteTitle(yDoc), next), LOCAL_ORIGIN);
  }, []);

  const setBody = useCallback((next: string) => {
    const yDoc = docRef.current;
    if (!yDoc) return;
    Y.transact(yDoc, () => applyTextEdit(noteBody(yDoc), next), LOCAL_ORIGIN);
  }, []);

  const setActionItems = useCallback((next: PlcActionItem[]) => {
    const yDoc = docRef.current;
    if (!yDoc) return;
    Y.transact(
      yDoc,
      () => applyActionItems(yDoc, noteActionItems(yDoc), next),
      LOCAL_ORIGIN
    );
  }, []);

  return { status, content, setTitle, setBody, setActionItems };
}
