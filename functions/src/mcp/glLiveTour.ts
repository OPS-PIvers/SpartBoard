// Admin-only live tour tools: create, get and update a live tour, and list Help Center categories (CLAUDE_CONNECTOR.md CC-D19).
import { randomUUID } from 'node:crypto';
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolError, reserveWrite, type ToolContext } from './activity';
import { isStrictSuperAdmin } from '../authz';
import {
  saveNewSet,
  savedSummary,
  validateCreate,
  type HelpCenterPlacement,
} from './glCreate';
import {
  BUILDING,
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
  type GlSet,
  type Step,
} from './glTools';
import {
  planAnchorRequests,
  type AnchorRequest,
  type MissingAnchorNote,
} from './glAnchorRequests';
import { TOUR_ANCHOR_LIST } from './tourAnchorList';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { LIVE_TOUR_GUIDE } from './liveTourGuide';
import { dryRunTour, type DryRunReport, type DryRunStep } from './tourDryRun';
import {
  buildMaterials,
  buildTourSetup,
  liveTourStep,
  publicMaterial,
  toStepInput,
  tourLayout,
  tourMaterialInput,
  type LiveTourStep,
  type StoredMaterial,
  type StoredTourSetup,
} from './tourSetup';
import { TOUR_ANCHOR_QUEUE } from '../tourAnchorQueue';
import { CREATES, OVERWRITES, READ_ONLY, iso, run } from './toolKit';
import { issuePictureTicket } from './tourPictures';
import {
  narrateTourSteps,
  narrationDeps,
  unnarratedIds,
} from './tourNarration';

export const HELP_RESOURCES = 'help_resources';
export const ADMIN_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'create_live_tour',
  'get_live_tour',
  'update_live_tour',
  'get_live_tour_step_picture',
  'list_help_center_categories',
  'get_live_tour_guide',
  'start_live_tour_picture_upload',
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

// Tour steps point at live controls: a binding plus words, no slides, overlays, questions or media.
export const tourStep = liveTourStep;

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
  'calloutAlign',
  'calloutBox',
  'tooltipPosition',
  'tooltipOffset',
  'panZoomScale',
  'spotlightRadius',
] as const;

const editStep = tourStep.extend({
  has_thumbnail: z
    .boolean()
    .optional()
    .describe('Read only. The picture is kept and retaken in SpartBoard.'),
  thumbnail_stale: z.boolean().optional().describe('Read only.'),
  has_narration: z
    .boolean()
    .optional()
    .describe('Read only. Saving a step with new text narrates it again.'),
  anchor_ready: z
    .string()
    .optional()
    .describe('Read only. Copy it into tour.anchor to bind the step.'),
});
type EditStep = z.infer<typeof editStep>;

const WIDGET_TYPES = new Set(WIDGET_TYPE_LIST);
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
  return thumb && typeof thumb === 'object' ? thumb : undefined;
};

