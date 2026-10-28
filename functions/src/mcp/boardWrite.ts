// Board writes for create_board and edit_board, plus board revision restore (AI_BOARDS D1, D3, D15–D19, D21, D22, D24).
import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import {
  ToolError,
  logActivity,
  reserveBoardOp,
  snapshotRevision,
  type ToolContext,
} from './activity';
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  BACKGROUND_PATTERNS,
  DEFAULT_BOARD_BACKGROUND,
} from './boardBackgrounds.gen';
import {
  buildWidgetConfig,
  canUseWidget,
  loadWidgetAccessContext,
  reconcile,
  widgetConfigSources,
  type WidgetAccessContext,
} from './boardConfig';
import {
  BOARD_TEMPLATES,
  SNAP_ZONE_LAYOUTS,
  applyTemplate,
  isFixed,
  placeInZone,
  type PlacedRect,
  type ScreenShape,
  type SnapZone,
} from './boardEngine.gen';
import {
  LIBRARY_ITEM_KEYS,
  assertBoardId,
  boardName,
  boardWidgets,
  boardsPath,
  hiddenKey,
  widgetLabel,
  widgetTypeName,
} from './boardStore';
import { WIDGET_CONFIG_RUNTIME } from './widgetConfigRuntime.gen';
import { checkWidgetSettings } from './widgetConfigValidator';

type Doc = Record<string, unknown>;

export const MAX_BOARDS_PER_CALL = 5;
export const MAX_WIDGETS_PER_BOARD = 20;
export const MAX_OPS_PER_CALL = 30;
export const MAX_BOARD_NAME = 100;
export const MAX_WIDGET_TITLE = 80;
/** Under Firestore's 1 MiB document cap, with room for the board's other fields. */
const MAX_BOARD_BYTES = 900_000;
const MAX_ERRORS = 10;
const COMMIT_ATTEMPTS = 3;
/** utils/migration.ts has no config migration steps yet; tests/mcpBoardBackgroundsCopy.test.ts fails when one is added. */
const CONFIG_VERSION = 0;

const isObject = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const ITEM_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const BOARD_BACKGROUNDS: readonly { id: string; name: string }[] = [
  ...BACKGROUND_COLORS.map((c) => ({
    id: c.id,
    name: c.id.replace(/^bg-/, '').replace(/-/g, ' '),
  })),
  ...BACKGROUND_PATTERNS.map((p) => ({ id: p.id, name: p.label })),
  ...BACKGROUND_GRADIENTS.map((g) => ({
    id: g.id,
    name: `${g.label} gradient`,
  })),
];
const BACKGROUND_IDS = new Set(BOARD_BACKGROUNDS.map((b) => b.id));

const FULL_LAYOUT = {
  id: 'full',
  zones: [{ id: 'full', x: 0, y: 0, w: 1, h: 1 }],
} as const;

/** Class-based widgets use the class picked in SpartBoard; Claude never sets one (D18). */
const CLASS_WIDGETS = new Set([
  'random',
  'seating-chart',
  'stations',
  'classes',
  'lunchCount',
  'scoreboard',
]);
/** Server-owned Embed fields: the app's link check writes them, and a new link resets them. */
const EMBED_CHECK_KEYS = new Set(['isEmbeddable', 'blockedReason']);
/** What summarizeSettings puts in place of a value Claude was not shown in full. */
const SUMMARY_MARKER =
  /^\[(embedded file|private link|nested settings|class group)\]$|… \(\d+ characters\)$|^… and \d+ more$/;

const LIBRARY_COLLECTIONS: Readonly<Record<string, string>> = {
  quiz: 'quizzes',
  video_activity: 'video_activities',
  flashcard_set: 'flashcard_sets',
  activity_wall: 'activity_wall_activities',
  guided_learning: 'guided_learning',
  mini_app: 'miniapps',
};
const LIBRARY_TOOL: Readonly<Record<string, string>> = {
  quiz: 'list_quizzes',
  video_activity: 'list_video_activities',
  flashcard_set: 'list_flashcard_sets',
  activity_wall: 'list_activity_walls',
  guided_learning: 'list_guided_learning',
  mini_app: 'list_mini_apps',
};

export const NOTE_EMBED_ACCESS =
  'Embedded Google files only show for viewers who can open them; remind the teacher to share the file with view access.';
