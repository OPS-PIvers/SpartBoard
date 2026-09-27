// Mini-app tools (plan: "Tools", PR 3). Mirrors saveMiniApp / handleCreate in components/widgets/MiniApp/Widget.tsx.
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
  assertFolder,
  iso,
  run,
  titleAndFolderFilter,
} from './toolKit';

const COLLECTION = 'miniapps';
/** Mirrors MAX_TITLE_LENGTH in the mini-app import adapter. */
const MAX_TITLE = 100;
/** Keeps get_mini_app under the connector's per-result size. */
export const MAX_HTML = 120_000;
const MAX_SCAN = 500;

type MiniApp = Record<string, unknown> & {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  order: number;
};

const appPath = (uid: string, id: string) => `users/${uid}/${COLLECTION}/${id}`;

function summarize(id: string, data: Record<string, unknown>) {
  return {
    app_id: id,
    title: data.title,
    ...(typeof data.html === 'string'
      ? { size_kb: Math.round(data.html.length / 102.4) / 10 }
      : {}),
    folder_id: data.folderId ?? null,
    created_at: iso(data.createdAt),
  };
}

export function assertHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) throw new ToolError('html is empty.');
  if (trimmed.length > MAX_HTML) {
    throw new ToolError(
      `The app is ${Math.round(trimmed.length / 1000)}k characters; the limit through Claude is ${MAX_HTML / 1000}k.`
    );
  }
  return trimmed;
}

async function readApp(ctx: ToolContext, id: string): Promise<MiniApp> {
  const snap = await ctx.db.doc(appPath(ctx.uid, id)).get();
  if (!snap.exists) {
    throw new ToolError(
      'That mini-app was not found. Use list_mini_apps to find its id.'
    );
  }
  return { ...(snap.data() as MiniApp), id };
}

async function saveEdit(
  ctx: ToolContext,
  previous: MiniApp,
  next: MiniApp,
  action: 'update' | 'restore'
) {
  const batch = ctx.db.batch();
  const data: Record<string, unknown> = { ...previous };
  delete data.id;
  const revisionId = snapshotRevision(ctx, batch, {
    itemType: 'mini_app',
    itemId: previous.id,
    title: previous.title,
    data,
  });
  const now = Date.now();
  // Order and createdAt stay put, as saveMiniApp keeps them.
  const doc: MiniApp = {
    ...next,
    createdAt: previous.createdAt,
    order: previous.order ?? 0,
    updatedAt: now,
    claudeEditedAt: now,
  };
  batch.set(ctx.db.doc(appPath(ctx.uid, doc.id)), doc);
  logActivity(ctx, batch, {
    action,
    itemType: 'mini_app',
    itemId: doc.id,
    title: doc.title,
    revisionId,
  });
  await batch.commit();
  return {
    ...summarize(doc.id, doc),
    previous_version_revision_id: revisionId,
    note: 'Boards already showing this app pick up the change the next time it loads.',
  };
}

/** restore_revision for mini-apps; called from tools.ts. */
export async function restoreMiniAppRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  const id = String(rev.get('itemId'));
  const current = await readApp(ctx, id);
  await reserveWrite(ctx);
  const data = rev.get('data') as MiniApp;
  return saveEdit(
    ctx,
    current,
    { ...data, id, folderId: current.folderId ?? null } as MiniApp,
    'restore'
  );
}

