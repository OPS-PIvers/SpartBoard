// Admin side of the District library (docs/plans/QUIZ_MCA_PRACTICE.md M29): list, upload, target, publish, delete.
import { useEffect, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { syncedBankPayload } from '@/utils/questionBankRecords';
import {
  DISTRICT_LIBRARY_COLLECTION,
  DISTRICT_LIBRARY_INDEX_COLLECTION,
  DISTRICT_LIBRARY_INDEX_DOC,
  bankFromPackage,
  behaviorFromPackage,
  checkPackageUpload,
  diffQuestionIds,
  draftHeaderFor,
  packageFieldsFor,
  PACKAGE_OWNED_OPTIONAL_KEYS,
  pictureFolderFor,
  pictureStoragePath,
  pruneTranslations,
  publishOrder,
  questionNotesFrom,
  quizFromPackage,
  syncedQuizDocFor,
  type LibraryBankRef,
  type UploadProblem,
} from '@/utils/districtLibraryPublish';
import {
  buildDistrictLibraryIndex,
  normalizeTargeting,
  type TargetingBuilding,
} from '@/utils/districtLibraryTargeting';
import { quizServedQuestionCount } from '@/utils/questionBanks';
import type { DistrictPackageEntry } from '@/utils/districtLibraryPackage';
import type { ReadDistrictPackage } from '@/utils/districtLibraryPackageReader';
import type { SyncedQuestionBank, SyncedQuizGroup } from '@/types';
import type {
  DistrictLibraryItem,
  DistrictLibraryStatus,
  DistrictLibraryTargeting,
} from '@/types/districtLibrary';

const SYNCED_QUIZZES = 'synced_quizzes';
const SYNCED_BANKS = 'synced_question_banks';

const itemRef = (id: string) => doc(db, DISTRICT_LIBRARY_COLLECTION, id);

/** Every library item, newest first; admins only. */
export function useDistrictLibraryItems(enabled: boolean): {
  items: DistrictLibraryItem[];
  loading: boolean;
  error: string | null;
} {
  const [items, setItems] = useState<DistrictLibraryItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, DISTRICT_LIBRARY_COLLECTION),
      (snap) => {
        const next = snap.docs.map((d) => d.data() as DistrictLibraryItem);
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        setItems(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logError('useDistrictLibraryItems', err);
        setError('Could not load the District library.');
        setLoading(false);
      }
    );
  }, [enabled]);
  return { items, loading, error };
}

const indexRef = () =>
  doc(db, DISTRICT_LIBRARY_INDEX_COLLECTION, DISTRICT_LIBRARY_INDEX_DOC);

/** Rewrites the published-targeting index from every item; the repair path if it ever drifts. */
export async function rebuildDistrictLibraryIndex(): Promise<void> {
  const snap = await getDocs(collection(db, DISTRICT_LIBRARY_COLLECTION));
  const items = snap.docs.map((d) => d.data() as DistrictLibraryItem);
  await setDoc(indexRef(), buildDistrictLibraryIndex(items, Date.now()));
}

/** Index entry for one item: present while published, removed otherwise; other items' entries are untouched. */
function indexPatch(
  itemId: string,
  item: DistrictLibraryItem | null,
  now: number
) {
  const entry = item
    ? buildDistrictLibraryIndex([item], now).items[itemId]
    : undefined;
  return { items: { [itemId]: entry ?? deleteField() }, updatedAt: now };
}

/** Updates one item's fields and its index entry in one transaction, so the two never disagree. */
async function updateItemAndIndex(
  itemId: string,
  change: (current: DistrictLibraryItem) => Partial<DistrictLibraryItem> | null
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef(itemId));
    if (!snap.exists())
      throw new Error('This item is no longer in the library.');
    const current = snap.data() as DistrictLibraryItem;
    const fields = change(current);
    if (fields && Object.keys(fields).length > 0) {
      tx.update(itemRef(itemId), fields as Record<string, unknown>);
    }
    const now = Date.now();
    tx.set(indexRef(), indexPatch(itemId, { ...current, ...fields }, now), {
      merge: true,
    });
  });
}

async function uploadPictures(
  pkg: ReadDistrictPackage,
  itemId: string,
  folder: string,
  paths: readonly string[]
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const path of paths) {
    const blob = await pkg.picture(path);
    const target = ref(storage, pictureStoragePath(itemId, folder, path));
    const snap = await uploadBytes(target, blob, { contentType: blob.type });
    urls.set(path, await getDownloadURL(snap.ref));
  }
  return urls;
}

/** Optional keys the new content lacks are cleared with deleteField. */
function withClearedKeys(
  payload: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  for (const key of keys) {
    if (!(key in out)) out[key] = deleteField();
  }
  return out;
}

