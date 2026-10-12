// Mini-app tools (plan: "Tools", PR 3). Mirrors saveMiniApp / handleCreate in components/widgets/MiniApp/Widget.tsx.
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PAGE_SIZE } from './config';
import {
  REVIEW_MARK,
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
import { checkMiniAppSource } from '../miniAppGrading';
import { MINI_APP_BASIC_SPEC, MINI_APP_RESULTS_SPEC } from '../miniAppSpec';

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
  collectsResults?: boolean;
  manifest?: MiniAppManifest;
};

const appPath = (uid: string, id: string) => `users/${uid}/${COLLECTION}/${id}`;
const keyPath = (uid: string, id: string) => `users/${uid}/mini_app_keys/${id}`;
const RESULTS_FEATURE_ID = 'mini-app-results';

const manifestSchema = z
  .object({
    questions: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(128),
          type: z.enum([
            'mc',
            'multi',
            'tf',
            'numeric',
            'short',
            'order',
            'other',
          ]),
          prompt: z.string().max(500).default(''),
          points: z.number().min(0).optional(),
        })
      )
      .max(200),
  })
  .describe('The questions the app sends answers for; see get_mini_app_spec.');

const answerKeySchema = z
  .object({
    questions: z.record(
      z.string(),
      z.object({
        correct: z
          .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.union([z.string(), z.number()])),
          ])
          .optional(),
        tolerance: z.number().min(0).optional(),
        accepted: z.array(z.string()).optional(),
      })
    ),
  })
  .describe(
    'Correct answers by question id. Saved apart from the app; students never see it.'
  );

const resultsFields = {
  collects_results: z
    .boolean()
    .optional()
    .describe('True when students send results the teacher wants to see.'),
  manifest: manifestSchema.optional(),
  answer_key: answerKeySchema.optional(),
};

type MiniAppManifest = z.infer<typeof manifestSchema>;
type MiniAppAnswerKey = z.infer<typeof answerKeySchema>;

/** Server twin of miniAppResultsOn: the preview flag AND Mini App submissions in Organization settings. */
export async function miniAppResultsOn(ctx: ToolContext): Promise<boolean> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  const [granted, modes] = await Promise.all([
    isGlobalFeatureGranted(ctx.db, RESULTS_FEATURE_ID, ctx.email, ctx.uid),
    ctx.db.doc('global_permissions/assignment-modes').get(),
  ]);
  const config: unknown = modes.get('config');
  const mode =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>).miniApp
      : undefined;
  return granted && mode !== 'view-only';
}

async function readKey(
  ctx: ToolContext,
  id: string
): Promise<MiniAppAnswerKey | null> {
  const snap = await ctx.db.doc(keyPath(ctx.uid, id)).get();
  return snap.exists ? (snap.data() as MiniAppAnswerKey) : null;
}

interface ResultsInput {
  collects_results?: boolean;
  manifest?: MiniAppManifest;
  answer_key?: MiniAppAnswerKey;
}

const RESULTS_OFF_NOTE =
  "Results scoring isn't on for this teacher, so collects_results, manifest and answer_key were not saved.";

/** Results fields only count for teachers with results on; for everyone else they are dropped. */
async function resultsInput(
  ctx: ToolContext,
  input: ResultsInput
): Promise<ResultsInput & { ignored: boolean }> {
  const sent =
    input.collects_results !== undefined ||
    input.manifest !== undefined ||
    input.answer_key !== undefined;
  if (!sent) return { ignored: false };
  if (await miniAppResultsOn(ctx)) {
    return {
      collects_results: input.collects_results,
      manifest: input.manifest,
      answer_key: input.answer_key,
      ignored: false,
    };
  }
  return { ignored: true };
}

/** D12: refuses a results app that would not work. */
function assertResultsApp(html: string, manifest: unknown, key: unknown): void {
  const problems = checkMiniAppSource(html, manifest, key);
  if (problems.length > 0) {
    throw new ToolError(
      `Not saved. ${problems.join(' ')} Fix these and save again; get_mini_app_spec has the rules.`
    );
  }
}

