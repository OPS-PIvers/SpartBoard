// Shared and synced-collection board mirroring for Claude's board writes (AI_BOARDS D23).
import type * as admin from '../firebaseAdmin';
import { ToolError, type ToolContext } from './activity';
import { boardWidgets } from './boardStore';

type Doc = Record<string, unknown>;
type Snapshot = admin.firestore.DocumentSnapshot;
type WriteBatch = admin.firestore.WriteBatch;

const isObject = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Mirrors PII_WIDGET_FIELDS in utils/dashboardPII.ts; tests/mcpBoardSharePII.test.ts keeps them equal. */
export const PII_WIDGET_FIELDS = [
  'firstNames',
  'lastNames',
  'completedNames',
  'remainingStudents',
  'lastResult',
  'lockedNames',
  'unassignedNames',
  'doneNames',
  'jigsawHomeGroups',
  'jigsawExpertGroups',
  'names',
  'roster',
  'customRoster',
] as const;

// Same name-key rules as widgetPiiKeys in utils/dashboardPII.ts.
const ROSTER_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[\w-]*\d)[\w-]{16,})$/i;
const NAME_KEYED_TYPES = new Set(['stations', 'lunchCount', 'seating-chart']);
const QUIZ_TEAM_ID = /^(?:pin|uid)-/;

const hasNameKeys = (map: unknown): boolean =>
  isObject(map) && Object.keys(map).some((key) => !ROSTER_ID.test(key));

const piiKeys = (type: string, config: Doc): string[] => {
  const keys: string[] = [...PII_WIDGET_FIELDS];
  const custom = config.rosterMode === 'custom';
  if (
    config.assignments !== undefined &&
    (custom || (NAME_KEYED_TYPES.has(type) && hasNameKeys(config.assignments)))
  )
    keys.push('assignments');
  if (
    type === 'seating-chart' &&
    Array.isArray(config.savedPlans) &&
    config.savedPlans.some(
      (plan: unknown) =>
        isObject(plan) && (custom || hasNameKeys(plan.assignments))
    )
  )
    keys.push('savedPlans');
  if (type === 'scoreboard') {
    if (
      Array.isArray(config.teams) &&
      config.teams.some(
        (team: unknown) => isObject(team) && QUIZ_TEAM_ID.test(str(team.id))
      )
    )
      keys.push('teams', 'history');
    else if (
      Array.isArray(config.history) &&
      config.history.some(
        (entry: unknown) =>
          isObject(entry) &&
          Array.isArray(entry.changes) &&
          entry.changes.some(
            (change: unknown) =>
              isObject(change) && QUIZ_TEAM_ID.test(str(change.teamId))
          )
      )
    )
      keys.push('history');
  }
  return keys;
};

const isLegacyHiddenWordKey = (key: unknown): boolean =>
  typeof key === 'string' && key.includes('#') && !key.includes(':');

/** Same scrub as scrubWidgetsPII in utils/dashboardPII.ts. */
export function scrubWidgetsPII(widgets: Doc[]): Doc[] {
  return widgets.map((widget) => {
    const config: Doc = isObject(widget.config) ? { ...widget.config } : {};
    const keys = piiKeys(str(widget.type), config);
    for (const key of keys) delete config[key];
    if (keys.includes('teams')) config.teams = [];
    if (Array.isArray(config.hiddenResponses))
      config.hiddenResponses = config.hiddenResponses.filter(
        (key: unknown) => !isLegacyHiddenWordKey(key)
      );
    return { ...widget, config };
  });
}

/** What a Synced share holds: scrubbed, and without this teacher's own use stamps. */
export function sharedWidgets(widgets: Doc[]): Doc[] {
  return scrubWidgetsPII(widgets.filter((w) => w.transient !== true)).map(
    (widget) => {
      const out: Doc = { ...widget };
      delete out.lastUse;
      return out;
    }
  );
}

/** Co-edited board fields besides widgets that the share carries and the owner's board must match. */
export const SHARED_BOARD_FIELDS = [
  'settings',
  'globalStyle',
  'annotationOverlay',
] as const;

const LIVE_MODES = new Set(['synced', 'view-only']);

/** The share a board mirrors, when this teacher is its live host. */
export interface LiveShare {
  ref: admin.firestore.DocumentReference;
  snap: Snapshot;
  data: Doc;
}

/** A linked collection entry to rename alongside the board. */
export interface LinkedEntry {
  ref: admin.firestore.DocumentReference;
  snap: Snapshot;
  boards: Doc[];
}

export interface ShareState {
  share: LiveShare | null;
  link: LinkedEntry | null;
}

const NOT_OWNER =
  'Another teacher owns this board and shares it with this teacher, so Claude cannot change it. Make changes in SpartBoard.';

/** True when a guest's ended copy could still come back to life from its share. */
async function shareStillLive(ctx: ToolContext, board: Doc): Promise<boolean> {
  const snap = await ctx.db
    .doc(`shared_boards/${str(board.linkedShareId)}`)
    .get();
  if (!snap.exists) return false;
  const host = str(board.linkedShareHostUid);
  return !host || str(snap.get('originalAuthor')) === host;
}

async function readLiveShare(
  ctx: ToolContext,
  shareId: string
): Promise<LiveShare | null> {
  const ref = ctx.db.doc(`shared_boards/${shareId}`);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !isObject(data)) return null;
  // A share someone else re-created, or a frozen copy or substitute link, is not this board's live share.
  if (str(data.originalAuthor) !== ctx.uid) return null;
  const mode = str(data.intendedMode);
  if (mode && !LIVE_MODES.has(mode)) return null;
  return { ref, snap, data };
}

const MAX_COLLECTION_DEPTH = 20;