/** Creates the canonical at the item's recorded id, or updates it when an earlier attempt already made it. */
async function writeBankCanonical(
  groupId: string,
  itemId: string,
  bank: ReturnType<typeof bankFromPackage>,
  uid: string,
  now: number
): Promise<{ groupId: string; version: number; ownerUid: string }> {
  const groupRef = doc(db, SYNCED_BANKS, groupId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists()) {
      tx.set(groupRef, {
        ...syncedBankPayload(bank, {
          groupId,
          ownerUid: uid,
          plcIds: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
        districtItemId: itemId,
      });
      return { groupId, version: 1, ownerUid: uid };
    }
    const current = snap.data() as SyncedQuestionBank;
    if (current.districtItemId !== itemId) {
      throw new Error('Another library item already uses this content.');
    }
    const version = (current.version ?? 1) + 1;
    const payload = syncedBankPayload(bank, {
      groupId,
      ownerUid: current.ownerUid,
      plcIds: current.plcIds ?? [],
      version,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    tx.update(
      groupRef,
      withClearedKeys({ ...payload, districtItemId: itemId }, [
        'stimuli',
        'targets',
        'language',
      ])
    );
    return { groupId, version, ownerUid: current.ownerUid };
  });
}

async function writeQuizCanonical(
  groupId: string,
  itemId: string,
  quiz: ReturnType<typeof quizFromPackage>,
  behavior: ReturnType<typeof behaviorFromPackage>,
  uid: string,
  now: number
): Promise<{ groupId: string; version: number }> {
  const groupRef = doc(db, SYNCED_QUIZZES, groupId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists()) {
      tx.set(
        groupRef,
        syncedQuizDocFor(quiz, {
          groupId,
          itemId,
          version: 1,
          uid,
          participants: { [uid]: { joinedAt: now } },
          createdAt: now,
          now,
          behavior,
        })
      );
      return { groupId, version: 1 };
    }
    const current = snap.data() as SyncedQuizGroup;
    if (current.districtItemId !== itemId) {
      throw new Error('Another library item already uses this content.');
    }
    const version = (current.version ?? 1) + 1;
    const full = syncedQuizDocFor(quiz, {
      groupId,
      itemId,
      version,
      uid,
      participants: current.participants,
      createdAt: current.createdAt,
      now,
      behavior: behavior ?? current.behavior,
    });
    // Participants stay as they are; the rules refuse any change to them.
    const rest: Record<string, unknown> = { ...full };
    delete rest.participants;
    const { removed } = diffQuestionIds(
      (current.questions ?? []).map((q) => q.id),
      quiz.questions.map((q) => q.id)
    );
    const translations = pruneTranslations(current.translations, removed);
    if (translations) rest.translations = translations;
    // The package is the whole quiz and carries no paper-sheet pictures, so a replace clears them.
    tx.update(
      groupRef,
      withClearedKeys(rest, [
        'stimuli',
        'language',
        'bankSlots',
        'order',
        'sections',
        'behavior',
        'translations',
        'paperSheetStimuli',
      ])
    );
    return { groupId, version };
  });
}

/** The item's header, created first as a draft with a random canonical id so a retry reuses that id. */
async function ensureDraftHeader(
  entry: DistrictPackageEntry,
  uid: string
): Promise<{ header: DistrictLibraryItem; isNew: boolean }> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef(entry.id));
    if (snap.exists()) {
      const header = snap.data() as DistrictLibraryItem;
      return { header, isNew: header.contentVersion === 0 };
    }
    // Never derived from the item id: staff who can't read the header must not be able to find the content.
    const header = draftHeaderFor(entry, {
      syncGroupId: crypto.randomUUID(),
      uid,
      now: Date.now(),
    });
    tx.set(itemRef(entry.id), header);
    return { header, isNew: true };
  });
}

/** Writes only the fields the upload owns, read and merged inside the transaction so a concurrent publish or retarget survives. */
async function finishHeader(
  itemId: string,
  fields: Partial<DistrictLibraryItem>,
  now: number
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef(itemId));
    if (!snap.exists())
      throw new Error('This item was deleted during the upload.');
    const current = snap.data() as DistrictLibraryItem;
    const update: Record<string, unknown> = { ...fields };
    for (const key of PACKAGE_OWNED_OPTIONAL_KEYS) {
      if (!(key in update) && key in current) update[key] = deleteField();
    }
    tx.update(itemRef(itemId), update);
    const merged = { ...current, ...fields };
    tx.set(indexRef(), indexPatch(itemId, merged, now), { merge: true });
  });
}

export interface PublishProgress {
  done: number;
  total: number;
  title: string;
}

export interface PublishPackageResult {
  added: string[];
  updated: string[];
  failed: UploadProblem[];
}

export type QuestionChanges = Record<
  string,
  { removed: string[]; added: string[] }
>;

/** Question ids each update removes and adds, read from the current canonicals for the review step. */
export async function previewPackageChanges(
  pkg: ReadDistrictPackage,
  existing: ReadonlyMap<string, DistrictLibraryItem>
): Promise<QuestionChanges> {
  const out: QuestionChanges = {};
  for (const entry of pkg.contents.manifest.entries) {
    const item = existing.get(entry.id);
    if (!item) continue;
    const name = item.kind === 'quiz' ? SYNCED_QUIZZES : SYNCED_BANKS;
    const snap = await getDoc(doc(db, name, item.syncGroupId));
    const questions = snap.exists()
      ? ((snap.data() as { questions?: { id: string }[] }).questions ?? [])
      : [];
    const file = pkg.contents.files[entry.id];
    out[entry.id] = diffQuestionIds(
      questions.map((q) => q.id),
      (file?.questions ?? []).map((q) => String(q.id))
    );
  }
  return out;
}