export const NOTE_CLASS =
  'Class-based widgets use the class picked in SpartBoard. If none is picked, the teacher picks one on the board.';
export const NOTE_ASSIGN =
  'Quiz and video activity widgets open on the teacher’s library; the teacher assigns the item from there.';
export const NOTE_SHARED =
  'This board is shared live. Co-teachers see the change once the teacher opens the board in SpartBoard.';

export interface WidgetSpec {
  type: string;
  zone_id: string;
  layout_id?: string;
  title?: string;
  settings?: Doc;
  library_item_id?: string;
}

export type BoardOp =
  | ({ op: 'add_widget' } & WidgetSpec)
  | {
      op: 'update_widget';
      widget_id: string;
      settings?: Doc;
      title?: string | null;
      library_item_id?: string;
    }
  | {
      op: 'move_widget';
      widget_id: string;
      zone_id: string;
      layout_id?: string;
    }
  | { op: 'remove_widget'; widget_id: string }
  | {
      op: 'apply_template';
      template_id: string;
      widgets: { widget_id: string; zone_id: string }[];
    }
  | { op: 'rename'; name: string }
  | { op: 'set_background'; background: string };

/** One problem with one requested change; collected so Claude sees every fix at once. */
class OpProblem extends Error {}

/** Everything a call reads once and every op shares. */
interface WriteSession {
  ctx: ToolContext;
  access: WidgetAccessContext;
  screen: ScreenShape;
  library: Map<string, Promise<Doc | null>>;
  notes: Set<string>;
}

async function openSession(
  ctx: ToolContext,
  screen: ScreenShape
): Promise<WriteSession> {
  return {
    ctx,
    access: await loadWidgetAccessContext(ctx.db, ctx.uid, ctx.email),
    screen,
    library: new Map(),
    notes: new Set(),
  };
}

/** A snap layout or template id, else the layout the call already chose. */
function resolveZone(
  layoutId: string | undefined,
  zoneId: string,
  fallbackLayout: string | null
): SnapZone {
  const id = layoutId ?? fallbackLayout;
  if (!id)
    throw new OpProblem(
      `say which layout zone "${zoneId}" is in with layout_id (a snap layout or template id from get_board_guide)`
    );
  const template = BOARD_TEMPLATES.find((t) => t.id === id);
  const layout =
    id === FULL_LAYOUT.id
      ? FULL_LAYOUT
      : SNAP_ZONE_LAYOUTS.find((l) => l.id === (template?.layoutId ?? id));
  if (!layout)
    throw new OpProblem(
      `"${id}" is not a snap layout or template; see get_board_guide`
    );
  const zone = layout.zones.find((z) => z.id === zoneId);
  if (!zone)
    throw new OpProblem(
      `"${zoneId}" is not a zone of "${id}"; its zones are ${layout.zones.map((z) => z.id).join(', ')}`
    );
  return { ...zone };
}

const geometry = (rect: PlacedRect) => ({
  x: rect.x,
  y: rect.y,
  w: rect.w,
  h: rect.h,
  xProp: rect.xProp,
  yProp: rect.yProp,
  wProp: rect.wProp,
  hProp: rect.hProp,
  aspectRatio: rect.aspectRatio,
});

/** Settings keys Claude may send: no class or student state, no library ids, no round-tripped summaries. */
function guardSettings(type: string, settings: Doc | undefined): void {
  if (!settings) return;
  const itemKey = LIBRARY_ITEM_KEYS[type]?.key;
  for (const key of Object.keys(settings)) {
    if (hiddenKey(key))
      throw new OpProblem(
        `\`${key}\` is class or student data; Claude can't set it`
      );
    if (key === itemKey)
      throw new OpProblem(
        `put the ${LIBRARY_ITEM_KEYS[type].kind.replace('_', ' ')} on the widget with library_item_id instead of \`${key}\``
      );
    if (type === 'embed' && EMBED_CHECK_KEYS.has(key))
      throw new OpProblem(`\`${key}\` is set by SpartBoard's link check`);
  }
  const marker = findMarker(settings, 0);
  if (marker)
    throw new OpProblem(
      `"${marker}" is a placeholder from get_board, not a real value; send the full value or leave that setting out`
    );
}

