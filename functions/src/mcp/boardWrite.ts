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
  isOffCanvas,
  placeInZone,
  tidy,
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
  layoutWidget,
  libraryItemOf,
  shownInFull,
  summarizeSettings,
  widgetLabel,
  widgetTypeName,
} from './boardStore';
import {
  SHARED_BOARD_FIELDS,
  mirrorToShare,
  shareStateOf,
  withShareContent,
} from './boardShare';
import { WIDGET_CONFIG_RUNTIME } from './widgetConfigRuntime.gen';
import { WIDGET_CONFIG_SCHEMAS } from './widgetConfigSchemas.gen';
import {
  checkWidgetSettings,
  partialWidgetSchema,
} from './widgetConfigValidator';

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
export const NOTE_KEPT_CLASS =
  'Class and student fields inside lists (such as station sizes or vote counts) were left as they were; the teacher changes those in SpartBoard.';
export const NOTE_ASSIGN =
  'Quiz and video activity widgets open on the teacher’s library; the teacher assigns the item from there.';

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

function resolveSchema(schema: unknown, depth = 0): Doc | null {
  if (!isObject(schema) || depth > 10) return null;
  if (typeof schema.$ref === 'string')
    return resolveSchema(
      WIDGET_CONFIG_SCHEMAS.definitions[
        decodeURIComponent(schema.$ref.replace(/^#\/definitions\//, ''))
      ],
      depth + 1
    );
  const branches = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(branches)) {
    const objects = branches
      .map((b) => resolveSchema(b, depth + 1))
      .filter((b): b is Doc => !!b && (isObject(b.properties) || !!b.items));
    return objects.length === 1 ? objects[0] : null;
  }
  return schema;
}

const typeOf = (schema: Doc | null): unknown =>
  Array.isArray(schema?.type) ? schema.type[0] : schema?.type;

const ZERO: Readonly<Record<string, unknown>> = {
  boolean: false,
  number: 0,
  integer: 0,
  string: '',
  array: [],
};

/** Claude's value with the student state get_board never showed taken from the stored value (list items matched by id), or zeroed on new items. */
export function keepHidden(
  claude: unknown,
  stored: unknown,
  schema: unknown,
  depth = 0
): unknown {
  if (depth > 20) return claude;
  const s = resolveSchema(schema);
  if (Array.isArray(claude)) {
    const byId = new Map(
      (Array.isArray(stored) ? stored : [])
        .filter(isObject)
        .filter((item) => str(item.id))
        .map((item) => [str(item.id), item])
    );
    return claude.map((item: unknown) =>
      keepHidden(
        item,
        isObject(item) && str(item.id) ? byId.get(str(item.id)) : undefined,
        s?.items,
        depth + 1
      )
    );
  }
  if (!isObject(claude)) return claude;
  const props = isObject(s?.properties) ? s.properties : {};
  const prev = isObject(stored) ? stored : undefined;
  const out: Doc = {};
  for (const [key, value] of Object.entries(claude))
    if (!hiddenKey(key))
      out[key] = keepHidden(value, prev?.[key], props[key], depth + 1);
  if (prev)
    for (const [key, value] of Object.entries(prev))
      if (hiddenKey(key)) out[key] = value;
  for (const key of Array.isArray(s?.required) ? s.required : []) {
    if (typeof key !== 'string' || !hiddenKey(key) || key in out) continue;
    const zero = ZERO[String(typeOf(resolveSchema(props[key])))];
    if (zero !== undefined) out[key] = structuredClone(zero);
  }
  return out;
}

/** Claude's settings with nested student state kept from the stored config (D18). */
function hasNestedHidden(value: unknown, depth = 0): boolean {
  if (depth > 20 || typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      (!Array.isArray(value) && hiddenKey(key)) ||
      hasNestedHidden(child, depth + 1)
  );
}

function withHidden(
  type: string,
  settings: Doc | undefined,
  stored: Doc,
  notes?: Set<string>
): Doc | undefined {
  if (!settings) return settings;
  if (notes && Object.values(settings).some((v) => hasNestedHidden(v)))
    notes.add(NOTE_KEPT_CLASS);
  const props = partialWidgetSchema(type)?.properties;
  const schemaProps = isObject(props) ? props : {};
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [
      key,
      keepHidden(value, stored[key], schemaProps[key], 1),
    ])
  );
}

