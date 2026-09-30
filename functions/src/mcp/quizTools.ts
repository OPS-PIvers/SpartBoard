// Quiz and question bank tools (plan: "Tools", PR 2). Content lives in the teacher's Drive; metadata in Firestore.
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
  type ItemType,
  type ToolContext,
} from './activity';
import { driveTokenFor, readDriveJson, saveQuizJson } from './drive';
import {
  KIND,
  LIST_MAX,
  MAX_QUESTIONS,
  MA_MAX_OPTIONS,
  MC_MAX_WRONG,
  buildMetadata,
  clearSatisfiedNeedsKey,
  metaPath,
  normalizeContent,
  questionNeedsKey,
  readMetadata,
  reconcileQuestionOrder,
  toFriendlyQuestion,
  toStoredQuestion,
  type FriendlyQuestion,
  type QuizContent,
  type QuizKind,
  type StoredQuestion,
} from './quizStore';
import {
  MAX_STANDARDS_PER_QUESTION,
  applyStandards,
  loadBenchmarks,
  normalizeStandardRef,
} from './standards';
import {
  CREATES,
  OVERWRITES,
  READ_ONLY,
  assertFolder,
  iso,
  pageByUpdatedAt,
  run,
  titleAndFolderFilter,
} from './toolKit';

/** Revisions above this size keep only a pointer; Drive's own version history still has the file. */
const MAX_REVISION_BYTES = 800_000;

const questionSchema = z.object({
  id: z.string().optional().describe('Keep from get_*; omit if new.'),
  type: z.enum([
    'multiple_choice',
    'choose_all',
    'fill_in_blank',
    'matching',
    'ordering',
    'free_response',
  ]),
  text: z
    .string()
    .min(1)
    .max(4000)
    .describe('The question as students see it.'),
  correct_answer: z
    .string()
    .max(1000)
    .optional()
    .describe('multiple_choice and fill_in_blank.'),
  incorrect_answers: z
    .array(z.string().max(1000))
    .max(MA_MAX_OPTIONS)
    .optional()
    .describe(`multiple_choice (1-${MC_MAX_WRONG}) and choose_all.`),
  correct_answers: z
    .array(z.string().max(1000))
    .max(MA_MAX_OPTIONS)
    .optional()
    .describe('choose_all: every correct option.'),
  accepted_alternates: z
    .array(z.string().max(1000))
    .max(10)
    .optional()
    .describe('fill_in_blank: other spellings to accept.'),
  blanks: z
    .array(
      z.object({
        answer: z.string().max(1000),
        accepted_alternates: z.array(z.string().max(1000)).max(10).optional(),
      })
    )
    .max(LIST_MAX)
    .optional()
    .describe(
      'fill_in_blank with two or more blanks: one entry per ___ in the text, in order. Replaces correct_answer.'
    ),
  pairs: z
    .array(z.object({ term: z.string().max(500), match: z.string().max(500) }))
    .max(LIST_MAX)
    .optional()
    .describe('matching: each term with its match.'),
  extra_matches: z
    .array(z.string().max(500))
    .max(LIST_MAX)
    .optional()
    .describe('matching: distractor matches with no term.'),
  items_in_order: z
    .array(z.string().max(500))
    .max(LIST_MAX)
    .optional()
    .describe('ordering: items in the correct order.'),
  points: z.number().min(0).max(100).optional().describe('Defaults to 1.'),
  time_limit_seconds: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .optional()
    .describe('0 or omitted means no limit.'),
  partial_credit: z
    .boolean()
    .optional()
    .describe('matching, ordering, choose_all and fill_in_blank with blanks.'),
  placeholder: z
    .string()
    .max(200)
    .optional()
    .describe('free_response hint text.'),
  min_words: z.number().int().min(0).max(5000).optional(),
  max_words: z.number().int().min(1).max(5000).optional(),
  standards: z
    .array(z.string().max(40))
    .max(MAX_STANDARDS_PER_QUESTION)
    .optional()
    .describe(
      "Minnesota benchmark codes (ELA, Social Studies, Math, Science, Physical Education or Arts), e.g. 6.1.2.1 or 7L.3.1.1.1, or World Language Can-Do codes like WL.3.2.1 (level.mode.indicator). A code in more than one set needs the full id, e.g. mn-math-2022:6.1.2.1. Replaces the question's standards; omit to keep them."
    ),
});

