import * as Y from 'yjs';
import { toBase64, fromBase64 } from 'lib0/buffer';
import type { PlcActionItem } from '@/types';

/**
 * CRDT document shape for a PLC note.
 *
 * A note's editable content lives in one `Y.Doc` — `title` and `body` as
 * `Y.Text`, `actionItems` as a `Y.Array` of `Y.Map`. Concurrent edits merge
 * structurally, so the optimistic-version precondition that used to surface a
 * conflict toast has nothing left to guard: two teachers typing in the same
 * note converge instead of racing.
 *
 * The Firestore `PlcNote.body`/`title`/`actionItems` fields stay populated as a
 * read-only mirror of this doc, so search snippets, action-item rollups,
 * markdown preview, trash/restore and the OLF converter keep reading what they
 * always read.
 *
 * This module is pure — no Firestore, no React. The transport lives in
 * `hooks/usePlcNoteCrdt`.
 */

/**
 * Payload ceiling for one `yUpdates` doc, mirroring the rule's
 * `request.resource.data.u.size() <= 200000`. The client must stay under it:
 * a rejected update is gone from the publish buffer by the time the write
 * fails, so the local doc would keep the text while every teammate silently
 * lost it.
 */
export const MAX_UPDATE_PAYLOAD_CHARS = 200_000;

/**
 * Largest run of text inserted in one transaction. Base64 inflates a Yjs
 * update by about 4/3, so this leaves ample room under the payload ceiling.
 */
const MAX_INSERT_CHUNK = 64_000;

const TITLE_KEY = 'title';
const BODY_KEY = 'body';
const ACTION_ITEMS_KEY = 'actionItems';

export interface PlcNoteCrdtContent {
  title: string;
  body: string;
  actionItems: PlcActionItem[];
}

export const noteTitle = (doc: Y.Doc): Y.Text => doc.getText(TITLE_KEY);
export const noteBody = (doc: Y.Doc): Y.Text => doc.getText(BODY_KEY);
export const noteActionItems = (doc: Y.Doc): Y.Array<Y.Map<unknown>> =>
  doc.getArray<Y.Map<unknown>>(ACTION_ITEMS_KEY);

/** True once any content has been seeded — guards double-seeding a note. */
export function isNoteDocEmpty(doc: Y.Doc): boolean {
  return (
    noteTitle(doc).length === 0 &&
    noteBody(doc).length === 0 &&
    noteActionItems(doc).length === 0
  );
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * Replace a `Y.Text`'s contents with `next` as a minimal splice.
 *
 * Diffing to one delete + one insert (rather than clearing and re-inserting)
 * is what makes concurrent typing merge: an edit at the end of the body leaves
 * a teammate's edit at the top untouched. Indices are UTF-16 code units, matching
 * both `Y.Text` and JS strings, so the boundaries are pulled back off a split
 * surrogate pair to avoid tearing an emoji in half.
 */
export function applyTextEdit(text: Y.Text, next: string): void {
  const current = text.toJSON();
  if (current === next) return;

  let prefix = 0;
  const maxPrefix = Math.min(current.length, next.length);
  while (prefix < maxPrefix && current[prefix] === next[prefix]) prefix += 1;
  if (prefix > 0 && prefix < maxPrefix) {
    if (isLowSurrogate(next.charCodeAt(prefix))) prefix -= 1;
  }

  let suffix = 0;
  const maxSuffix = Math.min(current.length - prefix, next.length - prefix);
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  if (suffix > 0 && suffix < maxSuffix) {
    if (isHighSurrogate(next.charCodeAt(next.length - suffix))) suffix -= 1;
  }

  const removed = current.length - prefix - suffix;
  const inserted = next.slice(prefix, next.length - suffix);
  const doc = text.doc;
  const transact = (fn: () => void) => {
    if (doc) Y.transact(doc, fn);
    else fn();
  };

  const chunks = inserted.length > 0 ? splitForInsert(inserted) : [];
  transact(() => {
    if (removed > 0) text.delete(prefix, removed);
    if (chunks.length > 0) text.insert(prefix, chunks[0]);
  });

  // A paste bigger than one chunk is split across transactions so each emits
  // an update that clears the payload ceiling on its own. Merging the whole
  // paste into one update would get it rejected by the rule, and the
  // publisher has already dropped it from its buffer by then.
  let at = prefix + (chunks[0]?.length ?? 0);
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const offset = at;
    transact(() => text.insert(offset, chunk));
    at += chunk.length;
  }
}

