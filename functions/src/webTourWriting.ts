// Write with Claude for web tours (docs/plans/WEB_TOURS_CLAUDE.md C9-C11): admin only, behind web-tours.
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Type, type Schema } from '@google/genai';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { recordAiUsage, resolveCallerIsAdmin } from './aiGeneration';
import { AiUnavailableError, generateAi, type AiPart } from './aiRouter';
import { parseGeminiJson } from './parseGeminiJson';
import { assertViewAsAllowed } from './viewAsGuard';
import { MAX_SLIDE_BYTES } from './mcp/glTools';
import {
  MAX_WEB_STEP_TITLE,
  MAX_WEB_TIP,
  WEB_TOURS,
  WEB_TOURS_FEATURE_ID,
  isWebTourPicturePath,
} from './mcp/webTourTools';
import { isWebTour } from './mcp/webTours';
import { isHardTextHit, webTourTextHits } from './mcp/webTourStudentData';

type Firestore = admin.firestore.Firestore;
type Token = { email?: string; email_verified?: boolean };

export type WritingField = 'title' | 'tip';
export const MAX_WRITE_STEPS = 12;
export const MAX_WEB_QUESTION = 200;
const MAX_CONTEXT_STEPS = 200;
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface WritingRequest {
  setId: string;
  steps: { id: string; fields: WritingField[] }[];
}

export interface WrittenStep {
  id: string;
  title?: string;
  tip?: string;
  question?: string;
}

interface StoredLocator {
  role?: unknown;
  name?: unknown;
  text?: unknown;
  heading?: unknown;
  pageTitle?: unknown;
  attrs?: { ariaLabel?: unknown };
}

interface StoredBinding {
  urlPattern?: unknown;
  action?: unknown;
  note?: unknown;
  picture?: { path?: unknown };
  locator?: StoredLocator;
}

interface StoredStep {
  id?: unknown;
  label?: unknown;
  text?: unknown;
  web?: StoredBinding;
}

export interface StoredWebTour {
  title?: unknown;
  surface?: unknown;
  webGoal?: unknown;
  steps?: unknown;
}

const bad = (msg: string) => new HttpsError('invalid-argument', msg);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const SET_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseWritingRequest(raw: unknown): WritingRequest {
  const d = (raw ?? {}) as Record<string, unknown>;
  const setId = typeof d.setId === 'string' ? d.setId : '';
  if (!SET_ID.test(setId)) throw bad('Malformed identifier.');
  const rawSteps = Array.isArray(d.steps) ? d.steps : [];
  if (rawSteps.length === 0 || rawSteps.length > MAX_WRITE_STEPS)
    throw bad(`Send 1 to ${MAX_WRITE_STEPS} steps.`);
  const seen = new Set<string>();
  const steps = rawSteps.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const fields = Array.isArray(o.fields) ? o.fields : [];
    if (!SET_ID.test(id) || seen.has(id)) throw bad('Malformed step id.');
    seen.add(id);
    const wanted = (['title', 'tip'] as const).filter((f) =>
      fields.includes(f)
    );
    if (!wanted.length || wanted.length !== fields.length)
      throw bad('Name title, tip or both for each step.');
    return { id, fields: wanted };
  });
  return { setId, steps };
}

export const WRITING_SYSTEM_PROMPT = `You write the words for a web tour: a walkthrough that highlights one control at a time on a website a teacher uses, with a short title and tip on each step.
You get the tour's goal when the admin gave one, every step in order with the clues the recorder saved (action, page address, page title, nearby heading, control role, name and text), the admin's private notes, and a picture of each step you are asked to write. The pictures come in the order the prompt lists them; match each picture to its step by that list.
Write only the fields each step asks for. A title is a short imperative under 60 characters, like "Open Gradebook". A tip is one or two plain sentences saying what the control does and why the teacher clicks it here; don't repeat the title.
Write for teachers in a calm, direct voice. Never include a student's name, email or id number, even if a picture shows one.
When you can't tell why a step happens, write no title or tip for it and return a short question instead (under 120 characters) that the admin can answer in a few words.`;

