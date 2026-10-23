// Admin-only web tour tools: read recorded drafts and their pictures, and rewrite step titles and tips; never publish.
import * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  ToolError,
  logActivity,
  reserveWrite,
  snapshotRevision,
  type ToolContext,
} from './activity';
import { assertAccess, MAX_SLIDE_BYTES } from './glTools';
import { OVERWRITES, READ_ONLY, iso, run } from './toolKit';
import { isWebTour, isWebTourSnapshot } from './webTours';
import { isHardTextHit, webTourTextHits } from './webTourStudentData';

// Must match components/tours/webTours.ts and functions/src/glTours.ts.
export const WEB_TOURS = 'building_web_tours';
const PICTURES_PREFIX = 'web_tour_pictures';
const SNAPSHOTS = 'building_guided_learning_tours';
export const WEB_TOURS_FEATURE_ID = 'web-tours';
// Tip cap matches MAX_TIP_CHARS in components/tours/web/recorderProtocol.ts; titles match the extension's playback clip.
export const MAX_WEB_TIP = 500;
export const MAX_WEB_STEP_TITLE = 200;
export const MAX_WEB_TOUR_TITLE = 200;
const MAX_WEB_STEPS = 200;

export const WEB_TOUR_TOOLS: ReadonlySet<string> = new Set([
  'list_web_tours',
  'get_web_tour',
  'get_web_tour_step_picture',
  'update_web_tour_text',
]);

const NOT_WEB =
  'That set is not a web tour. Use get_live_tour or get_guided_learning for SpartBoard sets.';
const FIND = 'list_web_tours lists every web tour draft with its set_id.';
const CONFLICT =
  'Someone saved this web tour in SpartBoard while Claude was editing it. Fetch it again and redo the change.';

