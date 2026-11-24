// Admin-only web tour tools: read recorded drafts and their pictures, rewrite words, add Message steps or steps from written clues, and move or remove steps; never publish.
import { randomUUID } from 'node:crypto';
import * as admin from '../firebaseAdmin';
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
import { LOG_TTL_MS } from './config';
import { OVERWRITES, READ_ONLY, iso, run } from './toolKit';
import { isWebTour, isWebTourSnapshot } from './webTours';
import { isHardTextHit, webTourTextHits } from './webTourStudentData';
import {
  readableFixLocator,
  stepFixes,
  type FixRun,
  type StepFix,
} from './webTourFixes';

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
  'update_web_tour_steps',
]);

const NOT_WEB =
  'That set is not a web tour. Use get_live_tour or get_guided_learning for SpartBoard sets.';
const FIND = 'list_web_tours lists every web tour draft with its set_id.';
const CONFLICT =
  'Someone saved this web tour in SpartBoard while Claude was editing it. Fetch it again and redo the change.';

interface WebLocator {
  role?: unknown;
  css?: unknown;
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
  picture?: {
    path?: unknown;
    w?: unknown;
    h?: unknown;
    original?: { path?: unknown };
  };
  note?: unknown;
  claudeQuestion?: unknown;
}
export interface WebStep {
  id: string;
  label?: unknown;
  text?: unknown;
  web?: WebBinding;
  message?: unknown;
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
  webSuggestions?: unknown;
  webFixDismissed?: unknown;
  webRevisionPictures?: unknown;
  [key: string]: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Admins with Guided Learning through Claude and the web-tours flag. */
export async function assertWebTourAccess(ctx: ToolContext): Promise<void> {
  await assertAccess(ctx, 'building');
  const { isGlobalFeatureGranted } = await import('../featureGrant');
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

/** The clues Claude may read: never the CSS path or the box. */
function readableClues(loc: WebLocator, withTitle = true) {
  const locator: Record<string, string | Record<string, string>> = {};
  for (const key of ['role', 'name', 'text', 'heading', 'pageTitle'] as const)
    if ((withTitle || key !== 'pageTitle') && str(loc[key]))
      locator[key] = str(loc[key]);
  const attrs: Record<string, string> = {};
  for (const key of ATTR_KEYS)
    if (str(loc.attrs?.[key])) attrs[key] = str(loc.attrs?.[key]);
  if (Object.keys(attrs).length) locator.attrs = attrs;
  return locator;
}

const CLUE_NAMES: Record<string, string> = {
  role: 'role',
  name: 'name',
  text: 'text',
  heading: 'heading',
  css: 'page position',
  'attrs.testId': 'control id',
  'attrs.ariaLabel': 'control label',
  'attrs.name': 'field name',
  'attrs.href': 'link address',
};

/** Which clues a fix changes, by name only, so Claude can tell what differs without reading the CSS path. */
function changedClues(before: WebLocator, after: WebLocator): string[] {
  const read = (l: WebLocator, key: string) =>
    key.startsWith('attrs.')
      ? str(l.attrs?.[key.slice(6)])
      : str(l[key as keyof WebLocator]);
  return Object.keys(CLUE_NAMES)
    .filter((k) => read(before, k) !== read(after, k))
    .map((k) => CLUE_NAMES[k]);
}

/** A Message step (X9): says something without pointing at a control, so it has no `web`. */
export const isMessageStep = (step: WebStep): boolean =>
  step.message === true && !step.web;

/** A step as Claude sees it: words, action, address, the readable clues, the admin's note and any suggested fix; never the CSS or box. */
export function publicWebStep(step: WebStep, index: number, fix?: StepFix) {
  const web = step.web;
  const locator = readableClues(web?.locator ?? {});
  const note = str(web?.note);
  const question = str(web?.claudeQuestion);
  return {
    id: step.id,
    number: index + 1,
    kind: isMessageStep(step) ? 'message' : 'recorded',
    title: str(step.label),
    tip: str(step.text),
    action: web ? str(web.action) || null : null,
    url_pattern: web ? str(web.urlPattern) : null,
    locator,
    has_picture: typeof web?.picture?.path === 'string',
    ...(note ? { note } : {}),
    ...(question ? { question } : {}),
    ...(fix
      ? {
          suggested_fix: {
            // Never a page title: it can name the student whose page it was.
            locator: readableClues(readableFixLocator(fix), false),
            changed: changedClues(web?.locator ?? {}, fix.locator),
            source: fix.source,
            runs: fix.count,
            found_at: iso(fix.at),
          },
        }
      : {}),
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

/** Runs of the tour, for the fixes they suggest; admins read them through the Admin SDK. */
async function runsOf(ctx: ToolContext, setId: string): Promise<FixRun[]> {
  const snap = await ctx.db.collection(`${SNAPSHOTS}/${setId}/runs`).get();
  return snap.docs.map((d) => d.data() as FixRun);
}

const publishedSteps = (p: PublishedWebTour | null) => {
  const steps = (p?.set as { steps?: unknown } | undefined)?.steps;
  return p && Array.isArray(steps)
    ? { at: p.at, steps: steps as WebStep[] }
    : null;
};

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
      if (field === 'tip' && !clean && isMessageStep(step))
        throw new ToolError(
          `Step "${step.id}" is a message, so its tip can't be empty.`
        );
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

// Same caps the recorder protocol puts on a recorded locator (isLocator in components/tours/web/recorderProtocol.ts).
export const MAX_WRITTEN_ROLE = 40;
export const MAX_WRITTEN_CLUE = 120;
export const MAX_WRITTEN_CSS = 400;
export const MAX_WRITTEN_HREF = 400;
export const MAX_URL_PATTERN = 500;
export const WEB_ACTIONS = ['click', 'type', 'select', 'observe'] as const;
type WebAction = (typeof WEB_ACTIONS)[number];

export interface WrittenLocator {
  role?: string;
  name?: string;
  text?: string;
  heading?: string;
  css?: string;
  attrs?: { testId?: string; ariaLabel?: string; name?: string; href?: string };
}

export type StepListEntry =
  | { id: string; title?: string; tip?: string }
  | { new_message: true; title?: string; tip: string }
  | {
      new_step: true;
      title?: string;
      tip?: string;
      url_pattern: string;
      action: WebAction;
      locator: WrittenLocator;
    };

// https only, a real host with no wildcard, then an optional path, query and #/ route; `*` stands for an id.
const URL_PATTERN_RE =
  /^(https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?)((?:\/[^\s?#]*)?)(\?[^\s#]*)?(#\/\S*)?$/i;

/** The page a written step plays on, origin lowercased; refuses anything the extension's matcher can't use or that holds student data. */
export function writtenUrlPattern(at: string, raw: string): string {
  const pattern = raw.trim();
  const m = URL_PATTERN_RE.exec(pattern);
  if (!m)
    throw new ToolError(
      `${at} url_pattern must be an https address like https://docs.google.com/forms/d/*/edit, with * in place of each id and no * in the host.`
    );
  const hits = [...webTourTextHits(pattern)].filter(isHardTextHit);
  if (hits.length)
    throw new ToolError(
      `${at} url_pattern holds what looks like an id or student data (${hits.join(', ')}). Put * in place of each id.`
    );
  return m[1].toLowerCase() + pattern.slice(m[1].length);
}

const CLUE_KEYS = ['name', 'text', 'heading'] as const;
const ATTR_TEXT_KEYS = ['testId', 'ariaLabel', 'name'] as const;

/** A locator from written clues: trimmed, empty clues dropped, refused when nothing identifies the control. */
export function writtenLocator(
  at: string,
  raw: WrittenLocator,
  warnings: string[]
): WebLocator {
  const out: WebLocator = {};
  const role = (raw.role ?? '').trim().toLowerCase();
  if (role) {
    if (!/^[a-z]+$/.test(role))
      throw new ToolError(
        `${at} locator.role must be one ARIA role word, like button, link, textbox or tab.`
      );
    out.role = role;
  }
  for (const key of CLUE_KEYS) {
    const v = (raw[key] ?? '').replace(/\s+/g, ' ').trim();
    if (!v) continue;
    checkText(`${at} locator.${key}`, v, warnings);
    out[key] = v;
  }
  const css = (raw.css ?? '').trim();
  if (css) {
    if (/[{};<\n\r]/.test(css))
      throw new ToolError(
        `${at} locator.css must be one CSS selector, such as [data-tour="import-notice.open"].`
      );
    checkText(`${at} locator.css`, css, warnings);
    out.css = css;
  }
  const attrs: Record<string, string> = {};
  for (const key of ATTR_TEXT_KEYS) {
    const v = (raw.attrs?.[key] ?? '').trim();
    if (!v) continue;
    checkText(`${at} locator.attrs.${key}`, v, warnings);
    attrs[key] = v;
  }
  const href = (raw.attrs?.href ?? '').trim();
  if (href) {
    if (!/^(?:\/|https:\/\/)[^\s?#]*$/.test(href))
      throw new ToolError(
        `${at} locator.attrs.href must be a link path like /course/*/materials, or a full https address on another site, with no query.`
      );
    const hits = [...webTourTextHits(href)].filter(isHardTextHit);
    if (hits.length)
      throw new ToolError(
        `${at} locator.attrs.href holds what looks like an id (${hits.join(', ')}). Put * in place of each id.`
      );
    attrs.href = href;
  }
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (!out.name && !out.text && !out.css && !out.attrs)
    throw new ToolError(
      `${at} locator needs a clue that names the control: name, text, css or attrs. A role or heading alone can't find it.`
    );
  return out;
}

const VERB: Record<WebAction, string> = {
  observe: 'Look at',
  click: 'Click',
  type: 'Type in',
  select: 'Choose from',
};

/** A step that points at a control from written clues, stored the way toWebStep stores a recorded one, with no picture. */
export function writtenWebStep(
  at: string,
  entry: Extract<StepListEntry, { new_step: true }>,
  id: string,
  warnings: string[]
): WebStep {
  const urlPattern = writtenUrlPattern(at, entry.url_pattern);
  const locator = writtenLocator(at, entry.locator, warnings);
  const what = str(locator.name) || str(locator.text);
  const label =
    (entry.title ?? '').trim() ||
    (what ? `${VERB[entry.action]} ${what}` : VERB[entry.action]);
  const text = (entry.tip ?? '').trim();
  checkText(`${at} title`, label, warnings);
  checkText(`${at} tip`, text, warnings);
  return {
    id,
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'tooltip',
    label,
    text,
    web: { urlPattern, action: entry.action, locator },
  };
}

/** The tour's new step list: kept steps by id in the given order, new Message and written steps where named; any step left out is removed. */
export function applyWebStepList(
  steps: readonly WebStep[],
  entries: readonly StepListEntry[],
  newId: () => string = randomUUID
): {
  steps: WebStep[];
  added: string[];
  removed: string[];
  warnings: string[];
} {
  if (!entries.length)
    throw new ToolError(
      'steps is the whole new list and cannot be empty. A tour needs at least one step.'
    );
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const warnings: string[] = [];
  const added: string[] = [];
  const next = entries.map((entry, i) => {
    const at = `Step ${i + 1}`;
    if ('new_step' in entry) {
      const step = writtenWebStep(at, entry, newId(), warnings);
      added.push(step.id);
      return step;
    }
    if ('new_message' in entry) {
      const label = (entry.title ?? '').trim();
      const text = entry.tip.trim();
      if (!text) throw new ToolError(`${at} is a new message without a tip.`);
      checkText(`${at} title`, label, warnings);
      checkText(`${at} tip`, text, warnings);
      const id = newId();
      added.push(id);
      // Same base fields a recorded step gets (toWebStep), with no web binding.
      const message: WebStep = {
        id,
        xPct: 50,
        yPct: 50,
        imageIndex: 0,
        interactionType: 'tooltip',
        label,
        text,
        message: true,
      };
      return message;
    }
    const step = byId.get(entry.id);
    if (!step)
      throw new ToolError(
        `No step has id "${entry.id}". Use the ids get_web_tour returns; a new message takes new_message instead of an id.`
      );
    if (seen.has(entry.id))
      throw new ToolError(`steps names step "${entry.id}" twice.`);
    seen.add(entry.id);
    if (entry.title === undefined && entry.tip === undefined) return step;
    const edited = applyWebStepText(
      [step],
      [{ id: entry.id, title: entry.title, tip: entry.tip }]
    );
    // applyWebStepText numbers the step 1; say where it sits in the new list.
    warnings.push(...edited.warnings.map((w) => w.replace(/^Step 1/, at)));
    return edited.steps[0];
  });
  if (next.length > MAX_WEB_STEPS)
    throw new ToolError(`A web tour has at most ${MAX_WEB_STEPS} steps.`);
  const removed = steps.filter((s) => !seen.has(s.id)).map((s) => s.id);
  if (!next.some((s) => !!s.web))
    warnings.push(
      'No step points at a control now, so the tour cannot be published until a recorded or written step is added.'
    );
  return { steps: next, added, removed, warnings };
}

/** Every picture file the steps point at in the set's own folder, the uncropped capture included. */
export function stepPicturePaths(
  setId: string,
  steps: readonly WebStep[]
): string[] {
  const out = new Set<string>();
  for (const step of steps) {
    const picture = step.web?.picture;
    for (const path of [picture?.path, picture?.original?.path])
      if (typeof path === 'string' && isWebTourPicturePath(setId, path))
        out.add(path);
  }
  return [...out];
}

/** The draft's revision picture list with `paths` held until `until`; expired entries drop out (X18). */
export function keepRevisionPictures(
  current: unknown,
  paths: readonly string[],
  until: number,
  now: number
): { path: string; until: number }[] {
  const kept = new Map<string, number>();
  for (const entry of Array.isArray(current) ? (current as unknown[]) : []) {
    const e = (entry ?? {}) as { path?: unknown; until?: unknown };
    if (
      typeof e.path === 'string' &&
      typeof e.until === 'number' &&
      e.until > now
    )
      kept.set(e.path, Math.max(e.until, kept.get(e.path) ?? 0));
  }
  for (const p of paths) kept.set(p, Math.max(until, kept.get(p) ?? 0));
  return [...kept].map(([path, u]) => ({ path, until: u }));
}

/** Saves a new title and steps, keeping the old version as a revision; fails if the draft changed since it was read. Step-list revisions keep every step whole. */
async function saveWebText(
  ctx: ToolContext,
  loaded: Awaited<ReturnType<typeof loadWebTour>>,
  title: string,
  steps: WebStep[],
  action: 'update' | 'restore',
  wholeSteps = false
) {
  const { set, updateTime } = loaded;
  const batch = ctx.db.batch();
  const now = Date.now();
  const revisionId = snapshotRevision(
    ctx,
    batch,
    {
      itemType: 'guided_learning',
      itemId: set.id,
      title: str(set.title),
      data: wholeSteps
        ? {
            source: 'web',
            kind: 'steps',
            title: str(set.title),
            steps: set.steps,
          }
        : {
            source: 'web',
            title: str(set.title),
            steps: set.steps.map((s) => ({
              id: s.id,
              label: str(s.label),
              text: str(s.text),
            })),
          },
    },
    now
  );
  logActivity(ctx, batch, {
    action,
    itemType: 'guided_learning',
    itemId: set.id,
    title,
    revisionId,
  });
  batch.update(
    ctx.db.collection(WEB_TOURS).doc(set.id),
    {
      title,
      steps,
      updatedAt: now,
      // The editor's sweep and publish can't read Claude's revisions, so the draft lists what they still need.
      ...(wholeSteps
        ? {
            webRevisionPictures: keepRevisionPictures(
              set.webRevisionPictures,
              stepPicturePaths(set.id, set.steps),
              now + LOG_TTL_MS,
              now
            ),
          }
        : {}),
    },
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

/** Puts back a revision: a step-list revision restores every step exactly; a word revision restores titles and tips, and steps recorded since keep theirs. */
export async function restoreWebTourRevision(
  ctx: ToolContext,
  rev: admin.firestore.DocumentSnapshot
) {
  await assertWebTourAccess(ctx);
  const data = rev.get('data') as {
    kind?: unknown;
    title?: unknown;
    steps?: { id?: unknown; label?: unknown; text?: unknown }[];
  };
  const loaded = await loadWebTour(ctx, String(rev.get('itemId')));
  if (data.kind === 'steps') {
    const steps = (Array.isArray(data.steps) ? data.steps : []).filter(
      (s): s is WebStep =>
        !!s && typeof s === 'object' && typeof s.id === 'string'
    );
    if (!steps.length)
      throw new ToolError('That revision has no steps to put back.');
    // Its pictures are held only this long, even if the revision outlives it before Firestore's TTL removes it.
    if (Number(rev.get('createdAt') ?? 0) + LOG_TTL_MS <= Date.now())
      throw new ToolError('That revision has expired.');
    const title = str(data.title) || str(loaded.set.title);
    await reserveWrite(ctx);
    const saved = await saveWebText(ctx, loaded, title, steps, 'restore', true);
    return {
      set_id: loaded.set.id,
      title,
      step_count: steps.length,
      previous_version_revision_id: saved.revisionId,
      note: 'Restored every step, with its target and picture, as a draft; publishing stays with the admin in SpartBoard.',
    };
  }
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
  "Each step: id, number, kind (recorded for a step that points at a control on a page, recorded by an admin or written from clues, message for a Message step that says something without pointing at a control and has no action, address, locator or picture), title, tip, action (click, type, select or observe), url_pattern (the page it plays on, ids as *), locator (the role, name, text, nearby heading, page title and stable attrs it finds its control by), has_picture, and when set the admin's private note for Claude (note, never shown to teachers) and the question SpartBoard's Write with Claude left on the step (question). goal is what the admin said the tour explains. suggested_fix, when present, is what a run of the tour found instead when the step missed or matched weakly: the clues (locator, whose name, text and heading are always the step's own, never words from the page it was found on), which clues differ (changed), where it came from (source: check for the admin's Check tour, admin for an admin's own run, teacher for teachers' runs, shown once at least two agree), and how many runs found it (runs). Claude can recommend a fix; only the admin can use it, in SpartBoard.";

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
      description: `Admins only. Returns a web tour draft with every step, in play order. ${STEP_LIST} Look at a step's picture with get_web_tour_step_picture before rewriting its words. Claude can rewrite titles and tips (update_web_tour_text) and add Message steps, add steps from written clues, move steps and remove steps (update_web_tour_steps); recording steps with pictures, checking and publishing stay with the admin in SpartBoard.`,
      inputSchema: { set_id: z.string().min(1).max(100) },
      annotations: READ_ONLY,
    },
    ({ set_id }) =>
      run('get_web_tour', ctx, async () => {
        await assertWebTourAccess(ctx);
        const [{ set }, published, runs] = await Promise.all([
          loadWebTour(ctx, set_id),
          publishedOf(ctx, set_id),
          runsOf(ctx, set_id),
        ]);
        const fixes = stepFixes(set, publishedSteps(published), runs);
        return {
          set_id,
          title: str(set.title),
          goal: str(set.webGoal) || null,
          help_center: set.helpCenter === true,
          updated_at: iso(set.updatedAt),
          publish_state: publishState(set, published),
          steps: set.steps.map((s, i) => publicWebStep(s, i, fixes.get(s.id))),
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
            .map((s, i) => publicWebStep(s, i))
            .filter((s) => changed.has(s.id)),
          ...(warnings.length ? { warnings } : {}),
          note: 'Saved as a draft. Teachers keep the published tour until an admin opens it in SpartBoard and publishes; the publish check there also looks for roster names.',
        };
      })
  );
  server.registerTool(
    'update_web_tour_steps',
    {
      title: "Add, move or remove a web tour's steps",
      description: `Admins only. Sets the draft's whole step list in its new order. Name each step to keep by id (with an optional new title or tip); add a Message step with new_message: true, a tip and an optional title; add a step that points at a control with new_step: true, its page (url_pattern), action and written locator; any step left out is removed, recorded steps included. A Message step shows a centered tip with no picture and plays on whatever page the teacher is on: use it for an opening, a closing, or before the tour moves to another site, and only when the admin asks for one. A written step plays like a recorded one but has no picture, and nobody has checked its clues against the real page: write them from what the page really shows, prefer a stable attribute or SpartBoard's data-tour selector over words that change, and tell the admin to run Check tour in SpartBoard, since publishing needs every step found. A control inside a closed shadow root (the SpartBoard extension's own Send to SpartBoard buttons among them) can't be found by any clue yet; use a Message step there. To change where a step points, remove it and add a written one. A tour needs at least one step that points at a control to publish. Saves the draft only and keeps the whole old list, targets and pictures included, as a revision restore_revision puts back exactly. Text that looks like student data is refused. If the tour is open in the SpartBoard editor, the admin reloads it there first, or its next save puts the old steps back.`,
      inputSchema: {
        set_id: z.string().min(1).max(100),
        steps: z
          .array(
            z.union([
              z
                .object({
                  id: z.string().min(1).max(100),
                  title: z.string().max(MAX_WEB_STEP_TITLE).optional(),
                  tip: z.string().max(MAX_WEB_TIP).optional(),
                })
                .strict(),
              z
                .object({
                  new_message: z.literal(true),
                  title: z.string().max(MAX_WEB_STEP_TITLE).optional(),
                  tip: z.string().min(1).max(MAX_WEB_TIP),
                })
                .strict(),
              z
                .object({
                  new_step: z.literal(true),
                  title: z.string().max(MAX_WEB_STEP_TITLE).optional(),
                  tip: z.string().max(MAX_WEB_TIP).optional(),
                  url_pattern: z
                    .string()
                    .min(1)
                    .max(MAX_URL_PATTERN)
                    .describe(
                      'The https page the step plays on, with * in place of each id, e.g. https://docs.google.com/forms/d/*/edit.'
                    ),
                  action: z.enum(WEB_ACTIONS),
                  locator: z
                    .object({
                      role: z.string().max(MAX_WRITTEN_ROLE).optional(),
                      name: z.string().max(MAX_WRITTEN_CLUE).optional(),
                      text: z.string().max(MAX_WRITTEN_CLUE).optional(),
                      heading: z.string().max(MAX_WRITTEN_CLUE).optional(),
                      css: z.string().max(MAX_WRITTEN_CSS).optional(),
                      attrs: z
                        .object({
                          testId: z.string().max(MAX_WRITTEN_CLUE).optional(),
                          ariaLabel: z
                            .string()
                            .max(MAX_WRITTEN_CLUE)
                            .optional(),
                          name: z.string().max(MAX_WRITTEN_CLUE).optional(),
                          href: z.string().max(MAX_WRITTEN_HREF).optional(),
                        })
                        .strict()
                        .optional(),
                    })
                    .strict()
                    .describe(
                      "The clues playback finds the control by, as get_web_tour shows them: role (ARIA role), name (accessible name: aria-label, label or the control's own text), text (its visible text), heading (the nearest heading or group label above it), css (one CSS selector) and attrs (testId for data-testid/data-test/data-qa, ariaLabel, name for a field's name attribute, href for a link path with ids as *). Give at least one of name, text, css or attrs."
                    ),
                })
                .strict(),
            ])
          )
          .min(1)
          .max(MAX_WEB_STEPS)
          .describe(
            'The whole new step list, in play order: { id } keeps a step, { new_message: true, tip } adds a Message step, { new_step: true, url_pattern, action, locator } adds a step that points at a control.'
          ),
      },
      annotations: OVERWRITES,
    },
    ({ set_id, steps }) =>
      run('update_web_tour_steps', ctx, async () => {
        await assertWebTourAccess(ctx);
        const loaded = await loadWebTour(ctx, set_id);
        const edited = applyWebStepList(loaded.set.steps, steps);
        await reserveWrite(ctx);
        const title = str(loaded.set.title);
        const saved = await saveWebText(
          ctx,
          loaded,
          title,
          edited.steps,
          'update',
          true
        );
        return {
          set_id,
          title,
          previous_version_revision_id: saved.revisionId,
          steps: edited.steps.map((s, i) => publicWebStep(s, i)),
          added_steps: edited.added,
          removed_steps: edited.removed,
          ...(edited.warnings.length ? { warnings: edited.warnings } : {}),
          note: edited.steps.some((s) => s.web && edited.added.includes(s.id))
            ? 'Saved as a draft. The written steps have no picture and are unchecked: the admin runs Check tour in SpartBoard, which must find every step before the tour can be published. Teachers keep the published tour until then.'
            : 'Saved as a draft. Teachers keep the published tour until an admin opens it in SpartBoard and publishes.',
        };
      })
  );
}
