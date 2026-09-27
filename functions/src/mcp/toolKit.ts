// Shared plumbing for MCP tool handlers: results, errors and cursor paging.
import * as admin from 'firebase-admin';
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