interface WebLocator {
  role?: unknown;
  name?: unknown;
  text?: unknown;
  heading?: unknown;
  pageTitle?: unknown;
  attrs?: Record<string, unknown>;
}
interface WebBinding {
  urlPattern?: unknown;
  action?: unknown;
  locator?: WebLocator;
  picture?: { path?: unknown; w?: unknown; h?: unknown };
  note?: unknown;
  claudeQuestion?: unknown;
}
export interface WebStep {
  id: string;
  label?: unknown;
  text?: unknown;
  web?: WebBinding;
  [key: string]: unknown;
}
export interface WebTourDoc {
  id: string;
  title?: unknown;
  surface?: unknown;
  steps: WebStep[];
  helpCenter?: unknown;
  updatedAt?: unknown;
  webGoal?: unknown;
  [key: string]: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Admins with Guided Learning through Claude and the web-tours flag. */
export async function assertWebTourAccess(ctx: ToolContext): Promise<void> {
  await assertAccess(ctx, 'building');
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  if (
    !(await isGlobalFeatureGranted(
      ctx.db,
      WEB_TOURS_FEATURE_ID,
      ctx.email,
      ctx.uid
    ))
  )
    throw new ToolError('Web tours are not turned on for this account yet.');
}

/** True when a path is a picture file inside this set's own folder. */
export function isWebTourPicturePath(setId: string, path: string): boolean {
  const prefix = `${PICTURES_PREFIX}/${setId}/`;
  return (
    setId.length > 0 &&
    !setId.includes('/') &&
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.slice(prefix.length).includes('/')
  );
}

const sortKeys = (_key: string, value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      )
    : value;

/** What teachers see of a web tour; the goal, notes and Claude's questions never count. */
export function publishedFingerprint(set: unknown): string | null {
  const s = (set ?? {}) as Record<string, unknown>;
  if (!Array.isArray(s.steps)) return null;
  const steps = (s.steps as WebStep[]).map((step) => {
    const web: WebBinding | undefined = step.web ? { ...step.web } : undefined;
    delete web?.note;
    delete web?.claudeQuestion;
    return { id: step.id, label: str(step.label), text: str(step.text), web };
  });
  return JSON.stringify(
    {
      title: str(s.title),
      webPicturesChecked: s.webPicturesChecked ?? null,
      steps,
    },
    sortKeys
  );
}

export interface PublishedWebTour {
  at: number;
  set: unknown;
}

/** Changed only when the draft was saved after publishing and what teachers see differs. */
export function publishState(
  draft: { updatedAt?: unknown; [key: string]: unknown },
  published: PublishedWebTour | null
): 'draft' | 'published' | 'changed' {
  if (published === null) return 'draft';
  if (typeof draft.updatedAt !== 'number' || draft.updatedAt <= published.at)
    return 'published';
  const now = publishedFingerprint(draft);
  return now !== null && now === publishedFingerprint(published.set)
    ? 'published'
    : 'changed';
}

const ATTR_KEYS = ['testId', 'ariaLabel', 'name', 'href'] as const;

/** A step as Claude sees it: words, action, address, the readable clues and the admin's note; never the CSS or box. */
export function publicWebStep(step: WebStep, index: number) {
  const web = step.web;
  const loc = web?.locator ?? {};
  const locator: Record<string, string | Record<string, string>> = {};
  for (const key of ['role', 'name', 'text', 'heading', 'pageTitle'] as const)
    if (str(loc[key])) locator[key] = str(loc[key]);
  const attrs: Record<string, string> = {};
  for (const key of ATTR_KEYS)
    if (str(loc.attrs?.[key])) attrs[key] = str(loc.attrs?.[key]);
  if (Object.keys(attrs).length) locator.attrs = attrs;
  const note = str(web?.note);
  const question = str(web?.claudeQuestion);
  return {
    id: step.id,
    number: index + 1,
    title: str(step.label),
    tip: str(step.text),
    action: web ? str(web.action) || null : null,
    url_pattern: web ? str(web.urlPattern) : null,
    locator,
    has_picture: typeof web?.picture?.path === 'string',
    ...(note ? { note } : {}),
    ...(question ? { question } : {}),
  };
}

export async function loadWebTour(ctx: ToolContext, setId: string) {
  if (!setId || setId.includes('/'))
    throw new ToolError(`No web tour has that set_id. ${FIND}`);
  const snap = await ctx.db.collection(WEB_TOURS).doc(setId).get();
  if (!snap.exists) {
    const other = await ctx.db.doc(`building_guided_learning/${setId}`).get();
    throw new ToolError(
      other.exists ? NOT_WEB : `No web tour has that set_id. ${FIND}`
    );
  }
  const data = snap.data() as Omit<WebTourDoc, 'id'>;
  const set: WebTourDoc = {
    ...data,
    id: setId,
    steps: Array.isArray(data.steps) ? (data.steps as WebStep[]) : [],
  };
  if (!isWebTour(set)) throw new ToolError(NOT_WEB);
  return { set, updateTime: snap.updateTime };
}

async function publishedOf(
  ctx: ToolContext,
  setId: string
): Promise<PublishedWebTour | null> {
  const snap = await ctx.db.collection(SNAPSHOTS).doc(setId).get();
  if (!snap.exists || !isWebTourSnapshot(snap.data())) return null;
  const at: unknown = snap.get('publishedAt');
  return { at: typeof at === 'number' ? at : 0, set: snap.get('set') };
}

export interface TextEdit {
  id: string;
  title?: string;
  tip?: string;
}

/** Copies the steps with only the named titles and tips changed; refuses student data, unknown or repeated ids. */
export function applyWebStepText(
  steps: readonly WebStep[],
  edits: readonly TextEdit[]
): { steps: WebStep[]; warnings: string[] } {
  const byId = new Map(edits.map((e) => [e.id, e]));
  if (byId.size !== edits.length)
    throw new ToolError('steps names a step twice.');
  const known = new Set(steps.map((s) => s.id));
  const missing = edits.find((e) => !known.has(e.id));
  if (missing)
    throw new ToolError(
      `No step has id "${missing.id}". Use the ids get_web_tour returns.`
    );
  const warnings: string[] = [];
  const next = steps.map((step, i) => {
    const edit = byId.get(step.id);
    if (!edit) return step;
    const out: WebStep = { ...step };
    // Words written for the step answer Claude's question on it.
    if (out.web && (edit.title?.trim() || edit.tip?.trim())) {
      out.web = { ...out.web };
      delete out.web.claudeQuestion;
    }
    for (const [field, key] of [
      ['title', 'label'],
      ['tip', 'text'],
    ] as const) {
      const value = edit[field];
      if (value === undefined) continue;
      const clean = value.trim();
      checkText(`Step ${i + 1} ${field}`, clean, warnings);
      out[key] = clean;
    }
    return out;
  });
  return { steps: next, warnings };
}

/** Throws on emails, id numbers or uuids, as the publish check would; a possible name only warns. */
export function checkText(at: string, text: string, warnings: string[]) {
  const hits = [...webTourTextHits(text)];
  const hard = hits.filter(isHardTextHit);
  if (hard.length)
    throw new ToolError(
      `${at} looks like it holds student data (${hard.join(', ')}). Write it without names, emails or id numbers.`
    );
  if (hits.length)
    warnings.push(
      `${at} has something that looks like a "Last, First" name; check it is not a student.`
    );
}

/** Saves a new title and step words, keeping the old words as a revision; fails if the draft changed since it was read. */
async function saveWebText(
  ctx: ToolContext,
  loaded: Awaited<ReturnType<typeof loadWebTour>>,
  title: string,
  steps: WebStep[],
  action: 'update' | 'restore'
) {
  const { set, updateTime } = loaded;
  const batch = ctx.db.batch();
  const revisionId = snapshotRevision(ctx, batch, {
    itemType: 'guided_learning',
    itemId: set.id,
    title: str(set.title),
    data: {
      source: 'web',
      title: str(set.title),
      steps: set.steps.map((s) => ({
        id: s.id,
        label: str(s.label),
        text: str(s.text),
      })),
    },
  });
  logActivity(ctx, batch, {
    action,
    itemType: 'guided_learning',
    itemId: set.id,
    title,
    revisionId,
  });
  batch.update(
    ctx.db.collection(WEB_TOURS).doc(set.id),
    { title, steps, updatedAt: Date.now() },
    { lastUpdateTime: updateTime }
  );
  try {
    await batch.commit();
  } catch (err) {
    if ((err as { code?: number }).code === 9) throw new ToolError(CONFLICT);
    throw err;
  }
  return { revisionId };
}

/** True for a revision update_web_tour_text kept. */
export const isWebTourRevision = (rev: admin.firestore.DocumentSnapshot) =>
  (rev.get('data') as { source?: unknown } | undefined)?.source === 'web';

/** Puts back a revision's tour title and step words; steps recorded since keep theirs. */
export async function restoreWebTourRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  await assertWebTourAccess(ctx);
  const data = rev.get('data') as {
    title?: unknown;
    steps?: { id?: unknown; label?: unknown; text?: unknown }[];
  };
  const loaded = await loadWebTour(ctx, String(rev.get('itemId')));
  const known = new Set(loaded.set.steps.map((s) => s.id));
  const edits = (Array.isArray(data.steps) ? data.steps : []).flatMap((s) =>
    typeof s.id === 'string' && known.has(s.id)
      ? [{ id: s.id, title: str(s.label), tip: str(s.text) }]
      : []
  );
  const title = str(data.title) || str(loaded.set.title);
  const edited = applyWebStepText(loaded.set.steps, edits);
  await reserveWrite(ctx);
  const saved = await saveWebText(ctx, loaded, title, edited.steps, 'restore');
  return {
    set_id: loaded.set.id,
    title,
    previous_version_revision_id: saved.revisionId,
    note: 'Restored the titles and tips as a draft; publishing stays with the admin in SpartBoard.',
  };
}