function findMarker(value: unknown, depth: number): string | null {
  if (typeof value === 'string')
    return SUMMARY_MARKER.test(value) ? value.slice(0, 60) : null;
  if (depth > 20 || typeof value !== 'object' || value === null) return null;
  for (const child of Object.values(value)) {
    const hit = findMarker(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Scoreboard teams that are a class's students or groups; get_board never shows their real names. */
function hasClassTeams(config: Doc): boolean {
  if (str(config.liveQuizWidgetId)) return true;
  return (
    Array.isArray(config.teams) &&
    config.teams.some(
      (t: unknown) =>
        isObject(t) &&
        (Array.isArray(t.memberStudentIds) || str(t.linkedRosterGroupId))
    )
  );
}

/** Embed links keep the teacher's form (the widget converts edit links when it draws); a new link resets the link check. */
function embedPatch(settings: Doc, previous?: Doc): Doc {
  if (!('url' in settings)) return {};
  const raw = str(settings.url).trim();
  if (!raw) return { url: '', isEmbeddable: true, blockedReason: '' };
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OpProblem(`"${raw.slice(0, 100)}" is not a web link`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    throw new OpProblem(`"${raw.slice(0, 100)}" is not a web link`);
  if (previous && str(previous.url) === url) return { url };
  return { url, isEmbeddable: true, blockedReason: '' };
}

async function libraryItem(
  session: WriteSession,
  kind: string,
  id: string
): Promise<Doc> {
  const tool = LIBRARY_TOOL[kind];
  const missing = () =>
    new OpProblem(
      `${kind.replace('_', ' ')} ${id.slice(0, 128)} is not in this teacher's library; use ${tool} to find its id`
    );
  if (!ITEM_ID.test(id)) throw missing();
  const key = `${kind}/${id}`;
  if (!session.library.has(key))
    session.library.set(
      key,
      session.ctx.db
        .doc(`users/${session.ctx.uid}/${LIBRARY_COLLECTIONS[kind]}/${id}`)
        .get()
        .then((snap) => {
          const data = snap.data();
          return snap.exists && isObject(data) ? data : null;
        })
    );
  const data = await session.library.get(key);
  if (!data) throw missing();
  return data;
}

/** The config fields that put a library item on its widget, the way the widget's own library picker sets them (D16). */
async function libraryPatch(
  session: WriteSession,
  type: string,
  id: string
): Promise<Doc> {
  const ref = LIBRARY_ITEM_KEYS[type];
  if (!ref)
    throw new OpProblem(
      `a ${widgetTypeName(type)} widget doesn't show library items`
    );
  const item = await libraryItem(session, ref.kind, id);
  const title = str(item.title).trim() || 'Untitled';
  const uid = session.ctx.uid;
  switch (type) {
    case 'quiz':
      session.notes.add(NOTE_ASSIGN);
      return {
        selectedQuizId: id,
        selectedQuizTitle: title,
        selectedQuizOwnerUid: uid,
      };
    case 'video-activity':
      session.notes.add(NOTE_ASSIGN);
      return {
        selectedActivityId: id,
        selectedActivityTitle: title,
        selectedActivityOwnerUid: uid,
      };
    case 'flashcards':
      return { view: 'present', presentSetId: id, presentSetOwnerUid: uid };
    case 'activity-wall':
      return { activeActivityId: id, activeActivityOwnerUid: uid };
    case 'guided-learning':
      return { view: 'player', playerSetId: id, playerSetOwnerUid: uid };
    case 'miniApp':
      if (typeof item.html !== 'string' || !item.html.trim())
        throw new OpProblem(`mini-app ${id} has no app to show`);
      return {
        activeApp: {
          id,
          title,
          html: item.html,
          createdAt: num(item.createdAt) || Date.now(),
          ...(item.collectsResults === true ? { collectsResults: true } : {}),
          ...(isObject(item.manifest) ? { manifest: item.manifest } : {}),
        },
        activeAppUnsaved: false,
      };
    default:
      throw new OpProblem(
        `a ${widgetTypeName(type)} widget doesn't show library items`
      );
  }
}

/** Top-level widget defaults other than size and config, as addWidget spreads them. */
function topDefaults(type: string): Doc {
  const raw: unknown = WIDGET_CONFIG_RUNTIME.defaults[type];
  if (!isObject(raw)) return {};
  const out: Doc = {};
  for (const [key, value] of Object.entries(raw))
    if (!['x', 'y', 'w', 'h', 'config'].includes(key))
      out[key] = structuredClone(value);
  return out;
}

async function buildNewWidget(
  session: WriteSession,
  spec: WidgetSpec,
  rect: PlacedRect,
  z: number
): Promise<Doc> {
  const access = await canUseWidget(session.access, spec.type);
  if (!access.ok) throw new OpProblem(access.message);
  guardSettings(spec.type, spec.settings);
  const built = buildWidgetConfig(
    spec.type,
    spec.settings,
    widgetConfigSources(session.access, spec.type)
  );
  if (!built.ok) throw new OpProblem(built.errors.join('; '));
  const config: Doc = {
    ...built.config,
    ...(spec.type === 'embed' && spec.settings
      ? embedPatch(spec.settings)
      : {}),
    ...(spec.library_item_id
      ? await libraryPatch(session, spec.type, spec.library_item_id)
      : {}),
  };
  if (spec.type === 'embed' && str(config.url)) noteEmbed(session, config);
  if (CLASS_WIDGETS.has(spec.type)) session.notes.add(NOTE_CLASS);
  const title = spec.title?.trim();
  return {
    ...topDefaults(spec.type),
    id: randomUUID(),
    type: spec.type,
    ...geometry(rect),
    z,
    flipped: false,
    version: 1,
    configVersion: CONFIG_VERSION,
    ...(title ? { customTitle: title } : {}),
    config,
  };
}

function noteEmbed(session: WriteSession, config: Doc): void {
  try {
    const host = new URL(str(config.url)).hostname.toLowerCase();
    if (/(^|\.)google\.com$/.test(host)) session.notes.add(NOTE_EMBED_ACCESS);
  } catch {
    // embedPatch already refused links that don't parse.
  }
}

const maxZ = (widgets: Doc[]): number =>
  widgets.reduce((max, w) => Math.max(max, num(w.z)), 0);

function bumped(widget: Doc, patch: Doc): Doc {
  return { ...widget, ...patch, version: num(widget.version) + 1 };
}

interface Applied {
  board: Doc;
  changes: string[];
}

/** Applies every op to a copy of the board; any problem refuses the whole call so a board never half-changes. */
async function applyOps(
  session: WriteSession,
  board: Doc,
  ops: readonly BoardOp[]
): Promise<Applied> {
  let widgets = boardWidgets(board).map((w) => ({ ...w }));
  let name = str(board.name);
  let background = str(board.background);
  let layout: string | null = null;
  const touched = new Set<string>();
  const changes: string[] = [];
  const problems: string[] = [];
  let added = 0;

  const find = (id: string): number => {
    const i = widgets.findIndex((w) => str(w.id) === id);
    if (i < 0)
      throw new OpProblem(
        `widget ${id.slice(0, 128)} is not on this board; read get_board for widget ids`
      );
    return i;
  };
  const once = (id: string) => {
    if (touched.has(id))
      throw new OpProblem(
        `widget ${id.slice(0, 128)} is changed twice in one call; combine those changes`
      );
    touched.add(id);
  };
  const assertMovable = (widget: Doc) => {
    if (
      isFixed({
        id: str(widget.id),
        isLocked: widget.isLocked === true,
        isPinned: widget.isPinned === true,
      })
    )
      throw new OpProblem(
        `${widgetLabel(widget)} is locked or pinned in place by the teacher`
      );
  };
  const move = (i: number, zone: SnapZone) => {
    widgets[i] = bumped(widgets[i], {
      ...geometry(placeInZone(zone, session.screen)),
      minimized: false,
      maximized: false,
    });
  };

  for (const [index, op] of ops.entries()) {
    try {
      switch (op.op) {
        case 'add_widget': {
          const zone = resolveZone(op.layout_id, op.zone_id, layout);
          const widget = await buildNewWidget(
            session,
            op,
            placeInZone(zone, session.screen),
            maxZ(widgets) + 1
          );
          widgets = [...widgets, widget];
          touched.add(str(widget.id));
          added += 1;
          changes.push(
            `Added ${widgetLabel(widget)} as widget ${str(widget.id)}.`
          );
          break;
        }
        case 'update_widget': {
          const i = find(op.widget_id);
          once(op.widget_id);
          const widget = widgets[i];
          const type = str(widget.type);
          const current = isObject(widget.config) ? widget.config : {};
          let config: Doc = current;
          if (op.settings) {
            guardSettings(type, op.settings);
            if (
              type === 'scoreboard' &&
              'teams' in op.settings &&
              hasClassTeams(current)
            )
              throw new OpProblem(
                'these scoreboard teams come from a class; change them in SpartBoard'
              );
            const checked = checkWidgetSettings(type, op.settings);
            if (!checked.ok) throw new OpProblem(checked.errors.join('; '));
            config = reconcile(type, checked.settings, {
              ...current,
              ...checked.settings,
              ...(type === 'embed'
                ? embedPatch(checked.settings, current)
                : {}),
            });
          }
          if (op.library_item_id)
            config = {
              ...config,
              ...(await libraryPatch(session, type, op.library_item_id)),
            };
          if (
            type === 'embed' &&
            op.settings &&
            'url' in op.settings &&
            str(config.url)
          )
            noteEmbed(session, config);
          const title =
            op.title === undefined
              ? {}
              : { customTitle: op.title?.trim() ? op.title.trim() : null };
          widgets[i] = bumped(widget, { ...title, config });
          changes.push(`Changed ${widgetLabel(widgets[i])}.`);
          break;
        }
        case 'move_widget': {
          const i = find(op.widget_id);
          once(op.widget_id);
          assertMovable(widgets[i]);
          move(i, resolveZone(op.layout_id, op.zone_id, layout));
          changes.push(`Moved ${widgetLabel(widgets[i])} to ${op.zone_id}.`);
          break;
        }
        case 'remove_widget': {
          const i = find(op.widget_id);
          once(op.widget_id);
          if (widgets[i].isLocked === true)
            throw new OpProblem(
              `${widgetLabel(widgets[i])} is locked by the teacher`
            );
          changes.push(`Removed ${widgetLabel(widgets[i])}.`);
          widgets = widgets.filter((_, at) => at !== i);
          break;
        }
        case 'apply_template': {
          const template = BOARD_TEMPLATES.find((t) => t.id === op.template_id);
          if (!template)
            throw new OpProblem(
              `"${op.template_id}" is not a template; see get_board_guide`
            );
          const result = applyTemplate(
            template,
            op.widgets.map((w) => ({ ...w, zoneId: w.zone_id })),
            session.screen
          );
          if (result.issues.length > 0)
            throw new OpProblem(
              result.issues
                .map((issue) =>
                  issue.problem === 'unknown-zone'
                    ? `"${issue.zoneId}" is not a zone of ${template.id}`
                    : `zone "${issue.zoneId}" is used twice`
                )
                .join('; ')
            );
          for (const placement of result.placements) {
            const i = find(placement.widget_id);
            once(placement.widget_id);
            assertMovable(widgets[i]);
            widgets[i] = bumped(widgets[i], {
              ...geometry(placement.rect),
              minimized: false,
              maximized: false,
            });
          }
          layout = template.id;
          changes.push(
            `Laid the board out as "${template.name}"${result.emptyZones.length > 0 ? `; empty zones: ${result.emptyZones.join(', ')}` : ''}.`
          );
          break;
        }
        case 'rename': {
          const next = op.name.trim();
          if (!next) throw new OpProblem('the board name is empty');
          name = next.slice(0, MAX_BOARD_NAME);
          changes.push(`Renamed the board to "${name}".`);
          break;
        }
        case 'set_background': {
          if (!BACKGROUND_IDS.has(op.background))
            throw new OpProblem(
              'use a background_id from get_board_guide backgrounds'
            );
          background = op.background;
          changes.push('Changed the background.');
          break;
        }
      }
    } catch (err) {
      if (!(err instanceof OpProblem)) throw err;
      problems.push(`Change ${index + 1} (${op.op}): ${err.message}.`);
    }
  }

  if (added > 0 && widgets.length > MAX_WIDGETS_PER_BOARD)
    problems.push(
      `A board holds ${MAX_WIDGETS_PER_BOARD} widgets at most; this would make ${widgets.length}.`
    );
  if (problems.length > 0) throw problemError(problems);
  return {
    board: { ...board, name, background, widgets: withoutUndefined(widgets) },
    changes,
  };
}

function problemError(problems: string[]): ToolError {
  const extra = problems.length - MAX_ERRORS;
  return new ToolError(
    [
      'Nothing was changed.',
      ...problems.slice(0, MAX_ERRORS),
      ...(extra > 0 ? [`…and ${extra} more problems.`] : []),
    ].join('\n')
  );
}

/** Firestore refuses undefined, which a default or a merged config can carry. */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value))
    return value.map((v: unknown) =>
      v === undefined ? null : withoutUndefined(v)
    ) as T;
  if (!isObject(value)) return value;
  const out: Doc = {};
  for (const [key, child] of Object.entries(value))
    if (child !== undefined) out[key] = withoutUndefined(child);
  return out as T;
}

const byteSize = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), 'utf8');