/** Settings get_board showed cut down can't be replaced whole: Claude would drop what it never saw. */
function assertShown(type: string, settings: Doc, stored: Doc): void {
  const tooLarge =
    summarizeSettings(type, stored).settings_too_large_to_show === true;
  for (const key of Object.keys(settings)) {
    const value = stored[key];
    // A long, embedded or private string was shown cut down, so a "replacement" would drop the rest.
    if (typeof value === 'string') {
      if (!shownInFull(value, 2))
        throw new OpProblem(
          `\`${key}\` is longer than get_board shows, so Claude can't replace it; change it in SpartBoard`
        );
      continue;
    }
    if (typeof value !== 'object' || value === null) continue;
    if (tooLarge || !shownInFull(value))
      throw new OpProblem(
        `\`${key}\` holds more than get_board shows, so Claude can't replace it; change it in SpartBoard`
      );
  }
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
      // A new quiz leaves any assignment or session the widget showed for the old one.
      return {
        view: 'manager',
        managerTab: 'library',
        activeAssignmentId: null,
        activeLiveSessionCode: null,
        resultsSessionId: null,
        selectedQuizId: id,
        selectedQuizTitle: title,
        selectedQuizOwnerUid: uid,
      };
    case 'video-activity':
      session.notes.add(NOTE_ASSIGN);
      return {
        view: 'manager',
        resultsSessionId: null,
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
    withHidden(spec.type, spec.settings, {}, session.notes),
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
  // The app reads a missing version as 1, so the bump must outrank that.
  return { ...widget, ...patch, version: Math.max(1, num(widget.version)) + 1 };
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
            assertShown(type, op.settings, current);
            const checked = checkWidgetSettings(
              type,
              withHidden(type, op.settings, current, session.notes)
            );
            if (!checked.ok) throw new OpProblem(checked.errors.join('; '));
            config = reconcile(type, checked.settings, {
              ...current,
              ...checked.settings,
              ...(type === 'embed'
                ? embedPatch(checked.settings, current)
                : {}),
            });
          }
          // The item the widget already shows: keep its live assignment or session.
          if (
            op.library_item_id &&
            op.library_item_id !== libraryItemOf(type, current)?.id
          )
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

const INK_LEFT_OUT = 'claudeInkLeftOut';

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
  const trimmed: Doc = { ...data, widgets, [INK_LEFT_OUT]: true };
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
  /** Null when nothing needed changing, so nothing was saved. */
  revisionId: string | null;
}

interface Change {
  board: Doc;
  changes: string[];
  notes?: string[];
  /** Nothing to save: the board already looks this way. */
  unchanged?: boolean;
}