const STEP_LIST =
  "Each step: id, number, title, tip, action (click, type, select or observe), url_pattern (the page it plays on, ids as *), locator (the role, name, text, nearby heading, page title and stable attrs it finds its control by), has_picture, and when set the admin's private note for Claude (note, never shown to teachers) and the question SpartBoard's Write with Claude left on the step (question). goal is what the admin said the tour explains.";

export function registerWebTourTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'list_web_tours',
    {
      title: 'List web tours',
      description:
        'Admins only. Lists the web tour drafts admins recorded with the SpartBoard Chrome extension, newest first. Web tours play on other websites, so the live tour tools do not open them; use get_web_tour. publish_state is "draft" (never published), "published" or "changed" (saved since the last publish).',
      inputSchema: {
        search: z
          .string()
          .max(100)
          .optional()
          .describe('Words that must all appear in the title.'),
      },
      annotations: READ_ONLY,
    },
    ({ search }) =>
      run('list_web_tours', ctx, async () => {
        await assertWebTourAccess(ctx);
        const words = (search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        const snap = await ctx.db
          .collection(WEB_TOURS)
          .select(
            'title',
            'updatedAt',
            'helpCenter',
            'steps',
            'surface',
            'webPicturesChecked'
          )
          .get();
        const rows = snap.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .filter((r) => isWebTour(r.data))
          .filter((r) =>
            words.every((w) => str(r.data.title).toLowerCase().includes(w))
          )
          .sort(
            (a, b) =>
              Number(b.data.updatedAt ?? 0) - Number(a.data.updatedAt ?? 0)
          );
        const published = await Promise.all(
          rows.map((r) => publishedOf(ctx, r.id))
        );
        return {
          web_tours: rows.map((r, i) => ({
            set_id: r.id,
            title: str(r.data.title),
            step_count: Array.isArray(r.data.steps) ? r.data.steps.length : 0,
            help_center: r.data.helpCenter === true,
            updated_at: iso(r.data.updatedAt),
            publish_state: publishState(r.data, published[i]),
          })),
        };
      })
  );

  server.registerTool(
    'get_web_tour',
    {
      title: 'Get a web tour',
      description: `Admins only. Returns a web tour draft with every step, in play order. ${STEP_LIST} Look at a step's picture with get_web_tour_step_picture before rewriting its words. Only titles and tips can change through Claude (update_web_tour_text); re-recording, reordering and publishing stay with the admin in SpartBoard.`,
      inputSchema: { set_id: z.string().min(1).max(100) },
      annotations: READ_ONLY,
    },
    ({ set_id }) =>
      run('get_web_tour', ctx, async () => {
        await assertWebTourAccess(ctx);
        const [{ set }, published] = await Promise.all([
          loadWebTour(ctx, set_id),
          publishedOf(ctx, set_id),
        ]);
        return {
          set_id,
          title: str(set.title),
          goal: str(set.webGoal) || null,
          help_center: set.helpCenter === true,
          updated_at: iso(set.updatedAt),
          publish_state: publishState(set, published),
          steps: set.steps.map(publicWebStep),
        };
      })
  );

  server.registerTool(
    'get_web_tour_step_picture',
    {
      title: "View a web tour step's picture",
      description:
        'Admins only. Returns the screenshot the Chrome extension took when the step was recorded (has_picture true), so its title and tip can describe what the teacher sees.',
      inputSchema: {
        set_id: z.string().min(1).max(100),
        step_id: z.string().min(1).max(100),
      },
      annotations: READ_ONLY,
    },
    async ({ set_id, step_id }): Promise<CallToolResult> => {
      let image: { data: Buffer; mimeType: string } | null = null;
      const result = await run('get_web_tour_step_picture', ctx, async () => {
        await assertWebTourAccess(ctx);
        const { set } = await loadWebTour(ctx, set_id);
        const index = set.steps.findIndex((s) => s.id === step_id);
        if (index < 0)
          throw new ToolError(
            'No step has that id. Use the ids get_web_tour returns.'
          );
        const step = set.steps[index];
        const path = step.web?.picture?.path;
        if (typeof path !== 'string')
          throw new ToolError('That step has no recorded picture.');
        if (!isWebTourPicturePath(set_id, path))
          throw new ToolError(
            "That picture is stored outside the tour's folder, so Claude cannot read it."
          );
        const file = admin.storage().bucket().file(path);
        const [meta] = await file.getMetadata();
        const mimeType = String(meta.contentType ?? '');
        if (!/^image\/(png|jpeg|webp)$/.test(mimeType))
          throw new ToolError('That picture is not an image Claude can show.');
        if (Number(meta.size ?? 0) > MAX_SLIDE_BYTES)
          throw new ToolError('That picture is too large to show here.');
        const [data] = await file.download();
        image = { data, mimeType };
        return { number: index + 1, step: publicWebStep(step, index) };
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
    'update_web_tour_text',
    {
      title: "Rewrite a web tour's titles and tips",
      description: `Admins only. Changes only the tour title and the named steps' titles and tips, by step id; every other step and field stays as recorded (addresses, controls, actions, pictures, order and the picture check). "" clears a title or tip. Text that looks like student data (an email, id number or uuid) is refused, as publishing would refuse it. Tips are at most ${MAX_WEB_TIP} characters and titles ${MAX_WEB_STEP_TITLE}. Saves the draft only: teachers keep the published tour until an admin opens it in SpartBoard (Guided Learning library, Live tours) and publishes. If the tour is open in the SpartBoard editor, the admin reloads it there first, or its next save puts the old words back.`,
      inputSchema: {
        set_id: z.string().min(1).max(100),
        title: z.string().trim().min(1).max(MAX_WEB_TOUR_TITLE).optional(),
        steps: z
          .array(
            z
              .object({
                id: z.string().min(1).max(100),
                title: z.string().max(MAX_WEB_STEP_TITLE).optional(),
                tip: z.string().max(MAX_WEB_TIP).optional(),
              })
              .strict()
          )
          .max(MAX_WEB_STEPS)
          .optional()
          .describe('New title or tip for each named step, by id.'),
      },
      annotations: OVERWRITES,
    },
    ({ set_id, title, steps }) =>
      run('update_web_tour_text', ctx, async () => {
        await assertWebTourAccess(ctx);
        if (title === undefined && !steps?.length)
          throw new ToolError('Pass a title, steps, or both.');
        const { set, updateTime } = await loadWebTour(ctx, set_id);
        const warnings: string[] = [];
        if (title !== undefined) checkText('The tour title', title, warnings);
        const edited = applyWebStepText(set.steps, steps ?? []);
        warnings.push(...edited.warnings);
        await reserveWrite(ctx);
        const nextTitle = title ?? str(set.title);
        const saved = await saveWebText(
          ctx,
          { set, updateTime },
          nextTitle,
          edited.steps,
          'update'
        );
        const changed = new Set((steps ?? []).map((s) => s.id));
        return {
          set_id,
          title: nextTitle,
          previous_version_revision_id: saved.revisionId,
          changed_steps: edited.steps
            .map(publicWebStep)
            .filter((s) => changed.has(s.id)),
          ...(warnings.length ? { warnings } : {}),
          note: 'Saved as a draft. Teachers keep the published tour until an admin opens it in SpartBoard and publishes; the publish check there also looks for roster names.',
        };
      })
  );
}