function summarize(id: string, data: Record<string, unknown>) {
  return {
    app_id: id,
    title: data.title,
    ...(typeof data.html === 'string'
      ? { size_kb: Math.round(data.html.length / 102.4) / 10 }
      : {}),
    folder_id: data.folderId ?? null,
    ...(data.collectsResults === true ? { collects_results: true } : {}),
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
  action: 'update' | 'restore',
  keys: { previous: MiniAppAnswerKey | null; next?: MiniAppAnswerKey | null }
) {
  const batch = ctx.db.batch();
  const data: Record<string, unknown> = { ...previous };
  delete data.id;
  // The key rides in the revision so an undo restores questions and answers together.
  data.answerKey = keys.previous;
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
    [REVIEW_MARK]: now,
  };
  batch.set(ctx.db.doc(appPath(ctx.uid, doc.id)), doc);
  if (keys.next !== undefined) {
    const keyRef = ctx.db.doc(keyPath(ctx.uid, doc.id));
    if (keys.next) batch.set(keyRef, { questions: keys.next.questions });
    else batch.delete(keyRef);
  }
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
  const currentKey = await readKey(ctx, id);
  await reserveWrite(ctx);
  const { answerKey, ...data } = rev.get('data') as MiniApp & {
    answerKey?: MiniAppAnswerKey | null;
  };
  return saveEdit(
    ctx,
    current,
    { ...data, id, folderId: current.folderId ?? null },
    'restore',
    // Revisions saved before keys rode along leave the key as it is.
    { previous: currentKey, next: answerKey }
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
        const key =
          app.collectsResults === true ? await readKey(ctx, app_id) : null;
        return {
          ...summarize(app_id, app),
          html: app.html,
          ...(app.collectsResults === true
            ? {
                manifest: app.manifest ?? { questions: [] },
                answer_key: key ?? { questions: {} },
              }
            : {}),
        };
      })
  );

  server.registerTool(
    'get_mini_app_spec',
    {
      title: 'Get the Mini App spec',
      description:
        'Returns how to write a SpartBoard mini-app for this teacher, including how it sends results. Read it before create_mini_app or an update_mini_app that changes html.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run('get_mini_app_spec', ctx, async () => {
        const resultsOn = await miniAppResultsOn(ctx);
        return {
          results_scoring: resultsOn,
          spec: resultsOn ? MINI_APP_RESULTS_SPEC : MINI_APP_BASIC_SPEC,
        };
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
        ...resultsFields,
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_mini_app', ctx, async () => {
        const html = assertHtml(input.html);
        await assertFolder(ctx, 'mini_apps', input.folder_id);
        const results = await resultsInput(ctx, input);
        const collects = results.collects_results === true;
        if (collects)
          assertResultsApp(html, results.manifest, results.answer_key);
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
          [REVIEW_MARK]: now,
          ...(input.folder_id ? { folderId: input.folder_id } : {}),
          ...(results.collects_results !== undefined
            ? { collectsResults: collects }
            : {}),
          ...(results.manifest ? { manifest: results.manifest } : {}),
        };
        const batch = ctx.db.batch();
        batch.set(col.doc(app.id), app);
        if (results.answer_key)
          batch.set(ctx.db.doc(keyPath(ctx.uid, app.id)), {
            questions: results.answer_key.questions,
          });
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
          ...(results.ignored ? { note: RESULTS_OFF_NOTE } : {}),
        };
      })
  );

  server.registerTool(
    'update_mini_app',
    {
      title: 'Edit a mini-app',
      description:
        'Edits a mini-app; only passed fields change. `html`, `manifest` and `answer_key` each replace the whole value.',
      inputSchema: {
        app_id: z.string().min(1),
        title: z.string().trim().min(1).max(MAX_TITLE).optional(),
        html: z.string().min(1).optional(),
        folder_id: z
          .string()
          .nullable()
          .optional()
          .describe('Folder id; null for top level.'),
        ...resultsFields,
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
        const existingKey = await readKey(ctx, input.app_id);
        const results = await resultsInput(ctx, input);
        const collects =
          results.collects_results ?? existing.collectsResults === true;
        const touchesResults =
          html !== undefined ||
          results.collects_results !== undefined ||
          results.manifest !== undefined ||
          results.answer_key !== undefined;
        if (collects && touchesResults && (await miniAppResultsOn(ctx)))
          assertResultsApp(
            html ?? existing.html,
            results.manifest ?? existing.manifest,
            results.answer_key ?? existingKey
          );
        await reserveWrite(ctx);
        const saved = await saveEdit(
          ctx,
          existing,
          {
            ...existing,
            title: input.title?.trim() || existing.title,
            html: html ?? existing.html,
            ...(input.folder_id === undefined
              ? {}
              : { folderId: input.folder_id }),
            ...(results.collects_results === undefined
              ? {}
              : { collectsResults: results.collects_results }),
            ...(results.manifest ? { manifest: results.manifest } : {}),
          },
          'update',
          {
            previous: existingKey,
            ...(results.answer_key ? { next: results.answer_key } : {}),
          }
        );
        return results.ignored
          ? { ...saved, note: `${saved.note} ${RESULTS_OFF_NOTE}` }
          : saved;
      })
  );
}