const QUESTION_HELP =
  'Types: multiple_choice (correct_answer + 1-4 incorrect_answers), choose_all (correct_answers + incorrect_answers), fill_in_blank (correct_answer + accepted_alternates, or blanks when the text has several ___), matching (pairs + extra_matches), ordering (items_in_order), free_response (no key). Plain text.';

const toolNames = (kind: QuizKind) =>
  kind === 'quiz'
    ? {
        list: 'list_quizzes',
        get: 'get_quiz',
        create: 'create_quiz',
        update: 'update_quiz',
        idKey: 'quiz_id' as const,
        where: 'SpartBoard > Quiz widget > library',
      }
    : {
        list: 'list_question_banks',
        get: 'get_question_bank',
        create: 'create_question_bank',
        update: 'update_question_bank',
        idKey: 'bank_id' as const,
        where: 'SpartBoard > Quiz widget > Question banks',
      };

function assertNotSynced(kind: QuizKind, meta: Record<string, unknown>): void {
  if (meta.sync) {
    throw new ToolError(
      `This ${KIND[kind].label} is shared with a PLC, so it has to be edited in SpartBoard where teammates' copies stay in sync.`
    );
  }
}

async function buildQuestions(
  ctx: ToolContext,
  inputs: FriendlyQuestion[],
  previous: StoredQuestion[]
): Promise<StoredQuestion[]> {
  const byId = new Map(previous.map((q) => [q.id, q]));
  const used = new Set<string>();
  const refs = inputs
    .flatMap((q) => q.standards ?? [])
    .map(normalizeStandardRef);
  const catalog = await loadBenchmarks(ctx.db, [...new Set(refs)]);
  return inputs.map((input, i) => {
    const existing =
      input.id && byId.has(input.id) && !used.has(input.id)
        ? byId.get(input.id)
        : undefined;
    const q = toStoredQuestion(input, i + 1, existing, randomUUID);
    used.add(q.id);
    if (input.standards !== undefined) {
      const targets = applyStandards(
        i + 1,
        q.targets,
        input.standards,
        catalog
      );
      if (targets.length > 0) q.targets = targets;
      else delete q.targets;
    }
    return q;
  });
}

function summarize(kind: QuizKind, id: string, data: Record<string, unknown>) {
  return {
    [toolNames(kind).idKey]: id,
    title: data.title,
    question_count: data.questionCount ?? 0,
    folder_id: data.folderId ?? null,
    shared_with_plc: Boolean(data.sync),
    updated_at: iso(data.updatedAt),
  };
}

async function loadContent(
  ctx: ToolContext,
  kind: QuizKind,
  id: string
): Promise<{
  meta: Record<string, unknown>;
  content: QuizContent;
  token: string;
}> {
  const meta = await readMetadata(ctx.db, kind, ctx.uid, id);
  if (!meta || typeof meta.driveFileId !== 'string') {
    throw new ToolError(
      `That ${KIND[kind].label} was not found. Use ${toolNames(kind).list} to find its id.`
    );
  }
  const token = await driveTokenFor(ctx.uid);
  const content = normalizeContent(
    await readDriveJson(token, meta.driveFileId),
    id
  );
  return { meta, content, token };
}

