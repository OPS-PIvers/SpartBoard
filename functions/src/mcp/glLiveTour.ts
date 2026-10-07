// Admin-only live tour tools: create, get and update a live tour, and list Help Center categories (CLAUDE_CONNECTOR.md CC-D19).
import { randomUUID } from 'node:crypto';
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolError, reserveWrite, type ToolContext } from './activity';
import { isStrictSuperAdmin } from '../authz';
import { saveNewSet, savedSummary, type HelpCenterPlacement } from './glCreate';
import {
  MAX_SLIDE_BYTES,
  MAX_STEPS,
  assertAccess,
  assertStepText,
  loadSet,
  mergeSteps,
  publicStep,
  requiredSchemaVersion,
  saveSet,
  slideBytes,
  stepInput,
  type GlSet,
  type Step,
  type StepInput,
} from './glTools';
import {
  planAnchorRequests,
  type AnchorRequest,
  type MissingAnchorNote,
} from './glAnchorRequests';
import { TOUR_ANCHOR_LIST } from './tourAnchorList';
import { TOUR_ANCHOR_QUEUE } from '../tourAnchorQueue';
import { CREATES, OVERWRITES, READ_ONLY, iso, run } from './toolKit';

export const HELP_RESOURCES = 'help_resources';
export const ADMIN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'create_live_tour',
  'get_live_tour',
  'update_live_tour',
  'get_live_tour_step_picture',
  'list_help_center_categories',
]);
export const GL_TOURS = 'building_guided_learning_tours';

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

// Tour steps point at live controls, so they carry no slide placement.
export const tourStep = stepInput
  .omit({
    imageIndex: true,
    xPct: true,
    yPct: true,
    region: true,
    calloutPin: true,
    calloutWidthPct: true,
    calloutScale: true,
    calloutTone: true,
    calloutBox: true,
  })
  .extend({ tour: stepInput.shape.tour.unwrap() });

// Slide placement a tour step no longer edits; kept from the stored step until the conversion script drops it.
const SLIDE_FIELDS = [
  'xPct',
  'yPct',
  'imageIndex',
  'region',
  'calloutPin',
  'calloutWidthPct',
  'calloutScale',
  'calloutTone',
  'calloutBox',
  'tooltipPosition',
  'tooltipOffset',
  'panZoomScale',
  'spotlightRadius',
] as const;

const editStep = tourStep
  .omit({
    tooltipPosition: true,
    tooltipOffset: true,
    panZoomScale: true,
    spotlightRadius: true,
  })
  .extend({
    has_thumbnail: z
      .boolean()
      .optional()
      .describe('Read only. The picture is kept and retaken in SpartBoard.'),
    thumbnail_stale: z.boolean().optional().describe('Read only.'),
    anchor_ready: z
      .string()
      .optional()
      .describe('Read only. Copy it into tour.anchor to bind the step.'),
  });
type EditStep = z.infer<typeof editStep>;

const KNOWN_ANCHORS = new Set(TOUR_ANCHOR_LIST.map((a) => a.id));
const SCOPE_OF = new Map(TOUR_ANCHOR_LIST.map((a) => [a.id, a.scope]));

export interface QueueItem {
  status?: unknown;
  anchorId?: unknown;
  widgetType?: unknown;
}

/** The anchor ref Live tour health's Rebind would write for a queue item; mirrors reboundAnchorRef in components/tours/anchorQueue.ts. */
export function readyAnchorRef(item: QueueItem): string | null {
  const ref = item.anchorId;
  if (typeof ref !== 'string' || !ref) return null;
  if (['open', 'rebound', 'needs-human'].includes(String(item.status)))
    return null;
  const [head, fieldKey] = ref.split('#');
  const [id, refType] = head.split(':');
  const scope = SCOPE_OF.get(id);
  if (!scope) return null;
  if (scope === 'board') return ref;
  const type =
    refType || (typeof item.widgetType === 'string' ? item.widgetType : '');
  if (!type) return null;
  if (scope !== 'field') return `${id}:${type}`;
  return fieldKey ? `${id}:${type}#${fieldKey}` : null;
}

