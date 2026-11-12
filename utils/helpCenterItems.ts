import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
  WidgetType,
} from '@/types';
import {
  UNFILED_CATEGORY_ID,
  isUnfiled,
  type HelpPublishRefusal,
  type HelpResourceItem,
} from '@/types/helpCenter';
import {
  loadBuildingSet,
  saveBuildingSetDoc,
  setHelpCenterFlag,
} from '@/hooks/useGuidedLearning';
import { publishTour } from '@/components/tours/publishedTours';
import { tourStepsOf } from '@/components/tours/tourSession';
import { anchorProblem } from '@/components/tours/tourHealth';
import { tourStepStatus } from '@/components/tours/editor/stepStatus';
import {
  isLiveTourSet,
  isWebTourSet,
} from '@/components/widgets/GuidedLearning/utils/liveTour';
import { openAssignmentIdsForSet } from '@/utils/guidedLearningFileRelease';

export const HELP_ITEMS_COLLECTION = 'help_resources';
const PERSONAL_GL_COLLECTION = 'guided_learning';
const UNTITLED = 'Untitled guide';

/** Who is filing the item; decides its scope (H20). */
export interface HelpAuthor {
  uid: string;
  email: string | null;
  orgId: string | null;
  isSuperAdmin: boolean;
}

/** A super admin's items are global, an org admin's belong to their org. */
export function helpScopeFor(author: HelpAuthor): string | null {
  if (author.isSuperAdmin) return null;
  if (!author.orgId)
    throw new Error('You need an organization to add Help Center items.');
  return author.orgId;
}

/** The personal set's id inside building_guided_learning once it moves. */
export const helpCopyIdFor = (personalSetId: string): string =>
  `help-${personalSetId}`;

type ItemSource = Pick<GuidedLearningSet, 'id' | 'title'> & {
  description?: string | null;
};

// Field list must match the rules `hasOnly` allowlist exactly.
export function buildHiddenHelpItem(
  set: ItemSource,
  author: HelpAuthor,
  id: string,
  opts: { order?: number; widgetTypes?: WidgetType[]; now?: number } = {}
): HelpResourceItem {
  const now = opts.now ?? Date.now();
  return {
    id,
    kind: 'guided-learning',
    title: (set.title.trim() || UNTITLED).slice(0, 200),
    description: (set.description ?? '').trim().slice(0, 1000),
    categoryId: UNFILED_CATEGORY_ID,
    order: opts.order ?? 0,
    visible: false,
    orgId: helpScopeFor(author),
    widgetTypes: opts.widgetTypes ?? [],
    url: null,
    embedType: null,
    setId: set.id,
    openCount: 0,
    createdBy: author.uid,
    createdByEmail: author.email ?? '',
    createdAt: now,
    updatedAt: now,
  };
}

/** Files a set in the Help Center as a Hidden, Unfiled item (H1, H4). */
export async function createHiddenHelpItem(
  set: ItemSource,
  author: HelpAuthor,
  opts: { order?: number; widgetTypes?: WidgetType[] } = {}
): Promise<HelpResourceItem> {
  const ref = doc(collection(db, HELP_ITEMS_COLLECTION));
  const item = buildHiddenHelpItem(set, author, ref.id, opts);
  await setDoc(ref, item);
  return item;
}

export type MoveSource =
  | {
      kind: 'building';
      set: Pick<GuidedLearningBuildingSetIndex, 'id' | 'title'> & {
        description?: string | null;
      };
    }
  | {
      kind: 'personal';
      set: Pick<
        GuidedLearningSetMetadata,
        'id' | 'title' | 'driveFileId' | 'updatedAt'
      >;
    };

export interface MoveDeps {
  /** The library hook's Drive read. */
  loadSetData: (driveFileId: string) => Promise<GuidedLearningSet>;
  /** The library hook's personal delete. */
  deleteSet: (setId: string, driveFileId: string) => Promise<void>;
  /** Items already loaded; a set one of them points at is not filed twice. */
  existingItems?: readonly HelpResourceItem[];
}

/** What happened to the library copy: a building set is flagged out of every library (H6); a personal one is removed, tagged until students close it (H5), or kept when edited after an older copy. */
export type MoveOutcome = 'flagged' | 'removed' | 'tagged' | 'kept';

export interface MoveResult {
  item: HelpResourceItem;
  /** The building set the item points at. */
  setId: string;
  original: MoveOutcome;
}

const itemFor = async (
  set: ItemSource,
  author: HelpAuthor,
  existing: readonly HelpResourceItem[] | undefined
): Promise<HelpResourceItem> =>
  existing?.find(
    (item) => item.kind === 'guided-learning' && item.setId === set.id
  ) ?? createHiddenHelpItem(set, author);

