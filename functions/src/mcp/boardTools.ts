// Connector board tools: list_boards, get_board, get_board_guide, create_board, edit_board (AI_BOARDS D1, D6, D8, D11, D20).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import { PAGE_SIZE, publicOrigin } from './config';
import { BOARD_TEMPLATES, SNAP_ZONE_LAYOUTS } from './boardEngine.gen';
import { loadWidgetAccessContext, canUseWidget } from './boardConfig';
import {
  LIBRARY_ITEM_KEYS,
  MAX_BOARDS_SCANNED,
  assertBoardId,
  boardName,
  boardWidgets,
  boardsPath,
  collectionPath,
  describeBoard,
  hiddenKey,
  inUseNote,
  loadCollections,
  readBoard,
  resolveBoardScreen,
  type BoardScreen,
} from './boardStore';
import { SETTINGS_FIELD_LIST } from './settingsFieldList';
import { WIDGET_CATALOGUE } from './widgetCatalogue.gen';
import { WIDGET_CONFIG_SCHEMAS } from './widgetConfigSchemas.gen';
import { hasWidgetSchema, partialWidgetSchema } from './widgetConfigValidator';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { CREATES, OVERWRITES, READ_ONLY, iso, run } from './toolKit';
import {
  BOARD_BACKGROUNDS,
  MAX_BOARD_NAME,
  MAX_BOARDS_PER_CALL,
  MAX_OPS_PER_CALL,
  MAX_WIDGET_TITLE,
  MAX_WIDGETS_PER_BOARD,
  createBoards,
  editBoard,
  type EditResult,
} from './boardWrite';

/** GlobalFeature id gating every board tool (D26). */
export const AI_BOARDS_FEATURE_ID = 'ai-boards';

export const BOARD_TOOLS: ReadonlySet<string> = new Set([
  'list_boards',
  'get_board',
  'get_board_guide',
  'create_board',
  'edit_board',
]);

const MAX_GUIDE_WIDGETS = 8;

export async function boardsOn(ctx: ToolContext): Promise<boolean> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  return isGlobalFeatureGranted(
    ctx.db,
    AI_BOARDS_FEATURE_ID,
    ctx.email,
    ctx.uid
  );
}

export async function assertBoardAccess(ctx: ToolContext): Promise<void> {
  if (!(await boardsOn(ctx)))
    throw new ToolError(
      'Boards through Claude are not turned on for this account yet.'
    );
}

const screenInput = z
  .object({
    w: z.number().int().min(320).max(10000),
    h: z.number().int().min(240).max(10000),
  })
  .optional()
  .describe(
    "Screen size in pixels to lay the board out for, e.g. {w: 1024, h: 768} for a 4:3 projector. Omit for the teacher's own screen."
  );

const screenOut = (screen: BoardScreen) => ({
  w: screen.w,
  h: screen.h,
  from:
    screen.source === 'request'
      ? 'this request'
      : screen.source === 'recorded'
        ? "the teacher's last full-screen size"
        : 'the 16:9 default (no screen recorded yet)',
});

const where = (name: string) =>
  `Open ${publicOrigin()} and pick "${name}" in the Boards list.`;

const str = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const lastChanged = (data: Record<string, unknown>): number =>
  num(data.updatedAt) || num(data.createdAt);

const BOARD_LIST_FIELDS = [
  'name',
  'updatedAt',
  'createdAt',
  'collectionId',
  'isPinned',
  'claudeEditedAt',
  'linkedShareId',
  'linkedShareRole',
] as const;

/** The teacher's own boards, or ones shared into their list where they are not the owner. */
const shareRole = (data: Record<string, unknown>): string | null => {
  if (!str(data.linkedShareId)) return null;
  const role = str(data.linkedShareRole);
  return role && role !== 'owner' ? role : null;
};

function decodeOffset(cursor: string | undefined): number {
  const n = Number(cursor ?? 0);
  return Number.isInteger(n) && n >= 0 && n < MAX_BOARDS_SCANNED ? n : 0;
}