const clueLines = (step: StoredStep): string[] => {
  const web: StoredBinding = step.web ?? {};
  const loc: StoredLocator = web.locator ?? {};
  const lines: [string, unknown][] = [
    ['Action', web.action],
    ['Page address', web.urlPattern],
    ['Page title', loc.pageTitle],
    ['Nearby heading', loc.heading],
    ['Control role', loc.role],
    ['Control name', loc.name],
    ['Control text', loc.text],
    ['Control label', loc.attrs?.ariaLabel],
  ];
  return lines.filter(([, v]) => str(v)).map(([k, v]) => `${k}: ${str(v)}`);
};

/** The prompt: the goal, every step with its clues, then the pictures of the steps to write. */
export function buildWritingParts(
  tour: StoredWebTour,
  req: WritingRequest,
  pictures: ReadonlyMap<string, { mimeType: string; data: string }>
): AiPart[] {
  const steps = (Array.isArray(tour.steps) ? tour.steps : []).slice(
    0,
    MAX_CONTEXT_STEPS
  ) as StoredStep[];
  const wanted = new Map(req.steps.map((s) => [s.id, s.fields]));
  const goal = str(tour.webGoal);
  const blocks = steps.map((step, i) => {
    const id = str(step.id);
    const fields = wanted.get(id);
    const lines = [
      `Step ${i + 1} (id ${id})${fields ? ` - write: ${fields.join(', ')}` : ''}`,
      ...clueLines(step),
      `Current title: ${str(step.label) || '(none)'}`,
      `Current tip: ${str(step.text) || '(none)'}`,
    ];
    const note = str(step.web?.note);
    if (note) lines.push(`Admin's note: ${note}`);
    return lines.join('\n');
  });
  const pictured = steps.flatMap((step, i) => {
    const picture = pictures.get(str(step.id));
    return picture ? [{ n: i + 1, id: str(step.id), picture }] : [];
  });
  // Claude gets every picture before any text, so the order is named rather than implied by position.
  const order = pictured.length
    ? `The ${pictured.length === 1 ? 'picture is' : `${pictured.length} pictures are`}, in order: ${pictured
        .map((p) => `step ${p.n} (id ${p.id})`)
        .join(', ')}.`
    : 'There are no pictures.';
  const parts: AiPart[] = [
    {
      text: [
        `Tour title: ${str(tour.title) || '(none)'}`,
        `Goal: ${goal || '(not given)'}`,
        order,
        '',
        blocks.join('\n\n'),
      ].join('\n'),
    },
  ];
  for (const p of pictured) {
    parts.push({ text: `Picture for step ${p.n} (id ${p.id}):` });
    parts.push({ inlineData: p.picture });
  }
  return parts;
}

export function buildWritingSchema(ids: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      steps: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, enum: ids },
            title: { type: Type.STRING },
            tip: { type: Type.STRING },
            question: { type: Type.STRING },
          },
          required: ['id'],
        },
      },
    },
    required: ['steps'],
  };
}

const clip = (v: unknown, max: number): string => {
  const s = str(v).replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max / 2 ? cut.slice(0, space) : cut).trimEnd();
};

const safe = (text: string) => ![...webTourTextHits(text)].some(isHardTextHit);

/** Only the requested fields of requested steps, capped, without student data; a question replaces the step's words. */
export function parseWritingResponse(
  text: string,
  req: WritingRequest
): WrittenStep[] {
  const parsed = parseGeminiJson<{ steps?: unknown }>(text);
  const items = Array.isArray(parsed?.steps) ? parsed.steps : [];
  const wanted = new Map(req.steps.map((s) => [s.id, s.fields]));
  const out = new Map<string, WrittenStep>();
  for (const raw of items) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    const fields = wanted.get(id);
    if (!fields || out.has(id)) continue;
    const question = clip(item.question, MAX_WEB_QUESTION);
    if (question && safe(question)) {
      out.set(id, { id, question });
      continue;
    }
    const step: WrittenStep = { id };
    const title = clip(item.title, MAX_WEB_STEP_TITLE);
    const tip = clip(item.tip, MAX_WEB_TIP);
    if (fields.includes('title') && title && safe(title)) step.title = title;
    if (fields.includes('tip') && tip && safe(tip)) step.tip = tip;
    if (step.title || step.tip) out.set(id, step);
  }
  return [...out.values()];
}

