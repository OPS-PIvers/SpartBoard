// Video activity tools (plan: "Tools", PR 3). Content lives in the teacher's Drive; metadata in Firestore.
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
import { driveTokenFor, readDriveJson, saveQuizJson } from './drive';
import { MA_MAX_OPTIONS, MC_MAX_WRONG } from './quizStore';
import {
  MAX_VIDEO_QUESTIONS,
  assertYouTubeUrl,
  buildVideoMetadata,
  normalizeVideoContent,
  orderByTimestamp,
  toFriendlyVideoQuestion,
  toStoredVideoQuestion,
  videoQuestionNeedsKey,
  type VideoContent,
  type VideoFriendlyQuestion,
  type VideoQuestion,
} from './videoStore';
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

const COLLECTION = 'video_activities';
const MAX_REVISION_BYTES = 800_000;
const metaPath = (uid: string, id: string) =>
  `users/${uid}/${COLLECTION}/${id}`;

const questionSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Existing question id from get_video_activity; omit for new.'),
  type: z.enum(['multiple_choice', 'choose_all', 'fill_in_blank']),
  text: z.string().min(1).max(4000),
  timestamp_seconds: z
    .number()
    .int()
    .min(0)
    .max(86_400)
    .describe(
      'Seconds into the video when the video pauses for this question.'
    ),
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
  points: z.number().min(0).max(100).optional().describe('Defaults to 1.'),
  time_limit_seconds: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .optional()
    .describe('Defaults to 30 for a new question; 0 means no limit.'),
  partial_credit: z.boolean().optional().describe('choose_all only.'),
});

const QUESTION_HELP =
  'Question types: multiple_choice (correct_answer + 1-4 incorrect_answers), choose_all (correct_answers + incorrect_answers), fill_in_blank (correct_answer, optional accepted_alternates). Each question needs timestamp_seconds; only use times you know are inside the video.';

function summarize(id: string, data: Record<string, unknown>) {
  return {
    activity_id: id,
    title: data.title,
    youtube_url: data.youtubeUrl ?? null,
    question_count: data.questionCount ?? 0,
    folder_id: data.folderId ?? null,
    shared_with_plc: Boolean(data.sync),
    updated_at: iso(data.updatedAt),
  };
}

function assertNotSynced(meta: Record<string, unknown>): void {
  if (meta.sync) {
    throw new ToolError(
      "This video activity is shared with a PLC, so it has to be edited in SpartBoard where teammates' copies stay in sync."
    );
  }
}

function buildQuestions(
  inputs: VideoFriendlyQuestion[],
  previous: VideoQuestion[]
): VideoQuestion[] {
  const byId = new Map(previous.map((q) => [q.id, q]));
  const used = new Set<string>();
  const out = inputs.map((input, i) => {
    const existing =
      input.id && byId.has(input.id) && !used.has(input.id)
        ? byId.get(input.id)
        : undefined;
    const q = toStoredVideoQuestion(input, i + 1, existing, randomUUID);
    used.add(q.id);
    return q;
  });
  return orderByTimestamp(out);
}

async function loadActivity(ctx: ToolContext, id: string) {
  const snap = await ctx.db.doc(metaPath(ctx.uid, id)).get();
  const meta = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  if (!meta || typeof meta.driveFileId !== 'string') {
    throw new ToolError(
      'That video activity was not found. Use list_video_activities to find its id.'
    );
  }
  const token = await driveTokenFor(ctx.uid);
  const content = normalizeVideoContent(
    await readDriveJson(token, meta.driveFileId),
    id
  );
  return { meta, content, token };
}

async function saveActivity(
  ctx: ToolContext,
  next: VideoContent,
  opts: {
    token: string;
    meta: Record<string, unknown> | null;
    previous: VideoContent | null;
    action: 'create' | 'update' | 'restore';
  }
) {
  const now = Date.now();
  const content: VideoContent = { ...next, updatedAt: now };
  const driveFileId = await saveQuizJson(
    opts.token,
    content,
    (opts.meta?.driveFileId as string | undefined) ?? null
  );
  const batch = ctx.db.batch();
  let revisionId: string | null = null;
  if (opts.previous) {
    const tooLarge = JSON.stringify(opts.previous).length > MAX_REVISION_BYTES;
    revisionId = snapshotRevision(ctx, batch, {
      itemType: 'video_activity',
      itemId: content.id,
      title: opts.previous.title,
      data: tooLarge
        ? { content: null, tooLarge: true }
        : { content: opts.previous },
    });
  }
  const meta = buildVideoMetadata(content, driveFileId, opts.meta, {
    ...(opts.action === 'create'
      ? { claudeCreatedAt: now }
      : { claudeEditedAt: now }),
  });
  batch.set(ctx.db.doc(metaPath(ctx.uid, content.id)), meta);
  logActivity(ctx, batch, {
    action: opts.action,
    itemType: 'video_activity',
    itemId: content.id,
    title: content.title,
    revisionId,
  });
  await batch.commit();
  return {
    ...summarize(content.id, meta),
    ...(revisionId ? { previous_version_revision_id: revisionId } : {}),
    questions_missing_answer_key: content.questions.filter(
      videoQuestionNeedsKey
    ).length,
  };
}

