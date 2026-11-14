// Quiz and question bank tools (plan: "Tools", PR 2). Content lives in the teacher's Drive; metadata in Firestore.
import type * as admin from '../firebaseAdmin';
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
import { prepareTargets, targetInputFields } from './targets';
import {
  CREATES,
  OVERWRITES,
  READ_ONLY,
  assertFolder,
  iso,
  pageByUpdatedAt,
  run,
  type ListedTool,
  titleAndFolderFilter,
} from './toolKit';
import {
  changedQuestionIds,
  previewMeta,
  quizView,
  runWithPreview,
} from './apps';
import {
  readRubric,
  rubricDoc,
  rubricMaxPoints,
  type Rubric,
} from './rubricShape';

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
  rubric_id: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe(
      'free_response: attach a rubric from list_rubrics or create_rubric; its total becomes the points. Keep the same id to keep the attached copy; null removes it.'
    ),
  dok: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .nullable()
    .optional()
    .describe(
      'Depth of Knowledge: 1 recall a fact or term, 2 apply a skill or concept (classify, compare, solve a routine problem), 3 reason with evidence or a plan (justify, analyze, solve a non-routine problem), 4 extended work across sources or time. Rate the thinking the question demands, not how hard it is. null clears it; omit to keep it.'
    ),
  explanation: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe(
      'Why the answer is right, in a sentence or two students read after results are published. null clears it; omit to keep it.'
    ),
  option_explanations: z
    .array(
      z.object({
        option: z.string().max(1000).describe('The choice text, exactly.'),
        explanation: z
          .string()
          .max(1000)
          .describe('Why this choice is right or wrong.'),
      })
    )
    .max(MA_MAX_OPTIONS * 2)
    .nullable()
    .optional()
    .describe(
      'multiple_choice and choose_all: one entry per choice saying why it is right or wrong (for a wrong choice, the mistake that leads there). Replaces the saved ones; null clears them; omit to keep them.'
    ),
  ...targetInputFields,
});

const QUESTION_HELP =
  "Types: multiple_choice (correct_answer + 1-4 incorrect_answers), choose_all (correct_answers + incorrect_answers), fill_in_blank (correct_answer + accepted_alternates, or blanks when the text has several ___), matching (pairs + extra_matches), ordering (items_in_order), free_response (no key; rubric_id attaches a scoring rubric). Plain text. Put standards and learning targets in standards and learning_targets, which fill the editor's Learning Targets field.";
const DOK_HELP =
  ' Give each question a dok level (1-4) as you tag its standards.';
const EXPLANATION_HELP =
  ' Write an explanation for every question, plus option_explanations for every multiple_choice and choose_all choice, unless the teacher says not to.';

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
  if (
    typeof meta.districtLinkedItemId === 'string' &&
    meta.districtLinkedItemId !== ''
  ) {
    throw new ToolError(
      `This ${KIND[kind].label} comes from the District library and is read-only. Make your own copy in SpartBoard to edit it.`
    );
  }
  if (meta.sync) {
    throw new ToolError(
      `This ${KIND[kind].label} is shared with a PLC, so it has to be edited in SpartBoard where teammates' copies stay in sync.`
    );
  }
}

/** Question fields behind a preview flag; the connector hides and drops them for a teacher without it. */
const GATED_FIELDS = [
  {
    feature: 'quiz-dok',
    fields: ['dok'],
    help: DOK_HELP,
    note: "DOK levels aren't turned on for this account, so dok was not saved. Leave dok out for this teacher.",
  },
  {
    feature: 'quiz-explanations',
    fields: ['explanation', 'option_explanations'],
    help: EXPLANATION_HELP,
    note: "Explanations aren't turned on for this account, so they were not saved. Leave explanation and option_explanations out for this teacher.",
  },
] as const;

type GatedKey = (typeof GATED_FIELDS)[number]['fields'][number];

const hasAny = (q: FriendlyQuestion, fields: readonly GatedKey[]) =>
  fields.some((f) => q[f] !== undefined);

const without = (q: FriendlyQuestion, fields: readonly GatedKey[]) => {
  const rest = { ...q };
  for (const f of fields) delete rest[f];
  return rest;
};

async function granted(ctx: ToolContext, feature: string): Promise<boolean> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  return isGlobalFeatureGranted(ctx.db, feature, ctx.email, ctx.uid);
}