const TEACHER_QUESTIONS = [
  'Grade and subject.',
  'The activity and which part of the lesson the board is for.',
  'A new board or an existing one (and which).',
  "Content you shouldn't invent: links, quiz topic, timer lengths, group or station names.",
  "The screen, if it isn't the one SpartBoard recorded (for example a 4:3 projector).",
];

const GUIDE_STEPS = [
  'Ask only for what you cannot infer from the conversation (questions below).',
  'State a short plan in a sentence or two: the template, each widget and what it holds. Then build it.',
  'Small follow-up tweaks ("make the timer 5 minutes") need no new plan.',
  'Read get_board before changing an existing board, and after every change look at the returned picture and layout check.',
  'Place widgets on template zones or snap zones, never at raw pixel positions.',
];

const NOTES = [
  'Embedded Google Docs, Slides, Sheets and Drive files only show for viewers who can open the file; remind the teacher to share it with view access.',
  "Class-based widgets (stations, name picker, seating chart, attendance) use the board's class. Never write student names; if no class is set, tell the teacher to pick one on the board.",
  'Boards are tuned to one screen shape. When the teacher will show the board on a different screen, pass that screen size.',
  'If get_board says the board may be on screen in class, check with the teacher before changes students would see.',
  'About 20 widgets per board at most.',
];

const CHAINING = [
  'Quiz board: create_quiz, then put a Quiz widget with that quiz id on the board, a QR code with the join link and a timer.',
  'Station rotation: a Stations widget with the station names, a timer set to the rotation length and Expectations for noise level.',
  'Discussion: a Text widget with the question, a name picker, and an Activity Wall made with create_activity_wall for responses.',
  'Lesson slides: an Embed widget with the Google Slides link (an edit link works), with a Text widget for key points beside it.',
];

/** Field labels from the widget's settings panel, keyed by config name. */
function settingsLabels(type: string): { setting: string; label: string }[] {
  const seen = new Set<string>();
  const out: { setting: string; label: string }[] = [];
  for (const field of SETTINGS_FIELD_LIST[type] ?? []) {
    const match = /^settings\.field:[^#]+#(.+)$/.exec(field.anchor);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    out.push({ setting: match[1], label: field.label });
  }
  return out;
}

function collectRefs(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, into);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') {
      const name = decodeURIComponent(child.replace(/^#\/definitions\//, ''));
      if (!into.has(name)) {
        into.add(name);
        collectRefs(WIDGET_CONFIG_SCHEMAS.definitions[name], into);
      }
    } else collectRefs(child, into);
  }
}

const MAX_SETTING_NAMES = 25;

/** Settings Claude may set: student and class state is left out (D18). */
function settingProps(type: string): Record<string, unknown> {
  const props = partialWidgetSchema(type)?.properties;
  if (typeof props !== 'object' || props === null) return {};
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !hiddenKey(key))
  );
}

function settingNames(type: string): string[] {
  const panel = settingsLabels(type)
    .map((s) => s.setting)
    .filter((key) => !hiddenKey(key));
  return (panel.length > 0 ? panel : Object.keys(settingProps(type))).slice(
    0,
    MAX_SETTING_NAMES
  );
}

/** The settings schema for one widget, with only the definitions it uses. */
function settingsSchema(type: string): Record<string, unknown> | null {
  const full = partialWidgetSchema(type);
  if (!full) return null;
  const schema = { ...full, properties: settingProps(type) };
  const refs = new Set<string>();
  collectRefs(schema, refs);
  if (refs.size === 0) return schema;
  return {
    ...schema,
    definitions: Object.fromEntries(
      [...refs].map((name) => [name, WIDGET_CONFIG_SCHEMAS.definitions[name]])
    ),
  };
}

