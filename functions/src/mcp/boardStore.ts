// Reads boards for the connector's board tools and describes them for Claude (AI_BOARDS D6, D8, D11).
import type * as admin from 'firebase-admin';
import { ToolError, type ToolContext } from './activity';
import {
  SNAP_ZONE_LAYOUTS,
  analyze,
  chromeBands,
  isOffCanvas,
  normalizeScreen,
  placeInZone,
  widgetRect,
  type LayoutWidget,
  type Rect,
  type ScreenShape,
  type SnapZoneLayout,
} from './boardEngine.gen';
import { renderBoardWireframe, type WireframeImage } from './boardWireframe';
import { WIDGET_CATALOGUE } from './widgetCatalogue.gen';
import { partialWidgetSchema } from './widgetConfigValidator';

type Doc = Record<string, unknown>;

export const MAX_BOARDS_SCANNED = 500;
export const MAX_WIDGETS_LISTED = 60;
export const MAX_WIDGETS_CHECKED = 100;
const MAX_CHECK_LINES = 30;
/** A board edited in SpartBoard this recently may be on screen in class (D8). */
export const IN_USE_WINDOW_MS = 5 * 60 * 1000;

const BOARD_ID = /^[A-Za-z0-9_-]{1,128}$/;
const isObject = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export const boardsPath = (uid: string) => `users/${uid}/dashboards`;

/** Board ids are path segments; anything else could address another document. */
export function assertBoardId(boardId: string): void {
  if (!BOARD_ID.test(boardId))
    throw new ToolError(`Board ${boardId} was not found.`);
}

export async function readBoard(
  ctx: ToolContext,
  boardId: string
): Promise<Doc & { id: string }> {
  assertBoardId(boardId);
  const snap = await ctx.db.doc(`${boardsPath(ctx.uid)}/${boardId}`).get();
  const data = snap.data();
  if (!snap.exists || !isObject(data))
    throw new ToolError(`Board ${boardId} was not found.`);
  return { ...data, id: boardId };
}

export const boardWidgets = (board: Doc): Doc[] =>
  Array.isArray(board.widgets) ? board.widgets.filter(isObject) : [];

export const boardName = (board: Doc): string =>
  str(board.name).trim() || 'Untitled board';

const MIN_SCREEN = 320;
const MAX_SCREEN = 10000;
const screenOk = (w: number | null, h: number | null): boolean =>
  w !== null &&
  h !== null &&
  w >= MIN_SCREEN &&
  h >= MIN_SCREEN * 0.75 &&
  w <= MAX_SCREEN &&
  h <= MAX_SCREEN;

export interface BoardScreen extends ScreenShape {
  source: 'request' | 'recorded' | 'default';
}

/** The requested screen, else the one the app recorded on the profile, else 16:9 (D11). */
export async function resolveBoardScreen(
  ctx: ToolContext,
  requested?: ScreenShape
): Promise<BoardScreen> {
  if (requested) return { ...normalizeScreen(requested), source: 'request' };
  try {
    const profile = await ctx.db
      .doc(`users/${ctx.uid}/userProfile/profile`)
      .get();
    const recorded: unknown = profile.data()?.boardScreen;
    if (isObject(recorded)) {
      const w = num(recorded.w);
      const h = num(recorded.h);
      if (screenOk(w, h))
        return { w: Math.round(w!), h: Math.round(h!), source: 'recorded' };
    }
  } catch (err) {
    console.error('[mcpServer] board screen read failed', {
      uid: ctx.uid,
      err,
    });
  }
  return { ...normalizeScreen(), source: 'default' };
}

/** Edited in SpartBoard (not by Claude) in the last few minutes, so it may be on screen (D8). */
export function inUseNote(board: Doc, now = Date.now()): string | null {
  const updatedAt = num(board.updatedAt);
  if (updatedAt === null) return null;
  const claudeAt = num(board.claudeEditedAt);
  if (claudeAt !== null && claudeAt >= updatedAt) return null;
  const ago = now - updatedAt;
  // updatedAt is the browser's clock, so a stamp a little in the future still counts.
  if (Math.abs(ago) > IN_USE_WINDOW_MS) return null;
  const minutes = Math.max(1, Math.round(ago / 60000));
  return `Changed in SpartBoard ${minutes} minute${minutes === 1 ? '' : 's'} ago, so it may be on screen in class. Check with the teacher before changes students would see.`;
}