/** Moves a library set into the Help Center in one step (H4-H6). */
export async function moveSetToHelpCenter(
  source: MoveSource,
  author: HelpAuthor,
  deps: MoveDeps
): Promise<MoveResult> {
  if (source.kind === 'building') {
    await setHelpCenterFlag(source.set.id, true);
    const item = await itemFor(source.set, author, deps.existingItems);
    return { item, setId: source.set.id, original: 'flagged' };
  }

  // Personal sets live in Drive, which teachers can't read, so the set moves into a building copy.
  const personal = source.set;
  const copyId = helpCopyIdFor(personal.id);
  // One copy per personal set: moving it again reuses that copy, keeping admin edits.
  let copy = await loadBuildingSet(copyId);
  // An original edited after its older copy was made keeps the newer work.
  const replaceable = !copy || personal.updatedAt <= copy.createdAt;
  if (!copy) {
    const loaded = await deps.loadSetData(personal.driveFileId);
    const now = Date.now();
    copy = {
      ...loaded,
      id: copyId,
      isBuilding: true,
      helpCenter: true,
      authorUid: author.uid,
      createdAt: now,
      updatedAt: now,
    };
    await saveBuildingSetDoc(copy);
  } else if (!copy.helpCenter) {
    await setHelpCenterFlag(copyId, true);
  }
  const item = await itemFor(copy, author, deps.existingItems);
  if (!replaceable) return { item, setId: copyId, original: 'kept' };

  // Removed only after the copy is saved, and kept while students still work on it.
  const open = await openAssignmentIdsForSet(author.uid, personal.id);
  if (open.length > 0) {
    await markMovedToHelpCenter(author.uid, personal.id);
    return { item, setId: copyId, original: 'tagged' };
  }
  await deps.deleteSet(personal.id, personal.driveFileId);
  return { item, setId: copyId, original: 'removed' };
}

// Not a save, so updatedAt stays put and a later edit clears the tag.
const markMovedToHelpCenter = (uid: string, setId: string): Promise<void> =>
  updateDoc(doc(db, 'users', uid, PERSONAL_GL_COLLECTION, setId), {
    movedToHelpCenterAt: Date.now(),
  });

/** A personal set showing the Moved to Help Center tag: moved while in use and not edited since (H5). */
export const isPendingHelpCenterMove = (
  meta: Pick<GuidedLearningSetMetadata, 'movedToHelpCenterAt' | 'updatedAt'>
): boolean =>
  typeof meta.movedToHelpCenterAt === 'number' &&
  meta.updatedAt <= meta.movedToHelpCenterAt;

/** Removes a tagged personal set once no student has it open; run when the owner's library loads. */
export async function finishPendingMove(
  uid: string,
  meta: Pick<
    GuidedLearningSetMetadata,
    'id' | 'driveFileId' | 'movedToHelpCenterAt' | 'updatedAt'
  >,
  deleteSet: MoveDeps['deleteSet']
): Promise<'removed' | 'waiting' | 'none'> {
  if (!isPendingHelpCenterMove(meta)) return 'none';
  const open = await openAssignmentIdsForSet(uid, meta.id);
  if (open.length > 0) return 'waiting';
  await deleteSet(meta.id, meta.driveFileId);
  return 'removed';
}

/** Why Publish is refused for this item and its set, or null when it can publish (H15). */
export function publishRefusalOf(
  item: Pick<HelpResourceItem, 'kind' | 'categoryId' | 'setId'>,
  set: GuidedLearningSet | null
): HelpPublishRefusal | null {
  if (isUnfiled(item)) return 'unfiled';
  if (item.kind !== 'guided-learning') return null;
  if (!item.setId || !set) return 'missing-set';
  if (isWebTourSet(set)) return 'web-tour';
  if (!isLiveTourSet(set)) return set.steps.length > 0 ? null : 'no-steps';
  const steps = tourStepsOf(set);
  if (steps.length === 0) return 'no-steps';
  const statuses = steps.map((step) => tourStepStatus(step, []));
  const failing = steps.some((step, i) => {
    const status = statuses[i];
    if (status === 'unregistered' || status === 'missing') return true;
    return status === 'ok' && !!step.tour.anchor
      ? anchorProblem(step.tour.anchor) !== null
      : false;
  });
  if (failing) return 'failing-steps';
  if (statuses.includes('unbound')) return 'unchecked-steps';
  return null;
}

export type PublishResult =
  { ok: true } | { ok: false; reason: HelpPublishRefusal };

/** One Publish: a Live tour's snapshot first, then the item becomes visible (H15). */
export async function publishHelpItem(
  item: HelpResourceItem,
  uid: string
): Promise<PublishResult> {
  const set =
    item.kind === 'guided-learning' && item.setId
      ? await loadBuildingSet(item.setId)
      : null;
  const reason = publishRefusalOf(item, set);
  if (reason) return { ok: false, reason };
  if (set && isLiveTourSet(set)) await publishTour(set, uid);
  await updateDoc(doc(db, HELP_ITEMS_COLLECTION, item.id), {
    visible: true,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

/** Hides the item from teachers; its published tour snapshot stays for other launch points. */
export async function hideHelpItem(
  item: Pick<HelpResourceItem, 'id'>
): Promise<void> {
  await updateDoc(doc(db, HELP_ITEMS_COLLECTION, item.id), {
    visible: false,
    updatedAt: Date.now(),
  });
}

/** Makes a personal copy of a Picture guide and leaves the Help Center item in place (H7). */
export async function copyHelpItemToLibrary(
  item: Pick<HelpResourceItem, 'kind' | 'setId'>,
  uid: string,
  saveSet: (set: GuidedLearningSet) => Promise<unknown>
): Promise<GuidedLearningSet> {
  if (item.kind !== 'guided-learning' || !item.setId)
    throw new Error('Only a Picture guide can be copied to your library.');
  const source = await loadBuildingSet(item.setId);
  if (!source) throw new Error('This guide was deleted.');
  if (isLiveTourSet(source) || isWebTourSet(source))
    throw new Error('Only a Picture guide can be copied to your library.');
  const now = Date.now();
  // Drop building-only fields; the copy is the admin's own set.
  const { isBuilding: _isBuilding, helpCenter: _helpCenter, ...rest } = source;
  const copy: GuidedLearningSet = {
    ...rest,
    id: crypto.randomUUID(),
    authorUid: uid,
    createdAt: now,
    updatedAt: now,
  };
  await saveSet(copy);
  return copy;
}