export async function buildBoardGuide(
  ctx: ToolContext,
  widgetTypes: readonly string[] = []
) {
  const access = await loadWidgetAccessContext(ctx.db, ctx.uid, ctx.email);
  const types = WIDGET_TYPE_LIST.filter((t) => hasWidgetSchema(t));
  const allowed = await Promise.all(
    types.map(async (t) => (await canUseWidget(access, t)).ok)
  );
  const usable = types.filter((_, i) => allowed[i]);
  const usableSet = new Set(usable);
  const screen = await resolveBoardScreen(ctx);
  const details: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const type of widgetTypes.slice(0, MAX_GUIDE_WIDGETS)) {
    if (!usableSet.has(type)) {
      unknown.push(type);
      continue;
    }
    details[type] = {
      name: WIDGET_CATALOGUE[type]?.name ?? type,
      settings_schema: settingsSchema(type),
      settings_panel: settingsLabels(type).filter((s) => !hiddenKey(s.setting)),
    };
  }
  return {
    steps: GUIDE_STEPS,
    ask_the_teacher_only_for: TEACHER_QUESTIONS,
    notes: NOTES,
    chaining_examples: CHAINING,
    screen: screenOut(screen),
    templates: BOARD_TEMPLATES.map((t) => ({
      template_id: t.id,
      name: t.name,
      when_to_use: t.whenToUse,
      zones: t.slots.map((s) => ({
        zone_id: s.zoneId,
        role: s.role,
        suggested_widgets: s.suggestedWidgets.filter((w) => usableSet.has(w)),
      })),
    })),
    snap_layouts: [
      { layout_id: 'full', zones: ['full'] },
      ...SNAP_ZONE_LAYOUTS.map((l) => ({
        layout_id: l.id,
        zones: l.zones.map((z) => z.id),
      })),
    ],
    backgrounds: BOARD_BACKGROUNDS.map((b) => ({
      background_id: b.id,
      name: b.name,
    })),
    widgets: usable.map((type) => ({
      type,
      name: WIDGET_CATALOGUE[type]?.name ?? type,
      ...(WIDGET_CATALOGUE[type]?.category
        ? { category: WIDGET_CATALOGUE[type].category }
        : {}),
      ...(LIBRARY_ITEM_KEYS[type]
        ? {
            library_item: {
              kind: LIBRARY_ITEM_KEYS[type].kind,
              setting: LIBRARY_ITEM_KEYS[type].key,
            },
          }
        : {}),
      settings: settingNames(type),
    })),
    widgets_this_teacher_cannot_use: types.length - usable.length,
    ...(Object.keys(details).length > 0 ? { widget_details: details } : {}),
    ...(unknown.length > 0
      ? {
          not_available: unknown.map(
            (t) => `"${t}" is not a widget this teacher can add.`
          ),
        }
      : {}),
    ...(widgetTypes.length > MAX_GUIDE_WIDGETS
      ? {
          note: `Details are given for the first ${MAX_GUIDE_WIDGETS} widgets; ask again for the rest.`,
        }
      : {}),
  };
}

const settingsInput = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "The widget's settings by name, from get_board_guide widget_types. Only the settings you send change."
  );
const titleInput = z.string().max(MAX_WIDGET_TITLE);
const zoneInput = z
  .string()
  .min(1)
  .max(64)
  .describe('A zone id of the layout, e.g. "left".');
const layoutInput = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "A snap layout or template id from get_board_guide. In create_board it defaults to the board's template_id; in edit_board to an apply_template earlier in the same call."
  );
const libraryInput = z
  .string()
  .min(1)
  .max(128)
  .optional()
  .describe(
    "Id of the teacher's quiz, video activity, flashcard set, Activity Wall, Guided Learning activity or mini-app for this widget to show."
  );