/** Split a run of text into chunks, never cutting a surrogate pair in half. */
function splitForInsert(text: string): string[] {
  if (text.length <= MAX_INSERT_CHUNK) return [text];
  const chunks: string[] = [];
  let at = 0;
  while (at < text.length) {
    let end = Math.min(at + MAX_INSERT_CHUNK, text.length);
    if (end < text.length && isLowSurrogate(text.charCodeAt(end))) end -= 1;
    chunks.push(text.slice(at, end));
    at = end;
  }
  return chunks;
}

const ACTION_ITEM_FIELDS = [
  'id',
  'text',
  'done',
  'assigneeUid',
  'dueAt',
  'createdBy',
  'createdAt',
  'doneAt',
] as const;

function actionItemToMap(item: PlcActionItem): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const field of ACTION_ITEM_FIELDS) {
    const value = item[field];
    if (value !== undefined) map.set(field, value);
  }
  return map;
}

const readString = (map: Y.Map<unknown>, key: string): string => {
  const value = map.get(key);
  return typeof value === 'string' ? value : '';
};

const readNullableString = (
  map: Y.Map<unknown>,
  key: string
): string | null => {
  const value = map.get(key);
  return typeof value === 'string' ? value : null;
};

const readNullableNumber = (
  map: Y.Map<unknown>,
  key: string
): number | null => {
  const value = map.get(key);
  return typeof value === 'number' ? value : null;
};

function mapToActionItem(map: Y.Map<unknown>): PlcActionItem {
  const item: PlcActionItem = {
    id: readString(map, 'id'),
    text: readString(map, 'text'),
    done: map.get('done') === true,
    createdBy: readString(map, 'createdBy'),
    createdAt: readNullableNumber(map, 'createdAt') ?? 0,
  };
  if (map.has('assigneeUid'))
    item.assigneeUid = readNullableString(map, 'assigneeUid');
  if (map.has('dueAt')) item.dueAt = readNullableNumber(map, 'dueAt');
  if (map.has('doneAt')) item.doneAt = readNullableNumber(map, 'doneAt');
  return item;
}

/**
 * Reconcile the action-item array against `next`, keyed by item id.
 *
 * Patching the matched maps in place rather than replacing the array keeps two
 * teachers ticking off different items from clobbering each other. The editor
 * only patches, removes and appends (never reorders), so appends land at the
 * end and order is otherwise preserved.
 */
export function applyActionItems(
  doc: Y.Doc,
  yItems: Y.Array<Y.Map<unknown>>,
  next: PlcActionItem[]
): void {
  Y.transact(doc, () => {
    const nextById = new Map(next.map((item) => [item.id, item]));

    for (let i = yItems.length - 1; i >= 0; i -= 1) {
      const map = yItems.get(i);
      const id = readString(map, 'id');
      const incoming = nextById.get(id);
      if (!incoming) {
        yItems.delete(i, 1);
        continue;
      }
      for (const field of ACTION_ITEM_FIELDS) {
        const value = incoming[field];
        if (value === undefined) {
          if (map.has(field)) map.delete(field);
        } else if (map.get(field) !== value) {
          map.set(field, value);
        }
      }
    }

    const present = new Set<string>();
    for (let i = 0; i < yItems.length; i += 1) {
      present.add(readString(yItems.get(i), 'id'));
    }
    const appended = next
      .filter((item) => !present.has(item.id))
      .map(actionItemToMap);
    if (appended.length > 0) yItems.push(appended);
  });
}

/** Snapshot the doc as the plain content the rest of the app reads. */
export function readNoteContent(doc: Y.Doc): PlcNoteCrdtContent {
  return {
    title: noteTitle(doc).toJSON(),
    body: noteBody(doc).toJSON(),
    actionItems: noteActionItems(doc).map(mapToActionItem),
  };
}

/**
 * Seed an empty doc from a note's existing Firestore fields.
 *
 * Seeding is NOT idempotent across clients — two clients seeding the same note
 * concurrently would each insert the text and converge on a doubled body. The
 * transport must elect a single seeder (a create-if-absent write of the initial
 * snapshot) before calling this.
 */
export function seedNoteDoc(doc: Y.Doc, content: PlcNoteCrdtContent): void {
  Y.transact(doc, () => {
    if (content.title) noteTitle(doc).insert(0, content.title);
    if (content.body) noteBody(doc).insert(0, content.body);
    if (content.actionItems.length > 0) {
      noteActionItems(doc).push(content.actionItems.map(actionItemToMap));
    }
  });
}

/** Firestore holds Yjs binary as base64 — it has no native byte-array field. */
export const encodeUpdate = (update: Uint8Array): string => toBase64(update);
export const decodeUpdate = (encoded: string): Uint8Array =>
  fromBase64(encoded);
export const encodeDocSnapshot = (doc: Y.Doc): string =>
  toBase64(Y.encodeStateAsUpdate(doc));