export function registerMiniAppTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'list_mini_apps',
    {
      title: 'List mini-apps',
      description: `Lists mini-apps in library order, ${PAGE_SIZE} per page.`,
      inputSchema: {
        search: z.string().max(100).optional(),
        folder_id: z.string().optional().describe('Folder id, or "root".'),
        cursor: z.string().optional().describe('From next_cursor.'),
      },
      annotations: READ_ONLY,
    },
    ({ search, folder_id, cursor }) =>
      run('list_mini_apps', ctx, async () => {
        // Same order the library uses; docs without `order` never show there either.
        const snap = await ctx.db
          .collection(`users/${ctx.uid}/${COLLECTION}`)
          .orderBy('order', 'asc')
          .orderBy('createdAt', 'desc')
          .select('title', 'folderId', 'createdAt')
          .limit(MAX_SCAN)
          .get();
        const matches = titleAndFolderFilter(search, folder_id);
        const all = snap.docs.filter((d) => matches(d.data()));
        const start = Math.max(0, Number(cursor ?? 0) || 0);
        const page = all.slice(start, start + PAGE_SIZE);
        return {
          mini_apps: page.map((d) => summarize(d.id, d.data())),
          next_cursor:
            start + PAGE_SIZE < all.length ? String(start + PAGE_SIZE) : null,
        };
      })
  );

  server.registerTool(
    'get_mini_app',
    {
      title: 'Get a mini-app',
      description: 'Returns a mini-app with its full HTML.',
      inputSchema: { app_id: z.string().min(1) },
      annotations: READ_ONLY,
    },
    ({ app_id }) =>
      run('get_mini_app', ctx, async () => {
        const app = await readApp(ctx, app_id);
        if (app.html.length > MAX_HTML) {
          return {
            ...summarize(app_id, app),
            html: null,
            note: 'This app is too large to read or edit through Claude. The teacher can edit it in SpartBoard.',
          };
        }
        return { ...summarize(app_id, app), html: app.html };
      })
  );

  server.registerTool(
    'create_mini_app',
    {
      title: 'Create a mini-app',
      description: `Saves a single-file HTML app (inline CSS and JS, no server) to the Mini App library. Runs sandboxed on the classroom board. Up to ${MAX_HTML / 1000}k characters.`,
      inputSchema: {
        title: z.string().trim().min(1).max(MAX_TITLE),
        html: z.string().min(1),
        folder_id: z
          .string()
          .optional()
          .describe('From list_folders; omit for top level.'),
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_mini_app', ctx, async () => {
        const html = assertHtml(input.html);
        await assertFolder(ctx, 'mini_apps', input.folder_id);
        await reserveWrite(ctx);
        const col = ctx.db.collection(`users/${ctx.uid}/${COLLECTION}`);
        // New apps land first: order = min(existing) - 1, as handleCreate does.
        const first = await col.orderBy('order', 'asc').limit(1).get();
        const minOrder = first.empty
          ? null
          : Number(first.docs[0].get('order'));
        const now = Date.now();
        const app: MiniApp = {
          id: randomUUID(),
          title: input.title.trim(),
          html,
          createdAt: now,
          order:
            minOrder === null || !Number.isFinite(minOrder) ? 0 : minOrder - 1,
          claudeCreatedAt: now,
          ...(input.folder_id ? { folderId: input.folder_id } : {}),
        };
        const batch = ctx.db.batch();
        batch.set(col.doc(app.id), app);
        logActivity(ctx, batch, {
          action: 'create',
          itemType: 'mini_app',
          itemId: app.id,
          title: app.title,
        });
        await batch.commit();
        return {
          ...summarize(app.id, app),
          where_to_find_it: 'SpartBoard > Mini App widget > library',
        };
      })
  );

  server.registerTool(
    'update_mini_app',
    {
      title: 'Edit a mini-app',
      description:
        'Edits a mini-app; only passed fields change. `html` replaces the whole file.',
      inputSchema: {
        app_id: z.string().min(1),
        title: z.string().trim().min(1).max(MAX_TITLE).optional(),
        html: z.string().min(1).optional(),
        folder_id: z
          .string()
          .nullable()
          .optional()
          .describe('Folder id; null for top level.'),
      },
      annotations: OVERWRITES,
    },
    (input) =>
      run('update_mini_app', ctx, async () => {
        const html =
          input.html === undefined ? undefined : assertHtml(input.html);
        if (input.folder_id)
          await assertFolder(ctx, 'mini_apps', input.folder_id);
        const existing = await readApp(ctx, input.app_id);
        if (existing.html.length > MAX_HTML) {
          throw new ToolError(
            'This app is too large to edit through Claude. The teacher can edit it in SpartBoard.'
          );
        }
        await reserveWrite(ctx);
        return saveEdit(
          ctx,
          existing,
          {
            ...existing,
            title: input.title?.trim() || existing.title,
            html: html ?? existing.html,
            ...(input.folder_id === undefined
              ? {}
              : { folderId: input.folder_id }),
          },
          'update'
        );
      })
  );
}
