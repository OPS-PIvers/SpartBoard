// MCP tool definitions for the Claude connector (plan: "Tools", PR 1).
import * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DAILY_WRITE_LIMIT, PAGE_SIZE } from './config';
import {
  REVIEW_MARK,
  ToolError,
  logActivity,
  reserveWrite,
  snapshotRevision,
  type ToolContext,
} from './activity';
import {
  MAX_CARDS,
  MAX_DEFINITION,
  MAX_TERM,
  mergeCards,
  normalizeSet,
  readSet,
  rewriteOpenStudySessions,
  setsPath,
  stageSetWrite,
  type FlashcardSet,
} from './flashcardStore';
import {
  CONTENT_TYPES,
  FOLDER_COLLECTIONS,
  MAX_FOLDERS,
  assertFolder,
  folderPath,
  iso,
  pageByUpdatedAt,
  resolveFolderPath,
  run,
  titleAndFolderFilter,
  toFolderRow,
  type FolderContentType,
  type FolderRow,
} from './toolKit';
import { registerQuizTools, restoreQuizRevision } from './quizTools';
import { registerVideoTools, restoreVideoRevision } from './videoTools';
import { registerRubricTools, restoreRubricRevision } from './rubricTools';
import { registerWallTools, restoreWallRevision } from './wallTools';
import { registerMiniAppTools, restoreMiniAppRevision } from './miniAppTools';
import { registerResultsTools } from './resultsTools';
import {
  registerGuidedLearningTools,
  restoreGuidedLearningRevision,
} from './glTools';
import { registerCreateGuidedLearning } from './glCreate';
import { ADMIN_ONLY_TOOLS, registerLiveTourTools } from './glLiveTour';
import { isAdmin } from './glTools';
import { registerMeetingTools } from './meetingTools';

export const SERVER_INSTRUCTIONS = [
  "SpartBoard is a classroom dashboard. These tools read and write the signed-in teacher's own library.",
  'Before editing an item, fetch it with the matching get_* tool and send back the full updated content.',
  'Before creating, agree a short plan with the teacher; after saving, say where to find it and what to double-check instead of repeating the content.',
  'Every edit keeps the previous version for 30 days; use list_revisions and restore_revision to undo.',
  'Nothing here can delete items, assign work to students, or share content; the teacher does that in SpartBoard.',
  'No student-level data is available through this connector; results summaries are class-level and hidden for fewer than 5 students.',
  "Quizzes, question banks and video activities are saved in the teacher's Google Drive; items shared with a PLC can only be edited in SpartBoard.",
  "Meeting notes are saved as a draft that a group editor reviews in SpartBoard; Claude never edits a group's notes directly.",
].join(' ');

function summarizeSet(set: FlashcardSet) {
  return {
    set_id: set.id,
    title: set.title,
    card_count: set.cards.length,
    folder_id: set.folderId ?? null,
    updated_at: iso(set.updatedAt),
  };
}

function fullSet(set: FlashcardSet) {
  return {
    ...summarizeSet(set),
    description: set.description ?? '',
    term_language: set.termLanguage,
    definition_language: set.definitionLanguage,
    shared_publicly: Boolean(set.publicShareId),
    cards: set.cards,
  };
}

const cardInput = z.object({
  term: z.string().min(1).max(MAX_TERM),
  definition: z.string().min(1).max(MAX_DEFINITION),
});
const languageInput = z
  .string()
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
  .describe('BCP 47 read-aloud language, e.g. es-MX. Default en-US.');