/** Drive write first (as the client does), then metadata, revision and activity log in one batch. */
async function saveContent(
  ctx: ToolContext,
  kind: QuizKind,
  next: QuizContent,
  opts: {
    token: string;
    meta: Record<string, unknown> | null;
    previous: QuizContent | null;
    action: 'create' | 'update' | 'restore';
  }
) {
  const now = Date.now();
  const questions = clearSatisfiedNeedsKey(next.questions);
  const content: QuizContent = {
    ...next,
    questions,
    ...(Array.isArray(next.order)
      ? { order: reconcileQuestionOrder(next.order, questions) }
      : {}),
    updatedAt: now,
  };
  const driveFileId = await saveQuizJson(
    opts.token,
    content,
    (opts.meta?.driveFileId as string | undefined) ?? null
  );
  const batch = ctx.db.batch();
  let revisionId: string | null = null;
  if (opts.previous) {
    const serialized = JSON.stringify(opts.previous);
    revisionId = snapshotRevision(ctx, batch, {
      itemType: KIND[kind].itemType as ItemType,
      itemId: content.id,
      title: opts.previous.title,
      data:
        serialized.length <= MAX_REVISION_BYTES
          ? { content: opts.previous }
          : { content: null, tooLarge: true },
    });
  }
  const meta = buildMetadata(kind, content, driveFileId, opts.meta, {
    ...(opts.action === 'create'
      ? { claudeCreatedAt: now }
      : { claudeEditedAt: now }),
    ...(kind === 'quiz' ? { [REVIEW_MARK]: now } : {}),
  });
  batch.set(ctx.db.doc(metaPath(kind, ctx.uid, content.id)), meta);
  logActivity(ctx, batch, {
    action: opts.action,
    itemType: KIND[kind].itemType as ItemType,
    itemId: content.id,
    title: content.title,
    revisionId,
  });
  await batch.commit();
  return {
    ...summarize(kind, content.id, meta),
    ...(revisionId ? { previous_version_revision_id: revisionId } : {}),
    questions_missing_answer_key:
      content.questions.filter(questionNeedsKey).length,
  };
}

/** restore_revision for quizzes and banks; called from tools.ts. */
export async function restoreQuizRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  const kind: QuizKind = rev.get('itemType') === 'quiz' ? 'quiz' : 'bank';
  const data = rev.get('data') as { content?: QuizContent | null } | undefined;
  if (!data?.content) {
    throw new ToolError(
      "That version was too large to keep here. The teacher can restore it from the file's version history in Google Drive."
    );
  }
  const id = String(rev.get('itemId'));
  const { meta, content, token } = await loadContent(ctx, kind, id);
  assertNotSynced(kind, meta);
  await reserveWrite(ctx);
  return saveContent(
    ctx,
    kind,
    { ...data.content, id },
    {
      token,
      meta,
      previous: content,
      action: 'restore',
    }
  );
}

