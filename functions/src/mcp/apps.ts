// MCP Apps preview cards: the ui:// page, the per-teacher flag and the data each card draws.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './activity';
import { APPS_FEATURE_ID, publicOrigin } from './config';
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
export const PREVIEW_URI = 'ui://spartboard/preview-v2';
export const APP_MIME = 'text/html;profile=mcp-app';
/** Where `vite.mcp-app.config.ts` puts the card page on the app's own hosting. */
export const CARD_PAGE_PATH = '/mcp-app/mcpApps/quiz-preview.html';
const CARD_CACHE_MS = 5 * 60 * 1000;

/** Google Fonts (Lexend), plus the hosts quiz pictures are served from. */
const MEDIA_HOSTS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://firebasestorage.googleapis.com',
  'https://storage.googleapis.com',
  'https://lh3.googleusercontent.com',
  'https://drive.google.com',
];

const FALLBACK_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#fff;font:14px system-ui,sans-serif;color:#475569"><p style="padding:16px">This preview could not load. Open the quiz in SpartBoard to see it.</p></body></html>';

let cardCache: { origin: string; html: string; at: number } | null = null;

/** The card page from the deployed app, with a base URL so its /mcp-app and /mathlive paths load from there. */
export async function cardHtml(
  fetcher: typeof fetch = fetch,
  now = Date.now()
): Promise<string> {
  const origin = publicOrigin();
  if (
    cardCache &&
    cardCache.origin === origin &&
    now - cardCache.at < CARD_CACHE_MS
  ) {
    return cardCache.html;
  }
  try {
    const res = await fetcher(`${origin}${CARD_PAGE_PATH}`);
    if (!res.ok) throw new Error(`card page ${res.status}`);
    const page = await res.text();
    if (!page.includes('<head>')) throw new Error('card page has no head');
    const html = page.replace('<head>', `<head><base href="${origin}/">`);
    cardCache = { origin, html, at: now };
    return html;
  } catch (err) {
    console.error('[mcpServer] preview card page failed to load', { err });
    return FALLBACK_HTML;
  }
}

export function resetCardCacheForTests(): void {
  cardCache = null;
}

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
    async () => {
      const origin = publicOrigin();
      return {
        contents: [
          {
            uri: PREVIEW_URI,
            mimeType: APP_MIME,
            text: await cardHtml(),
            _meta: {
              ui: {
                prefersBorder: true,
                csp: {
                  resourceDomains: [origin, ...MEDIA_HOSTS],
                  baseUriDomains: [origin],
                },
              },
            },
          },
        ],
      };
    }
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
    open_url: publicOrigin(),
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
    // The saved quiz and its settings, so the card can run the real student player.
    quiz: content,
    behavior: (meta.behavior as Record<string, unknown> | undefined) ?? null,
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