function assertFits(board: Doc): void {
  if (byteSize(board) > MAX_BOARD_BYTES)
    throw new ToolError(
      'Nothing was changed: the board would be too large to save. Use fewer or smaller widgets, such as a smaller mini-app.'
    );
}

/** The board as it was, for 30 days; legacy inline ink is left out of a board near the size cap (D21). */
export function revisionData(board: Doc): { data: Doc; inkLeftOut: boolean } {
  const data: Doc = { ...board };
  delete data.id;
  if (byteSize(data) <= MAX_BOARD_BYTES) return { data, inkLeftOut: false };
  const widgets = boardWidgets(data).map((w) => {
    const next: Doc = { ...w };
    delete next.annotation;
    if (isObject(w.config) && 'paths' in w.config) {
      const config: Doc = { ...w.config };
      delete config.paths;
      next.config = config;
    }
    return next;
  });
  const trimmed: Doc = { ...data, widgets };
  delete trimmed.annotationOverlay;
  if (byteSize(trimmed) > MAX_BOARD_BYTES)
    throw new ToolError(
      'Nothing was changed: this board is too large to keep a previous version of. Make this change in SpartBoard.'
    );
  return { data: trimmed, inkLeftOut: true };
}

const claudeStamp = (board: Doc, now: number) => ({
  claudeEditedAt: now,
  // A board Claude made that the teacher hasn't opened yet still reads "Made with Claude".
  claudeAction:
    board.claudeAction === 'created' && board.claudeUnseen === true
      ? 'created'
      : 'edited',
  claudeUnseen: true,
});