/** A tour step as Claude sees it: no slide placement, the thumbnail as a flag. */
export function publicTourStep(step: Step): Record<string, unknown> {
  const out = publicStep(step);
  // Only what update_live_tour takes back, so a step can be returned unchanged.
  for (const key of Object.keys(out))
    if (!(key in editStep.shape)) delete out[key];
  const tour = step.tour as Record<string, unknown> | undefined;
  const thumb = thumbnailOf(step);
  if (tour) {
    const binding = { ...tour };
    delete binding.thumbnail;
    // A step's saved starting board is edited on the board, never here.
    delete binding.start;
    out.tour = binding;
  }
  out.has_thumbnail = !!thumb;
  if (thumb && tour && thumb.anchor !== tour.anchor) out.thumbnail_stale = true;
  out.has_narration = !!(step as { narration?: unknown }).narration;
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

/** Steps that work from their English fallback only, until a developer tags the control (D9). */
export function needsAnchors(steps: GlSet['steps']) {
  const ids = steps.flatMap((s) =>
    (s.tour as { anchor?: unknown } | undefined)?.anchor === '' ? [s.id] : []
  );
  return ids.length
    ? {
        needs_anchors: ids,
        needs_anchors_note:
          'These steps find their control by its English name only, so they fail for teachers using another language. Name them in the hand-back; publish once the controls are tagged and the steps rebound.',
      }
    : {};
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
  const setup = (set.tourSetup ?? {}) as Partial<StoredTourSetup>;
  return {
    set_id: set.id,
    title: set.title,
    description: set.description ?? '',
    help_center: set.helpCenter === true,
    welcome_enabled: set.welcomeEnabled === true,
    welcome_message: set.welcomeMessage ?? '',
    tour_widgets: Array.isArray(setup.widgets) ? setup.widgets : [],
    ...(setup.layouts?.length ? { layouts: setup.layouts } : {}),
    use_teacher_board: setup.useTeacherBoard === true,
    autopilot: setup.autopilot === true,
    ...(setup.materials?.length
      ? { materials: setup.materials.map(publicMaterial) }
      : {}),
    publish_state: state,
    published_at: publishedAt === null ? null : iso(publishedAt),
    updated_at: iso(set.updatedAt),
    ...(unregistered.length > 0
      ? { steps_with_unregistered_anchor: unregistered }
      : {}),
    ...needsAnchors(set.steps),
    steps: set.steps.map((s) => {
      const out = publicTourStep(s);
      const ref = ready.get(s.id);
      return ref ? { ...out, anchor_ready: ref } : out;
    }),
  };
}

/** Validates the full step list like create_live_tour, keeping each stored step's thumbnail, starting board and slide placement. */
export function mergeTourSteps(
  existing: readonly Step[],
  input: readonly EditStep[]
): Step[] {
  const byId = new Map(existing.map((s) => [s.id, s]));
  const stripped = input.map((s) => {
    const out: Record<string, unknown> = { ...s };
    delete out.has_thumbnail;
    delete out.thumbnail_stale;
    delete out.anchor_ready;
    return toStepInput(out as unknown as LiveTourStep, byId.get(s.id));
  });
  const merged = mergeSteps(existing, stripped, 0);
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
    const start = (prior.tour as { start?: unknown } | undefined)?.start;
    if (start && next.tour)
      next.tour = { ...(next.tour as Record<string, unknown>), start };
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

const setupInputs = {
  tour_widgets: z
    .array(z.string().max(60))
    .max(12)
    .optional()
    .describe(
      'Widget types on the board when the tour starts, e.g. "clock". Replaces the stored list.'
    ),
  layouts: z
    .array(tourLayout)
    .max(12)
    .optional()
    .describe(
      "Where each tour widget sits. Leave out and SpartBoard places them. A layout's type joins tour_widgets."
    ),
  materials: z
    .array(tourMaterialInput)
    .max(6)
    .optional()
    .describe(
      "Library items the tour works on. With any material the tour runs in a sandbox: what it saves, assigns or starts stays out of the teacher's real library unless they keep it. Replaces the stored list."
    ),
  use_teacher_board: z
    .boolean()
    .optional()
    .describe(
      "true: play on the teacher's board as it is. Leave out to clear the stage and add the tour's widgets."
    ),
  autopilot: z
    .boolean()
    .optional()
    .describe(
      'Start with Autopilot on, so the tour performs each step while the teacher watches.'
    ),
};

const helpCenterInput = z
  .object({
    category_id: z.string().min(1).max(100),
    widget_types: z
      .array(z.string().max(60))
      .max(12)
      .optional()
      .describe('Widgets whose ? button offers this tour, e.g. "clock".'),
  })
  .strict()
  .optional()
  .describe(
    'File it in the Help Center under a category from list_help_center_categories, hidden until an admin shows it.'
  );

const dryRunInput = z
  .boolean()
  .optional()
  .describe(
    'Check the tour the way playback will meet it and return errors and warnings, without saving.'
  );

function validateWidgetTypes(field: string, list: readonly string[]) {
  const unknown = list.find((t) => !WIDGET_TYPES.has(t));
  if (unknown)
    throw new ToolError(
      `${field}: "${unknown}" is not a widget type. Use one of: ${WIDGET_TYPE_LIST.join(', ')}.`
    );
}

/** Runs the playback check on stored steps. */
export function checkTour(
  steps: readonly Step[],
  setup: StoredTourSetup
): DryRunReport {
  return dryRunTour(
    steps.map((s) => ({
      id: s.id,
      label: typeof s.label === 'string' ? s.label : undefined,
      text: typeof s.text === 'string' ? s.text : undefined,
      tour: s.tour as DryRunStep['tour'],
    })),
    {
      widgets: setup.widgets,
      layouts: setup.layouts,
      materials: setup.materials,
      useTeacherBoard: setup.useTeacherBoard === true,
    }
  );
}

const dryRunResult = (report: DryRunReport) => ({
  dry_run: true,
  would_save: report.errors.length === 0,
  errors: report.errors,
  warnings: report.warnings,
});

/** Refuses a save that would break playback, listing every problem at once. */
export function assertPlays(report: DryRunReport): void {
  if (report.errors.length === 0) return;
  throw new ToolError(
    `Not saved: the tour would break when it plays.\n${report.errors
      .map((e) => `- ${e.message}`)
      .join('\n')}\nFix these and save again; dry_run checks without saving.`
  );
}

/** Checks the category and works out who a new Help Center item is shown to and where it goes. */
async function helpPlacement(ctx: ToolContext, placement: HelpCenterPlacement) {
  const [categories, scope, order] = await Promise.all([
    loadCategories(ctx),
    helpCenterScope(ctx),
    nextOrder(ctx.db, placement.category_id),
  ]);
  if (!categories.some((c) => c.id === placement.category_id))
    throw new ToolError(
      `help_center.category_id "${placement.category_id}" is not a Help Center category. Use one of: ${categories.map((c) => c.id).join(', ')}.`
    );
  return { ...scope, order };
}

/** Moves the tour's Help Center item to the new placement, or adds a hidden one. */
async function helpItemWrite(
  ctx: ToolContext,
  set: GlSet,
  placement: HelpCenterPlacement
): Promise<(batch: admin.firestore.WriteBatch, saved: GlSet) => void> {
  const help = await helpPlacement(ctx, placement);
  const found = await ctx.db
    .collection(HELP_RESOURCES)
    .where('setId', '==', set.id)
    .limit(1)
    .get();
  const now = Date.now();
  if (!found.empty) {
    const ref = found.docs[0].ref;
    const moved = found.docs[0].get('categoryId') !== placement.category_id;
    return (batch) =>
      batch.update(ref, {
        categoryId: placement.category_id,
        widgetTypes: [...new Set(placement.widget_types ?? [])],
        ...(moved ? { order: help.order } : {}),
        updatedAt: now,
      });
  }
  const id = randomUUID();
  return (batch, saved) =>
    batch.create(
      ctx.db.doc(`${HELP_RESOURCES}/${id}`),
      buildHelpItem(placement, saved, {
        id,
        uid: ctx.uid,
        email: ctx.email,
        orgId: help.orgId,
        order: help.order,
        now,
      })
    );
}

const narrationNote = (failed: readonly string[]) =>
  failed.length
    ? {
        narration_failed: failed,
        narration_note:
          'These steps have no new narration; saving them again retries it.',
      }
    : {};

/** Generated narration for each step whose words changed; never fails the save. */
async function narrate(ctx: ToolContext, steps: GlSet['steps']) {
  try {
    return await narrateTourSteps(steps, await narrationDeps(ctx));
  } catch (err) {
    console.warn('[live tour] narration unavailable', err);
    return { steps: [...steps], failed: unnarratedIds(steps) };
  }
}

export function registerLiveTourTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'get_live_tour_guide',
    {
      title: 'Read the live tour guide',
      description:
        'Admins only. How to write a live tour that needs no editing: finding the path to each control, staging, Autopilot, voice, checks and the hand-back. Read it before create_live_tour or update_live_tour.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run('get_live_tour_guide', ctx, async () => {
        await assertAccess(ctx, 'building');
        return { guide: LIVE_TOUR_GUIDE };
      })
  );

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
        'Admins only. Creates a live tour that walks a teacher through the real SpartBoard board, one step per control. Read get_live_tour_guide first. Every step needs a tour binding (list_tour_anchors); an opening or closing step observes "board.whole". The tour is checked the way playback will meet it: problems that would break it refuse the save, others come back as warnings; pass dry_run to check without saving. Saved as an unpublished draft: pass help_center to also add it to the Help Center, hidden until an admin test-runs it, publishes it in the Studio and shows the item in Admin Settings > Help Center.',
      inputSchema: {
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        ...setupInputs,
        help_center: helpCenterInput,
        steps: z.array(tourStep).min(1).max(MAX_STEPS),
        dry_run: dryRunInput,
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_live_tour', ctx, async () => {
        const placement = input.help_center;
        const steps = input.steps.map((s) => toStepInput(s));
        const materialsDraft = (input.materials ?? []).map((m) => ({
          ...m,
          id: m.id ?? '',
        }));
        const draftSetup = buildTourSetup(
          input,
          materialsDraft.length ? materialsDraft : undefined
        );
        const report = checkTour(
          validateCreate({ ...input, kind: 'live_tour', steps }),
          draftSetup
        );
        if (input.dry_run) return dryRunResult(report);
        assertPlays(report);
        let help: {
          orgId: string | null;
          label: string;
          order: number;
        } | null = null;
        if (placement) {
          await assertAccess(ctx, 'help_center');
          help = await helpPlacement(ctx, placement);
        }
        const materials = input.materials
          ? await buildMaterials(ctx, input.materials)
          : undefined;
        const helpItemId = randomUUID();
        const saved = await saveNewSet(
          ctx,
          {
            ...input,
            steps,
            kind: 'live_tour',
            source: 'building',
            tour_setup: buildTourSetup(input, materials),
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
        const voiced = await narrate(ctx, saved.set.steps);
        const changed = voiced.steps.filter((s, i) => s !== saved.set.steps[i]);
        if (changed.length) {
          // The tour is already saved, so a failed audio write is reported, not thrown.
          await ctx.db
            .doc(`${BUILDING}/${saved.set.id}`)
            .update({ steps: voiced.steps })
            .catch((err: unknown) => {
              console.warn('[live tour] narration write failed', err);
              voiced.failed.push(...changed.map((s) => s.id));
            });
        }
        return {
          ...savedSummary(saved),
          ...needsAnchors(saved.set.steps),
          ...narrationNote(voiced.failed),
          where_to_find_it: help
            ? 'SpartBoard > Admin Settings > Help Center (hidden)'
            : 'SpartBoard > Guided Learning widget > library, building sets',
          ...(help
            ? { help_item_id: helpItemId, help_item_shown_to: help.label }
            : {}),
          ...(report.warnings.length ? { warnings: report.warnings } : {}),
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
        'Admins only. Edits a live tour; only passed fields change. To change only wording, pass step_text, which leaves every other step and field as stored. `steps` replaces the whole list in play order: send every step to keep, with its id, as get_live_tour returned it; use it to add, remove, reorder or rebind steps. The result is checked like create_live_tour: problems that would break playback refuse the save, others come back as warnings; dry_run checks without saving. Thumbnails and narration are kept. Saves the draft only: teachers keep the published tour until an admin opens the tour in SpartBoard and publishes the changes.',
      inputSchema: {
        set_id: z.string().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        ...setupInputs,
        help_center: helpCenterInput,
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
        dry_run: dryRunInput,
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
        const prior = (set.tourSetup ?? {}) as Partial<StoredTourSetup>;
        if (input.tour_widgets)
          validateWidgetTypes('tour_widgets', input.tour_widgets);
        if (input.help_center?.widget_types)
          validateWidgetTypes(
            'help_center.widget_types',
            input.help_center.widget_types
          );
        const draftMaterials = input.materials?.map((m): StoredMaterial => ({
          ...m,
          id: m.id ?? '',
        }));
        const report = checkTour(
          next.steps,
          buildTourSetup(input, draftMaterials, prior)
        );
        if (input.dry_run) return dryRunResult(report);
        assertPlays(report);
        const materials = input.materials
          ? await buildMaterials(ctx, input.materials, prior.materials)
          : undefined;
        next.tourSetup = buildTourSetup(input, materials, prior);
        const placement = input.help_center;
        let stageHelp:
          | ((batch: admin.firestore.WriteBatch, saved: GlSet) => void)
          | undefined;
        if (placement) {
          await assertAccess(ctx, 'help_center');
          stageHelp = await helpItemWrite(ctx, set, placement);
          next.helpCenter = true;
        }
        await reserveWrite(ctx);
        const voiced = await narrate(ctx, next.steps);
        next.steps = voiced.steps;
        const saved = await saveSet(
          ctx,
          loaded,
          next,
          'update',
          requests,
          stageHelp
        );
        return {
          ...saved,
          ...needsAnchors(next.steps),
          ...narrationNote(voiced.failed),
          ...(report.warnings.length ? { warnings: report.warnings } : {}),
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
  server.registerTool(
    'start_live_tour_picture_upload',
    {
      title: 'Upload live tour step pictures',
      description:
        "Admins only, Claude Code only. Returns a ticket, good for 30 minutes, for scripts/run-live-tour.mjs, which plays the tour on the dev board and posts each step's picture to upload_url as its thumbnail. Run: node scripts/run-live-tour.mjs <tour.json> --upload <upload_url> --ticket <ticket>.",
      inputSchema: { set_id: z.string().min(1) },
      annotations: CREATES,
    },
    ({ set_id }) =>
      run('start_live_tour_picture_upload', ctx, async () => {
        await assertAccess(ctx, 'building');
        const { set } = await loadTour(ctx, set_id);
        return {
          set_id,
          steps: set.steps.length,
          ...(await issuePictureTicket(ctx, set_id)),
        };
      })
  );
}