async function saveFlashcardEdit(
  ctx: ToolContext,
  existing: FlashcardSet,
  next: FlashcardSet,
  action: 'update' | 'restore'
) {
  const now = Date.now();
  const batch = ctx.db.batch();
  const previous: Record<string, unknown> = { ...existing };
  delete previous.id;
  const revisionId = snapshotRevision(ctx, batch, {
    itemType: 'flashcard_set',
    itemId: existing.id,
    title: existing.title,
    data: previous,
  });
  const normalized = normalizeSet(
    { ...next, claudeEditedAt: now, [REVIEW_MARK]: now },
    now
  );
  stageSetWrite(ctx.db, batch, ctx.uid, normalized);
  logActivity(ctx, batch, {
    action,
    itemType: 'flashcard_set',
    itemId: normalized.id,
    title: normalized.title,
    revisionId,
  });
  await batch.commit();
  let studySessionsUpdated = 0;
  let warning: string | undefined;
  try {
    studySessionsUpdated = await rewriteOpenStudySessions(
      ctx.db,
      ctx.uid,
      normalized
    );
  } catch (err) {
    console.error('[mcpServer] study session rewrite failed', {
      uid: ctx.uid,
      err,
    });
    warning =
      'Saved, but open Study assignments still show the old cards until the teacher re-saves the set in SpartBoard.';
  }
  return {
    ...summarizeSet(normalized),
    previous_version_revision_id: revisionId,
    open_study_assignments_updated: studySessionsUpdated,
    ...(warning ? { warning } : {}),
  };
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const { db, uid } = ctx;

  server.registerTool(
    'get_my_account',
    {
      title: 'Get my SpartBoard account',
      description:
        'Returns the connected teacher, supported content and daily limits.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    () =>
      run('get_my_account', ctx, async () => {
        let name: string | null = null;
        try {
          name = (await admin.auth().getUser(uid)).displayName ?? null;
        } catch {
          name = null;
        }
        return {
          email: ctx.email,
          name,
          content_types: [
            'flashcards',
            'quizzes',
            'question_banks',
            'video_activities',
            'rubrics',
            'activity_walls',
            'mini_apps',
          ],
          can: [
            'create',
            'edit',
            'undo edits',
            'class-level quiz and video activity results',
          ],
          cannot: ['delete', 'assign to students', 'share', 'see student data'],
          daily_change_limit: DAILY_WRITE_LIMIT,
        };
      })
  );

  const loadFolders = async (contentType: FolderContentType) => {
    const snap = await db
      .collection(`users/${uid}/${FOLDER_COLLECTIONS[contentType]}`)
      .limit(MAX_FOLDERS)
      .get();
    return snap.docs.map((d) => toFolderRow(d.id, d.data()));
  };

  server.registerTool(
    'list_folders',
    {
      title: 'List library folders',
      description:
        "Lists the teacher's library folders for a content type, with each folder's path from the top level.",
      inputSchema: { content_type: z.enum(CONTENT_TYPES) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    ({ content_type }) =>
      run('list_folders', ctx, async () => {
        const rows = await loadFolders(content_type);
        const byId = new Map(rows.map((r) => [r.id, r]));
        const folders = rows
          .map((r) => ({ ...r, path: folderPath(r.id, byId).join(' / ') }))
          .sort((a, b) => a.path.localeCompare(b.path) || a.order - b.order)
          .map((f) => ({
            folder_id: f.id,
            name: f.name,
            path: f.path,
            parent_folder_id: f.parentId,
            color: f.color,
          }));
        return { content_type, folders };
      })
  );

  server.registerTool(
    'create_folder',
    {
      title: 'Create a library folder',
      description:
        'Creates a library folder for a content type. parent_path files it under nested folders, reusing ones that exist and creating the rest.',
      inputSchema: {
        content_type: z.enum(CONTENT_TYPES),
        name: z.string().trim().min(1).max(100),
        parent_folder_id: z
          .string()
          .optional()
          .describe('Omit for a top-level folder.'),
        parent_path: z
          .array(z.string().trim().min(1).max(100))
          .max(10)
          .optional()
          .describe(
            'Folder names under parent_folder_id (or the top level), outermost first, e.g. ["Unit 3", "Week 2"].'
          ),
        color: z
          .string()
          .regex(/^[a-z][a-z0-9-]{0,23}$/)
          .optional()
          .describe(
            'Folder colour name from the library palette, e.g. "blue"; omit for the default.'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ content_type, name, parent_folder_id, parent_path, color }) =>
      run('create_folder', ctx, async () => {
        const rows = await loadFolders(content_type);
        const byId = new Map(rows.map((r) => [r.id, r]));
        const start = parent_folder_id || null;
        if (start && !byId.has(start))
          throw new ToolError(
            `Folder ${start} was not found. Use list_folders to find a folder id.`
          );
        const { parentId: deepest, missing } = resolveFolderPath(
          rows,
          start,
          parent_path ?? []
        );
        const toCreate = [...missing, name.trim()];
        for (let i = 0; i < toCreate.length; i++) await reserveWrite(ctx);
        const col = db.collection(
          `users/${uid}/${FOLDER_COLLECTIONS[content_type]}`
        );
        const now = Date.now();
        const batch = db.batch();
        let parentId = deepest;
        let created: FolderRow | null = null;
        for (const [i, folderName] of toCreate.entries()) {
          // Mirrors createFolder in hooks/useFolderTree.ts: order = max(siblings) + 1.
          const orders = rows
            .filter((r) => r.parentId === parentId)
            .map((r) => r.order);
          const last = i === toCreate.length - 1;
          const ref = col.doc();
          created = {
            id: ref.id,
            name: folderName,
            parentId,
            order: orders.length === 0 ? 0 : Math.max(...orders) + 1,
            color: last && color ? color : null,
          };
          batch.set(ref, {
            name: created.name,
            parentId,
            order: created.order,
            ...(created.color ? { color: created.color } : {}),
            createdAt: now,
            updatedAt: now,
          });
          logActivity(ctx, batch, {
            action: 'create',
            itemType: 'folder',
            itemId: ref.id,
            title: folderName,
          });
          rows.push(created);
          byId.set(created.id, created);
          parentId = created.id;
        }
        await batch.commit();
        const folder = created as FolderRow;
        return {
          folder_id: folder.id,
          name: folder.name,
          path: folderPath(folder.id, byId).join(' / '),
          parent_folder_id: folder.parentId,
          color: folder.color,
          ...(missing.length > 0 ? { parent_folders_created: missing } : {}),
        };
      })
  );

  server.registerTool(
    'list_flashcard_sets',
    {
      title: 'List flashcard sets',
      description: `Lists flashcard sets, newest first, ${PAGE_SIZE} per page. Ids and titles only.`,
      inputSchema: {
        search: z.string().max(100).optional().describe('Title contains.'),
        folder_id: z.string().optional().describe('Folder id, or "root".'),
        cursor: z.string().optional().describe('From next_cursor.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    ({ search, folder_id, cursor }) =>
      run('list_flashcard_sets', ctx, async () => {
        const page = await pageByUpdatedAt(
          db,
          setsPath(uid),
          cursor,
          titleAndFolderFilter(search, folder_id)
        );
        return {
          sets: page.items.map(({ id, data }) =>
            summarizeSet({ ...(data as unknown as FlashcardSet), id })
          ),
          next_cursor: page.next_cursor,
        };
      })
  );

  server.registerTool(
    'get_flashcard_set',
    {
      title: 'Get a flashcard set',
      description: 'Returns a flashcard set with card ids.',
      inputSchema: { set_id: z.string().min(1) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    ({ set_id }) =>
      run('get_flashcard_set', ctx, async () => {
        const set = await readSet(db, uid, set_id);
        if (!set) throw new ToolError(`Flashcard set ${set_id} was not found.`);
        return fullSet(set);
      })
  );

  server.registerTool(
    'create_flashcard_set',
    {
      title: 'Create a flashcard set',
      description: `Creates a flashcard set. Up to ${MAX_CARDS} cards; plain text.`,
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        term_language: languageInput.optional(),
        definition_language: languageInput.optional(),
        folder_id: z
          .string()
          .optional()
          .describe('From list_folders; omit for top level.'),
        cards: z.array(cardInput).min(1).max(MAX_CARDS),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input) =>
      run('create_flashcard_set', ctx, async () => {
        await assertFolder(ctx, 'flashcards', input.folder_id);
        await reserveWrite(ctx);
        const now = Date.now();
        const set = normalizeSet(
          {
            id: db.collection(setsPath(uid)).doc().id,
            title: input.title,
            description: input.description ?? '',
            termLanguage: input.term_language ?? 'en-US',
            definitionLanguage: input.definition_language ?? 'en-US',
            cards: mergeCards([], input.cards),
            folderId: input.folder_id ?? null,
            createdAt: now,
            updatedAt: now,
            claudeCreatedAt: now,
            [REVIEW_MARK]: now,
          },
          now
        );
        const batch = db.batch();
        stageSetWrite(db, batch, uid, set);
        logActivity(ctx, batch, {
          action: 'create',
          itemType: 'flashcard_set',
          itemId: set.id,
          title: set.title,
        });
        await batch.commit();
        return {
          ...summarizeSet(set),
          where_to_find_it: 'SpartBoard > Flashcards widget > library',
        };
      })
  );

  server.registerTool(
    'update_flashcard_set',
    {
      title: 'Edit a flashcard set',
      description:
        'Edits a flashcard set; only passed fields change. `cards` replaces the whole list: send every card to keep, with its id. Open Study assignments update.',
      inputSchema: {
        set_id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        term_language: languageInput.optional(),
        definition_language: languageInput.optional(),
        folder_id: z
          .string()
          .nullable()
          .optional()
          .describe('Folder id; null for top level.'),
        cards: z
          .array(
            cardInput.extend({
              id: z.string().optional().describe('Keep; omit if new.'),
            })
          )
          .min(1)
          .max(MAX_CARDS)
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input) =>
      run('update_flashcard_set', ctx, async () => {
        const existing = await readSet(db, uid, input.set_id);
        if (!existing)
          throw new ToolError(`Flashcard set ${input.set_id} was not found.`);
        if (input.folder_id)
          await assertFolder(ctx, 'flashcards', input.folder_id);
        await reserveWrite(ctx);
        const next: FlashcardSet = {
          ...existing,
          title: input.title ?? existing.title,
          description: input.description ?? existing.description,
          termLanguage: input.term_language ?? existing.termLanguage,
          definitionLanguage:
            input.definition_language ?? existing.definitionLanguage,
          folderId:
            input.folder_id === undefined ? existing.folderId : input.folder_id,
          cards: input.cards
            ? mergeCards(existing.cards, input.cards)
            : existing.cards,
        };
        return saveFlashcardEdit(ctx, existing, next, 'update');
      })
  );

  server.registerTool(
    'list_revisions',
    {
      title: 'List previous versions',
      description:
        'Lists versions saved before Claude edits (kept 30 days), newest first.',
      inputSchema: {
        item_id: z.string().optional().describe('Only this item.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    ({ item_id }) =>
      run('list_revisions', ctx, async () => {
        const snap = await db
          .collection(`users/${uid}/claude_revisions`)
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get();
        const revisions = snap.docs
          .filter((d) => !item_id || d.get('itemId') === item_id)
          .slice(0, PAGE_SIZE)
          .map((d) => ({
            revision_id: d.id,
            item_type: String(d.get('itemType')),
            item_id: String(d.get('itemId')),
            title: String(d.get('title') ?? ''),
            saved_at: iso(d.get('createdAt')),
          }));
        return { revisions };
      })
  );

  server.registerTool(
    'restore_revision',
    {
      title: 'Restore a previous version',
      description:
        'Restores a version from list_revisions. The current version is saved first.',
      inputSchema: { revision_id: z.string().min(1) },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ revision_id }) =>
      run('restore_revision', ctx, async () => {
        const rev = await db
          .doc(`users/${uid}/claude_revisions/${revision_id}`)
          .get();
        if (!rev.exists)
          throw new ToolError(
            `Revision ${revision_id} was not found or has expired.`
          );
        const itemType = rev.get('itemType') as unknown;
        if (itemType === 'quiz' || itemType === 'question_bank') {
          return restoreQuizRevision(ctx, rev);
        }
        if (itemType === 'video_activity')
          return restoreVideoRevision(ctx, rev);
        if (itemType === 'rubric') return restoreRubricRevision(ctx, rev);
        if (itemType === 'activity_wall') return restoreWallRevision(ctx, rev);
        if (itemType === 'mini_app') return restoreMiniAppRevision(ctx, rev);
        if (itemType === 'guided_learning')
          return restoreGuidedLearningRevision(ctx, rev);
        if (itemType !== 'flashcard_set') {
          throw new ToolError('That revision cannot be restored.');
        }
        const itemId = String(rev.get('itemId'));
        const existing = await readSet(db, uid, itemId);
        if (!existing) {
          throw new ToolError(
            'The item no longer exists in SpartBoard, so it cannot be restored.'
          );
        }
        await reserveWrite(ctx);
        const data = rev.get('data') as Omit<FlashcardSet, 'id'>;
        // Sharing state is live, not content: keep the current share link.
        const restored: FlashcardSet = {
          ...data,
          id: itemId,
          publicShareId: existing.publicShareId ?? null,
        };
        return saveFlashcardEdit(ctx, existing, restored, 'restore');
      })
  );

  registerQuizTools(server, ctx);
  registerVideoTools(server, ctx);
  registerRubricTools(server, ctx);
  registerWallTools(server, ctx);
  registerMiniAppTools(server, ctx);
  registerResultsTools(server, ctx);
  registerGuidedLearningTools(server, ctx);
  registerCreateGuidedLearning(server, ctx);
  registerLiveTourTools(server, ctx);
  registerMeetingTools(server, ctx);
}

/** Tools left out of a non-admin's tools/list; each handler still checks admin itself. */
export async function hiddenToolsFor(
  ctx: ToolContext
): Promise<ReadonlySet<string>> {
  try {
    return (await isAdmin(ctx)) ? new Set() : ADMIN_ONLY_TOOLS;
  } catch {
    return ADMIN_ONLY_TOOLS;
  }
}
