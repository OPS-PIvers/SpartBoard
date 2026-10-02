// Admin-only live tour tools: create_live_tour and list_help_center_categories (CLAUDE_CONNECTOR.md CC-D19).
import { randomUUID } from 'node:crypto';
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import { isStrictSuperAdmin } from '../authz';
import {
  MAX_NEW_SLIDES,
  saveNewSet,
  savedSummary,
  type HelpCenterPlacement,
} from './glCreate';
import { MAX_STEPS, assertAccess, stepInput } from './glTools';
import { CREATES, READ_ONLY, run } from './toolKit';

export const HELP_RESOURCES = 'help_resources';
export const ADMIN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'create_live_tour',
  'list_help_center_categories',
]);

// Mirrors DEFAULT_HELP_CATEGORIES in types/helpCenter.ts, which the app shows until help_center/config is saved.
const DEFAULT_CATEGORIES = [
  { id: 'getting-started', name: 'Getting started', order: 0 },
  { id: 'boards-widgets', name: 'Boards & widgets', order: 1 },
  { id: 'quizzes-activities', name: 'Quizzes & activities', order: 2 },
  { id: 'sharing-classes', name: 'Sharing & classes', order: 3 },
  { id: 'admin', name: 'Admin', order: 4 },
];

interface Category {
  id: string;
  name: string;
  order: number;
}

export function parseCategories(data: Record<string, unknown> | undefined) {
  const raw = data?.categories;
  const list = Array.isArray(raw)
    ? raw.filter(
        (c): c is Category =>
          !!c &&
          typeof (c as Category).id === 'string' &&
          typeof (c as Category).name === 'string'
      )
    : [];
  return (list.length > 0 ? list : DEFAULT_CATEGORIES)
    .map(({ id, name, order }) => ({ id, name, order: order ?? 0 }))
    .sort((a, b) => a.order - b.order);
}

async function loadCategories(ctx: ToolContext) {
  const snap = await ctx.db.doc('help_center/config').get();
  return parseCategories(snap.data());
}

/** The Help Center scope an item gets, matching the Admin Settings > Help Center manager: global for super admins, else the admin's org. */
export async function helpCenterScope(
  ctx: ToolContext
): Promise<{ orgId: string | null; label: string }> {
  const email = ctx.email.toLowerCase();
  if (await isStrictSuperAdmin(ctx.db, email))
    return { orgId: null, label: 'Everyone' };
  const { normalizeEmailDomain, resolveOrgIdForDomain } =
    await import('../classlinkShared');
  const domain = normalizeEmailDomain(email);
  const orgId = domain ? await resolveOrgIdForDomain(ctx.db, domain) : null;
  if (
    orgId &&
    (await ctx.db.doc(`organizations/${orgId}/members/${email}`).get()).exists
  )
    return { orgId, label: orgId };
  throw new ToolError(
    'Your account is not a member of an organization, so it cannot add Help Center items.'
  );
}

/** The help_resources doc for a new tour, hidden until an admin publishes it; fields match the rules' allowlist. */
export function buildHelpItem(
  placement: HelpCenterPlacement,
  set: { id: string; title: string; description?: unknown },
  ids: {
    id: string;
    uid: string;
    email: string;
    orgId: string | null;
    order: number;
    now: number;
  }
) {
  return {
    id: ids.id,
    kind: 'guided-learning',
    title: set.title,
    description: typeof set.description === 'string' ? set.description : '',
    categoryId: placement.category_id,
    order: ids.order,
    visible: false,
    orgId: ids.orgId,
    widgetTypes: [...new Set(placement.widget_types ?? [])],
    url: null,
    embedType: null,
    setId: set.id,
    openCount: 0,
    createdBy: ids.uid,
    createdByEmail: ids.email,
    createdAt: ids.now,
    updatedAt: ids.now,
  };
}

async function nextOrder(
  db: admin.firestore.Firestore,
  categoryId: string
): Promise<number> {
  const snap = await db
    .collection(HELP_RESOURCES)
    .where('categoryId', '==', categoryId)
    .get();
  return snap.docs.reduce((max, d) => {
    const order: unknown = d.get('order');
    return typeof order === 'number' ? Math.max(max, order + 1) : max;
  }, 0);
}

