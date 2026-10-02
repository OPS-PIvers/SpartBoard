// Guided Learning tools: read, view and edit the teacher's sets, and building and Help Center sets for admins.
import * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GL_FEATURE_ID, PAGE_SIZE } from './config';
import {
  ToolError,
  logActivity,
  reserveWrite,
  snapshotRevision,
  type ToolContext,
} from './activity';
import {
  driveTokenFor,
  readDriveBytes,
  readDriveJson,
  replaceDriveJson,
} from './drive';
import { TOUR_ANCHOR_LIST } from './tourAnchorList';
import { OVERWRITES, READ_ONLY, iso, run } from './toolKit';

const KNOWN_ANCHORS = new Set(TOUR_ANCHOR_LIST.map((a) => a.id));

type Source = 'mine' | 'building';
type Step = Record<string, unknown> & { id: string; imageIndex: number };
export interface GlSet extends Record<string, unknown> {
  id: string;
  title: string;
  imageUrls: string[];
  steps: Step[];
  mode: string;
  schemaVersion?: number;
  updatedAt: number;
}

const PERSONAL = 'guided_learning';
const BUILDING = 'building_guided_learning';
export const MAX_STEPS = 200;
/** Raw bytes; base64 adds a third and Claude caps an image near 5 MB. */
export const MAX_SLIDE_BYTES = 3_500_000;
const MAX_DOC_BYTES = 900_000;
const MAX_SCAN = 500;
// Step media that points at files the set owns; carried from the stored step, never taken from Claude.
const CARRIED_FIELDS = [
  'audioStoragePath',
  'videoStoragePath',
  'narration',
  'targets',
] as const;
const CALLOUT_STYLE_FIELDS = [
  'calloutWidthPct',
  'calloutScale',
  'calloutTone',
] as const;
const BOX_REPLACED_FIELDS = [
  'calloutPin',
  'calloutWidthPct',
  'calloutScale',
  'tooltipPosition',
  'tooltipOffset',
] as const;
const EDGE_SLACK = 0.01;