const widgetSpec = z.object({
  type: z.string().min(1).max(64).describe('Widget type from get_board_guide.'),
  zone_id: zoneInput,
  layout_id: layoutInput,
  title: titleInput.optional().describe('Title shown on the widget.'),
  settings: settingsInput,
  library_item_id: libraryInput,
});
const widgetId = z.string().min(1).max(128);
const opInput = z.discriminatedUnion('op', [
  widgetSpec.extend({ op: z.literal('add_widget') }),
  z.object({
    op: z.literal('update_widget'),
    widget_id: widgetId,
    settings: settingsInput,
    title: titleInput.nullable().optional().describe('null clears it.'),
    library_item_id: libraryInput,
  }),
  z.object({
    op: z.literal('move_widget'),
    widget_id: widgetId,
    zone_id: zoneInput,
    layout_id: layoutInput,
  }),
  z.object({ op: z.literal('remove_widget'), widget_id: widgetId }),
  z.object({
    op: z.literal('apply_template'),
    template_id: z.string().min(1).max(64),
    widgets: z
      .array(z.object({ widget_id: widgetId, zone_id: zoneInput }))
      .max(MAX_WIDGETS_PER_BOARD)
      .describe('Which widget goes in which template zone.'),
  }),
  z.object({
    op: z.literal('rename'),
    name: z.string().min(1).max(MAX_BOARD_NAME),
  }),
  z.object({
    op: z.literal('set_background'),
    background: z
      .string()
      .min(1)
      .max(600)
      .describe('A background_id from get_board_guide.'),
  }),
]);

type Picture = { png: Buffer; result: Record<string, unknown> };

function pictureOf(
  board: Record<string, unknown> & { id: string },
  shape: BoardScreen
): Picture {
  const picture = describeBoard(board, shape);
  return {
    png: picture.wireframe.png,
    result: {
      board_id: board.id,
      name: boardName(board),
      widget_count: boardWidgets(board).length,
      widgets: picture.widgets,
      ...(picture.widgets_not_listed > 0
        ? { widgets_not_listed: picture.widgets_not_listed }
        : {}),
      layout_check: picture.layout_check,
      where_to_find_it: where(boardName(board)),
    },
  };
}

/** Each board's wireframe first, then the text result (D6). */
function withImages(result: CallToolResult, pngs: Buffer[]): CallToolResult {
  if (result.isError || pngs.length === 0) return result;
  return {
    content: [
      ...pngs.map((png) => ({
        type: 'image' as const,
        data: png.toString('base64'),
        mimeType: 'image/png',
      })),
      ...result.content,
    ],
  };
}

/** The edit_board and restore result: what changed, the new board and how to undo it. */
export function editResultOf(edit: EditResult, shape: BoardScreen): Picture {
  const { png, result } = pictureOf(edit.board, shape);
  const inUse = inUseNote(edit.before);
  return {
    png,
    result: {
      ...result,
      changes: edit.changes,
      ...(inUse ? { in_use: inUse } : {}),
      ...(edit.notes.length > 0 ? { notes: edit.notes } : {}),
      screen: screenOut(shape),
      previous_version_revision_id: edit.revisionId,
    },
  };
}