/** The live linked collection the board sits in, walking up its parent collections. */
async function linkedCollectionIdOf(
  ctx: ToolContext,
  collectionId: string
): Promise<string | null> {
  const seen = new Set<string>();
  let id = collectionId;
  while (id && !seen.has(id) && seen.size < MAX_COLLECTION_DEPTH) {
    seen.add(id);
    const snap = await ctx.db.doc(`users/${ctx.uid}/collections/${id}`).get();
    const data = snap.data();
    if (!snap.exists || !isObject(data)) return null;
    if (str(data.linkedCollectionId) && data.linkedCollectionEnded !== true)
      return str(data.linkedCollectionId);
    id = str(data.parentCollectionId);
  }
  return null;
}

/** Same rule as canEditLinkedCollection in utils/linkedCollectionSync.ts. */
const canEditLink = (link: Doc, uid: string): boolean => {
  if (link.ended === true) return false;
  if (str(link.hostUid) === uid) return true;
  const participants = isObject(link.participants) ? link.participants : {};
  const me = participants[uid];
  return (
    str(link.mode) === 'synced' &&
    isObject(me) &&
    str(me.role) === 'collaborator'
  );
};

async function readLinkedEntry(
  ctx: ToolContext,
  collectionId: string,
  shareId: string
): Promise<LinkedEntry | null> {
  const linkId = await linkedCollectionIdOf(ctx, collectionId);
  if (!linkId || linkId.includes('/')) return null;
  const ref = ctx.db.doc(`linked_collections/${linkId}`);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !isObject(data) || !canEditLink(data, ctx.uid))
    return null;
  const boards = Array.isArray(data.boards) ? data.boards.filter(isObject) : [];
  if (!boards.some((b) => str(b.shareId) === shareId)) return null;
  return { ref, snap, boards };
}

/** Refuses boards another teacher owns; for a live board, finds its share and synced-collection entry. */
export async function shareStateOf(
  ctx: ToolContext,
  board: Doc
): Promise<ShareState> {
  const shareId = str(board.linkedShareId);
  if (!shareId) return { share: null, link: null };
  const role = str(board.linkedShareRole);
  if (role !== 'owner') {
    // A View-Only copy is removed when its share ends; a guest's ended copy is theirs once the share is gone.
    if (
      role === 'viewer' ||
      board.linkedShareEnded !== true ||
      (await shareStillLive(ctx, board))
    )
      throw new ToolError(NOT_OWNER);
    return { share: null, link: null };
  }
  if (board.linkedShareEnded === true || shareId.includes('/'))
    return { share: null, link: null };
  const share = await readLiveShare(ctx, shareId);
  if (!share) return { share: null, link: null };
  const collectionId = str(board.collectionId);
  const link = collectionId
    ? await readLinkedEntry(ctx, collectionId, shareId)
    : null;
  return { share, link };
}

/** The board as co-teachers see it (the share wins, as when SpartBoard opens it), keeping this teacher's stamps and Drive-only fields. */
export function withShareContent(board: Doc, share: LiveShare | null): Doc {
  if (!share || !Array.isArray(share.data.widgets)) return board;
  const own = new Map(boardWidgets(board).map((w) => [str(w.id), w]));
  const widgets = boardWidgets(share.data).map((shared) => {
    const mine = own.get(str(shared.id));
    if (!mine) return shared;
    const out: Doc = { ...shared };
    const version = Math.max(num(shared.version), num(mine.version));
    if (version > 0) out.version = version;
    if (mine.lastUse !== undefined) out.lastUse = mine.lastUse;
    const mineConfig = isObject(mine.config) ? mine.config : {};
    const config: Doc = isObject(shared.config) ? { ...shared.config } : {};
    for (const key of piiKeys(str(mine.type), mineConfig))
      if (key in mineConfig) config[key] = mineConfig[key];
    out.config = config;
    return out;
  });
  const updatedAt = Math.max(num(board.updatedAt), num(share.data.updatedAt));
  const coEdited: Doc = {};
  for (const key of SHARED_BOARD_FIELDS)
    if (share.data[key] !== undefined) coEdited[key] = share.data[key];
  return {
    ...board,
    ...coEdited,
    widgets,
    ...(str(share.data.background)
      ? { background: str(share.data.background) }
      : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/** For reading: the board with its live share's content when this teacher hosts it. */
export async function liveBoardView<T extends Doc>(
  ctx: ToolContext,
  board: T
): Promise<T> {
  const shareId = str(board.linkedShareId);
  if (
    !shareId ||
    shareId.includes('/') ||
    str(board.linkedShareRole) !== 'owner' ||
    board.linkedShareEnded === true
  )
    return board;
  return withShareContent(board, await readLiveShare(ctx, shareId)) as T;
}

/** Adds the share and link writes to the board's batch, each conditional on what was read. */
export function mirrorToShare(
  ctx: ToolContext,
  batch: WriteBatch,
  state: ShareState,
  board: { name: string; background: string; widgets: Doc[] },
  now: number
): void {
  if (!state.share) return;
  batch.update(
    state.share.ref,
    {
      name: board.name,
      ...(board.background ? { background: board.background } : {}),
      widgets: sharedWidgets(board.widgets),
      updatedAt: now,
      updatedBy: ctx.uid,
    },
    { lastUpdateTime: state.share.snap.updateTime }
  );
  const link = state.link;
  if (!link) return;
  const shareId = state.share.ref.id;
  if (
    !link.boards.some(
      (b) => str(b.shareId) === shareId && str(b.name) !== board.name
    )
  )
    return;
  batch.update(
    link.ref,
    {
      boards: link.boards.map((b) =>
        str(b.shareId) === shareId ? { ...b, name: board.name } : b
      ),
      updatedAt: now,
      updatedBy: ctx.uid,
    },
    { lastUpdateTime: link.snap.updateTime }
  );
}