export function registerQuizTools(server: McpServer, ctx: ToolContext): void {
  for (const kind of ['quiz', 'bank'] as const) {
    const names = toolNames(kind);
    const label = KIND[kind].label;
    const folderType = kind === 'quiz' ? 'quizzes' : 'question_banks';
    const collection = `users/${ctx.uid}/${KIND[kind].collection}`;

    server.registerTool(
      names.list,
      {
        title: `List ${KIND[kind].plural}`,
        description: `Lists ${KIND[kind].plural}, newest first, ${PAGE_SIZE} per page. Ids and titles only.`,
        inputSchema: {
          search: z.string().max(100).optional().describe('Title contains.'),
          folder_id: z.string().optional().describe('Folder id, or "root".'),
          cursor: z.string().optional().describe('From next_cursor.'),
        },
        annotations: READ_ONLY,
      },
      ({ search, folder_id, cursor }) =>
        run(names.list, ctx, async () => {
          const page = await pageByUpdatedAt(
            ctx.db,
            collection,
            cursor,
            titleAndFolderFilter(search, folder_id)
          );
          return {
            [`${folderType}`]: page.items.map(({ id, data }) =>
              summarize(kind, id, data)
            ),
            next_cursor: page.next_cursor,
          };
        })
    );

    server.registerTool(
      names.get,
      {
        title: `Get a ${label}`,
        description: `Returns a ${label} with its answer key and question ids.`,
        inputSchema: { [names.idKey]: z.string().min(1) },
        annotations: READ_ONLY,
      },
      (input: Record<string, string>) =>
        run(names.get, ctx, async () => {
          const id = input[names.idKey];
          const { meta, content } = await loadContent(ctx, kind, id);
          const sections = Array.isArray(content.sections)
            ? content.sections
            : [];
          const stimuli = Array.isArray(content.stimuli) ? content.stimuli : [];
          return {
            ...summarize(kind, id, meta),
            language: content.language ?? null,
            questions: content.questions.map(toFriendlyQuestion),
            ...(sections.length > 0
              ? {
                  sections: sections.map(
                    (s: { title?: string }) => s.title ?? ''
                  ),
                  note: 'Sections and question order within them are managed in SpartBoard.',
                }
              : {}),
            ...(stimuli.length > 0
              ? { attached_passages_or_media: stimuli.length }
              : {}),
            ...(Array.isArray(content.bankSlots) && content.bankSlots.length > 0
              ? { question_bank_pulls: content.bankSlots.length }
              : {}),
          };
        })
    );

    server.registerTool(
      names.create,
      {
        title: `Create a ${label}`,
        description: `Creates a ${label} in the teacher's library (saved to Drive). ${QUESTION_HELP}`,
        inputSchema: {
          title: z.string().trim().min(1).max(200),
          folder_id: z
            .string()
            .optional()
            .describe('From list_folders; omit for top level.'),
          language: z
            .string()
            .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
            .optional()
            .describe('BCP 47 tag of the quiz language, e.g. en-US.'),
          questions: z.array(questionSchema).min(1).max(MAX_QUESTIONS),
        },
        annotations: CREATES,
      },
      (input) =>
        run(names.create, ctx, async () => {
          await assertFolder(ctx, folderType, input.folder_id);
          const questions = await buildQuestions(
            ctx,
            input.questions as FriendlyQuestion[],
            []
          );
          const token = await driveTokenFor(ctx.uid);
          await reserveWrite(ctx);
          const now = Date.now();
          const content: QuizContent = {
            id: randomUUID(),
            title: input.title.trim(),
            questions,
            createdAt: now,
            updatedAt: now,
            ...(input.language ? { language: input.language } : {}),
          };
          const result = await saveContent(ctx, kind, content, {
            token,
            meta: input.folder_id ? { folderId: input.folder_id } : null,
            previous: null,
            action: 'create',
          });
          return { ...result, where_to_find_it: names.where };
        })
    );

    server.registerTool(
      names.update,
      {
        title: `Edit a ${label}`,
        description: `Edits a ${label}; only passed fields change. \`questions\` replaces the whole list: send every question to keep, with its id. New questions go in the last section.${label === 'quiz' ? ' Existing assignments keep their questions.' : ''}`,
        inputSchema: {
          [names.idKey]: z.string().min(1),
          title: z.string().trim().min(1).max(200).optional(),
          folder_id: z
            .string()
            .nullable()
            .optional()
            .describe('Folder id; null for top level.'),
          questions: z
            .array(questionSchema)
            .min(1)
            .max(MAX_QUESTIONS)
            .optional(),
        },
        annotations: OVERWRITES,
      },
      (input: Record<string, unknown>) =>
        run(names.update, ctx, async () => {
          const id = String(input[names.idKey]);
          const folderId = input.folder_id as string | null | undefined;
          if (folderId) await assertFolder(ctx, folderType, folderId);
          const { meta, content, token } = await loadContent(ctx, kind, id);
          assertNotSynced(kind, meta);
          const questions = input.questions
            ? await buildQuestions(
                ctx,
                input.questions as FriendlyQuestion[],
                content.questions
              )
            : content.questions;
          await reserveWrite(ctx);
          return saveContent(
            ctx,
            kind,
            {
              ...content,
              title:
                (input.title as string | undefined)?.trim() || content.title,
              questions,
            },
            {
              token,
              meta: folderId === undefined ? meta : { ...meta, folderId },
              previous: content,
              action: 'update',
            }
          );
        })
    );
  }
}