/** restore_revision for video activities; called from tools.ts. */
export async function restoreVideoRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  const data = rev.get('data') as { content?: VideoContent | null } | undefined;
  if (!data?.content) {
    throw new ToolError(
      "That version was too large to keep here. The teacher can restore it from the file's version history in Google Drive."
    );
  }
  const id = String(rev.get('itemId'));
  const { meta, content, token } = await loadActivity(ctx, id);
  assertNotSynced(meta);
  await reserveWrite(ctx);
  return saveActivity(
    ctx,
    { ...data.content, id },
    { token, meta, previous: content, action: 'restore' }
  );
}

export function registerVideoTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_video_activities',
    {
      title: 'List video activities',
      description: `Lists the teacher's video activities (YouTube videos with questions), newest first, ${PAGE_SIZE} per page. Use get_video_activity for questions.`,
      inputSchema: {
        search: z
          .string()
          .max(100)
          .optional()
          .describe('Case-insensitive match on title.'),
        folder_id: z
          .string()
          .optional()
          .describe(
            'Only items in this folder; "root" for items in no folder.'
          ),
        cursor: z
          .string()
          .optional()
          .describe('next_cursor from a previous page.'),
      },
      annotations: READ_ONLY,
    },
    ({ search, folder_id, cursor }) =>
      run('list_video_activities', ctx, async () => {
        const page = await pageByUpdatedAt(
          ctx.db,
          `users/${ctx.uid}/${COLLECTION}`,
          cursor,
          titleAndFolderFilter(search, folder_id)
        );
        return {
          video_activities: page.items.map(({ id, data }) =>
            summarize(id, data)
          ),
          next_cursor: page.next_cursor,
        };
      })
  );

  server.registerTool(
    'get_video_activity',
    {
      title: 'Get a video activity',
      description:
        "Returns a video activity with its YouTube link and every question, answer key and timestamp. Keep each question's id when sending it back to update_video_activity.",
      inputSchema: { activity_id: z.string().min(1) },
      annotations: READ_ONLY,
    },
    ({ activity_id }) =>
      run('get_video_activity', ctx, async () => {
        const { meta, content } = await loadActivity(ctx, activity_id);
        return {
          ...summarize(activity_id, meta),
          youtube_url: content.youtubeUrl,
          questions: content.questions.map(toFriendlyVideoQuestion),
        };
      })
  );

  server.registerTool(
    'create_video_activity',
    {
      title: 'Create a video activity',
      description: `Creates a video activity: a YouTube video that pauses at set times to ask questions. Saved to the teacher's Google Drive and SpartBoard library (Video Activity widget). ${QUESTION_HELP}`,
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        youtube_url: z.string().max(500),
        folder_id: z
          .string()
          .optional()
          .describe(
            'From list_folders. Omit to save at the top of the library.'
          ),
        questions: z.array(questionSchema).min(1).max(MAX_VIDEO_QUESTIONS),
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_video_activity', ctx, async () => {
        const youtubeUrl = assertYouTubeUrl(input.youtube_url);
        await assertFolder(ctx, 'video_activities', input.folder_id);
        const questions = buildQuestions(
          input.questions as VideoFriendlyQuestion[],
          []
        );
        const token = await driveTokenFor(ctx.uid);
        await reserveWrite(ctx);
        const now = Date.now();
        const result = await saveActivity(
          ctx,
          {
            id: randomUUID(),
            title: input.title.trim(),
            youtubeUrl,
            questions,
            createdAt: now,
            updatedAt: now,
          },
          {
            token,
            meta: input.folder_id ? { folderId: input.folder_id } : null,
            previous: null,
            action: 'create',
          }
        );
        return {
          ...result,
          where_to_find_it: 'SpartBoard > Video Activity widget > library',
        };
      })
  );

  server.registerTool(
    'update_video_activity',
    {
      title: 'Edit a video activity',
      description: `Edits a video activity. Only the fields you pass change. \`questions\`, when passed, replaces the whole list: include every question to keep, with its id from get_video_activity. Questions are sorted by timestamp. The previous version is kept for 30 days (restore_revision). Existing assignments keep the questions they were given. ${QUESTION_HELP}`,
      inputSchema: {
        activity_id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        youtube_url: z.string().max(500).optional(),
        folder_id: z
          .string()
          .nullable()
          .optional()
          .describe(
            'Move to this folder; null moves it to the top of the library.'
          ),
        questions: z
          .array(questionSchema)
          .min(1)
          .max(MAX_VIDEO_QUESTIONS)
          .optional(),
      },
      annotations: OVERWRITES,
    },
    (input) =>
      run('update_video_activity', ctx, async () => {
        const youtubeUrl =
          input.youtube_url === undefined
            ? undefined
            : assertYouTubeUrl(input.youtube_url);
        if (input.folder_id)
          await assertFolder(ctx, 'video_activities', input.folder_id);
        const { meta, content, token } = await loadActivity(
          ctx,
          input.activity_id
        );
        assertNotSynced(meta);
        const questions = input.questions
          ? buildQuestions(
              input.questions as VideoFriendlyQuestion[],
              content.questions
            )
          : content.questions;
        await reserveWrite(ctx);
        return saveActivity(
          ctx,
          {
            ...content,
            title: input.title?.trim() || content.title,
            youtubeUrl: youtubeUrl ?? content.youtubeUrl,
            questions,
          },
          {
            token,
            meta:
              input.folder_id === undefined
                ? meta
                : { ...meta, folderId: input.folder_id },
            previous: content,
            action: 'update',
          }
        );
      })
  );
}
