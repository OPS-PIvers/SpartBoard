// Activity Wall tools (plan: "Tools", PR 3). Mirrors useActivityWallLibrary.saveActivity and WallEditorModal.
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PAGE_SIZE } from './config';
import {
  ToolError,
  logActivity,
  reserveWrite,
  snapshotRevision,
  type ToolContext,
} from './activity';
import {
  CREATES,
  OVERWRITES,
  READ_ONLY,
  iso,
  pageByUpdatedAt,
  run,
  titleAndFolderFilter,
} from './toolKit';

const COLLECTION = 'activity_wall_activities';
const LAYOUTS = [
  'wall',
  'columns',
  'table',
  'timeline',
  'map',
  'wordcloud',
] as const;
type Layout = (typeof LAYOUTS)[number];
const DEFAULT_APPEARANCE = {
  kind: 'gradient',
  value: 'bg-gradient-to-br from-slate-900 to-slate-700',
};
const MAX_SECTIONS = 20;

type Wall = Record<string, unknown> & {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
};
type Section = { id: string; label: string };
type AllowedTypes = {
  photo: boolean;
  link: boolean;
  file: boolean;
  video: boolean;
};

const wallPath = (uid: string, id: string) =>
  `users/${uid}/${COLLECTION}/${id}`;

/** Mirrors buildDefaultWall in utils/activityWallNormalize.ts with no building defaults. */
export function defaultWall(id: string, now: number): Wall {
  return {
    id,
    title: '',
    prompt: '',
    mode: 'text',
    moderationEnabled: false,
    identificationMode: 'anonymous',
    createdAt: now,
    updatedAt: now,
    layout: 'wall',
    allowedTypes: { photo: false, link: false, file: false, video: false },
    appearance: DEFAULT_APPEARANCE,
    allowGuests: true,
    showNames: false,
    maxPostsPerStudent: 0,
    allowStudentEdit: false,
    allowStudentDelete: false,
    acceptingResponses: true,
    studentsCanSeePosts: true,
    allowLikes: false,
    allowComments: false,
    allowCommentResponses: false,
  };
}

/** Labels → sections, keeping the id of an existing section with the same label so posts stay put. */
export function toSections(
  labels: string[] | undefined,
  previous: unknown,
  newId: () => string
): Section[] | undefined {
  if (labels === undefined) return undefined;
  const pool = Array.isArray(previous) ? [...(previous as Section[])] : [];
  return labels
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => {
      const i = pool.findIndex((s) => s.label === label);
      if (i === -1) return { id: newId(), label };
      const [kept] = pool.splice(i, 1);
      return { id: kept.id, label };
    });
}

/** The save WallEditorModal performs: legacy fields, trimmed sections, layout checks. */
export function finalizeWall(draft: Wall, now: number): Wall {
  const layout = (draft.layout as Layout | undefined) ?? 'wall';
  const sections = (draft.sections as Section[] | undefined) ?? [];
  const rows = (draft.tableRows as Section[] | undefined) ?? [];
  const cols = (draft.tableCols as Section[] | undefined) ?? [];
  if (layout === 'columns' && sections.length === 0) {
    throw new ToolError('A columns wall needs at least one column.');
  }
  if (layout === 'table' && (rows.length === 0 || cols.length === 0)) {
    throw new ToolError('A table wall needs at least one row and one column.');
  }
  const next: Wall = {
    ...draft,
    mode: layout === 'wordcloud' ? 'text' : 'photo',
    identificationMode: draft.showNames ? 'name' : 'anonymous',
    sections,
    tableRows: rows,
    tableCols: cols,
    createdAt: draft.createdAt || now,
    updatedAt: now,
  };
  const classIds = next.classIds as string[] | undefined;
  if (classIds?.[0]) next.classId = classIds[0];
  else delete next.classId;
  return next;
}

/** Mirrors mirrorSessionFromEntry in utils/activityWallNormalize.ts for entries saved by finalizeWall. */
export function sessionMirror(
  entry: Wall,
  uid: string,
  now: number
): Record<string, unknown> {
  const allowGuests = (entry.allowGuests as boolean | undefined) ?? true;
  const mode = entry.mode as string;
  const session: Record<string, unknown> = {
    id: `${uid}_${entry.id}`,
    activityId: entry.id,
    teacherUid: uid,
    title: entry.title,
    prompt: entry.prompt,
    mode,
    moderationEnabled: Boolean(entry.moderationEnabled),
    identificationMode: entry.identificationMode,
    updatedAt: now,
    layout: entry.layout ?? (mode === 'photo' ? 'wall' : 'wordcloud'),
    allowedTypes: entry.allowedTypes ?? {
      photo: mode === 'photo',
      link: false,
      file: false,
      video: false,
    },
    appearance: entry.appearance ?? DEFAULT_APPEARANCE,
    allowGuests,
    showNames:
      (entry.showNames as boolean | undefined) ??
      (entry.identificationMode === 'name' ||
        entry.identificationMode === 'name-pin'),
    maxPostsPerStudent: entry.maxPostsPerStudent ?? 0,
    allowStudentEdit: entry.allowStudentEdit ?? false,
    allowStudentDelete: entry.allowStudentDelete ?? false,
    acceptingResponses: entry.acceptingResponses ?? true,
    driveVisibility: allowGuests ? 'anyone' : 'domain',
    studentsCanSeePosts: entry.studentsCanSeePosts ?? true,
    allowLikes: entry.allowLikes ?? false,
    allowComments: entry.allowComments ?? false,
    allowCommentResponses: entry.allowCommentResponses ?? false,
  };
  for (const k of [
    'classId',
    'classIds',
    'rosterIds',
    'sections',
    'tableRows',
    'tableCols',
    'mapCenter',
  ]) {
    if (entry[k]) session[k] = entry[k];
  }
  return session;
}