/** Boards another teacher shares into this list are theirs; edits go through SpartBoard. */
function assertOwnBoard(board: Doc): void {
  const role = str(board.linkedShareRole);
  if (str(board.linkedShareId) && role && role !== 'owner')
    throw new ToolError(
      'Another teacher owns this board and shares it with this teacher, so Claude cannot change it. Make changes in SpartBoard.'
    );
}

const liveShared = (board: Doc): boolean =>
  !!str(board.linkedShareId) && board.linkedShareEnded !== true;

const isPreconditionFailure = (err: unknown): boolean => {
  const code = (err as { code?: unknown })?.code;
  return (
    code === 9 ||
    code === 'failed-precondition' ||
    code === 10 ||
    code === 'aborted'
  );
};

export interface EditResult {
  board: Doc & { id: string };
  before: Doc;
  changes: string[];
  notes: string[];
  revisionId: string;
}

/** Applies ops, keeps the previous version and logs the change, retrying when SpartBoard saved the board meanwhile. */
export async function editBoard(
  ctx: ToolContext,
  boardId: string,
  ops: readonly BoardOp[],
  screen: ScreenShape
): Promise<EditResult> {
  assertBoardId(boardId);
  if (ops.length === 0) throw new ToolError('Give at least one change.');
  const session = await openSession(ctx, screen);
  const ref = ctx.db.doc(`${boardsPath(ctx.uid)}/${boardId}`);
  let reserved = false;
  for (let attempt = 1; ; attempt++) {
    const snap = await ref.get();
    const before = snap.data();
    if (!snap.exists || !isObject(before))
      throw new ToolError(`Board ${boardId} was not found.`);
    assertOwnBoard(before);
    const { board, changes } = await applyOps(session, before, ops);
    assertFits(board);
    const revision = revisionData(before);
    if (!reserved) {
      await reserveBoardOp(ctx);
      reserved = true;
    }
    const now = Date.now();
    const batch = ctx.db.batch();
    const revisionId = snapshotRevision(ctx, batch, {
      itemType: 'board',
      itemId: boardId,
      title: boardName(before),
      data: revision.data,
    });
    const stamp = claudeStamp(before, now);
    batch.update(
      ref,
      {
        ...(board.name !== before.name ? { name: board.name } : {}),
        ...(board.background !== before.background
          ? { background: board.background }
          : {}),
        widgets: board.widgets,
        updatedAt: now,
        ...stamp,
      },
      { lastUpdateTime: snap.updateTime }
    );
    logActivity(ctx, batch, {
      action: 'update',
      itemType: 'board',
      itemId: boardId,
      title: str(board.name),
      revisionId,
    });
    try {
      await batch.commit();
    } catch (err) {
      if (attempt < COMMIT_ATTEMPTS && isPreconditionFailure(err)) continue;
      if (isPreconditionFailure(err))
        throw new ToolError(
          'Nothing was changed: the board kept changing in SpartBoard. Try again in a moment.'
        );
      throw err;
    }
    const notes = [...session.notes];
    if (revision.inkLeftOut)
      notes.push(
        'This board is very large, so older inline drawing ink was left out of the saved previous version.'
      );
    if (liveShared(before)) notes.push(NOTE_SHARED);
    return {
      board: { ...board, updatedAt: now, ...stamp, id: boardId },
      before,
      changes,
      notes,
      revisionId,
    };
  }
}

