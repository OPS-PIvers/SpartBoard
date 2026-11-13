// Teacher side of the District library (docs/plans/QUIZ_MCA_PRACTICE.md M27-M28): what targets me, and adding it.
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteField,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  DISTRICT_LIBRARY_COLLECTION,
  DISTRICT_LIBRARY_INDEX_COLLECTION,
  DISTRICT_LIBRARY_INDEX_DOC,
  DISTRICT_LINKS_SUBCOLLECTION,
} from '@/utils/districtLibraryPublish';
import { indexedItemIdsFor } from '@/utils/districtLibraryTargeting';
import type { SyncedQuestionBank } from '@/types';
import type {
  DistrictBankLinkView,
  DistrictLibraryBankLink,
  DistrictLibraryIndex,
  DistrictLibraryItem,
  DistrictLibraryViewer,
} from '@/types/districtLibrary';

/** Published items that target this teacher, by title. Empty when `enabled` is false. */
export function useDistrictLibraryForTeacher(
  viewer: DistrictLibraryViewer | null,
  enabled: boolean
): { items: DistrictLibraryItem[]; loading: boolean } {
  const on = enabled && !!viewer?.email;
  const [index, setIndex] = useState<DistrictLibraryIndex | null>(null);
  const [named, setNamed] = useState<DistrictLibraryItem[]>([]);
  const [byId, setById] = useState<Record<string, DistrictLibraryItem | null>>(
    {}
  );
  const [indexLoaded, setIndexLoaded] = useState(false);
  const email = viewer?.email.toLowerCase() ?? '';

  useEffect(() => {
    if (!on) return;
    return onSnapshot(
      doc(db, DISTRICT_LIBRARY_INDEX_COLLECTION, DISTRICT_LIBRARY_INDEX_DOC),
      (snap) => {
        setIndex(snap.exists() ? (snap.data() as DistrictLibraryIndex) : null);
        setIndexLoaded(true);
      },
      (err) => {
        logError('useDistrictLibraryForTeacher.index', err);
        setIndexLoaded(true);
      }
    );
  }, [on]);

  useEffect(() => {
    if (!on || !email) return;
    return onSnapshot(
      query(
        collection(db, DISTRICT_LIBRARY_COLLECTION),
        where('targetEmails', 'array-contains', email),
        where('status', '==', 'published')
      ),
      (snap) => setNamed(snap.docs.map((d) => d.data() as DistrictLibraryItem)),
      (err) => logError('useDistrictLibraryForTeacher.named', err)
    );
  }, [on, email]);

  const buildingsKey = (viewer?.buildings ?? []).join('|');
  const gradesKey = (viewer?.grades ?? []).join('|');
  const ids = useMemo(
    () =>
      on
        ? indexedItemIdsFor(index, {
            email,
            buildings: buildingsKey ? buildingsKey.split('|') : [],
            grades: gradesKey ? gradesKey.split('|') : [],
          })
        : [],
    [on, index, email, buildingsKey, gradesKey]
  );
  const idsKey = ids.join('|');

  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    // Index entries change rarely; one read per targeted item, refreshed when the index changes.
    void Promise.all(
      idsKey.split('|').map(async (id) => {
        try {
          const snap = await getDoc(doc(db, DISTRICT_LIBRARY_COLLECTION, id));
          return [
            id,
            snap.exists() ? (snap.data() as DistrictLibraryItem) : null,
          ] as const;
        } catch (err) {
          logError('useDistrictLibraryForTeacher.item', err, { id });
          return [id, null] as const;
        }
      })
    ).then((pairs) => {
      if (!cancelled) setById(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey, index]);

  const items = useMemo(() => {
    if (!on) return [];
    const out = new Map<string, DistrictLibraryItem>();
    for (const id of ids) {
      const item = byId[id];
      if (item && item.status === 'published') out.set(id, item);
    }
    for (const item of named) out.set(item.id, item);
    return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [on, ids, byId, named]);

  return { items, loading: on && !indexLoaded };
}

const NO_LINKS: DistrictBankLinkView[] = [];

/** Rereads a link's item and canonical: an unpublished, untargeted or deleted item is unavailable; bank details refresh. */
async function checkDistrictBankLink(
  uid: string,
  link: DistrictLibraryBankLink
): Promise<DistrictBankLinkView> {
  let itemSyncGroupId: string | null = null;
  try {
    // The rules only let a teacher read an item that is published and still targets them.
    const item = await getDoc(
      doc(db, DISTRICT_LIBRARY_COLLECTION, link.itemId)
    );
    const data = item.exists() ? (item.data() as DistrictLibraryItem) : null;
    if (data?.status === 'published') itemSyncGroupId = data.syncGroupId;
  } catch {
    itemSyncGroupId = null;
  }
  if (!itemSyncGroupId) return { ...link, unavailable: true };
  try {
    // A deleted and re-uploaded item has a new canonical; follow it.
    const snap = await getDoc(
      doc(db, 'synced_question_banks', itemSyncGroupId)
    );
    if (!snap.exists()) return { ...link, unavailable: true };
    const bank = snap.data() as SyncedQuestionBank;
    const fresh = {
      syncGroupId: itemSyncGroupId,
      ownerUid: bank.ownerUid,
      title: bank.title,
      questionCount: bank.questionCount,
      targetIds: bank.targetIds ?? [],
    };
    const changed =
      fresh.syncGroupId !== link.syncGroupId ||
      fresh.ownerUid !== link.ownerUid ||
      fresh.title !== link.title ||
      fresh.questionCount !== link.questionCount ||
      fresh.targetIds.join('|') !== (link.targetIds ?? []).join('|');
    if (changed) {
      await updateDoc(
        doc(db, 'users', uid, DISTRICT_LINKS_SUBCOLLECTION, link.itemId),
        fresh
      ).catch((err: unknown) =>
        logError('useDistrictBankLinks.refresh', err, { itemId: link.itemId })
      );
    }
    return { ...link, ...fresh };
  } catch (err) {
    logError('useDistrictBankLinks.canonical', err, { itemId: link.itemId });
    return { ...link, unavailable: true };
  }
}

/** District library banks this teacher added, checked against the library once per change. */
export function useDistrictBankLinks(
  uid: string | undefined,
  enabled: boolean
): DistrictBankLinkView[] {
  const [stored, setStored] = useState<DistrictLibraryBankLink[]>([]);
  const [checked, setChecked] = useState<Record<string, DistrictBankLinkView>>(
    {}
  );
  const on = enabled && !!uid;
  useEffect(() => {
    if (!on || !uid) return;
    return onSnapshot(
      collection(db, 'users', uid, DISTRICT_LINKS_SUBCOLLECTION),
      (snap) =>
        setStored(
          snap.docs
            .map((d) => d.data() as DistrictLibraryBankLink)
            .filter((l) => l.kind === 'bank')
        ),
      (err) => logError('useDistrictBankLinks', err)
    );
  }, [on, uid]);

  // Check each link once per stored version; the refresh write lands back here with matching fields.
  const checkKey = stored
    .map((l) => `${l.itemId}:${l.syncGroupId}:${l.addedAt}`)
    .sort()
    .join('|');
  useEffect(() => {
    if (!on || !uid || !checkKey) return;
    let cancelled = false;
    void Promise.all(stored.map((l) => checkDistrictBankLink(uid, l))).then(
      (views) => {
        if (!cancelled) {
          setChecked(Object.fromEntries(views.map((v) => [v.itemId, v])));
        }
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only when the set of links changes
  }, [on, uid, checkKey]);

  return useMemo(() => {
    if (!on) return NO_LINKS;
    return (
      stored
        // The check runs once per link version; folderId always comes from the stored link.
        .map((l) =>
          checked[l.itemId]
            ? { ...l, ...checked[l.itemId], folderId: l.folderId }
            : l
        )
        .sort((a, b) => a.title.localeCompare(b.title))
    );
  }, [on, stored, checked]);
}

/** Links a library bank into the teacher's bank picker; reading the canonical also proves access. */
export async function addDistrictBank(
  uid: string,
  item: DistrictLibraryItem
): Promise<void> {
  const snap = await getDoc(doc(db, 'synced_question_banks', item.syncGroupId));
  if (!snap.exists()) throw new Error('This bank is no longer available.');
  const bank = snap.data() as SyncedQuestionBank;
  const link: DistrictLibraryBankLink = {
    itemId: item.id,
    kind: 'bank',
    syncGroupId: item.syncGroupId,
    ownerUid: bank.ownerUid,
    title: item.title,
    questionCount: bank.questionCount,
    targetIds: bank.targetIds ?? [],
    addedAt: Date.now(),
  };
  await setDoc(
    doc(db, 'users', uid, DISTRICT_LINKS_SUBCOLLECTION, item.id),
    link
  );
}

/** Files an added district bank in one of the teacher's Quiz library folders; null returns it to the District library folder. */
export async function moveDistrictBank(
  uid: string,
  itemId: string,
  folderId: string | null
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, DISTRICT_LINKS_SUBCOLLECTION, itemId), {
    folderId: folderId ?? deleteField(),
  });
}

export async function removeDistrictBank(
  uid: string,
  itemId: string
): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, DISTRICT_LINKS_SUBCOLLECTION, itemId));
}