export interface WritingDeps {
  isAdmin: (token: Token) => Promise<boolean>;
  /** The web-tours flag for this caller, and the AI switch. */
  allowed: (token: Token, uid: string) => Promise<boolean>;
  loadTour: (setId: string) => Promise<StoredWebTour | null>;
  loadPicture: (
    path: string
  ) => Promise<{ mimeType: string; data: string } | null>;
  record: (token: Token, uid: string) => Promise<unknown>;
  generate: (parts: AiPart[], schema: Schema) => Promise<string>;
}

/** Admin and flag checks, the draft and its pictures, then one model call. */
export async function runWebTourWriting(
  req: WritingRequest,
  uid: string,
  token: Token,
  deps: WritingDeps
): Promise<{ steps: WrittenStep[] }> {
  if (!(await deps.isAdmin(token)) || !(await deps.allowed(token, uid)))
    throw new HttpsError(
      'permission-denied',
      'Web tours are not turned on for this account.'
    );
  const tour = await deps.loadTour(req.setId);
  if (!tour || !isWebTour(tour) || !Array.isArray(tour.steps))
    throw new HttpsError('not-found', 'That web tour was not found.');
  const byId = new Map(
    (tour.steps as StoredStep[]).map((s) => [str(s.id), s] as const)
  );
  if (req.steps.some((s) => !byId.has(s.id)))
    throw bad('A step is no longer in the tour.');
  const pictures = new Map<string, { mimeType: string; data: string }>();
  await Promise.all(
    req.steps.map(async ({ id }) => {
      const path = byId.get(id)?.web?.picture?.path;
      if (typeof path !== 'string' || !isWebTourPicturePath(req.setId, path))
        return;
      const picture = await deps.loadPicture(path).catch(() => null);
      if (picture) pictures.set(id, picture);
    })
  );
  await deps.record(token, uid);
  try {
    const text = await deps.generate(
      buildWritingParts(tour, req, pictures),
      buildWritingSchema(req.steps.map((s) => s.id))
    );
    return { steps: parseWritingResponse(text, req) };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[writeWebTourTextV1] failed:', error);
    if (error instanceof AiUnavailableError)
      throw new HttpsError('failed-precondition', error.message);
    throw new HttpsError('internal', "Claude couldn't write these steps.");
  }
}

function defaultDeps(db: Firestore): WritingDeps {
  return {
    isAdmin: (token) => resolveCallerIsAdmin(db, token),
    allowed: async (token, uid) => {
      const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
      const ai = await db
        .collection('global_permissions')
        .doc('gemini-functions')
        .get();
      return (
        ai.data()?.enabled !== false &&
        (await isGlobalFeatureGranted(
          db,
          WEB_TOURS_FEATURE_ID,
          token.email ?? null,
          uid
        ))
      );
    },
    loadTour: async (setId) => {
      const snap = await db.collection(WEB_TOURS).doc(setId).get();
      return snap.exists ? (snap.data() as StoredWebTour) : null;
    },
    loadPicture: async (path) => {
      const file = admin.storage().bucket().file(path);
      const [meta] = await file.getMetadata();
      const mimeType = String(meta.contentType ?? '');
      if (!PICTURE_TYPES.has(mimeType)) return null;
      if (Number(meta.size ?? 0) > MAX_SLIDE_BYTES) return null;
      const [data] = await file.download();
      return { mimeType, data: data.toString('base64') };
    },
    record: (token, uid) => recordAiUsage(db, token, uid, 'web-tour-writing'),
    generate: async (parts, schema) => {
      const result = await generateAi(db, {
        integration: 'web-tour-writing',
        parts,
        systemInstruction: WRITING_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: schema,
      });
      if (result.stopped !== 'complete')
        throw new Error(
          `${result.model} stopped early: ${result.finishReason}`
        );
      if (!result.text) throw new Error('Empty response from the AI model.');
      return result.text;
    },
  };
}

export const writeWebTourTextV1 = onCall(
  {
    memory: '512MiB',
    // Room for a 60 s Claude attempt and a full Gemini retry.
    timeoutSeconds: 180,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    if (!request.auth?.uid)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    return runWebTourWriting(
      parseWritingRequest(request.data),
      request.auth.uid,
      request.auth.token,
      defaultDeps(admin.firestore())
    );
  }
);