export interface NewBoardInput {
  name: string;
  collection_id?: string;
  background?: string;
  template_id?: string;
  widgets: WidgetSpec[];
}

export interface CreateResult {
  boards: (Doc & { id: string })[];
  notes: string[];
}

/** New boards at the top of the Boards list, outside any collection unless one is named (D19). */
export async function createBoards(
  ctx: ToolContext,
  inputs: readonly NewBoardInput[],
  screen: ScreenShape
): Promise<CreateResult> {
  if (inputs.length === 0) throw new ToolError('Give at least one board.');
  if (inputs.length > MAX_BOARDS_PER_CALL)
    throw new ToolError(`Make at most ${MAX_BOARDS_PER_CALL} boards per call.`);
  const session = await openSession(ctx, screen);
  const problems: string[] = [];
  const collectionIds = [
    ...new Set(
      inputs.map((b) => b.collection_id).filter((id): id is string => !!id)
    ),
  ];
  const collections = new Map(
    await Promise.all(
      collectionIds.map(async (id) => {
        if (!ITEM_ID.test(id)) return [id, false] as const;
        const snap = await ctx.db
          .doc(`users/${ctx.uid}/collections/${id}`)
          .get();
        return [id, snap.exists] as const;
      })
    )
  );
  const top = await ctx.db
    .collection(boardsPath(ctx.uid))
    .orderBy('order', 'asc')
    .select('order')
    .limit(1)
    .get();
  let order = Math.min(0, num(top.docs[0]?.get('order'))) - inputs.length;

  const now = Date.now();
  const boards: (Doc & { id: string })[] = [];
  for (const [index, input] of inputs.entries()) {
    const label = `Board ${index + 1} ("${input.name.trim().slice(0, 40)}")`;
    const name = input.name.trim().slice(0, MAX_BOARD_NAME);
    if (!name) problems.push(`${label}: the board name is empty.`);
    if (input.collection_id && !collections.get(input.collection_id))
      problems.push(
        `${label}: collection ${input.collection_id.slice(0, 128)} was not found; use list_boards to see collection ids.`
      );
    if (input.background && !BACKGROUND_IDS.has(input.background))
      problems.push(
        `${label}: use a background_id from get_board_guide backgrounds.`
      );
    if (
      input.template_id &&
      !BOARD_TEMPLATES.some((t) => t.id === input.template_id)
    )
      problems.push(
        `${label}: "${input.template_id}" is not a template; see get_board_guide.`
      );
    if (input.widgets.length > MAX_WIDGETS_PER_BOARD)
      problems.push(
        `${label}: a board holds ${MAX_WIDGETS_PER_BOARD} widgets at most.`
      );
    const empty: Doc = { name: name || 'Untitled board', widgets: [] };
    try {
      const { board } = await applyOps(session, empty, [
        ...input.widgets.map((spec): BoardOp => ({
          ...spec,
          op: 'add_widget',
          layout_id: spec.layout_id ?? input.template_id,
        })),
      ]);
      const id = randomUUID();
      const doc: Doc = {
        id,
        name: str(board.name),
        background: input.background ?? DEFAULT_BOARD_BACKGROUND,
        widgets: board.widgets,
        createdAt: now,
        updatedAt: now,
        order: order++,
        collectionId: input.collection_id ?? null,
        isPinned: false,
        claudeEditedAt: now,
        claudeAction: 'created',
        claudeUnseen: true,
      };
      assertFits(doc);
      boards.push({ ...doc, id });
    } catch (err) {
      if (!(err instanceof ToolError)) throw err;
      problems.push(
        ...err.message
          .split('\n')
          .filter((line) => line !== 'Nothing was changed.')
          .map(
            (line) => `${label}: ${line.replace(/^Nothing was changed: /, '')}`
          )
      );
    }
  }
  if (problems.length > 0) throw problemError(problems);

  await reserveBoardOp(ctx);
  const batch = ctx.db.batch();
  for (const board of boards) {
    batch.create(ctx.db.doc(`${boardsPath(ctx.uid)}/${board.id}`), board);
    logActivity(ctx, batch, {
      action: 'create',
      itemType: 'board',
      itemId: board.id,
      title: str(board.name),
    });
  }
  await batch.commit();
  return { boards, notes: [...session.notes] };
}