const tourStep = stepInput.extend({
  tour: stepInput.shape.tour.unwrap(),
  xPct: stepInput.shape.xPct.optional(),
  yPct: stepInput.shape.yPct.optional(),
  imageIndex: stepInput.shape.imageIndex.optional(),
});

export function registerLiveTourTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'list_help_center_categories',
    {
      title: 'List Help Center categories',
      description:
        'Admins only. Lists the Help Center categories a live tour can be filed under, and who a new item would be shown to.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run('list_help_center_categories', ctx, async () => {
        await assertAccess(ctx, 'help_center');
        const [categories, scope] = await Promise.all([
          loadCategories(ctx),
          helpCenterScope(ctx),
        ]);
        return { categories, new_items_shown_to: scope.label };
      })
  );

  server.registerTool(
    'create_live_tour',
    {
      title: 'Create a live tour',
      description:
        'Admins only. Creates a live tour that walks a teacher through the real SpartBoard board, one step per control. Every step needs a tour binding (list_tour_anchors); a narration step observes the control it describes, and welcome_message opens the tour. No screenshots are needed. Saved as an unpublished draft: pass help_center to also add it to the Help Center, hidden until an admin test-runs it, publishes it in the Studio and shows the item in Admin Settings > Help Center.',
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        tour_widgets: z
          .array(z.string().max(60))
          .max(12)
          .optional()
          .describe(
            'Widget types added to the board before the tour starts, e.g. "clock".'
          ),
        help_center: z
          .object({
            category_id: z.string().min(1).max(100),
            widget_types: z
              .array(z.string().max(60))
              .max(12)
              .optional()
              .describe(
                'Widgets whose ? button offers this tour, e.g. "clock".'
              ),
          })
          .strict()
          .optional()
          .describe('A category id from list_help_center_categories.'),
        slide_urls: z
          .array(z.string().max(2000))
          .max(MAX_NEW_SLIDES)
          .optional()
          .describe(
            'Rarely needed: public image links shown off-board. Step imageIndex counts from 0.'
          ),
        steps: z.array(tourStep).min(1).max(MAX_STEPS),
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_live_tour', ctx, async () => {
        const placement = input.help_center;
        let help: {
          orgId: string | null;
          label: string;
          order: number;
        } | null = null;
        if (placement) {
          await assertAccess(ctx, 'help_center');
          const [categories, scope, order] = await Promise.all([
            loadCategories(ctx),
            helpCenterScope(ctx),
            nextOrder(ctx.db, placement.category_id),
          ]);
          if (!categories.some((c) => c.id === placement.category_id))
            throw new ToolError(
              `help_center.category_id "${placement.category_id}" is not a Help Center category. Use one of: ${categories.map((c) => c.id).join(', ')}.`
            );
          help = { ...scope, order };
        }
        const helpItemId = randomUUID();
        const saved = await saveNewSet(
          ctx,
          {
            ...input,
            kind: 'live_tour',
            source: 'building',
            steps: input.steps.map((s) => ({
              ...s,
              xPct: s.xPct ?? 50,
              yPct: s.yPct ?? 50,
              imageIndex: s.imageIndex ?? 0,
            })),
          },
          (batch, set) => {
            if (!placement || !help) return;
            batch.create(
              ctx.db.doc(`${HELP_RESOURCES}/${helpItemId}`),
              buildHelpItem(placement, set, {
                id: helpItemId,
                uid: ctx.uid,
                email: ctx.email,
                orgId: help.orgId,
                order: help.order,
                now: Date.now(),
              })
            );
          }
        );
        return {
          ...savedSummary(saved),
          where_to_find_it: help
            ? 'SpartBoard > Admin Settings > Help Center (hidden)'
            : 'SpartBoard > Guided Learning widget > library, building sets',
          ...(help
            ? { help_item_id: helpItemId, help_item_shown_to: help.label }
            : {}),
          note: help
            ? 'Saved as a hidden draft. In Admin Settings > Help Center, open the item and edit its activity to run it live and publish it in the Studio, then make the item visible.'
            : 'Saved as a draft. Try it with Run live on my board (draft) in the library; teachers see it after it is published in the Studio.',
        };
      })
  );
}