/** Library item each widget can show, by the config key that holds its id (D16). */
export const LIBRARY_ITEM_KEYS: Readonly<
  Record<string, { kind: string; key: string }>
> = {
  quiz: { kind: 'quiz', key: 'selectedQuizId' },
  'video-activity': { kind: 'video_activity', key: 'selectedActivityId' },
  flashcards: { kind: 'flashcard_set', key: 'presentSetId' },
  'activity-wall': { kind: 'activity_wall', key: 'activeActivityId' },
  'guided-learning': { kind: 'guided_learning', key: 'playerSetId' },
  miniApp: { kind: 'mini_app', key: 'activeApp' },
};

export function libraryItemOf(
  type: string,
  config: Doc
): { kind: string; id: string } | null {
  const ref = LIBRARY_ITEM_KEYS[type];
  if (!ref) return null;
  const value = config[ref.key];
  const id = isObject(value) ? str(value.id) : str(value);
  return id ? { kind: ref.kind, id } : null;
}

// Pulled from Drive at load and scrubbed before Firestore (utils/dashboardPII.ts); never shown even if a stale doc has them.
const PII_KEYS = new Set([
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
  'assignments',
]);
// Student, class and session state; Claude never sees or writes it (D18).
const STUDENT_KEY =
  /student|roster|names$|assign|session|result|response|submission|attendance|classid|completed|remaining|picked|history|pin$|pins$|scores?$|votes?$|seatingrule|subshare|plcsheet|email|periodname|teachername|joincode|sharecode|owneruid|authoruid|participant/i;
export const MAX_STRING = 300;
export const MAX_ITEMS = 20;
export const MAX_DEPTH = 4;
const PRIVATE_LINK =
  /[?&](token|sig|signature|access_token|X-Goog-Signature)=/i;
const MAX_SETTINGS_CHARS = 4000;

export const hiddenKey = (key: string): boolean =>
  PII_KEYS.has(key) || STUDENT_KEY.test(key);

function summarizeValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[embedded file]';
    if (PRIVATE_LINK.test(value)) return '[private link]';
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}… (${value.length} characters)`
      : value;
  }
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) return '[nested settings]';
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ITEMS)
      .map((item) => summarizeValue(item, depth + 1));
    return value.length > MAX_ITEMS
      ? [...items, `… and ${value.length - MAX_ITEMS} more`]
      : items;
  }
  const out: Doc = {};
  for (const [key, child] of Object.entries(value)) {
    if (hiddenKey(key)) continue;
    out[key] = summarizeValue(child, depth + 1);
  }
  return out;
}

/** False when get_board showed this setting cut down, so Claude can't send a whole replacement for it. */
export function shownInFull(value: unknown, depth = 1): boolean {
  if (typeof value === 'string')
    return (
      depth <= 1 ||
      (!value.startsWith('data:') &&
        !PRIVATE_LINK.test(value) &&
        value.length <= MAX_STRING)
    );
  if (typeof value !== 'object' || value === null) return true;
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(value))
    return (
      value.length <= MAX_ITEMS &&
      value.every((item) => shownInFull(item, depth + 1))
    );
  return Object.entries(value).every(
    ([key, child]) => hiddenKey(key) || shownInFull(child, depth + 1)
  );
}

/** Widget-specific fields whose ordinary-looking keys hold student names. */
function redactStudentFields(type: string, config: Doc): Doc {
  if (type !== 'scoreboard' || !Array.isArray(config.teams)) return config;
  // A quiz-synced scoreboard has one team per student, named after them.
  if (str(config.liveQuizWidgetId)) {
    const rest = { ...config };
    delete rest.teams;
    return rest;
  }
  return {
    ...config,
    teams: config.teams.map((team: unknown) =>
      isObject(team) &&
      (Array.isArray(team.memberStudentIds) || str(team.linkedRosterGroupId))
        ? { ...team, name: '[class group]' }
        : team
    ),
  };
}

/** The widget's settings Claude can work with: schema keys only, no student data, long values cut. */
export function summarizeSettings(type: string, raw: unknown): Doc {
  if (!isObject(raw)) return {};
  const config = redactStudentFields(type, raw);
  const schema = partialWidgetSchema(type);
  const props = isObject(schema?.properties) ? schema.properties : null;
  const itemKey = LIBRARY_ITEM_KEYS[type]?.key;
  const out: Doc = {};
  for (const [key, value] of Object.entries(config)) {
    if (!props || !Object.hasOwn(props, key) || hiddenKey(key)) continue;
    // The library item is reported by id; an inline copy (a mini-app's code) is not settings.
    if (key === itemKey && isObject(value)) continue;
    if (value === undefined || value === null || value === '') continue;
    out[key] = summarizeValue(value, 1);
  }
  const text = JSON.stringify(out);
  if (text.length <= MAX_SETTINGS_CHARS) return out;
  return {
    settings_too_large_to_show: true,
    setting_names: Object.keys(out),
  };
}

const ZONE_TOLERANCE_PX = 6;
const TIDY_LAYOUTS: readonly SnapZoneLayout[] = [
  {
    id: 'full',
    nameKey: 'full',
    zones: [{ id: 'full', x: 0, y: 0, w: 1, h: 1 }],
  },
  ...SNAP_ZONE_LAYOUTS,
];

/** The snap zone a widget sits on exactly, if any. */
export function zoneOf(
  rect: Rect,
  screen: ScreenShape
): { layout_id: string; zone_id: string } | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= ZONE_TOLERANCE_PX;
  for (const layout of TIDY_LAYOUTS)
    for (const zone of layout.zones) {
      const z = placeInZone(zone, screen);
      if (
        near(z.x, rect.x) &&
        near(z.y, rect.y) &&
        near(z.x + z.w, rect.x + rect.w) &&
        near(z.y + z.h, rect.y + rect.h)
      )
        return { layout_id: layout.id, zone_id: zone.id };
    }
  return null;
}

export const widgetTypeName = (type: string): string =>
  WIDGET_CATALOGUE[type]?.name ?? type;

export function widgetLabel(widget: Doc): string {
  const title = str(widget.customTitle).trim();
  const name = widgetTypeName(str(widget.type));
  return title ? `${title} (${name})` : name;
}

const GEOMETRY = [
  'x',
  'y',
  'w',
  'h',
  'xProp',
  'yProp',
  'wProp',
  'hProp',
] as const;
const FLAGS = ['minimized', 'maximized', 'isLocked', 'isPinned'] as const;

const layoutWidget = (widget: Doc, index: number): LayoutWidget => {
  const out: LayoutWidget = {
    id: str(widget.id) || `widget-${index + 1}`,
    type: str(widget.type),
  };
  for (const key of GEOMETRY) {
    const value = num(widget[key]);
    if (value !== null) out[key] = value;
  }
  for (const key of FLAGS) if (widget[key] === true) out[key] = true;
  return out;
};

const BAND_LABELS: Readonly<Record<string, string>> = {
  'app-buttons': 'App buttons',
  dock: 'Dock',
  'board-buttons-left': 'Board buttons',
  'board-buttons-right': 'Board buttons',
};

const px = (r: Rect) => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  w: Math.round(r.w),
  h: Math.round(r.h),
});

export interface BoardPicture {
  widgets: Doc[];
  layout_check: string[];
  wireframe: WireframeImage;
  widgets_not_listed: number;
}

/** Widgets with their place on the screen, a plain layout check, and the wireframe image (D6). */
export function describeBoard(board: Doc, screen: ScreenShape): BoardPicture {
  const raw = boardWidgets(board);
  const layout = raw.map(layoutWidget);
  const labels = new Map<string, string>();
  for (const [i, w] of layout.entries())
    if (!labels.has(w.id)) labels.set(w.id, widgetLabel(raw[i]));
  const widgets = raw.slice(0, MAX_WIDGETS_LISTED).map((widget, i) => {
    const type = str(widget.type);
    const config = isObject(widget.config) ? widget.config : {};
    const rect = isOffCanvas(layout[i]) ? null : widgetRect(layout[i], screen);
    const item = libraryItemOf(type, config);
    const flags = [
      widget.minimized === true ? 'minimized' : null,
      widget.maximized === true ? 'full screen' : null,
      widget.isLocked === true ? 'locked' : null,
      widget.isPinned === true ? 'pinned' : null,
    ].filter((f): f is string => f !== null);
    return {
      widget_id: layout[i].id,
      type,
      name: widgetTypeName(type),
      ...(str(widget.customTitle).trim()
        ? { title: str(widget.customTitle).trim() }
        : {}),
      position: rect ? px(rect) : null,
      zone: rect ? zoneOf(rect, screen) : null,
      ...(flags.length > 0 ? { state: flags } : {}),
      ...(item ? { library_item: item } : {}),
      settings: summarizeSettings(type, config),
    };
  });

  // The gap search grows steeply with widget count, so a runaway board is checked in part.
  const { gaps, overlaps, chromeCollisions } = analyze(
    layout.slice(0, MAX_WIDGETS_CHECKED),
    screen
  );
  const name = (id: string) => labels.get(id) ?? id;
  const check: string[] = [];
  for (const o of overlaps) check.push(`${name(o.a)} overlaps ${name(o.b)}.`);
  for (const c of chromeCollisions) {
    if (c.kind === 'off-screen')
      check.push(`${name(c.widgetId)} runs off the screen.`);
    else if (c.kind === 'drawer')
      check.push(
        `${name(c.widgetId)}: its ${c.side} drawer would open under the app's buttons or off the screen.`
      );
    else
      check.push(
        `${name(c.widgetId)} sits under the ${(BAND_LABELS[c.kind] ?? c.kind).toLowerCase()}.`
      );
  }
  for (const g of gaps)
    check.push(
      `Empty space of about ${Math.round(g.share * 100)}% of the board at x ${Math.round(g.x)}, y ${Math.round(g.y)} (${Math.round(g.w)}×${Math.round(g.h)}).`
    );
  if (check.length > MAX_CHECK_LINES) {
    const more = check.length - MAX_CHECK_LINES;
    check.splice(MAX_CHECK_LINES, more, `…and ${more} more layout problems.`);
  }
  if (layout.length > MAX_WIDGETS_CHECKED)
    check.push(
      `Only the first ${MAX_WIDGETS_CHECKED} of ${layout.length} widgets were checked; the board has far more than the 20 it should.`
    );
  if (check.length === 0)
    check.push(
      raw.length === 0
        ? 'The board is empty.'
        : 'No overlaps, nothing under the app buttons or dock, and no large empty space.'
    );

  const wireframe = renderBoardWireframe({
    name: boardName(board),
    screen,
    rects: layout.flatMap((w, i) => {
      if (isOffCanvas(w)) return [];
      const rect = widgetRect(w, screen);
      return rect ? [{ ...rect, label: widgetLabel(raw[i]) }] : [];
    }),
    bands: chromeBands(screen).map((band) => ({
      ...band,
      label: BAND_LABELS[band.id] ?? band.id,
    })),
  });

  return {
    widgets,
    layout_check: check,
    wireframe,
    widgets_not_listed: Math.max(0, raw.length - MAX_WIDGETS_LISTED),
  };
}

export interface CollectionRow {
  id: string;
  name: string;
  parentId: string | null;
}

export async function loadCollections(
  db: admin.firestore.Firestore,
  uid: string
): Promise<Map<string, CollectionRow>> {
  const snap = await db
    .collection(`users/${uid}/collections`)
    .limit(MAX_BOARDS_SCANNED)
    .get();
  return new Map(
    snap.docs.map((d) => {
      const data = d.data();
      return [
        d.id,
        {
          id: d.id,
          name: str(data.name).trim() || 'Untitled collection',
          parentId: str(data.parentCollectionId) || null,
        },
      ];
    })
  );
}

/** "Outer / Inner" path of a collection, guarding against cycles. */
export function collectionPath(
  id: string | null,
  rows: Map<string, CollectionRow>
): string | null {
  if (!id) return null;
  const names: string[] = [];
  const seen = new Set<string>();
  let at: string | null = id;
  while (at && !seen.has(at) && names.length < 20) {
    seen.add(at);
    const row = rows.get(at);
    if (!row) break;
    names.unshift(row.name);
    at = row.parentId;
  }
  return names.length > 0 ? names.join(' / ') : null;
}
