// Shared plumbing for MCP tool handlers: results, errors and cursor paging.
import * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PAGE_SIZE } from './config';
import { ToolError, type ToolContext } from './activity';

export const json = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

export const iso = (ms: unknown): string | null =>
  typeof ms === 'number' ? new Date(ms).toISOString() : null;

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
export const CREATES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
export const OVERWRITES = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** Library folder collection per content type, mirroring folderCollectionName in hooks/useFolders.ts. */
export const FOLDER_COLLECTIONS = {
  flashcards: 'flashcard_folders',
  quizzes: 'quiz_folders',
  question_banks: 'question_bank_folders',
  video_activities: 'video_activity_folders',
  mini_apps: 'miniapp_folders',
  guided_learning: 'guided_learning_folders',
  projects: 'projects_folders',
} as const;
export type FolderContentType = keyof typeof FOLDER_COLLECTIONS;
export const CONTENT_TYPES = Object.keys(FOLDER_COLLECTIONS) as [
  FolderContentType,
  ...FolderContentType[],
];

export async function assertFolder(
  ctx: ToolContext,
  contentType: FolderContentType,
  folderId: string | null | undefined
): Promise<void> {
  if (!folderId) return;
  const snap = await ctx.db
    .doc(`users/${ctx.uid}/${FOLDER_COLLECTIONS[contentType]}/${folderId}`)
    .get();
  if (!snap.exists) {
    throw new ToolError(
      `Folder ${folderId} was not found. Use list_folders to find a folder id.`
    );
  }
}

export const FOLDER_PAGE_SIZE = 500;

/** Folder colour palette, matching LibraryFolder.color in the client. */
export const FOLDER_COLORS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'pink',
  'gray',
] as const;

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  color: string | null;
}

export function toFolderRow(
  id: string,
  data: Record<string, unknown>
): FolderRow {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    parentId: typeof data.parentId === 'string' ? data.parentId : null,
    order: Number(data.order ?? 0),
    color: typeof data.color === 'string' && data.color ? data.color : null,
  };
}

// Reads every folder page by page, so a large library never misses an existing folder.
export async function loadAllFolders(
  db: admin.firestore.Firestore,
  collectionPath: string
): Promise<FolderRow[]> {
  const rows: FolderRow[] = [];
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(collectionPath)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(FOLDER_PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    for (const d of snap.docs) rows.push(toFolderRow(d.id, d.data()));
    if (snap.docs.length < FOLDER_PAGE_SIZE) return rows;
    last = snap.docs[snap.docs.length - 1];
  }
}

/** Folder names from the top level down to this folder; a cycle or missing parent stops the walk. */
export function folderPath(
  id: string,
  byId: ReadonlyMap<string, FolderRow>
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return names;
}

/** Walks `names` down from `parentId`, reusing same-named folders (case-insensitive); returns where the walk stopped and the names still to create. */
export function resolveFolderPath(
  rows: readonly FolderRow[],
  parentId: string | null,
  names: readonly string[]
): { parentId: string | null; missing: string[] } {
  let current = parentId;
  for (let i = 0; i < names.length; i++) {
    const want = names[i].trim().toLowerCase();
    const match = rows
      .filter(
        (r) => r.parentId === current && r.name.trim().toLowerCase() === want
      )
      .sort((a, b) => a.order - b.order)[0];
    if (!match) return { parentId: current, missing: names.slice(i) };
    current = match.id;
  }
  return { parentId: current, missing: [] };
}

/** Runs a tool body, turning expected failures into a readable tool error for Claude. */
export async function run(
  name: string,
  ctx: ToolContext,
  body: () => Promise<unknown>
): Promise<CallToolResult> {
  try {
    return json(await body());
  } catch (err) {
    if (err instanceof ToolError) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
    console.error(`[mcpServer] ${name} failed`, { uid: ctx.uid, err });
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'SpartBoard could not complete that request. Try again shortly.',
        },
      ],
    };
  }
}