function summarize(id: string, data: Record<string, unknown>) {
  return {
    wall_id: id,
    title: data.title,
    layout: data.layout ?? (data.mode === 'photo' ? 'wall' : 'wordcloud'),
    updated_at: iso(data.updatedAt),
  };
}

function fullWall(wall: Wall) {
  const labels = (v: unknown) =>
    Array.isArray(v) ? (v as Section[]).map((s) => s.label) : [];
  const allowed = (wall.allowedTypes ?? {}) as Partial<AllowedTypes>;
  return {
    ...summarize(wall.id, wall),
    prompt: wall.prompt,
    columns: labels(wall.sections),
    table_rows: labels(wall.tableRows),
    table_columns: labels(wall.tableCols),
    post_types: [
      'text',
      ...(['photo', 'link', 'file', 'video'] as const).filter(
        (t) => allowed[t]
      ),
    ],
    show_names: Boolean(wall.showNames),
    moderation: Boolean(wall.moderationEnabled),
    allow_likes: Boolean(wall.allowLikes),
    allow_comments: Boolean(wall.allowComments),
    max_posts_per_student: Number(wall.maxPostsPerStudent ?? 0),
  };
}

async function readWall(ctx: ToolContext, id: string): Promise<Wall> {
  const snap = await ctx.db.doc(wallPath(ctx.uid, id)).get();
  if (!snap.exists) {
    throw new ToolError(
      'That Activity Wall was not found. Use list_activity_walls to find its id.'
    );
  }
  return { ...(snap.data() as Wall), id };
}

/** Writes the entry, and refreshes the live session mirror when the wall has been opened before. */
async function writeWall(
  ctx: ToolContext,
  wall: Wall,
  opts: { previous: Wall | null; action: 'create' | 'update' | 'restore' }
) {
  const now = Date.now();
  const batch = ctx.db.batch();
  let revisionId: string | null = null;
  if (opts.previous) {
    const data: Record<string, unknown> = { ...opts.previous };
    delete data.id;
    revisionId = snapshotRevision(ctx, batch, {
      itemType: 'activity_wall',
      itemId: wall.id,
      title: opts.previous.title,
      data,
    });
  }
  batch.set(ctx.db.doc(wallPath(ctx.uid, wall.id)), wall);
  const sessionRef = ctx.db.doc(`activity_wall_sessions/${ctx.uid}_${wall.id}`);
  if (opts.action !== 'create' && (await sessionRef.get()).exists) {
    batch.set(sessionRef, sessionMirror(wall, ctx.uid, now), { merge: true });
  }
  logActivity(ctx, batch, {
    action: opts.action,
    itemType: 'activity_wall',
    itemId: wall.id,
    title: wall.title || 'Untitled wall',
    revisionId,
  });
  await batch.commit();
  return {
    ...fullWall(wall),
    ...(revisionId ? { previous_version_revision_id: revisionId } : {}),
  };
}

/** restore_revision for Activity Walls; called from tools.ts. */
export async function restoreWallRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  const id = String(rev.get('itemId'));
  const current = await readWall(ctx, id);
  await reserveWrite(ctx);
  const data = rev.get('data') as Wall;
  // Live controls and class targeting stay as they are now; only content rolls back.
  const restored = finalizeWall(
    {
      ...data,
      id,
      acceptingResponses: current.acceptingResponses,
      studentsCanSeePosts: current.studentsCanSeePosts,
      classIds: current.classIds,
      rosterIds: current.rosterIds,
    } as Wall,
    Date.now()
  );
  if (current.classIds === undefined) delete restored.classIds;
  if (current.rosterIds === undefined) delete restored.rosterIds;
  return writeWall(ctx, restored, { previous: current, action: 'restore' });
}

const wallFields = {
  prompt: z
    .string()
    .max(2000)
    .optional()
    .describe('The question or instructions students see.'),
  layout: z
    .enum(LAYOUTS)
    .optional()
    .describe(
      'wall: free cards. columns, table: labeled sections. timeline: ordered. map: pins. wordcloud: short phrases.'
    ),
  columns: z
    .array(z.string().max(100))
    .max(MAX_SECTIONS)
    .optional()
    .describe('Required for columns.'),
  table_rows: z
    .array(z.string().max(100))
    .max(MAX_SECTIONS)
    .optional()
    .describe('Required for table.'),
  table_columns: z
    .array(z.string().max(100))
    .max(MAX_SECTIONS)
    .optional()
    .describe('Required for table.'),
  post_types: z
    .array(z.enum(['photo', 'link', 'file', 'video']))
    .optional()
    .describe('Besides text.'),
  show_names: z.boolean().optional().describe("Show students' names on posts."),
  moderation: z.boolean().optional().describe('Teacher approves posts first.'),
  allow_likes: z.boolean().optional(),
  allow_comments: z.boolean().optional(),
  max_posts_per_student: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe('0 means no limit.'),
};

