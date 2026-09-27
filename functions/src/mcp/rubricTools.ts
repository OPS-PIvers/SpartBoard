// Rubric tools (plan: "Tools", PR 3). Mirrors useRubrics.saveRubric and RubricBuilderPanel validation.
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

export const MIN_LEVELS = 2;
export const MAX_LEVELS = 6;
export const MAX_CRITERIA = 12;

export interface RubricLevel {
  id: string;
  label: string;
  points: number;
  description?: string;
}
export interface RubricCriterion {
  id: string;
  name: string;
  description?: string;
  levels: RubricLevel[];
}
/** Rubric in types.ts; firestore.rules locks the doc to exactly these keys. */
export interface Rubric {
  id: string;
  title: string;
  description?: string;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

export interface CriterionInput {
  id?: string;
  name: string;
  description?: string;
  levels: {
    id?: string;
    label: string;
    points: number;
    description?: string;
  }[];
}

const rubricPath = (uid: string, id: string) => `users/${uid}/rubrics/${id}`;

const optionalText = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

/** Tool input → stored criteria, reusing ids the teacher's grades point at. */
export function buildCriteria(
  inputs: CriterionInput[],
  previous: RubricCriterion[],
  newId: () => string
): RubricCriterion[] {
  const prevById = new Map(previous.map((c) => [c.id, c]));
  const used = new Set<string>();
  return inputs.map((input, i) => {
    const n = i + 1;
    const name = input.name.trim();
    if (!name) throw new ToolError(`Criterion ${n}: name is required.`);
    if (input.levels.length < MIN_LEVELS || input.levels.length > MAX_LEVELS) {
      throw new ToolError(
        `Criterion ${n}: needs ${MIN_LEVELS} to ${MAX_LEVELS} levels.`
      );
    }
    const prior =
      input.id && !used.has(input.id) ? prevById.get(input.id) : undefined;
    if (prior) used.add(prior.id);
    const priorLevels = new Map((prior?.levels ?? []).map((l) => [l.id, l]));
    const seen = new Set<number>();
    const usedLevels = new Set<string>();
    const levels = input.levels.map((level) => {
      const label = level.label.trim();
      if (!label)
        throw new ToolError(`Criterion ${n}: every level needs a label.`);
      if (!Number.isInteger(level.points) || level.points < 0) {
        throw new ToolError(
          `Criterion ${n}: level points must be whole numbers of 0 or more.`
        );
      }
      if (seen.has(level.points)) {
        throw new ToolError(
          `Criterion ${n}: two levels can't have the same points.`
        );
      }
      seen.add(level.points);
      const out: RubricLevel = {
        id:
          level.id && priorLevels.has(level.id) && !usedLevels.has(level.id)
            ? level.id
            : newId(),
        label,
        points: level.points,
      };
      usedLevels.add(out.id);
      const description = optionalText(level.description);
      if (description) out.description = description;
      return out;
    });
    levels.sort((a, b) => a.points - b.points);
    const criterion: RubricCriterion = {
      id: prior ? prior.id : newId(),
      name,
      levels,
    };
    const description = optionalText(input.description);
    if (description) criterion.description = description;
    return criterion;
  });
}

/** Exactly the keys firestore.rules allows, with undefined optionals dropped. */
export function rubricDoc(rubric: Rubric): Rubric {
  const out: Rubric = {
    id: rubric.id,
    title: rubric.title,
    criteria: rubric.criteria,
    createdAt: rubric.createdAt,
    updatedAt: rubric.updatedAt,
  };
  if (rubric.description) out.description = rubric.description;
  return out;
}

/** Mirrors rubricMaxPoints in utils/rubricPoints.ts. */
export const rubricMaxPoints = (criteria: RubricCriterion[]): number =>
  criteria.reduce(
    (sum, c) => sum + Math.max(0, ...c.levels.map((l) => l.points)),
    0
  );

function summarize(id: string, data: Record<string, unknown>) {
  const criteria = Array.isArray(data.criteria)
    ? (data.criteria as RubricCriterion[])
    : [];
  return {
    rubric_id: id,
    title: data.title,
    criteria_count: criteria.length,
    max_points: rubricMaxPoints(criteria),
    updated_at: iso(data.updatedAt),
  };
}

async function readRubric(ctx: ToolContext, id: string): Promise<Rubric> {
  const snap = await ctx.db.doc(rubricPath(ctx.uid, id)).get();
  if (!snap.exists) {
    throw new ToolError(
      'That rubric was not found. Use list_rubrics to find its id.'
    );
  }
  return { ...(snap.data() as Rubric), id };
}

async function saveRubricEdit(
  ctx: ToolContext,
  previous: Rubric,
  next: Rubric,
  action: 'update' | 'restore'
) {
  const batch = ctx.db.batch();
  const revisionId = snapshotRevision(ctx, batch, {
    itemType: 'rubric',
    itemId: previous.id,
    title: previous.title,
    data: { ...rubricDoc(previous) },
  });
  const doc = rubricDoc({ ...next, updatedAt: Date.now() });
  batch.set(ctx.db.doc(rubricPath(ctx.uid, doc.id)), doc);
  logActivity(ctx, batch, {
    action,
    itemType: 'rubric',
    itemId: doc.id,
    title: doc.title,
    revisionId,
  });
  await batch.commit();
  return {
    ...summarize(doc.id, { ...doc }),
    previous_version_revision_id: revisionId,
    note: 'Quiz questions already using this rubric keep their copy until the teacher reattaches it in the quiz editor.',
  };
}

/** restore_revision for rubrics; called from tools.ts. */
export async function restoreRubricRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  const id = String(rev.get('itemId'));
  const current = await readRubric(ctx, id);
  await reserveWrite(ctx);
  const data = rev.get('data') as Rubric;
  return saveRubricEdit(
    ctx,
    current,
    { ...data, id, createdAt: current.createdAt },
    'restore'
  );
}

const criterionSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Existing criterion id from get_rubric; omit for new.'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  levels: z
    .array(
      z.object({
        id: z.string().optional().describe('Existing level id; omit for new.'),
        label: z.string().min(1).max(100).describe('e.g. "Proficient".'),
        points: z.number().int().min(0).max(100),
        description: z
          .string()
          .max(1000)
          .optional()
          .describe('What work at this level looks like.'),
      })
    )
    .min(MIN_LEVELS)
    .max(MAX_LEVELS)
    .describe(
      `${MIN_LEVELS}-${MAX_LEVELS} levels with different whole-number points; stored lowest first.`
    ),
});

export function registerRubricTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_rubrics',
    {
      title: 'List rubrics',
      description: `Lists the teacher's rubrics, newest first, ${PAGE_SIZE} per page.`,
      inputSchema: {
        search: z.string().max(100).optional(),
        cursor: z
          .string()
          .optional()
          .describe('next_cursor from a previous page.'),
      },
      annotations: READ_ONLY,
    },
    ({ search, cursor }) =>
      run('list_rubrics', ctx, async () => {
        const page = await pageByUpdatedAt(
          ctx.db,
          `users/${ctx.uid}/rubrics`,
          cursor,
          titleAndFolderFilter(search, undefined)
        );
        return {
          rubrics: page.items.map(({ id, data }) => summarize(id, data)),
          next_cursor: page.next_cursor,
        };
      })
  );

  server.registerTool(
    'get_rubric',
    {
      title: 'Get a rubric',
      description:
        'Returns a rubric with every criterion and level. Keep criterion and level ids when sending it back to update_rubric.',
      inputSchema: { rubric_id: z.string().min(1) },
      annotations: READ_ONLY,
    },
    ({ rubric_id }) =>
      run('get_rubric', ctx, async () => {
        const rubric = await readRubric(ctx, rubric_id);
        return {
          ...summarize(rubric_id, { ...rubric }),
          description: rubric.description ?? '',
          criteria: rubric.criteria,
        };
      })
  );

  server.registerTool(
    'create_rubric',
    {
      title: 'Create a rubric',
      description:
        "Creates a scoring rubric in the teacher's SpartBoard library. Teachers attach rubrics to free-response quiz questions in the quiz editor.",
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        criteria: z.array(criterionSchema).min(1).max(MAX_CRITERIA),
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_rubric', ctx, async () => {
        const criteria = buildCriteria(input.criteria, [], randomUUID);
        await reserveWrite(ctx);
        const now = Date.now();
        const doc = rubricDoc({
          id: randomUUID(),
          title: input.title.trim(),
          description: optionalText(input.description),
          criteria,
          createdAt: now,
          updatedAt: now,
        });
        const batch = ctx.db.batch();
        batch.set(ctx.db.doc(rubricPath(ctx.uid, doc.id)), doc);
        logActivity(ctx, batch, {
          action: 'create',
          itemType: 'rubric',
          itemId: doc.id,
          title: doc.title,
        });
        await batch.commit();
        return {
          ...summarize(doc.id, { ...doc }),
          where_to_find_it:
            'SpartBoard > Quiz editor > a Free Response question > Rubric',
        };
      })
  );

  server.registerTool(
    'update_rubric',
    {
      title: 'Edit a rubric',
      description:
        'Edits a rubric. Only the fields you pass change. `criteria`, when passed, replaces the whole list: include every criterion to keep, with its id from get_rubric. The previous version is kept for 30 days (restore_revision).',
      inputSchema: {
        rubric_id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        criteria: z.array(criterionSchema).min(1).max(MAX_CRITERIA).optional(),
      },
      annotations: OVERWRITES,
    },
    (input) =>
      run('update_rubric', ctx, async () => {
        const existing = await readRubric(ctx, input.rubric_id);
        const criteria = input.criteria
          ? buildCriteria(input.criteria, existing.criteria, randomUUID)
          : existing.criteria;
        await reserveWrite(ctx);
        return saveRubricEdit(
          ctx,
          existing,
          {
            ...existing,
            title: input.title?.trim() || existing.title,
            description:
              input.description === undefined
                ? existing.description
                : optionalText(input.description),
            criteria,
          },
          'update'
        );
      })
  );
}