/** One board write: the previous version, the board, its live share and the log, retried when SpartBoard saved meanwhile. */
async function commitBoardChange(
  ctx: ToolContext,
  boardId: string,
  action: 'update' | 'restore',
  missing: string,
  change: (before: Doc) => Promise<Change>
): Promise<EditResult> {
  const ref = ctx.db.doc(`${boardsPath(ctx.uid)}/${boardId}`);
  let reserved = false;
  for (let attempt = 1; ; attempt++) {
    const snap = await ref.get();
    const stored = snap.data();
    if (!snap.exists || !isObject(stored)) throw new ToolError(missing);
    const shared = await shareStateOf(ctx, stored);
    // Co-teachers' edits live on the share until this teacher opens the board, so Claude starts from there.
    const before = withShareContent(stored, shared.share);
    const next = await change(before);
    if (next.unchanged)
      return {
        board: { ...before, id: boardId },
        before,
        changes: next.changes,
        notes: next.notes ?? [],
        revisionId: null,
      };
    const { board } = next;
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
    const stamp = claudeStamp(stored, now);
    const name = str(board.name);
    const background = str(board.background);
    batch.update(
      ref,
      {
        ...(name !== str(stored.name) ? { name } : {}),
        ...(background !== str(stored.background) ? { background } : {}),
        // The share is stamped as this teacher's write, so their board must carry co-teachers' style and ink too.
        ...Object.fromEntries(
          SHARED_BOARD_FIELDS.filter(
            (key) =>
              shared.share &&
              board[key] !== undefined &&
              JSON.stringify(board[key]) !== JSON.stringify(stored[key])
          ).map((key) => [key, board[key]])
        ),
        widgets: board.widgets,
        updatedAt: now,
        ...stamp,
      },
      { lastUpdateTime: snap.updateTime }
    );
    mirrorToShare(
      ctx,
      batch,
      shared,
      { name, background, widgets: boardWidgets(board) },
      now
    );
    logActivity(ctx, batch, {
      action,
      itemType: 'board',
      itemId: boardId,
      title: name,
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
    const notes = [...(next.notes ?? [])];
    if (shared.share)
      notes.push(
        'This board is shared live, so the teachers it is shared with see the change too.'
      );
    if (revision.inkLeftOut)
      notes.push(
        'This board is very large, so older inline drawing ink was left out of the saved previous version.'
      );
    return {
      board: { ...board, updatedAt: now, ...stamp, id: boardId },
      before,
      changes: next.changes,
      notes,
      revisionId,
    };
  }
}

/** Applies ops, keeps the previous version and logs the change. */
export async function editBoard(
  ctx: ToolContext,
  boardId: string,
  ops: readonly BoardOp[],
  screen: ScreenShape
): Promise<EditResult> {
  assertBoardId(boardId);
  if (ops.length === 0) throw new ToolError('Give at least one change.');
  const session = await openSession(ctx, screen);
  return commitBoardChange(
    ctx,
    boardId,
    'update',
    `Board ${boardId} was not found.`,
    async (before) => {
      const applied = await applyOps(session, before, ops);
      return { ...applied, notes: [...session.notes] };
    }
  );
}

const SAME_GEOMETRY = 1e-6;
const GEOMETRY_KEYS = ['xProp', 'yProp', 'wProp', 'hProp'] as const;

/** Snaps the board's widgets onto the best-fitting snap layout or nearest zones; settings and content stay as they are (D2). */
export async function tidyBoard(
  ctx: ToolContext,
  boardId: string,
  screen: ScreenShape
): Promise<EditResult> {
  assertBoardId(boardId);
  return commitBoardChange(
    ctx,
    boardId,
    'update',
    `Board ${boardId} was not found.`,
    (before) => {
      const widgets = boardWidgets(before);
      const layout = widgets.map(layoutWidget);
      const result = tidy(layout, screen);
      let moved = 0;
      const next = widgets.map((widget, i) => {
        const placed = result.widgets[i];
        if (
          isFixed(layout[i]) ||
          isOffCanvas(layout[i]) ||
          GEOMETRY_KEYS.every(
            (key) => Math.abs(num(widget[key]) - placed[key]) < SAME_GEOMETRY
          )
        )
          return widget;
        moved += 1;
        return bumped(widget, geometry(placed));
      });
      const named = (ids: string[]) =>
        ids
          .map((id) => widgets[layout.findIndex((w) => w.id === id)])
          .filter((w): w is Doc => !!w)
          .map(widgetLabel)
          .join(', ');
      const notes: string[] = [];
      if (result.unplaced.length > 0)
        notes.push(
          `No free zone was left for ${named(result.unplaced)}, so they still overlap other widgets. Remove a widget or ask the teacher which to drop.`
        );
      const fixedCount = layout.filter((w) => isFixed(w)).length;
      if (fixedCount > 0)
        notes.push(
          `${fixedCount} locked or pinned widget${fixedCount === 1 ? '' : 's'} stayed where the teacher put ${fixedCount === 1 ? 'it' : 'them'}.`
        );
      if (moved === 0)
        return Promise.resolve({
          board: before,
          changes: ['The board was already tidy, so nothing was changed.'],
          notes,
          unchanged: true,
        });
      return Promise.resolve({
        board: { ...before, widgets: withoutUndefined(next) },
        changes: [
          `Moved ${moved} widget${moved === 1 ? '' : 's'} onto ${result.layoutId ? `the "${result.layoutId}" snap layout` : 'the nearest snap zones'}.`,
        ],
        notes,
      });
    }
  );
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

/** Student, class and session state recorded since the revision stays as it is now (D18). */
function withCurrentState(saved: Doc, now: Doc | undefined): Doc {
  if (!now || !isObject(saved.config) || !isObject(now.config)) return saved;
  const config = keepHidden(
    saved.config,
    now.config,
    partialWidgetSchema(str(saved.type))
  );
  return { ...saved, config };
}

/** Ink a trimmed revision left out stays as it is now instead of being wiped. */
function withCurrentInk(saved: Doc, now: Doc | undefined): Doc {
  if (!now) return saved;
  const out: Doc = { ...saved };
  if (!('annotation' in saved) && 'annotation' in now)
    out.annotation = now.annotation;
  const nowConfig = isObject(now.config) ? now.config : {};
  if (
    isObject(saved.config) &&
    !('paths' in saved.config) &&
    'paths' in nowConfig
  )
    out.config = { ...saved.config, paths: nowConfig.paths };
  return out;
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
  return commitBoardChange(
    ctx,
    boardId,
    'restore',
    'The board no longer exists in SpartBoard, so it cannot be restored.',
    (before) => {
      const versions = new Map(
        boardWidgets(before).map((w) => [str(w.id), num(w.version)])
      );
      const current = new Map(boardWidgets(before).map((w) => [str(w.id), w]));
      const inkLeftOut = saved[INK_LEFT_OUT] === true;
      // Every restored widget outranks the open tab's copy, so SpartBoard takes it.
      const widgets: Doc[] = boardWidgets(saved).map((w) => ({
        ...withCurrentState(
          inkLeftOut ? withCurrentInk(w, current.get(str(w.id))) : w,
          current.get(str(w.id))
        ),
        version: Math.max(1, num(w.version), versions.get(str(w.id)) ?? 0) + 1,
      }));
      const notes: string[] = [];
      if (widgets.some((w) => w.type === 'drawing'))
        notes.push(
          'Drawing widget ink is kept separately and was not part of the previous version, so drawings show as they are now.'
        );
      return Promise.resolve({
        board: {
          ...before,
          name: boardName(saved),
          background: str(saved.background) || DEFAULT_BOARD_BACKGROUND,
          widgets,
        },
        changes: ['Restored the board to the saved version.'],
        notes,
      });
    }
  );
}