type WallFieldInput = {
  prompt?: string;
  layout?: Layout;
  columns?: string[];
  table_rows?: string[];
  table_columns?: string[];
  post_types?: ('photo' | 'link' | 'file' | 'video')[];
  show_names?: boolean;
  moderation?: boolean;
  allow_likes?: boolean;
  allow_comments?: boolean;
  max_posts_per_student?: number;
};

function applyFields(base: Wall, input: WallFieldInput): Wall {
  const next: Wall = { ...base };
  if (input.prompt !== undefined) next.prompt = input.prompt.trim();
  if (input.layout !== undefined) next.layout = input.layout;
  const sections = toSections(input.columns, base.sections, randomUUID);
  if (sections) next.sections = sections;
  const rows = toSections(input.table_rows, base.tableRows, randomUUID);
  if (rows) next.tableRows = rows;
  const cols = toSections(input.table_columns, base.tableCols, randomUUID);
  if (cols) next.tableCols = cols;
  if (input.post_types !== undefined) {
    const set = new Set(input.post_types);
    next.allowedTypes = {
      photo: set.has('photo'),
      link: set.has('link'),
      file: set.has('file'),
      video: set.has('video'),
    };
  }
  if (input.show_names !== undefined) next.showNames = input.show_names;
  if (input.moderation !== undefined) next.moderationEnabled = input.moderation;
  if (input.allow_likes !== undefined) next.allowLikes = input.allow_likes;
  if (input.allow_comments !== undefined)
    next.allowComments = input.allow_comments;
  if (input.max_posts_per_student !== undefined)
    next.maxPostsPerStudent = input.max_posts_per_student;
  return next;
}

export function registerWallTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_activity_walls',
    {
      title: 'List Activity Walls',
      description: `Lists Activity Walls, newest first, ${PAGE_SIZE} per page.`,
      inputSchema: {
        search: z.string().max(100).optional(),
        cursor: z.string().optional().describe('From next_cursor.'),
      },
      annotations: READ_ONLY,
    },
    ({ search, cursor }) =>
      run('list_activity_walls', ctx, async () => {
        const page = await pageByUpdatedAt(
          ctx.db,
          `users/${ctx.uid}/${COLLECTION}`,
          cursor,
          titleAndFolderFilter(search, undefined)
        );
        return {
          walls: page.items.map(({ id, data }) => summarize(id, data)),
          next_cursor: page.next_cursor,
        };
      })
  );

  server.registerTool(
    'get_activity_wall',
    {
      title: 'Get an Activity Wall',
      description:
        "Returns an Activity Wall's prompt, layout and settings (no student posts).",
      inputSchema: { wall_id: z.string().min(1) },
      annotations: READ_ONLY,
    },
    ({ wall_id }) =>
      run('get_activity_wall', ctx, async () =>
        fullWall(await readWall(ctx, wall_id))
      )
  );

  server.registerTool(
    'create_activity_wall',
    {
      title: 'Create an Activity Wall',
      description:
        'Creates an Activity Wall: a prompt students answer by posting cards.',
      inputSchema: { title: z.string().trim().min(1).max(200), ...wallFields },
      annotations: CREATES,
    },
    (input) =>
      run('create_activity_wall', ctx, async () => {
        const now = Date.now();
        const draft = applyFields(
          { ...defaultWall(randomUUID(), now), title: input.title.trim() },
          input
        );
        const wall = finalizeWall(
          { ...draft, claudeCreatedAt: now } as Wall,
          now
        );
        await reserveWrite(ctx);
        const result = await writeWall(ctx, wall, {
          previous: null,
          action: 'create',
        });
        return {
          ...result,
          where_to_find_it: 'SpartBoard > Activity Wall widget > library',
        };
      })
  );

  server.registerTool(
    'update_activity_wall',
    {
      title: 'Edit an Activity Wall',
      description:
        'Edits an Activity Wall; only passed fields change and lists are replaced. Renaming a column moves its posts to the default spot. Students on an open wall see changes at once.',
      inputSchema: {
        wall_id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        ...wallFields,
      },
      annotations: OVERWRITES,
    },
    (input) =>
      run('update_activity_wall', ctx, async () => {
        const existing = await readWall(ctx, input.wall_id);
        const now = Date.now();
        const draft = applyFields(
          { ...existing, title: input.title?.trim() || existing.title },
          input
        );
        const wall = finalizeWall(
          { ...draft, claudeEditedAt: now } as Wall,
          now
        );
        await reserveWrite(ctx);
        return writeWall(ctx, wall, { previous: existing, action: 'update' });
      })
  );
}
