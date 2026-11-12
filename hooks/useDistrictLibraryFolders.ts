// District library folders: the staff-readable folder tree, admin-only folder audiences, and admin edits.
import { useEffect, useState } from 'react';
import {
  deleteField,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import {
  DISTRICT_LIBRARY_COLLECTION,
  DISTRICT_LIBRARY_INDEX_COLLECTION,
  DISTRICT_LIBRARY_INDEX_DOC,
} from '@/utils/districtLibraryPublish';
import {
  buildDistrictLibraryIndex,
  normalizeTargeting,
  type TargetingBuilding,
} from '@/utils/districtLibraryTargeting';
import {
  DISTRICT_AUDIENCES_DOC,
  DISTRICT_FOLDERS_DOC,
  childFolders,
  folderAudienceFor,
  isInFolder,
  itemFolderId,
  nextFolderOrder,
  sameAudience,
  wouldNestInSelf,
  type FolderAudience,
  type FolderMap,
} from '@/utils/districtLibraryFolders';
import type {
  DistrictLibraryFolderAudiences,
  DistrictLibraryFolders,
  DistrictLibraryItem,
  DistrictLibraryTargeting,
} from '@/types/districtLibrary';

const foldersRef = () =>
  doc(db, DISTRICT_LIBRARY_INDEX_COLLECTION, DISTRICT_FOLDERS_DOC);
const audiencesRef = () =>
  doc(db, DISTRICT_LIBRARY_INDEX_COLLECTION, DISTRICT_AUDIENCES_DOC);
const indexRef = () =>
  doc(db, DISTRICT_LIBRARY_INDEX_COLLECTION, DISTRICT_LIBRARY_INDEX_DOC);
const itemRef = (id: string) => doc(db, DISTRICT_LIBRARY_COLLECTION, id);

const NO_FOLDERS: FolderMap = {};
const NO_AUDIENCES: DistrictLibraryFolderAudiences['folders'] = {};

/** The folder tree; any district staff member may read it. Empty when `enabled` is false. */
export function useDistrictFolders(enabled: boolean): FolderMap {
  const [folders, setFolders] = useState<FolderMap>(NO_FOLDERS);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      foldersRef(),
      (snap) =>
        setFolders(
          snap.exists()
            ? ((snap.data() as DistrictLibraryFolders).folders ?? NO_FOLDERS)
            : NO_FOLDERS
        ),
      (err) => logError('useDistrictFolders', err)
    );
  }, [enabled]);
  return enabled ? folders : NO_FOLDERS;
}

/** Each folder's audience; site admins only. */
export function useDistrictFolderAudiences(
  enabled: boolean
): DistrictLibraryFolderAudiences['folders'] {
  const [audiences, setAudiences] =
    useState<DistrictLibraryFolderAudiences['folders']>(NO_AUDIENCES);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      audiencesRef(),
      (snap) =>
        setAudiences(
          snap.exists()
            ? ((snap.data() as DistrictLibraryFolderAudiences).folders ??
                NO_AUDIENCES)
            : NO_AUDIENCES
        ),
      (err) => logError('useDistrictFolderAudiences', err)
    );
  }, [enabled]);
  return enabled ? audiences : NO_AUDIENCES;
}

export async function createDistrictFolder(
  folders: FolderMap,
  name: string,
  parentId: string | null
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(
    foldersRef(),
    {
      folders: {
        [id]: {
          name: name.trim(),
          parentId,
          order: nextFolderOrder(folders, parentId),
        },
      },
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return id;
}

export async function renameDistrictFolder(
  folderId: string,
  name: string
): Promise<void> {
  await setDoc(
    foldersRef(),
    { folders: { [folderId]: { name: name.trim() } }, updatedAt: Date.now() },
    { merge: true }
  );
}

/** Deletes an empty folder; a folder with items or subfolders is refused. */
export async function deleteDistrictFolder(
  folders: FolderMap,
  items: readonly DistrictLibraryItem[],
  folderId: string
): Promise<void> {
  if (
    childFolders(folders, folderId).length > 0 ||
    items.some((i) => itemFolderId(folders, i) === folderId)
  ) {
    throw new Error('Move or delete what is inside this folder first.');
  }
  await setDoc(
    foldersRef(),
    { folders: { [folderId]: deleteField() }, updatedAt: Date.now() },
    { merge: true }
  );
  await setDoc(
    audiencesRef(),
    { folders: { [folderId]: deleteField() }, updatedAt: Date.now() },
    { merge: true }
  );
}

/** Index entry patch for one item after its targeting changed. */
const indexPatchFor = (item: DistrictLibraryItem, now: number) => {
  const entry = buildDistrictLibraryIndex([item], now).items[item.id];
  return { items: { [item.id]: entry ?? deleteField() }, updatedAt: now };
};

/** Writes one item's folder, audience flag and targeting with its index entry in one transaction. */
async function writeItem(
  itemId: string,
  fields: {
    folderId?: string | null;
    ownTargeting?: boolean;
    audience?: FolderAudience;
  },
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(itemRef(itemId));
    if (!snap.exists())
      throw new Error('This item is no longer in the library.');
    const current = snap.data() as DistrictLibraryItem;
    const now = Date.now();
    const update: Record<string, unknown> = { updatedAt: now, updatedBy: uid };
    const merged: DistrictLibraryItem = { ...current, updatedAt: now };
    if (fields.folderId !== undefined) {
      update.folderId = fields.folderId ?? deleteField();
      merged.folderId = fields.folderId ?? undefined;
    }
    if (fields.ownTargeting !== undefined) {
      update.ownTargeting = fields.ownTargeting ? true : deleteField();
      merged.ownTargeting = fields.ownTargeting || undefined;
    }
    if (fields.audience) {
      const { everyone, targetBuildings, targetGrades, targetEmails } =
        fields.audience;
      const audience = {
        everyone,
        targetBuildings: [...targetBuildings],
        targetGrades: [...targetGrades],
        targetEmails: [...targetEmails],
        gradeBuildings: [...fields.audience.gradeBuildings],
      };
      Object.assign(update, audience);
      Object.assign(merged, audience);
    }
    tx.update(itemRef(itemId), update);
    tx.set(indexRef(), indexPatchFor(merged, now), { merge: true });
  });
}