/** Friendly questions with fields the teacher can't see removed. */
async function visibleQuestions(
  ctx: ToolContext,
  questions: StoredQuestion[]
): Promise<FriendlyQuestion[]> {
  let out: FriendlyQuestion[] = questions.map(toFriendlyQuestion);
  for (const gate of GATED_FIELDS) {
    if (!out.some((q) => hasAny(q, gate.fields))) continue;
    if (await granted(ctx, gate.feature)) continue;
    out = out.map((q) => without(q, gate.fields));
  }
  return out;
}

/** Drops gated fields the teacher can't see; notes a flag only when a dropped value would have changed something. */
async function gateFields(
  ctx: ToolContext,
  inputs: FriendlyQuestion[],
  previous: StoredQuestion[]
): Promise<{ inputs: FriendlyQuestion[]; notes: string[] }> {
  const notes: string[] = [];
  const before = new Map(
    previous.map((q) => [q.id, toFriendlyQuestion(q)] as const)
  );
  let out = inputs;
  for (const gate of GATED_FIELDS) {
    if (!out.some((q) => hasAny(q, gate.fields))) continue;
    if (await granted(ctx, gate.feature)) continue;
    const changed = out.some((q) => {
      const old = q.id ? before.get(q.id) : undefined;
      return gate.fields.some(
        (f) =>
          q[f] !== undefined &&
          JSON.stringify(q[f]) !== JSON.stringify(old?.[f] ?? null)
      );
    });
    out = out.map((q) => without(q, gate.fields));
    if (changed) notes.push(gate.note);
  }
  return { inputs: out, notes };
}

const QUESTION_WRITE_TOOLS = new Set([
  'create_quiz',
  'update_quiz',
  'create_question_bank',
  'update_question_bank',
]);

/** tools/list for this teacher: question fields behind a flag they lack are left out of the quiz and bank write tools. */
export async function questionFieldsFor(
  ctx: ToolContext
): Promise<(tool: ListedTool) => ListedTool> {
  const off = (
    await Promise.all(
      GATED_FIELDS.map(async (g) =>
        (await granted(ctx, g.feature).catch(() => false)) ? [] : [g]
      )
    )
  ).flat();
  if (off.length === 0) return (tool) => tool;
  return (tool) => {
    if (!QUESTION_WRITE_TOOLS.has(tool.name ?? '')) return tool;
    let description =
      typeof tool.description === 'string' ? tool.description : '';
    const schema = JSON.parse(JSON.stringify(tool.inputSchema ?? {})) as {
      properties?: Record<
        string,
        { items?: { properties?: Record<string, unknown> } }
      >;
    };
    const props = schema.properties?.questions?.items?.properties;
    for (const g of off) {
      description = description.replace(g.help, '');
      for (const f of g.fields) if (props) delete props[f];
    }
    return { ...tool, description, inputSchema: schema };
  };
}

async function buildQuestions(
  ctx: ToolContext,
  rawInputs: FriendlyQuestion[],
  previous: StoredQuestion[]
): Promise<{ questions: StoredQuestion[]; notes: string[] }> {
  const { inputs, notes } = await gateFields(ctx, rawInputs, previous);
  const byId = new Map(previous.map((q) => [q.id, q]));
  const used = new Set<string>();
  const applyTargets = await prepareTargets(
    ctx,
    inputs,
    previous.flatMap((q) => q.targets ?? [])
  );
  const built = inputs.map((input, i) => {
    const existing =
      input.id && byId.has(input.id) && !used.has(input.id)
        ? byId.get(input.id)
        : undefined;
    const q = toStoredQuestion(input, i + 1, existing, randomUUID);
    used.add(q.id);
    const targets = applyTargets(i + 1, q.targets, input);
    if (targets) q.targets = targets;
    else delete q.targets;
    return q;
  });
  await attachRubrics(ctx, inputs, built);
  return { questions: built, notes };
}