/** Puts a board's widgets, name and background back as they were; live sharing, collection and pin stay as they are now. */
export async function restoreBoard(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
): Promise<EditResult> {
  const boardId = String(rev.get('itemId'));
  assertBoardId(boardId);
  const saved: unknown = rev.get('data');
  if (!isObject(saved))
    throw new ToolError('That revision cannot be restored.');
  const ref = ctx.db.doc(`${boardsPath(ctx.uid)}/${boardId}`);
  let reserved = false;
  for (let attempt = 1; ; attempt++) {
    const snap = await ref.get();
    const before = snap.data();
    if (!snap.exists || !isObject(before))
      throw new ToolError(
        'The board no longer exists in SpartBoard, so it cannot be restored.'
      );
    assertOwnBoard(before);
    const versions = new Map(
      boardWidgets(before).map((w) => [str(w.id), num(w.version)])
    );
    // Every restored widget outranks the open tab's copy, so SpartBoard takes it.
    const widgets: Doc[] = boardWidgets(saved).map((w) => ({
      ...w,
      version: Math.max(num(w.version), versions.get(str(w.id)) ?? 0) + 1,
    }));
    const board: Doc = {
      ...before,
      name: boardName(saved),
      background: str(saved.background) || DEFAULT_BOARD_BACKGROUND,
      widgets,
    };
    assertFits(board);
    const revision = revisionData(before);
    if (!reserved) {
      await reserveBoardOp(ctx);
      reserved = true;
    }
    const now = Date.now();
    const batch = ctx.db.batch();
    const revisionId = snapshotRevision(ctx, batch, {
      itemType: 'board',
      itemId: boardId,
      title: boardName(before),
      data: revision.data,
    });
    const stamp = claudeStamp(before, now);
    batch.update(
      ref,
      {
        name: board.name,
        background: board.background,
        widgets,
        updatedAt: now,
        ...stamp,
      },
      { lastUpdateTime: snap.updateTime }
    );
    logActivity(ctx, batch, {
      action: 'restore',
      itemType: 'board',
      itemId: boardId,
      title: str(board.name),
      revisionId,
    });
    try {
      await batch.commit();
    } catch (err) {
      if (attempt < COMMIT_ATTEMPTS && isPreconditionFailure(err)) continue;
      if (isPreconditionFailure(err))
        throw new ToolError(
          'Nothing was changed: the board kept changing in SpartBoard. Try again in a moment.'
        );
      throw err;
    }
    const notes: string[] = [];
    if (widgets.some((w) => w.type === 'drawing'))
      notes.push(
        'Drawing widget ink is kept separately and was not part of the previous version, so drawings show as they are now.'
      );
    if (revision.inkLeftOut)
      notes.push(
        'This board is very large, so older inline drawing ink was left out of the version saved before restoring.'
      );
    if (liveShared(before)) notes.push(NOTE_SHARED);
    return {
      board: { ...board, updatedAt: now, ...stamp, id: boardId },
      before,
      changes: ['Restored the board to the saved version.'],
      notes,
      revisionId,
    };
  }
}