function decodeCursor(
  cursor: string | undefined
): { updatedAt: number; id: string } | null {
  const sep = cursor?.indexOf(':') ?? -1;
  if (!cursor || sep <= 0) return null;
  const updatedAt = Number(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  return Number.isFinite(updatedAt) && id ? { updatedAt, id } : null;
}

/**
 * Newest-first page of a collection filtered in memory. The cursor is "<updatedAt>:<docId>" so
 * equal timestamps never drop a doc, and at most 200 docs are read per call.
 */
export async function pageByUpdatedAt(
  db: admin.firestore.Firestore,
  collectionPath: string,
  cursor: string | undefined,
  matches: (data: Record<string, unknown>) => boolean
): Promise<{
  items: { id: string; data: Record<string, unknown> }[];
  next_cursor: string | null;
}> {
  const items: { id: string; data: Record<string, unknown> }[] = [];
  let after = decodeCursor(cursor);
  let scanned = 0;
  let exhausted = false;
  while (items.length < PAGE_SIZE && scanned < 200) {
    let q = db
      .collection(collectionPath)
      .orderBy('updatedAt', 'desc')
      .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
      .limit(50);
    if (after) q = q.startAfter(after.updatedAt, after.id);
    const snap = await q.get();
    scanned += snap.size;
    let consumed = 0;
    for (const d of snap.docs) {
      consumed += 1;
      const data = d.data();
      after = { updatedAt: Number(data.updatedAt ?? 0), id: d.id };
      if (matches(data)) items.push({ id: d.id, data });
      if (items.length >= PAGE_SIZE) break;
    }
    if (snap.size < 50 && consumed === snap.size) {
      exhausted = true;
      break;
    }
  }
  return {
    items,
    next_cursor: exhausted || !after ? null : `${after.updatedAt}:${after.id}`,
  };
}

/** Title search + folder filter shared by every list_* tool ("root" = not in a folder). */
export function titleAndFolderFilter(
  search: string | undefined,
  folderId: string | undefined
): (data: Record<string, unknown>) => boolean {
  const needle = search?.trim().toLowerCase() ?? '';
  return (data) => {
    const title = typeof data.title === 'string' ? data.title : '';
    const folder = (data.folderId as string | null | undefined) ?? null;
    return (
      (!needle || title.toLowerCase().includes(needle)) &&
      (!folderId || (folderId === 'root' ? !folder : folder === folderId))
    );
  };
}

type ListHandler = (request: unknown, extra: unknown) => Promise<unknown>;
interface ListedTool {
  name?: string;
  inputSchema?: Record<string, unknown>;
  execution?: { taskSupport?: string };
  annotations?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Drops protocol defaults from tools/list ($schema, forbidden task support, destructiveHint on read-only tools); every chat pays for these tokens. */
export function slimTool(tool: ListedTool): ListedTool {
  const out: ListedTool = { ...tool };
  if (out.inputSchema && '$schema' in out.inputSchema) {
    const schema = { ...out.inputSchema };
    delete schema.$schema;
    out.inputSchema = schema;
  }
  if (out.execution?.taskSupport === 'forbidden') delete out.execution;
  if (out.annotations?.readOnlyHint === true) {
    const annotations = { ...out.annotations };
    delete annotations.destructiveHint;
    out.annotations = annotations;
  }
  return out;
}

/** Wraps the SDK's tools/list handler with slimTool, leaving out `hidden` tools; a no-op if the SDK internals change. */
export function slimToolListing(
  server: McpServer,
  hidden?: () => Promise<ReadonlySet<string>>
): void {
  const handlers = (
    server.server as unknown as { _requestHandlers?: Map<string, ListHandler> }
  )._requestHandlers;
  const original = handlers?.get('tools/list');
  if (!handlers || !original) return;
  handlers.set('tools/list', async (request, extra) => {
    const result = (await original(request, extra)) as { tools?: ListedTool[] };
    if (!Array.isArray(result.tools)) return result;
    const skip = hidden ? await hidden() : new Set<string>();
    return {
      ...result,
      tools: result.tools.filter((t) => !skip.has(t.name ?? '')).map(slimTool),
    };
  });
}