export function registerBoardTools(server: McpServer, ctx: ToolContext): void {
  const { db, uid } = ctx;

  server.registerTool(
    'list_boards',
    {
      title: 'List boards',
      description: `Lists the teacher's SpartBoard boards, most recently changed first, ${PAGE_SIZE} per page, with each board's collection and widget count. in_use means it was changed in SpartBoard in the last few minutes and may be on screen in class.`,
      inputSchema: {
        search: z.string().max(100).optional().describe('Name contains.'),
        collection_id: z
          .string()
          .max(128)
          .optional()
          .describe(
            'Only boards in this collection, or "root" for boards outside any collection.'
          ),
        cursor: z.string().max(10).optional().describe('From next_cursor.'),
      },
      annotations: READ_ONLY,
    },
    ({ search, collection_id, cursor }) =>
      run('list_boards', ctx, async () => {
        await assertBoardAccess(ctx);
        // Newest changed plus newest created, so boards saved before updatedAt existed still list.
        const newest = (field: string) =>
          db
            .collection(boardsPath(uid))
            .orderBy(field, 'desc')
            .select(...BOARD_LIST_FIELDS)
            .limit(MAX_BOARDS_SCANNED)
            .get();
        const [byUpdated, byCreated, collections] = await Promise.all([
          newest('updatedAt'),
          newest('createdAt'),
          loadCollections(db, uid),
        ]);
        const byId = new Map<string, Record<string, unknown>>();
        for (const d of [...byUpdated.docs, ...byCreated.docs])
          if (!byId.has(d.id)) byId.set(d.id, d.data());
        const needle = (search ?? '').trim().toLowerCase();
        const rows = [...byId]
          .map(([id, data]) => ({ id, data }))
          .filter(({ data }) => {
            if (needle && !boardName(data).toLowerCase().includes(needle))
              return false;
            if (collection_id === undefined) return true;
            const at = str(data.collectionId) || null;
            return collection_id === 'root'
              ? at === null
              : at === collection_id;
          })
          .sort(
            (a, b) =>
              lastChanged(b.data) - lastChanged(a.data) ||
              a.id.localeCompare(b.id)
          );
        const offset = decodeOffset(cursor);
        const page = rows.slice(offset, offset + PAGE_SIZE);
        const counts =
          page.length === 0
            ? []
            : await db.getAll(
                ...page.map((r) => db.doc(`${boardsPath(uid)}/${r.id}`)),
                { fieldMask: ['widgets'] }
              );
        const countById = new Map(
          counts.map((d) => [d.id, boardWidgets(d.data() ?? {}).length])
        );
        const now = Date.now();
        const next = offset + PAGE_SIZE;
        return {
          boards: page.map(({ id, data }) => {
            const inUse = inUseNote(data, now);
            const role = shareRole(data);
            return {
              board_id: id,
              name: boardName(data),
              widget_count: countById.get(id) ?? 0,
              collection: collectionPath(
                str(data.collectionId) || null,
                collections
              ),
              collection_id: str(data.collectionId) || null,
              ...(data.isPinned === true ? { pinned: true } : {}),
              ...(role ? { shared_with_you_as: role } : {}),
              updated_at: iso(data.updatedAt ?? data.createdAt),
              in_use: inUse !== null,
            };
          }),
          next_cursor:
            next < rows.length && next < MAX_BOARDS_SCANNED
              ? String(next)
              : null,
        };
      })
  );

  server.registerTool(
    'get_board',
    {
      title: 'Get a board',
      description:
        "Returns a board's widgets with their type, position, snap zone, settings and library item, a plain layout check (overlaps, widgets under the app's buttons or dock, empty space) and a wireframe picture of the board on the teacher's screen. Student names and class data are never included.",
      inputSchema: {
        board_id: z.string().min(1).max(128),
        screen: screenInput,
      },
      annotations: READ_ONLY,
    },
    async ({ board_id, screen }) => {
      let png: Buffer | null = null;
      const result = await run('get_board', ctx, async () => {
        await assertBoardAccess(ctx);
        assertBoardId(board_id);
        const board = await readBoard(ctx, board_id);
        const shape = await resolveBoardScreen(ctx, screen);
        const collections = await loadCollections(db, uid);
        const picture = describeBoard(board, shape);
        png = picture.wireframe.png;
        const inUse = inUseNote(board);
        const role = shareRole(board);
        return {
          board_id,
          name: boardName(board),
          collection: collectionPath(
            str(board.collectionId) || null,
            collections
          ),
          updated_at: iso(board.updatedAt ?? board.createdAt),
          ...(inUse ? { in_use: inUse } : {}),
          ...(role
            ? {
                shared_with_you_as: role,
                note: 'Another teacher owns this board and shares it with this teacher.',
              }
            : {}),
          screen: screenOut(shape),
          widget_count: boardWidgets(board).length,
          widgets: picture.widgets,
          ...(picture.widgets_not_listed > 0
            ? { widgets_not_listed: picture.widgets_not_listed }
            : {}),
          layout_check: picture.layout_check,
          where_to_find_it: where(boardName(board)),
        };
      });
      const image = png as Buffer | null;
      if (result.isError || !image) return result;
      return {
        content: [
          {
            type: 'image',
            data: image.toString('base64'),
            mimeType: 'image/png',
          },
          ...result.content,
        ],
      } satisfies CallToolResult;
    }
  );

  server.registerTool(
    'get_board_guide',
    {
      title: 'Get the board building guide',
      description:
        "Read before building or changing a board. Returns the steps and the questions to ask the teacher, activity templates with their zones, snap layouts, the widgets this teacher can use with their settings, and chaining examples. widget_types adds each named widget's full settings schema.",
      inputSchema: {
        widget_types: z
          .array(z.string().max(64))
          .max(20)
          .optional()
          .describe(
            `Widget types to return full settings for, e.g. ["time-tool", "text"]; at most ${MAX_GUIDE_WIDGETS}.`
          ),
      },
      annotations: READ_ONLY,
    },
    ({ widget_types }) =>
      run('get_board_guide', ctx, async () => {
        await assertBoardAccess(ctx);
        return buildBoardGuide(ctx, widget_types ?? []);
      })
  );

  server.registerTool(
    'create_board',
    {
      title: 'Create boards',
      description: `Creates up to ${MAX_BOARDS_PER_CALL} new boards at the top of the teacher's Boards list, each with up to ${MAX_WIDGETS_PER_BOARD} widgets placed on template or snap-layout zones and set up with real settings and library items. Read get_board_guide first and agree a short plan with the teacher. Returns each board's wireframe picture and layout check.`,
      inputSchema: {
        boards: z
          .array(
            z.object({
              name: z.string().min(1).max(MAX_BOARD_NAME),
              template_id: z
                .string()
                .min(1)
                .max(64)
                .optional()
                .describe(
                  'Template from get_board_guide; widget zone_ids are its zones.'
                ),
              collection_id: z
                .string()
                .min(1)
                .max(128)
                .optional()
                .describe(
                  'Only when the teacher names a collection (ids from list_boards).'
                ),
              background: z
                .string()
                .min(1)
                .max(600)
                .optional()
                .describe('A background_id from get_board_guide.'),
              widgets: z.array(widgetSpec).max(MAX_WIDGETS_PER_BOARD),
            })
          )
          .min(1)
          .max(MAX_BOARDS_PER_CALL),
        screen: screenInput,
      },
      annotations: CREATES,
    },
    async ({ boards, screen }) => {
      const pngs: Buffer[] = [];
      const result = await run('create_board', ctx, async () => {
        await assertBoardAccess(ctx);
        const shape = await resolveBoardScreen(ctx, screen);
        const created = await createBoards(ctx, boards, shape);
        const out = created.boards.map((board) => {
          const picture = pictureOf(board, shape);
          pngs.push(picture.png);
          return picture.result;
        });
        return {
          boards: out,
          ...(created.notes.length > 0 ? { notes: created.notes } : {}),
          screen: screenOut(shape),
        };
      });
      return withImages(result, pngs);
    }
  );

  server.registerTool(
    'edit_board',
    {
      title: 'Edit a board',
      description: `Changes one of the teacher's boards with up to ${MAX_OPS_PER_CALL} changes applied together: add_widget, update_widget (settings, title or library item), move_widget (to a zone), remove_widget, apply_template (move widgets onto a template's zones), rename and set_background. If any change is refused nothing is saved. Read get_board first for widget ids. The previous version is kept for 30 days; restore_revision undoes it. Never deletes a board.`,
      inputSchema: {
        board_id: z.string().min(1).max(128),
        changes: z.array(opInput).min(1).max(MAX_OPS_PER_CALL),
        screen: screenInput,
      },
      annotations: OVERWRITES,
    },
    async ({ board_id, changes, screen }) => {
      let png: Buffer | null = null;
      const result = await run('edit_board', ctx, async () => {
        await assertBoardAccess(ctx);
        assertBoardId(board_id);
        const shape = await resolveBoardScreen(ctx, screen);
        const edit = await editBoard(ctx, board_id, changes, shape);
        const picture = editResultOf(edit, shape);
        png = picture.png;
        return picture.result;
      });
      const image = png as Buffer | null;
      return withImages(result, image ? [image] : []);
    }
  );
}