/** Step id → the anchor its recorded control was tagged with since, from the anchor queue. */
async function readyAnchors(
  ctx: ToolContext,
  steps: readonly Step[]
): Promise<Map<string, string>> {
  const pending = steps.flatMap((s) => {
    const tour = s.tour as { anchor?: unknown; unmapped?: unknown } | undefined;
    return tour?.anchor === '' && typeof tour.unmapped === 'string'
      ? [{ stepId: s.id, fingerprint: tour.unmapped }]
      : [];
  });
  if (pending.length === 0) return new Map();
  const snaps = await ctx.db.getAll(
    ...pending.map((p) => ctx.db.doc(`${TOUR_ANCHOR_QUEUE}/${p.fingerprint}`))
  );
  const ready = new Map<string, string>();
  pending.forEach((p, i) => {
    const ref = snaps[i].exists
      ? readyAnchorRef(snaps[i].data() as QueueItem)
      : null;
    if (ref) ready.set(p.stepId, ref);
  });
  return ready;
}

/** update_live_tour's step_text: new label or text on stored steps, everything else untouched. */
export function applyStepText(
  steps: readonly Step[],
  edits: readonly { id: string; label?: string; text?: string }[]
): Step[] {
  const byId = new Map(edits.map((e) => [e.id, e]));
  if (byId.size !== edits.length)
    throw new ToolError('step_text names a step twice.');
  const known = new Set(steps.map((s) => s.id));
  const missing = edits.find((e) => !known.has(e.id));
  if (missing)
    throw new ToolError(
      `step_text: no step has id "${missing.id}". Use the ids get_live_tour returns.`
    );
  return steps.map((step) => {
    const edit = byId.get(step.id);
    if (!edit) return step;
    const next: Step = { ...step };
    for (const key of ['label', 'text'] as const) {
      const value = edit[key];
      if (value === undefined) continue;
      if (key === 'text' && value)
        assertStepText(`step_text "${step.id}"`, value);
      if (value) next[key] = value;
      else delete next[key];
    }
    return next;
  });
}

interface TourThumbnail {
  anchor?: unknown;
}
const thumbnailOf = (step: Step): TourThumbnail | undefined => {
  const thumb = (step.tour as { thumbnail?: unknown } | undefined)?.thumbnail;
  return thumb && typeof thumb === 'object'
    ? (thumb as TourThumbnail)
    : undefined;
};

/** A tour step as Claude sees it: no slide placement, the thumbnail as a flag. */
export function publicTourStep(step: Step): Record<string, unknown> {
  const out = publicStep(step);
  for (const key of SLIDE_FIELDS) delete out[key];
  const tour = step.tour as Record<string, unknown> | undefined;
  const thumb = thumbnailOf(step);
  if (tour) {
    const binding = { ...tour };
    delete binding.thumbnail;
    out.tour = binding;
  }
  out.has_thumbnail = !!thumb;
  if (thumb && tour && thumb.anchor !== tour.anchor) out.thumbnail_stale = true;
  return out;
}

export type TourPublishState = 'draft' | 'published' | 'changed';

/** Draft = never published; changed = saved after the snapshot teachers run. */
export function tourPublishState(
  updatedAt: unknown,
  publishedAt: number | null
): TourPublishState {
  if (publishedAt === null) return 'draft';
  return typeof updatedAt === 'number' && updatedAt > publishedAt
    ? 'changed'
    : 'published';
}