const pct = z.number().min(0).max(100);
const prop = z.number().min(-0.01).max(1.01);
const https = z
  .string()
  .max(2000)
  .regex(/^https:\/\//, 'must be an https URL');
const layout = z
  .object({
    slot: z.number().int().min(0).max(20),
    type: z.string().min(1).max(60),
    xProp: prop,
    yProp: prop,
    wProp: prop,
    hProp: prop,
    aspectRatio: z.number().positive().optional(),
  })
  .strict();
const keyframe = layout.omit({ type: true, aspectRatio: true });

export const stepInput = z
  .object({
    id: z.string().trim().min(1).max(100),
    xPct: pct,
    yPct: pct,
    imageIndex: z.number().int().min(0),
    label: z.string().max(100).optional(),
    interactionType: z.enum([
      'tooltip',
      'text-popover',
      'pan-zoom',
      'spotlight',
      'pan-zoom-spotlight',
      'audio',
      'video',
      'question',
    ]),
    text: z.string().max(1000).optional(),
    hideStepNumber: z.boolean().optional(),
    hotspotAlwaysHidden: z.boolean().optional(),
    showOverlay: z.enum(['none', 'popover', 'tooltip', 'banner']).optional(),
    tooltipPosition: z
      .enum(['above', 'below', 'left', 'right', 'auto'])
      .optional(),
    tooltipOffset: z.number().min(-200).max(200).optional(),
    panZoomScale: z.number().min(1.5).max(6).optional(),
    spotlightRadius: z.number().min(5).max(50).optional(),
    bannerTone: z.enum(['blue', 'red', 'neutral']).optional(),
    autoAdvanceDuration: z.number().min(0).max(600).optional(),
    audioUrl: https.optional(),
    videoUrl: https.optional(),
    region: z
      .object({
        shape: z.enum(['rect', 'ellipse', 'polygon']),
        wPct: z.number().gt(0).max(100),
        hPct: z.number().gt(0).max(100),
        cornerPct: z.number().min(0).max(50).optional(),
        points: z
          .array(z.object({ x: pct, y: pct }).strict())
          .min(3)
          .max(24)
          .optional(),
      })
      .strict()
      .optional(),
    calloutPin: z.object({ xPct: pct, yPct: pct }).strict().optional(),
    calloutWidthPct: z.number().min(10).max(95).optional(),
    calloutScale: z.number().min(0.75).max(2).optional(),
    calloutTone: z.enum(['light', 'accent']).optional(),
    calloutBox: z
      .object({
        xPct: z.number().min(-500).max(500),
        yPct: z.number().min(-500).max(500),
        wPct: z.number().min(1).max(500),
        hPct: z.number().min(1).max(500),
      })
      .strict()
      .optional(),
    cursor: z.object({ hide: z.boolean().optional() }).strict().optional(),
    question: z
      .object({
        type: z.enum(['multiple-choice', 'matching', 'sorting']),
        text: z.string().trim().min(1).max(500),
        choices: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
        correctAnswer: z.string().max(300).optional(),
        matchingPairs: z
          .array(
            z
              .object({
                left: z.string().trim().min(1).max(300),
                right: z.string().trim().min(1).max(300),
              })
              .strict()
          )
          .max(12)
          .optional(),
        sortingItems: z
          .array(z.string().trim().min(1).max(300))
          .max(12)
          .optional(),
      })
      .strict()
      .optional(),
    tour: z
      .object({
        anchor: z.string().max(200),
        action: z.enum(['click', 'observe']),
        fallback: z
          .object({
            role: z.string().min(1).max(40),
            name: z.string().min(1).max(200),
          })
          .strict()
          .optional(),
        teacherMustClick: z.boolean().optional(),
        slot: z.number().int().min(0).max(20).optional(),
        spawns: layout.optional(),
        layoutKeyframes: z.array(keyframe).min(1).max(20).optional(),
      })
      .strict()
      .optional(),
    aiDraft: z.boolean().optional(),
  })
  .strict();
export type StepInput = z.infer<typeof stepInput>;

const hasCallout = (s: StepInput) =>
  s.interactionType === 'tooltip' ||
  s.interactionType === 'text-popover' ||
  (['pan-zoom', 'spotlight', 'pan-zoom-spotlight'].includes(
    s.interactionType
  ) &&
    (s.showOverlay === 'popover' || s.showOverlay === 'tooltip'));

const isStorageUrl = (url: string) => {
  try {
    return new URL(url).hostname === 'firebasestorage.googleapis.com';
  } catch {
    return false;
  }
};

/** Checks the edited steps against the importer's rules and merges in media the stored steps own. */
export function mergeSteps(
  existing: readonly Step[],
  input: readonly StepInput[],
  slideCount: number
): Step[] {
  if (input.length === 0)
    throw new ToolError('steps must have at least one step.');
  if (input.length > MAX_STEPS)
    throw new ToolError(`A set holds at most ${MAX_STEPS} steps.`);
  const byId = new Map(existing.map((s) => [s.id, s]));
  const seen = new Set<string>();
  return input.map((s, i) => {
    const at = `steps[${i}]`;
    if (seen.has(s.id))
      throw new ToolError(`${at}.id "${s.id}" is used twice.`);
    seen.add(s.id);
    if (s.imageIndex >= slideCount) {
      throw new ToolError(
        `${at}.imageIndex ${s.imageIndex} is past the last slide (${slideCount - 1}). Slides can't be added here.`
      );
    }
    if (s.text !== undefined) {
      const parts = s.text.split('\n\n');
      if (
        parts.length > 2 ||
        parts.some((p) => !p.trim() || p.includes('\n'))
      ) {
        throw new ToolError(
          `${at}.text must be one paragraph, or two separated by one blank line.`
        );
      }
    }
    if (s.region) {
      const halfW = s.region.wPct / 2;
      const halfH = s.region.hPct / 2;
      if (
        s.xPct - halfW < -EDGE_SLACK ||
        s.xPct + halfW > 100 + EDGE_SLACK ||
        s.yPct - halfH < -EDGE_SLACK ||
        s.yPct + halfH > 100 + EDGE_SLACK
      ) {
        throw new ToolError(`${at}.region extends outside the slide.`);
      }
      if ((s.region.shape === 'polygon') !== (s.region.points !== undefined)) {
        throw new ToolError(
          `${at}.region.points is required on a polygon and only allowed there.`
        );
      }
    }
    const styled = CALLOUT_STYLE_FIELDS.some((k) => s[k] !== undefined);
    if ((styled || s.calloutBox) && !hasCallout(s)) {
      throw new ToolError(
        `${at}: callout size, tone and box apply only to steps that show a callout.`
      );
    }
    if (s.calloutBox) {
      const extra = BOX_REPLACED_FIELDS.find((k) => s[k] !== undefined);
      if (extra)
        throw new ToolError(
          `${at}.${extra}: leave it out when calloutBox is set.`
        );
    }
    if (s.bannerTone && s.showOverlay !== 'banner')
      throw new ToolError(`${at}.bannerTone needs showOverlay "banner".`);
    if (s.interactionType === 'question') {
      const q = s.question;
      if (!q)
        throw new ToolError(`${at}.question is required on a question step.`);
      if (
        q.type === 'multiple-choice' &&
        (!q.choices ||
          q.choices.length < 2 ||
          !q.choices.includes(q.correctAnswer ?? ''))
      ) {
        throw new ToolError(
          `${at}.question needs at least two choices and a correctAnswer that is one of them.`
        );
      }
      if (q.type === 'matching' && (q.matchingPairs?.length ?? 0) < 2)
        throw new ToolError(`${at}.question needs at least two matchingPairs.`);
      if (q.type === 'sorting' && (q.sortingItems?.length ?? 0) < 2)
        throw new ToolError(`${at}.question needs at least two sortingItems.`);
    }
    if (s.tour && s.tour.anchor === '' && !s.tour.fallback) {
      throw new ToolError(
        `${at}.tour: an empty anchor needs a fallback role and name.`
      );
    }
    const prior = byId.get(s.id);
    const anchorId = s.tour?.anchor.split(/[:#]/)[0];
    const priorAnchor = (prior?.tour as { anchor?: unknown } | undefined)
      ?.anchor;
    if (
      anchorId &&
      !KNOWN_ANCHORS.has(anchorId) &&
      priorAnchor !== s.tour?.anchor
    ) {
      throw new ToolError(
        `${at}.tour.anchor "${anchorId}" is not a SpartBoard tour anchor. Use list_tour_anchors, or an empty anchor with a fallback.`
      );
    }
    const merged: Step = { ...s };
    for (const key of ['audioUrl', 'videoUrl'] as const) {
      const url = s[key];
      if (url && isStorageUrl(url) && url !== prior?.[key]) {
        throw new ToolError(
          `${at}.${key}: only a link already on this step or an outside https link can be used.`
        );
      }
    }
    if (prior) {
      for (const key of CARRIED_FIELDS) {
        if (prior[key] !== undefined) merged[key] = prior[key];
      }
      // A replaced media link no longer owns the uploaded file.
      if (s.audioUrl !== prior.audioUrl) delete merged.audioStoragePath;
      if (s.videoUrl !== prior.videoUrl) delete merged.videoStoragePath;
    }
    return merged;
  });
}

/** The app's stamp: 5 with a callout box, 4 with callout size or tone, else 3. */
export function requiredSchemaVersion(steps: readonly Step[]): number {
  if (steps.some((s) => s.calloutBox !== undefined)) return 5;
  return steps.some((s) => CALLOUT_STYLE_FIELDS.some((k) => s[k] !== undefined))
    ? 4
    : 3;
}

const usesSpotlight = (s: Step) =>
  s.interactionType === 'spotlight' ||
  s.interactionType === 'pan-zoom-spotlight';

/** Steps as Claude sees them: the files a step owns stay server-side. */
function publicStep(step: Step) {
  const out: Record<string, unknown> = { ...step };
  delete out.audioStoragePath;
  delete out.videoStoragePath;
  delete out.targets;
  if (step.narration)
    out.narration = 'kept (regenerate in the Studio after changing this step)';
  return out;
}

async function isAdmin(ctx: ToolContext): Promise<boolean> {
  return (await ctx.db.collection('admins').doc(ctx.email.toLowerCase()).get())
    .exists;
}

async function assertAccess(
  ctx: ToolContext,
  source: Source | 'help_center'
): Promise<void> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  if (
    !(await isGlobalFeatureGranted(ctx.db, GL_FEATURE_ID, ctx.email, ctx.uid))
  ) {
    throw new ToolError(
      'Guided Learning editing through Claude is not turned on for this account yet.'
    );
  }
  if (source !== 'mine' && !(await isAdmin(ctx))) {
    throw new ToolError(
      'Only SpartBoard admins can read or edit building and Help Center sets.'
    );
  }
}

interface Loaded {
  set: GlSet;
  source: Source;
  driveFileId?: string;
  updateTime?: admin.firestore.Timestamp;
}

export async function loadSet(
  ctx: ToolContext,
  source: Source,
  setId: string
): Promise<Loaded> {
  if (source === 'building') {
    const snap = await ctx.db.doc(`${BUILDING}/${setId}`).get();
    if (!snap.exists)
      throw new ToolError(
        'That set was not found. Use list_guided_learning with source "building" or "help_center".'
      );
    return {
      set: { ...(snap.data() as GlSet), id: setId },
      source,
      updateTime: snap.updateTime,
    };
  }
  const meta = await ctx.db.doc(`users/${ctx.uid}/${PERSONAL}/${setId}`).get();
  const driveFileId = meta.get('driveFileId') as unknown;
  if (!meta.exists || typeof driveFileId !== 'string' || !driveFileId) {
    throw new ToolError(
      'That set was not found. Use list_guided_learning to find its id.'
    );
  }
  const set = (await readDriveJson(
    await driveTokenFor(ctx.uid),
    driveFileId
  )) as GlSet;
  if (!set || !Array.isArray(set.steps) || !Array.isArray(set.imageUrls)) {
    throw new ToolError("That set's file in Google Drive can't be read.");
  }
  return {
    set: { ...set, id: setId },
    source,
    driveFileId,
    updateTime: meta.updateTime,
  };
}

function fullSet(loaded: Loaded) {
  const { set } = loaded;
  return {
    set_id: set.id,
    source: loaded.source,
    help_center: set.helpCenter === true,
    title: set.title,
    description: set.description ?? '',
    mode: set.mode,
    welcome_enabled: set.welcomeEnabled === true,
    welcome_message: set.welcomeMessage ?? '',
    schema_version: set.schemaVersion ?? 1,
    slide_count: set.imageUrls.length,
    slide_kinds: set.imageKinds ?? set.imageUrls.map(() => 'image'),
    tour_setup: set.tourSetup ?? null,
    updated_at: iso(set.updatedAt),
    steps: set.steps.map(publicStep),
  };
}

const EDITABLE = [
  'title',
  'description',
  'mode',
  'welcomeEnabled',
  'welcomeMessage',
  'steps',
  'schemaVersion',
] as const;

const CONFLICT =
  'Someone saved this set in SpartBoard while Claude was editing it. Fetch it again and redo the change.';

async function saveSet(
  ctx: ToolContext,
  loaded: Loaded,
  next: GlSet,
  action: 'update' | 'restore'
) {
  const now = Date.now();
  const saved: GlSet = { ...next, updatedAt: now, claudeEditedAt: now };
  if (Buffer.byteLength(JSON.stringify(saved)) > MAX_DOC_BYTES)
    throw new ToolError('The edited set is too large to save.');
  const previous: Record<string, unknown> = { source: loaded.source };
  for (const key of EDITABLE)
    if (loaded.set[key] !== undefined) previous[key] = loaded.set[key];
  const batch = ctx.db.batch();
  const revisionId = snapshotRevision(ctx, batch, {
    itemType: 'guided_learning',
    itemId: saved.id,
    title: loaded.set.title,
    data: previous,
  });
  logActivity(ctx, batch, {
    action,
    itemType: 'guided_learning',
    itemId: saved.id,
    title: saved.title,
    revisionId,
  });
  const changed: Record<string, unknown> = {
    updatedAt: now,
    claudeEditedAt: now,
  };
  for (const key of EDITABLE)
    changed[key] = saved[key] ?? admin.firestore.FieldValue.delete();
  if (loaded.source === 'building') {
    // Fails if the set changed since it was read, so a Studio save in between is never overwritten.
    batch.update(ctx.db.doc(`${BUILDING}/${saved.id}`), changed, {
      lastUpdateTime: loaded.updateTime,
    });
    try {
      await batch.commit();
    } catch (err) {
      if ((err as { code?: number }).code === 9) throw new ToolError(CONFLICT);
      throw err;
    }
  } else {
    const metaRef = ctx.db.doc(`users/${ctx.uid}/${PERSONAL}/${saved.id}`);
    const current = await metaRef.get();
    if (
      !current.updateTime?.isEqual(
        loaded.updateTime as admin.firestore.Timestamp
      )
    )
      throw new ToolError(CONFLICT);
    // The previous version is kept before the Drive file changes, so a failed save can still be undone.
    await batch.commit();
    await replaceDriveJson(
      await driveTokenFor(ctx.uid),
      loaded.driveFileId as string,
      saved
    );
    await metaRef.set(
      {
        title: saved.title,
        description: saved.description ?? admin.firestore.FieldValue.delete(),
        mode: saved.mode,
        stepCount: saved.steps.length,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  return {
    set_id: saved.id,
    title: saved.title,
    step_count: saved.steps.length,
    previous_version_revision_id: revisionId,
    note:
      loaded.source === 'building'
        ? 'Saved. A published live tour keeps its old steps until it is republished in the Studio.'
        : 'Saved. Open it in the Guided Learning Studio to check placement.',
  };
}

function applyEdit(loaded: Loaded, input: EditInput): GlSet {
  const { set } = loaded;
  const steps = input.steps
    ? mergeSteps(set.steps, input.steps, set.imageUrls.length)
    : set.steps;
  if (
    input.steps &&
    (set.schemaVersion ?? 1) < 2 &&
    steps.some(usesSpotlight)
  ) {
    throw new ToolError(
      'This set uses an older spotlight format. Open it once in SpartBoard and save it, then edit it here.'
    );
  }
  const next: GlSet = {
    ...set,
    title: input.title ?? set.title,
    mode: input.mode ?? set.mode,
    steps,
    schemaVersion: input.steps
      ? requiredSchemaVersion(steps)
      : set.schemaVersion,
  };
  if (input.description !== undefined)
    next.description = input.description || undefined;
  if (input.welcome_enabled !== undefined)
    next.welcomeEnabled = input.welcome_enabled;
  if (input.welcome_message !== undefined)
    next.welcomeMessage = input.welcome_message || undefined;
  return next;
}

interface EditInput {
  title?: string;
  description?: string;
  mode?: 'structured' | 'guided' | 'explore';
  welcome_enabled?: boolean;
  welcome_message?: string;
  steps?: StepInput[];
}

/** restore_revision for Guided Learning; called from tools.ts. */
export async function restoreGuidedLearningRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  const data = rev.get('data') as Record<string, unknown>;
  const source: Source = data.source === 'building' ? 'building' : 'mine';
  await assertAccess(ctx, source);
  const loaded = await loadSet(ctx, source, String(rev.get('itemId')));
  const steps = (data.steps as Step[] | undefined) ?? loaded.set.steps;
  if (steps.some((s) => s.imageIndex >= loaded.set.imageUrls.length)) {
    throw new ToolError(
      "The set's slides changed since that version, so it can't be restored here. Restore it in SpartBoard."
    );
  }
  await reserveWrite(ctx);
  const next: GlSet = { ...loaded.set, steps };
  for (const key of EDITABLE)
    if (key !== 'steps') next[key] = data[key] as never;
  return saveSet(ctx, loaded, next, 'restore');
}

// Guided Learning slides upload to the uploader's hotspot_images folder; building sets may hold any admin's.
export function glSlideStoragePath(
  url: URL,
  bucketName: string,
  uid: string,
  source: 'mine' | 'building'
): string {
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/?#]+)$/.exec(url.pathname);
  const path = match ? decodeURIComponent(match[2]) : '';
  const owner = source === 'mine' ? uid : '[^/]+';
  if (
    match?.[1] !== bucketName ||
    path.split('/').some((part) => part === '..' || part === '.') ||
    !new RegExp(`^users/${owner}/hotspot_images/[^/]+$`).test(path)
  )
    throw new ToolError('That slide is stored somewhere Claude cannot read.');
  return path;
}

async function slideBytes(
  ctx: ToolContext,
  url: string,
  source: 'mine' | 'building'
): Promise<{ data: Buffer; mimeType: string }> {
  const data = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(url);
  if (data) return { data: Buffer.from(data[2], 'base64'), mimeType: data[1] };
  const parsed = new URL(url);
  if (parsed.hostname === 'firebasestorage.googleapis.com') {
    const bucket = admin.storage().bucket();
    const file = bucket.file(
      glSlideStoragePath(parsed, bucket.name, ctx.uid, source)
    );
    const [meta] = await file.getMetadata();
    const mimeType = String(meta.contentType ?? '');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mimeType))
      throw new ToolError('That slide is not an image Claude can show.');
    const [bytes] = await file.download();
    return { data: bytes, mimeType };
  }
  const driveId =
    parsed.hostname === 'lh3.googleusercontent.com'
      ? /^\/d\/([^/?#=]+)/.exec(parsed.pathname)?.[1]
      : undefined;
  if (driveId) return readDriveBytes(await driveTokenFor(ctx.uid), driveId);
  throw new ToolError('That slide is stored somewhere Claude cannot read.');
}

export function registerGuidedLearningTools(
  server: McpServer,
  ctx: ToolContext
): void {
  const sourceInput = z
    .enum(['mine', 'building'])
    .default('mine')
    .describe('"building" for building and Help Center sets (admins only).');

  server.registerTool(
    'list_guided_learning',
    {
      title: 'List Guided Learning sets',
      description: `Lists Guided Learning sets, newest first, ${PAGE_SIZE} per page. source "help_center" lists the sets the Help Center uses (admins only).`,
      inputSchema: {
        source: z.enum(['mine', 'building', 'help_center']).default('mine'),
        search: z.string().max(100).optional(),
        cursor: z.string().optional().describe('From next_cursor.'),
      },
      annotations: READ_ONLY,
    },
    ({ source, search, cursor }) =>
      run('list_guided_learning', ctx, async () => {
        await assertAccess(ctx, source);
        const path =
          source === 'mine' ? `users/${ctx.uid}/${PERSONAL}` : BUILDING;
        const snap = await ctx.db
          .collection(path)
          .select('title', 'updatedAt', 'helpCenter', 'stepCount', 'mode')
          .limit(MAX_SCAN)
          .get();
        const needle = search?.trim().toLowerCase();
        const all = snap.docs
          .filter(
            (d) => source !== 'help_center' || d.get('helpCenter') === true
          )
          .filter(
            (d) =>
              !needle ||
              String(d.get('title') ?? '')
                .toLowerCase()
                .includes(needle)
          )
          .sort(
            (a, b) =>
              Number(b.get('updatedAt') ?? 0) - Number(a.get('updatedAt') ?? 0)
          );
        const start = Math.max(0, Number(cursor ?? 0) || 0);
        return {
          sets: all.slice(start, start + PAGE_SIZE).map((d) => ({
            set_id: d.id,
            source: source === 'mine' ? 'mine' : 'building',
            title: String(d.get('title') ?? ''),
            help_center: d.get('helpCenter') === true,
            updated_at: iso(d.get('updatedAt')),
          })),
          next_cursor:
            start + PAGE_SIZE < all.length ? String(start + PAGE_SIZE) : null,
        };
      })
  );

  server.registerTool(
    'list_tour_anchors',
    {
      title: 'List live tour anchors',
      description:
        'Lists the SpartBoard controls a live tour step can point at (tour.anchor). Scope "widget type" refs add ":<widgetType>" (dock.item:clock); "field" refs add ":<widgetType>#<fieldKey>". panel anchors appear only once a menu or panel is open, so an earlier step must open it. A control not listed can use anchor "" with a fallback role and accessible name, which works in English only.',
      inputSchema: {
        search: z
          .string()
          .max(100)
          .optional()
          .describe('Matches the id or label, e.g. "assign" or "quiz".'),
      },
      annotations: READ_ONLY,
    },
    ({ search }) =>
      run('list_tour_anchors', ctx, async () => {
        await assertAccess(ctx, 'mine');
        const words = (search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        const anchors = TOUR_ANCHOR_LIST.filter((a) =>
          words.every((w) => `${a.id} ${a.label}`.toLowerCase().includes(w))
        );
        return { count: anchors.length, anchors };
      })
  );

  server.registerTool(
    'get_guided_learning',
    {
      title: 'Get a Guided Learning set',
      description:
        'Returns a set with every step. xPct/yPct and region sizes are % of the slide image. Use get_guided_learning_slide to see a slide before moving a target.',
      inputSchema: { set_id: z.string().min(1), source: sourceInput },
      annotations: READ_ONLY,
    },
    ({ set_id, source }) =>
      run('get_guided_learning', ctx, async () => {
        await assertAccess(ctx, source);
        return fullSet(await loadSet(ctx, source, set_id));
      })
  );

  server.registerTool(
    'get_guided_learning_slide',
    {
      title: 'View a Guided Learning slide',
      description:
        'Returns one slide image and the steps placed on it, so targets and callouts can be checked or moved.',
      inputSchema: {
        set_id: z.string().min(1),
        source: sourceInput,
        slide_index: z.number().int().min(0),
      },
      annotations: READ_ONLY,
    },
    async ({ set_id, source, slide_index }): Promise<CallToolResult> => {
      let image: { data: Buffer; mimeType: string } | null = null;
      const result = await run('get_guided_learning_slide', ctx, async () => {
        await assertAccess(ctx, source);
        const { set } = await loadSet(ctx, source, set_id);
        const url = set.imageUrls[slide_index];
        if (url === undefined)
          throw new ToolError(
            `The set has ${set.imageUrls.length} slides, numbered from 0.`
          );
        const kinds = Array.isArray(set.imageKinds)
          ? (set.imageKinds as unknown[])
          : [];
        if (kinds[slide_index] === 'video')
          throw new ToolError(
            'That slide is a video and cannot be shown here.'
          );
        image = await slideBytes(ctx, url, source);
        if (image.data.length > MAX_SLIDE_BYTES)
          throw new ToolError('That slide image is too large to show here.');
        return {
          slide_index,
          steps_on_this_slide: set.steps.flatMap((s, i) =>
            s.imageIndex === slide_index
              ? [{ number: i + 1, ...publicStep(s) }]
              : []
          ),
        };
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
    'update_guided_learning',
    {
      title: 'Edit a Guided Learning set',
      description:
        'Edits a set; only passed fields change. `steps` replaces the whole list in play order: send every step to keep, with its id. Slides cannot be added or removed. Text is one paragraph, or a second short caveat paragraph after a blank line. A click step on a full-screen slide wants a region and pan-zoom-spotlight.',
      inputSchema: {
        set_id: z.string().min(1),
        source: sourceInput,
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        mode: z.enum(['structured', 'guided', 'explore']).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        steps: z.array(stepInput).min(1).max(MAX_STEPS).optional(),
      },
      annotations: OVERWRITES,
    },
    ({ set_id, source, ...input }) =>
      run('update_guided_learning', ctx, async () => {
        await assertAccess(ctx, source);
        const loaded = await loadSet(ctx, source, set_id);
        const next = applyEdit(loaded, input);
        await reserveWrite(ctx);
        return saveSet(ctx, loaded, next, 'update');
      })
  );
}