/** Mirrors QuizEditor's handleAttachRubric / handleDetachRubric: the question keeps a frozen copy and the rubric total is its points. */
async function attachRubrics(
  ctx: ToolContext,
  inputs: FriendlyQuestion[],
  questions: StoredQuestion[]
): Promise<void> {
  const rubrics = new Map<string, Promise<Rubric>>();
  for (const [i, input] of inputs.entries()) {
    const q = questions[i];
    const wanted = input.rubric_id;
    if (wanted != null && q.type !== 'free-response') {
      throw new ToolError(
        `Question ${i + 1}: rubric_id only works on free_response questions.`
      );
    }
    if (wanted === null) {
      delete q.rubricId;
      delete q.rubricSnapshot;
      delete q.rubricVisibleToStudents;
      continue;
    }
    if (wanted && !(q.rubricId === wanted && q.rubricSnapshot)) {
      let pending = rubrics.get(wanted);
      if (!pending) {
        pending = readRubric(ctx, wanted);
        rubrics.set(wanted, pending);
      }
      q.rubricId = wanted;
      q.rubricSnapshot = rubricDoc(await pending);
    }
    const snapshot = q.rubricSnapshot as Rubric | undefined;
    if (q.type === 'free-response' && Array.isArray(snapshot?.criteria)) {
      q.points = rubricMaxPoints(snapshot.criteria);
    }
  }
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
      itemType: KIND[kind].itemType,
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
    itemType: KIND[kind].itemType,
    itemId: content.id,
    title: content.title,
    revisionId,
  });
  await batch.commit();
  return {
    summary: {
      ...summarize(kind, content.id, meta),
      ...(revisionId ? { previous_version_revision_id: revisionId } : {}),
      questions_missing_answer_key:
        content.questions.filter(questionNeedsKey).length,
    },
    content,
    meta,
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
  const saved = await saveContent(
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
  return saved.summary;
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
        _meta: previewMeta,
      },
      (input: Record<string, string>) =>
        runWithPreview(names.get, ctx, async () => {
          const id = input[names.idKey];
          const { meta, content } = await loadContent(ctx, kind, id);
          const sections = Array.isArray(content.sections)
            ? content.sections
            : [];
          const stimuli = Array.isArray(content.stimuli) ? content.stimuli : [];
          const result = {
            ...summarize(kind, id, meta),
            language: content.language ?? null,
            questions: await visibleQuestions(ctx, content.questions),
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
          return { result, view: quizView(kind, content, meta) };
        })
    );

    server.registerTool(
      names.create,
      {
        title: `Create a ${label}`,
        description: `Creates a ${label} in the teacher's library (saved to Drive). ${QUESTION_HELP}${DOK_HELP}${EXPLANATION_HELP}`,
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
        _meta: previewMeta,
      },
      (input) =>
        runWithPreview(names.create, ctx, async () => {
          await assertFolder(ctx, folderType, input.folder_id);
          const { questions, notes } = await buildQuestions(
            ctx,
            input.questions,
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
          const saved = await saveContent(ctx, kind, content, {
            token,
            meta: input.folder_id ? { folderId: input.folder_id } : null,
            previous: null,
            action: 'create',
          });
          return {
            result: {
              ...saved.summary,
              where_to_find_it: names.where,
              ...(notes.length > 0 ? { not_saved: notes } : {}),
            },
            view: quizView(kind, saved.content, saved.meta),
          };
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
        _meta: previewMeta,
      },
      (input: Record<string, unknown>) =>
        runWithPreview(names.update, ctx, async () => {
          const id = String(input[names.idKey]);
          const folderId = input.folder_id as string | null | undefined;
          if (folderId) await assertFolder(ctx, folderType, folderId);
          const { meta, content, token } = await loadContent(ctx, kind, id);
          assertNotSynced(kind, meta);
          const { questions, notes } = input.questions
            ? await buildQuestions(
                ctx,
                input.questions as FriendlyQuestion[],
                content.questions
              )
            : { questions: content.questions, notes: [] as string[] };
          await reserveWrite(ctx);
          const saved = await saveContent(
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
          const kept = new Set(saved.content.questions.map((q) => q.id));
          const changed = changedQuestionIds(
            content.questions,
            saved.content.questions
          );
          return {
            result: {
              ...saved.summary,
              changed_questions: saved.content.questions.flatMap((q, i) =>
                changed.includes(q.id) ? [i + 1] : []
              ),
              ...(notes.length > 0 ? { not_saved: notes } : {}),
            },
            view: quizView(kind, saved.content, saved.meta, {
              changed,
              removed: content.questions.filter((q) => !kept.has(q.id)).length,
            }),
          };
        })
    );
  }
}
