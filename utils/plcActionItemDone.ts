// Applies Google Tasks completion changes to PLC note and doc action items.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import * as Y from 'yjs';
import { db } from '@/config/firebase';
import {
  normalizePlcNoteCollabSettings,
  PLC_NOTE_COLLAB_SETTINGS_DOC,
} from '@/config/plcNoteCollab';
import { writeVersionedNoteFields } from '@/hooks/usePlcNoteCrdt';
import type { PlcActionItem } from '@/types';
import { logError } from '@/utils/logError';
import {
  parseActionItems,
  sanitizeActionItemsForWrite,
} from '@/utils/plcActionItems';
import {
  applyActionItems,
  decodeUpdate,
  encodeUpdate,
  MAX_UPDATE_PAYLOAD_CHARS,
  noteActionItems,
  readNoteContent,
} from '@/utils/plcNoteCrdt';

export interface ActionItemDoneChange {
  plcId: string;
  source: 'note' | 'doc';
  parentId: string;
  itemId: string;
  done: boolean;
}

export interface ApplyActionItemDoneOptions {
  /** Whether live note collaboration is on (`admin_settings/plc_note_collab`). */
  collab: boolean;
  now?: number;
}

/** Flip only the targeted items; returns null when nothing would change. */
export function flipActionItems(
  items: readonly PlcActionItem[],
  doneById: ReadonlyMap<string, boolean>,
  now: number
): PlcActionItem[] | null {
  let changed = false;
  const next = items.map((item) => {
    const done = doneById.get(item.id);
    if (done === undefined || item.done === done) return item;
    changed = true;
    return { ...item, done, doneAt: done ? now : null };
  });
  return changed ? next : null;
}

/** One-shot read of the live-collaboration switch; falls back to off. */
export async function readPlcNoteCollabEnabled(): Promise<boolean> {
  try {
    const snap = await getDoc(
      doc(db, 'admin_settings', PLC_NOTE_COLLAB_SETTINGS_DOC)
    );
    return snap.exists()
      ? normalizePlcNoteCollabSettings(snap.data()).enabled
      : false;
  } catch {
    return false;
  }
}

async function applyToDoc(
  plcId: string,
  docId: string,
  doneById: ReadonlyMap<string, boolean>,
  now: number
): Promise<void> {
  const ref = doc(db, 'plcs', plcId, 'docs', docId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const next = flipActionItems(
      parseActionItems(snap.data().actionItems),
      doneById,
      now
    );
    if (!next) return;
    tx.update(ref, {
      actionItems: sanitizeActionItemsForWrite(next),
      updatedAt: serverTimestamp(),
    });
  });
}

async function applyToPlainNote(
  plcId: string,
  noteId: string,
  uid: string,
  doneById: ReadonlyMap<string, boolean>,
  now: number
): Promise<void> {
  const ref = doc(db, 'plcs', plcId, 'notes', noteId);
  // Re-reading the version on retry is safe here: only the targeted items change.
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const next = flipActionItems(
      parseActionItems(data.actionItems),
      doneById,
      now
    );
    if (!next) return;
    const fields: Record<string, unknown> = {
      actionItems: sanitizeActionItemsForWrite(next),
      lastEditedBy: uid,
      lastEditedAt: serverTimestamp(),
    };
    if (typeof data.version === 'number') fields.version = data.version + 1;
    tx.update(ref, fields);
  });
}

async function applyToCrdtNote(
  plcId: string,
  noteId: string,
  uid: string,
  yState: string,
  doneById: ReadonlyMap<string, boolean>,
  now: number
): Promise<void> {
  const yDoc = new Y.Doc();
  try {
    Y.applyUpdate(yDoc, decodeUpdate(yState));
    const updatesRef = collection(
      db,
      'plcs',
      plcId,
      'notes',
      noteId,
      'yUpdates'
    );
    const updates = await getDocs(query(updatesRef, orderBy('at')));
    updates.forEach((d) => {
      const raw: unknown = d.data().u;
      if (typeof raw === 'string') Y.applyUpdate(yDoc, decodeUpdate(raw));
    });

    const next = flipActionItems(
      readNoteContent(yDoc).actionItems,
      doneById,
      now
    );
    if (!next) return;

    const local: Uint8Array[] = [];
    const onUpdate = (update: Uint8Array) => local.push(update);
    yDoc.on('update', onUpdate);
    applyActionItems(yDoc, noteActionItems(yDoc), next);
    yDoc.off('update', onUpdate);
    if (local.length === 0) return;

    const payload = encodeUpdate(
      local.length === 1 ? local[0] : Y.mergeUpdates(local)
    );
    if (payload.length > MAX_UPDATE_PAYLOAD_CHARS) {
      throw new Error(
        'Yjs update exceeds the yUpdates payload cap and cannot be published'
      );
    }
    await setDoc(doc(updatesRef), { u: payload, uid, at: serverTimestamp() });

    const snapshot = readNoteContent(yDoc);
    await writeVersionedNoteFields(plcId, noteId, uid, () => ({
      title: snapshot.title,
      body: snapshot.body,
      actionItems: sanitizeActionItemsForWrite(snapshot.actionItems),
    }));
  } finally {
    yDoc.destroy();
  }
}

async function applyToNote(
  plcId: string,
  noteId: string,
  uid: string,
  doneById: ReadonlyMap<string, boolean>,
  opts: ApplyActionItemDoneOptions,
  now: number
): Promise<void> {
  if (opts.collab) {
    const snap = await getDoc(doc(db, 'plcs', plcId, 'notes', noteId));
    if (!snap.exists()) return;
    const yState: unknown = snap.data().yState;
    if (typeof yState === 'string' && yState.length > 0) {
      await applyToCrdtNote(plcId, noteId, uid, yState, doneById, now);
      return;
    }
  }
  await applyToPlainNote(plcId, noteId, uid, doneById, now);
}

/** Write each parent's changes in one go; a failing parent never blocks the rest. */
export async function applyActionItemDoneChanges(
  changes: readonly ActionItemDoneChange[],
  uid: string,
  opts: ApplyActionItemDoneOptions
): Promise<void> {
  const now = opts.now ?? Date.now();
  const groups = new Map<
    string,
    { change: ActionItemDoneChange; doneById: Map<string, boolean> }
  >();
  for (const change of changes) {
    const key = `${change.plcId}/${change.source}/${change.parentId}`;
    const group = groups.get(key) ?? { change, doneById: new Map() };
    group.doneById.set(change.itemId, change.done);
    groups.set(key, group);
  }

  await Promise.all(
    [...groups.values()].map(async ({ change, doneById }) => {
      const { plcId, source, parentId } = change;
      try {
        if (source === 'doc') {
          await applyToDoc(plcId, parentId, doneById, now);
        } else {
          await applyToNote(plcId, parentId, uid, doneById, opts, now);
        }
      } catch (err) {
        logError('applyActionItemDoneChanges', err, {
          plcId,
          source,
          parentId,
        });
      }
    })
  );
}