/** Checks every entry before the first write, then adds or updates each (or only `onlyIds`); one entry failing never stops the rest. */
export async function publishDistrictPackage(
  pkg: ReadDistrictPackage,
  uid: string,
  options: {
    onlyIds?: ReadonlySet<string>;
    onProgress?: (p: PublishProgress) => void;
  } = {}
): Promise<PublishPackageResult> {
  const { manifest, files } = pkg.contents;
  const existing = new Map<string, DistrictLibraryItem | null>();
  for (const e of manifest.entries) {
    const snap = await getDoc(itemRef(e.id));
    existing.set(
      e.id,
      snap.exists() ? (snap.data() as DistrictLibraryItem) : null
    );
  }
  const problems = checkPackageUpload(
    manifest,
    files,
    existing,
    options.onlyIds
  );
  if (problems.length > 0) return { added: [], updated: [], failed: problems };

  const entries = publishOrder(manifest.entries).filter(
    (e) => !options.onlyIds || options.onlyIds.has(e.id)
  );
  const banks = new Map<string, LibraryBankRef>();
  // Quizzes may draw from banks published earlier, not only in this upload.
  for (const e of manifest.entries.filter((x) => x.kind === 'questionBank')) {
    const item = existing.get(e.id);
    if (!item) continue;
    const bankSnap = await getDoc(doc(db, SYNCED_BANKS, item.syncGroupId));
    if (!bankSnap.exists()) continue;
    banks.set(e.id, {
      itemId: e.id,
      syncGroupId: item.syncGroupId,
      ownerUid: (bankSnap.data() as SyncedQuestionBank).ownerUid,
      title: item.title,
    });
  }
  const result: PublishPackageResult = { added: [], updated: [], failed: [] };
  const attemptId = crypto.randomUUID().slice(0, 8);
  let done = 0;
  for (const entry of entries) {
    options.onProgress?.({ done, total: entries.length, title: entry.title });
    try {
      const { header, isNew } = await ensureDraftHeader(entry, uid);
      const now = Date.now();
      const folder = pictureFolderFor(header.contentVersion + 1, attemptId);
      const urls = await uploadPictures(pkg, entry.id, folder, entry.pictures);
      const notes = questionNotesFrom(entry, urls);
      let contentVersion: number;
      let questionCount: number;
      if (entry.kind === 'questionBank') {
        const bank = bankFromPackage(files[entry.id], urls, now);
        const written = await writeBankCanonical(
          header.syncGroupId,
          entry.id,
          bank,
          uid,
          now
        );
        banks.set(entry.id, {
          itemId: entry.id,
          syncGroupId: written.groupId,
          ownerUid: written.ownerUid,
          title: entry.title,
        });
        contentVersion = written.version;
        questionCount = bank.questions.length;
      } else {
        const file = files[entry.id];
        const quiz = quizFromPackage(file, urls, banks, now);
        const written = await writeQuizCanonical(
          header.syncGroupId,
          entry.id,
          quiz,
          behaviorFromPackage(file),
          uid,
          now
        );
        contentVersion = written.version;
        questionCount = quizServedQuestionCount(quiz);
      }
      await finishHeader(
        entry.id,
        packageFieldsFor(entry, manifest, {
          contentVersion,
          questionCount,
          questionNotes: notes,
          uid,
          now,
        }),
        now
      );
      (isNew ? result.added : result.updated).push(entry.title);
    } catch (err) {
      logError('publishDistrictPackage.entry', err, { itemId: entry.id });
      result.failed.push({
        id: entry.id,
        title: entry.title,
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
    done += 1;
  }
  options.onProgress?.({ done, total: entries.length, title: '' });
  return result;
}

/** Saves who an item reaches, field by field, with its index entry. */
export async function saveDistrictLibraryTargeting(
  itemId: string,
  targeting: DistrictLibraryTargeting,
  buildings: readonly TargetingBuilding[],
  uid: string
): Promise<void> {
  const clean = normalizeTargeting(targeting, buildings);
  await updateItemAndIndex(itemId, () => ({
    ...clean,
    updatedAt: Date.now(),
    updatedBy: uid,
  }));
}

/** Publishes or unpublishes an item, with its index entry. */
export async function setDistrictLibraryStatus(
  itemId: string,
  status: DistrictLibraryStatus,
  uid: string
): Promise<void> {
  await updateItemAndIndex(itemId, (current) =>
    current.status === status
      ? null
      : { status, updatedAt: Date.now(), updatedBy: uid }
  );
}

/** Removes an item from the library and the index. Its content and pictures stay so teachers' copies and assigned quizzes keep working. */
export async function deleteDistrictLibraryItem(itemId: string): Promise<void> {
  await runTransaction(db, (tx) => {
    tx.delete(itemRef(itemId));
    tx.set(indexRef(), indexPatch(itemId, null, Date.now()), { merge: true });
    return Promise.resolve();
  });
}