export function liveTourView(
  set: GlSet,
  publishedAt: number | null,
  ready: ReadonlyMap<string, string> = new Map()
) {
  const state = tourPublishState(set.updatedAt, publishedAt);
  const unregistered = set.steps.flatMap((s) => {
    const anchor = (s.tour as { anchor?: unknown } | undefined)?.anchor;
    const id = typeof anchor === 'string' ? anchor.split(/[:#]/)[0] : '';
    return id && !KNOWN_ANCHORS.has(id) ? [s.id] : [];
  });
  const setup = (set.tourSetup ?? {}) as {
    widgets?: unknown;
    autopilot?: unknown;
  };
  return {
    set_id: set.id,
    title: set.title,
    description: set.description ?? '',
    help_center: set.helpCenter === true,
    welcome_enabled: set.welcomeEnabled === true,
    welcome_message: set.welcomeMessage ?? '',
    tour_widgets: Array.isArray(setup.widgets) ? setup.widgets : [],
    autopilot: setup.autopilot === true,
    publish_state: state,
    published_at: publishedAt === null ? null : iso(publishedAt),
    updated_at: iso(set.updatedAt),
    ...(unregistered.length > 0
      ? { steps_with_unregistered_anchor: unregistered }
      : {}),
    steps: set.steps.map((s) => {
      const out = publicTourStep(s);
      const ref = ready.get(s.id);
      return ref ? { ...out, anchor_ready: ref } : out;
    }),
  };
}

/** Validates the full step list like create_live_tour, keeping each stored step's thumbnail and slide placement. */
export function mergeTourSteps(
  existing: readonly Step[],
  input: readonly EditStep[]
): Step[] {
  const stripped = input.map((s) => {
    const out: Record<string, unknown> = { ...s };
    delete out.has_thumbnail;
    delete out.thumbnail_stale;
    delete out.anchor_ready;
    return out as unknown as StepInput;
  });
  const merged = mergeSteps(existing, stripped, 0);
  const byId = new Map(existing.map((s) => [s.id, s]));
  return merged.map((step) => {
    const prior = byId.get(step.id);
    if (!prior) return step;
    const next: Record<string, unknown> = { ...step };
    for (const key of SLIDE_FIELDS)
      if (prior[key] !== undefined) next[key] = prior[key];
    const thumb = thumbnailOf(prior);
    if (thumb && next.tour)
      next.tour = {
        ...(next.tour as Record<string, unknown>),
        thumbnail: thumb,
      };
    return next as Step;
  });
}

const FIND_TOURS =
  'list_guided_learning with source "building" and kind "live_tour" lists every live tour with its set_id.';

async function loadTour(ctx: ToolContext, setId: string) {
  const loaded = await loadSet(ctx, 'building', setId).catch((err) => {
    if (err instanceof ToolError)
      throw new ToolError(`No live tour has that set_id. ${FIND_TOURS}`);
    throw err;
  });
  if (loaded.set.mode !== 'tour')
    throw new ToolError(
      `That set is a Guided Learning set, not a live tour; read it with get_guided_learning. ${FIND_TOURS}`
    );
  return loaded;
}

async function publishedAtOf(
  ctx: ToolContext,
  setId: string
): Promise<number | null> {
  const snap = await ctx.db.doc(`${GL_TOURS}/${setId}`).get();
  if (!snap.exists) return null;
  const at: unknown = snap.get('publishedAt');
  return typeof at === 'number' ? at : 0;
}

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
        'Admins only. Creates a live tour that walks a teacher through the real SpartBoard board, one step per control. Every step needs a tour binding (list_tour_anchors); a narration step observes the control it describes, an opening or closing step observes "board.whole", and welcome_message opens the tour. Steps have no slides, screenshots or positions. Saved as an unpublished draft: pass help_center to also add it to the Help Center, hidden until an admin test-runs it, publishes it in the Studio and shows the item in Admin Settings > Help Center.',
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        autopilot: z
          .boolean()
          .optional()
          .describe(
            'Start the tour with Autopilot on, so it performs each step while the teacher watches.'
          ),
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

  server.registerTool(
    'get_live_tour',
    {
      title: 'Get a live tour',
      description:
        'Admins only. Returns a live tour with every step: its anchor, action, value and text, whether it has a thumbnail, and whether teachers see the latest version (publish_state "draft" never published, "published" up to date, "changed" saved since the last publish). Find the set_id with list_guided_learning, source "building", kind "live_tour". A recorded step with anchor "" works from its English fallback only; anchor_ready on such a step is the anchor its control has since been given, which update_live_tour can put in tour.anchor. Use get_live_tour_step_picture to see what was recorded before writing a step\'s text.',
      inputSchema: { set_id: z.string().min(1) },
      annotations: READ_ONLY,
    },
    ({ set_id }) =>
      run('get_live_tour', ctx, async () => {
        await assertAccess(ctx, 'building');
        const [loaded, publishedAt] = await Promise.all([
          loadTour(ctx, set_id),
          publishedAtOf(ctx, set_id),
        ]);
        const ready = await readyAnchors(ctx, loaded.set.steps);
        return liveTourView(loaded.set, publishedAt, ready);
      })
  );

  server.registerTool(
    'update_live_tour',
    {
      title: 'Edit a live tour',
      description:
        'Admins only. Edits a live tour; only passed fields change. To change only wording, pass step_text, which leaves every other step and field as stored. `steps` replaces the whole list in play order: send every step to keep, with its id, as get_live_tour returned it; use it to add, remove, reorder or rebind steps. Anchors are checked like create_live_tour. Thumbnails and narration are kept. Saves the draft only: teachers keep the published tour until an admin opens the tour in SpartBoard and publishes the changes.',
      inputSchema: {
        set_id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        steps: z.array(editStep).min(1).max(MAX_STEPS).optional(),
        step_text: z
          .array(
            z
              .object({
                id: z.string().min(1).max(100),
                label: z.string().max(100).optional(),
                text: z.string().max(1000).optional(),
              })
              .strict()
          )
          .min(1)
          .max(MAX_STEPS)
          .optional()
          .describe(
            'New label or text for the named steps, by id; "" clears it. Not with steps.'
          ),
      },
      annotations: OVERWRITES,
    },
    ({ set_id, ...input }) =>
      run('update_live_tour', ctx, async () => {
        await assertAccess(ctx, 'building');
        const loaded = await loadTour(ctx, set_id);
        const { set } = loaded;
        const next: GlSet = { ...set, title: input.title ?? set.title };
        if (input.description !== undefined)
          next.description = input.description || undefined;
        if (input.welcome_enabled !== undefined)
          next.welcomeEnabled = input.welcome_enabled;
        if (input.welcome_message !== undefined)
          next.welcomeMessage = input.welcome_message || undefined;
        let requests: AnchorRequest[] = [];
        if (input.steps && input.step_text)
          throw new ToolError(
            'Pass steps or step_text, not both. Put the new wording in steps.'
          );
        if (input.step_text)
          next.steps = applyStepText(set.steps, input.step_text);
        if (input.steps) {
          const notes = new Map<string, MissingAnchorNote>();
          for (const s of input.steps)
            if (s.missing_anchor) notes.set(s.id, s.missing_anchor);
          const planned = planAnchorRequests(
            mergeTourSteps(set.steps, input.steps),
            set.steps,
            notes
          );
          next.steps = planned.steps as GlSet['steps'];
          next.schemaVersion = Math.max(
            set.schemaVersion ?? 1,
            requiredSchemaVersion(next.steps)
          );
          requests = planned.requests;
        }
        await reserveWrite(ctx);
        const saved = await saveSet(ctx, loaded, next, 'update', requests);
        return {
          ...saved,
          note: 'Saved as a draft. Teachers keep the published tour until an admin opens it in SpartBoard (Guided Learning library > Edit) and publishes the changes.',
        };
      })
  );

  server.registerTool(
    'get_live_tour_step_picture',
    {
      title: "View a live tour step's picture",
      description:
        'Admins only. Returns the screenshot recorded for a live tour step (has_thumbnail true), so its text can describe what the teacher actually sees. A thumbnail_stale picture shows the control the step pointed at before it was rebound.',
      inputSchema: {
        set_id: z.string().min(1),
        step_id: z.string().min(1).max(100),
      },
      annotations: READ_ONLY,
    },
    async ({ set_id, step_id }): Promise<CallToolResult> => {
      let image: { data: Buffer; mimeType: string } | null = null;
      const result = await run('get_live_tour_step_picture', ctx, async () => {
        await assertAccess(ctx, 'building');
        const { set } = await loadTour(ctx, set_id);
        const index = set.steps.findIndex((s) => s.id === step_id);
        if (index < 0)
          throw new ToolError(
            'No step has that id. Use the ids get_live_tour returns.'
          );
        const step = set.steps[index];
        const url = (thumbnailOf(step) as { url?: unknown } | undefined)?.url;
        if (typeof url !== 'string' || !url)
          throw new ToolError('That step has no recorded picture.');
        image = await slideBytes(ctx, url, 'building');
        if (image.data.length > MAX_SLIDE_BYTES)
          throw new ToolError('That picture is too large to show here.');
        return { number: index + 1, step: publicTourStep(step) };
      });
      const shown = image as { data: Buffer; mimeType: string } | null;
      if (result.isError || !shown) return result;
      return {
        content: [
          {
            type: 'image',
            data: shown.data.toString('base64'),
            mimeType: shown.mimeType,
          },
          ...result.content,
        ],
      };
    }
  );
}
