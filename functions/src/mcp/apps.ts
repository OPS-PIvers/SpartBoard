// MCP Apps preview cards: the ui:// page, the per-teacher flag and the data each card draws.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './activity';
import { APPS_FEATURE_ID, publicOrigin } from './config';
import { PREVIEW_HTML } from './apps/previewApp.gen';
import {
  questionNeedsKey,
  toFriendlyQuestion,
  type QuizContent,
  type QuizKind,
  type StoredQuestion,
} from './quizStore';
import { rubricMaxPoints, type Rubric } from './rubricShape';
import { run } from './toolKit';

/** Bump the suffix when the page changes shape, so Claude never pairs new data with a cached old page. */
export const PREVIEW_URI = 'ui://spartboard/preview-v1';
export const APP_MIME = 'text/html;profile=mcp-app';
/** Lexend and Roboto Mono, the app's own fonts, served by Google Fonts. */
const FONT_HOSTS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

/** Tool `_meta` that points Claude at the preview page (both the nested and the legacy flat key). */
export const previewMeta: Record<string, unknown> = {
  ui: { resourceUri: PREVIEW_URI },
  'ui/resourceUri': PREVIEW_URI,
};

const PREVIEW_NOTE =
  'The teacher sees this as a preview card in the chat, so do not repeat its questions or criteria. Messages that start with "From the preview card" come from that card.';

const flagCache = new WeakMap<ToolContext, Promise<boolean>>();

/** Whether this teacher gets preview cards; read once per request. */
export function appsOn(ctx: ToolContext): Promise<boolean> {
  let pending = flagCache.get(ctx);
  if (!pending) {
    pending = import('../quizMediaArchive')
      .then(({ isGlobalFeatureGranted }) =>
        isGlobalFeatureGranted(ctx.db, APPS_FEATURE_ID, ctx.email, ctx.uid)
      )
      .catch(() => false);
    flagCache.set(ctx, pending);
  }
  return pending;
}

export function registerAppResources(server: McpServer): void {
  server.registerResource(
    'SpartBoard preview',
    PREVIEW_URI,
    {
      mimeType: APP_MIME,
      description: 'Preview card for quizzes, question banks and rubrics.',
    },
    () => ({
      contents: [
        {
          uri: PREVIEW_URI,
          mimeType: APP_MIME,
          text: PREVIEW_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { resourceDomains: FONT_HOSTS },
            },
          },
        },
      ],
    })
  );
}

/** run() plus the card data, attached only when this teacher has previews on. */
export async function runWithPreview(
  name: string,
  ctx: ToolContext,
  body: () => Promise<{
    result: Record<string, unknown>;
    view: Record<string, unknown>;
  }>
): Promise<CallToolResult> {
  let view: Record<string, unknown> | null = null;
  const out = await run(name, ctx, async () => {
    const [made, on] = await Promise.all([body(), appsOn(ctx)]);
    if (!on) return made.result;
    view = made.view;
    return { ...made.result, preview_shown: PREVIEW_NOTE };
  });
  return out.isError || !view ? out : { ...out, structuredContent: view };
}

/** A rubric as the card draws it; level ids are left out because the card never edits. */
export function rubricCard(rubric: Rubric) {
  return {
    title: rubric.title,
    description: rubric.description ?? '',
    max_points: rubricMaxPoints(rubric.criteria ?? []),
    criteria: (rubric.criteria ?? []).map((c) => ({
      name: c.name,
      description: c.description ?? '',
      examples: c.guide?.examples ?? [],
      levels: c.levels.map((l) => ({
        label: l.label,
        points: l.points,
        description: l.description ?? '',
      })),
    })),
  };
}

export function rubricView(rubric: Rubric) {
  return {
    view: 'rubric',
    rubric_id: rubric.id,
    updated_at: rubric.updatedAt,
    ...rubricCard(rubric),
  };
}

const questionPoints = (q: StoredQuestion): number =>
  typeof q.points === 'number' ? q.points : 1;

/** Question ids that are new or differ from the saved version before this edit. */
export function changedQuestionIds(
  previous: StoredQuestion[],
  next: StoredQuestion[]
): string[] {
  const before = new Map(previous.map((q) => [q.id, JSON.stringify(q)]));
  return next
    .filter((q) => before.get(q.id) !== JSON.stringify(q))
    .map((q) => q.id);
}

export function quizView(
  kind: QuizKind,
  content: QuizContent,
  meta: Record<string, unknown>,
  edit?: { changed: readonly string[]; removed: number }
) {
  const changedSet = new Set(edit?.changed ?? []);
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    view: 'quiz',
    kind,
    id: content.id,
    title: content.title,
    shared_with_plc: Boolean(meta.sync),
    updated_at: content.updatedAt,
    total_points: content.questions.reduce((s, q) => s + questionPoints(q), 0),
    missing_answer_keys: content.questions.filter(questionNeedsKey).length,
    sections: count(content.sections),
    passages: count(content.stimuli),
    bank_pulls: count(content.bankSlots),
    removed_questions: edit?.removed ?? 0,
    open_url: publicOrigin(),
    questions: content.questions.map((q, i) => {
      const snapshot = q.rubricSnapshot as Rubric | undefined;
      return {
        n: i + 1,
        ...toFriendlyQuestion(q),
        points: questionPoints(q),
        changed: changedSet.has(q.id),
        rubric: snapshot
          ? {
              ...rubricCard(snapshot),
              shown_to_students: q.rubricVisibleToStudents === true,
            }
          : null,
      };
    }),
  };
}