/** Gives every item that follows a folder under `rootId` (or anywhere when null) that folder's audience. */
async function applyFolderAudiences(
  items: readonly DistrictLibraryItem[],
  folders: FolderMap,
  audiences: DistrictLibraryFolderAudiences['folders'],
  uid: string,
  rootId: string | null
): Promise<void> {
  for (const item of items) {
    if (item.ownTargeting) continue;
    const home = itemFolderId(folders, item);
    if (home === null) continue;
    if (rootId !== null && !isInFolder(folders, home, rootId)) continue;
    const found = folderAudienceFor(folders, audiences, home);
    if (found && !sameAudience(found.audience, item)) {
      await writeItem(item.id, { audience: found.audience }, uid);
    }
  }
}

/** Saves who a folder reaches, then gives it to every item in it that follows its folder. */
export async function saveDistrictFolderAudience(
  folderId: string,
  targeting: DistrictLibraryTargeting,
  buildings: readonly TargetingBuilding[],
  ctx: {
    folders: FolderMap;
    audiences: DistrictLibraryFolderAudiences['folders'];
    items: readonly DistrictLibraryItem[];
    uid: string;
  }
): Promise<void> {
  const clean = normalizeTargeting(targeting, buildings);
  await setDoc(
    audiencesRef(),
    { folders: { [folderId]: clean }, updatedAt: Date.now() },
    { merge: true }
  );
  await applyFolderAudiences(
    ctx.items,
    ctx.folders,
    { ...ctx.audiences, [folderId]: clean },
    ctx.uid,
    folderId
  );
}

/** Moves items into a folder (null for the top level); items that follow their folder take its audience. */
export async function moveDistrictItems(
  itemIds: readonly string[],
  folderId: string | null,
  ctx: {
    folders: FolderMap;
    audiences: DistrictLibraryFolderAudiences['folders'];
    items: readonly DistrictLibraryItem[];
    uid: string;
  }
): Promise<void> {
  const found = folderAudienceFor(ctx.folders, ctx.audiences, folderId);
  for (const id of itemIds) {
    const item = ctx.items.find((i) => i.id === id);
    const follows = !item?.ownTargeting && folderId !== null;
    await writeItem(
      id,
      {
        folderId,
        ...(follows && found ? { audience: found.audience } : {}),
      },
      ctx.uid
    );
  }
}

/** Moves a folder under another folder (null for the top level), then refreshes audiences inside it. */
export async function moveDistrictFolder(
  folderId: string,
  parentId: string | null,
  ctx: {
    folders: FolderMap;
    audiences: DistrictLibraryFolderAudiences['folders'];
    items: readonly DistrictLibraryItem[];
    uid: string;
  }
): Promise<void> {
  if (folderId === parentId || wouldNestInSelf(ctx.folders, folderId, parentId))
    throw new Error('A folder cannot go inside itself.');
  await setDoc(
    foldersRef(),
    {
      folders: {
        [folderId]: {
          parentId,
          order: nextFolderOrder(ctx.folders, parentId),
        },
      },
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  const moved: FolderMap = {
    ...ctx.folders,
    [folderId]: { ...ctx.folders[folderId], parentId },
  };
  await applyFolderAudiences(
    ctx.items,
    moved,
    ctx.audiences,
    ctx.uid,
    folderId
  );
}

/** Switches an item between its folder's audience and its own; going back to the folder takes the folder's audience now. */
export async function setDistrictItemFollowsFolder(
  item: DistrictLibraryItem,
  follows: boolean,
  ctx: {
    folders: FolderMap;
    audiences: DistrictLibraryFolderAudiences['folders'];
    uid: string;
  }
): Promise<void> {
  const found = follows
    ? folderAudienceFor(ctx.folders, ctx.audiences, item.folderId ?? null)
    : null;
  await writeItem(
    item.id,
    { ownTargeting: !follows, ...(found ? { audience: found.audience } : {}) },
    ctx.uid
  );
}
