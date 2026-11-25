// Generate with AI on Admin Settings > Help Center: one model call fills a live tour item's title, description, category, audience and widgets.
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Type, type Schema } from '@google/genai';
import * as admin from './firebaseAdmin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isStrictSuperAdmin } from './authz';
import { refundAiUsage, resolveCallerIsAdmin } from './aiGeneration';
import { generateAi } from './aiRouter';
import { isExcludedFrom } from './permissionExclusion';
import { parseGeminiJson } from './parseGeminiJson';
import { assertViewAsAllowed } from './viewAsGuard';
import { safeErr } from './safeLog';
import { WIDGET_TYPE_LIST } from './mcp/widgetTypeList';
import { parseCategories } from './helpCategories';

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;
interface Token {
  email?: string;
  email_verified?: boolean;
}

export const HELP_CENTER_AI_FEATURE_ID = 'help-center-ai';
export const HELP_CENTER_AI_DEFAULT_LIMIT = 20;
const AUDIENCES = ['teachers', 'subs', 'students'] as const;
type Audience = (typeof AUDIENCES)[number];
const WIDGET_TYPES = new Set(WIDGET_TYPE_LIST);
const MAX_STEPS_SENT = 60;

export interface DetailsRequest {
  itemId: string;
  audiences: Audience[];
  widgets: { id: string; label: string }[];
}

export interface HelpDetails {
  title: string;
  description: string;
  categoryId: string;
  audience: Audience;
  widgetTypes: string[];
}

const bad = (msg: string) => new HttpsError('invalid-argument', msg);
const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export function parseDetailsRequest(raw: unknown): DetailsRequest {
  const d = (raw ?? {}) as Data;
  const itemId = typeof d.itemId === 'string' ? d.itemId.trim() : '';
  if (!itemId || itemId.includes('/') || itemId.length > 200)
    throw bad('Malformed identifier.');
  const audiences = (Array.isArray(d.audiences) ? d.audiences : []).filter(
    (a): a is Audience => AUDIENCES.includes(a as Audience)
  );
  const widgets = (Array.isArray(d.widgets) ? d.widgets : [])
    .slice(0, 200)
    .flatMap((w) => {
      const id = str((w as Data | null)?.id, 60);
      const label = str((w as Data | null)?.label, 80);
      return WIDGET_TYPES.has(id) ? [{ id, label: label || id }] : [];
    });
  return {
    itemId,
    audiences: [...new Set<Audience>(['teachers', ...audiences])],
    widgets,
  };
}

export const HELP_DETAILS_SYSTEM_PROMPT = `You write the Help Center card for a SpartBoard tour. SpartBoard is a classroom dashboard where teachers put widgets on a board. Teachers pick a tour by its card, which shows the title and the description.

Rules:
- Title: the task in the teacher's words, starting with a verb, under 60 characters. Example: "Make random groups".
- Description: two to four short sentences for a teacher who has never seen the feature. Say what they will do, what they get at the end, and when it helps in class. Name widgets and buttons as the screen shows them.
- One idea per sentence. No compound sentences joined with "so" or "and then". No em dashes. No "Tip:" or "Note:". No internal ids, anchor names or code words.
- Category: the one category that fits best.
- Audience: teachers, unless the tour is plainly for substitutes (the substitute portal) or for students and that audience is offered.
- Widgets: every widget the tour stages, adds or teaches. Use only ids from the list. An empty list is fine for a tour that uses no widget.`;

interface TourFacts {
  title: string;
  description: string;
  categoryId: string;
  audience: Audience;
  widgetTypes: string[];
  tourWidgets: string[];
  steps: { label: string; text: string; anchor: string }[];
}

export function buildDetailsPrompt(
  facts: TourFacts,
  categories: { id: string; name: string }[],
  req: DetailsRequest
): string {
  const steps = facts.steps
    .slice(0, MAX_STEPS_SENT)
    .map(
      (s, i) =>
        `${i + 1}. ${s.label || '(no label)'}: ${s.text || '(no text)'}${s.anchor ? ` [control: ${s.anchor}]` : ''}`
    )
    .join('\n');
  const widgetList = (
    req.widgets.length
      ? req.widgets
      : WIDGET_TYPE_LIST.map((id) => ({ id, label: id }))
  )
    .map((w) => `${w.id} = ${w.label}`)
    .join('; ');
  return [
    `Current title: ${facts.title || '(none)'}`,
    `Current description: ${facts.description || '(none)'}`,
    `Current category: ${facts.categoryId || '(none)'}`,
    `Current audience: ${facts.audience}`,
    `Current widgets: ${facts.widgetTypes.join(', ') || '(none)'}`,
    `Widgets the tour puts on the board: ${facts.tourWidgets.join(', ') || '(none)'}`,
    '',
    `Categories: ${categories.map((c) => `${c.id} = ${c.name}`).join('; ')}`,
    `Audiences offered: ${req.audiences.join(', ')}`,
    `Widget ids: ${widgetList}`,
    '',
    'Steps:',
    steps || '(no steps)',
  ].join('\n');
}

export function buildDetailsSchema(
  categoryIds: string[],
  req: DetailsRequest
): Schema {
  const widgetIds = req.widgets.length
    ? req.widgets.map((w) => w.id)
    : [...WIDGET_TYPE_LIST];
  return {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      categoryId: { type: Type.STRING, enum: categoryIds },
      audience: { type: Type.STRING, enum: req.audiences },
      widgetTypes: {
        type: Type.ARRAY,
        items: { type: Type.STRING, enum: widgetIds },
      },
    },
    required: ['title', 'description', 'categoryId', 'audience', 'widgetTypes'],
  };
}

/** Keeps only values the item can take; anything else falls back to the current value. */
export function parseDetailsResponse(
  text: string,
  facts: TourFacts,
  categoryIds: string[],
  req: DetailsRequest
): HelpDetails {
  const raw = parseGeminiJson(text) ?? {};
  const title = str(raw.title, 200) || facts.title;
  const description = str(raw.description, 1000) || facts.description;
  const categoryId = categoryIds.includes(raw.categoryId as string)
    ? (raw.categoryId as string)
    : facts.categoryId;
  const audience = req.audiences.includes(raw.audience as Audience)
    ? (raw.audience as Audience)
    : facts.audience;
  const allowed = new Set(
    req.widgets.length ? req.widgets.map((w) => w.id) : WIDGET_TYPE_LIST
  );
  const rawWidgets: unknown = raw.widgetTypes;
  const widgetTypes = Array.isArray(rawWidgets)
    ? [
        ...new Set(
          (rawWidgets as unknown[]).filter(
            (w): w is string => typeof w === 'string' && allowed.has(w)
          )
        ),
      ].slice(0, 12)
    : facts.widgetTypes;
  return { title, description, categoryId, audience, widgetTypes };
}

export function tourFacts(item: Data, set: Data | undefined): TourFacts {
  const steps = Array.isArray(set?.steps) ? (set.steps as Data[]) : [];
  const setup = (set?.tourSetup ?? {}) as Data;
  const audience = AUDIENCES.includes(item.audience as Audience)
    ? (item.audience as Audience)
    : 'teachers';
  return {
    title: str(item.title, 200),
    description: str(item.description, 1000),
    categoryId: str(item.categoryId, 100),
    audience,
    widgetTypes: Array.isArray(item.widgetTypes)
      ? item.widgetTypes.filter((w): w is string => typeof w === 'string')
      : [],
    tourWidgets: Array.isArray(setup.widgets)
      ? setup.widgets.filter((w): w is string => typeof w === 'string')
      : [],
    steps: steps.map((s) => ({
      label: str(s.label, 100),
      text: str(s.text, 1000),
      anchor: str((s.tour as Data | undefined)?.anchor, 200),
    })),
  };
}

export interface DetailsDeps {
  isAdmin: (token: Token) => Promise<boolean>;
  canWriteItem: (token: Token, orgId: unknown) => Promise<boolean>;
  /** Both flags on and the caller not excluded. */
  flagsOn: (token: Token) => Promise<boolean>;
  loadItem: (itemId: string) => Promise<Data | null>;
  loadSet: (setId: string) => Promise<Data | undefined>;
  loadCategories: () => Promise<{ id: string; name: string }[]>;
  charge: (token: Token, uid: string) => Promise<string[]>;
  refund: (docIds: string[]) => Promise<void>;
  generate: (prompt: string, schema: Schema) => Promise<string>;
}

/** Admin, item scope and flag checks, the daily limit, then one model call; a failed call gives its charge back. */
export async function runHelpDetails(
  req: DetailsRequest,
  uid: string,
  token: Token,
  deps: DetailsDeps
): Promise<HelpDetails> {
  if (!(await deps.isAdmin(token)) || !(await deps.flagsOn(token)))
    throw new HttpsError(
      'permission-denied',
      'Generate with AI is not turned on for this account.'
    );
  const item = await deps.loadItem(req.itemId);
  if (
    !item ||
    item.kind !== 'guided-learning' ||
    typeof item.setId !== 'string'
  )
    throw new HttpsError('not-found', 'That Help Center item was not found.');
  if (!(await deps.canWriteItem(token, item.orgId)))
    throw new HttpsError(
      'permission-denied',
      "You can't change this Help Center item."
    );
  const [set, categories] = await Promise.all([
    deps.loadSet(item.setId),
    deps.loadCategories(),
  ]);
  const facts = tourFacts(item, set);
  const categoryIds = categories.map((c) => c.id);
  const charged = await deps.charge(token, uid);
  try {
    const text = await deps.generate(
      buildDetailsPrompt(facts, categories, req),
      buildDetailsSchema(categoryIds, req)
    );
    return parseDetailsResponse(text, facts, categoryIds, req);
  } catch (error) {
    await deps.refund(charged).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    console.error('[generateHelpDetailsV1] failed:', safeErr(error));
    throw new HttpsError('internal', "AI couldn't fill in these details.");
  }
}

/** Counts the call against the row's daily limit, which applies to admins too. */
async function chargeDaily(
  db: Firestore,
  token: Token,
  uid: string
): Promise<string[]> {
  const perm = await db
    .collection('global_permissions')
    .doc(HELP_CENTER_AI_FEATURE_ID)
    .get();
  const config = (perm.data()?.config ?? {}) as Data;
  const limited = config.dailyLimitEnabled !== false;
  const limit =
    typeof config.dailyLimit === 'number' && config.dailyLimit > 0
      ? config.dailyLimit
      : HELP_CENTER_AI_DEFAULT_LIMIT;
  const today = new Date().toISOString().split('T')[0];
  const ids = [
    `${uid}_${HELP_CENTER_AI_FEATURE_ID}_${today}`,
    `${uid}_${today}`,
  ];
  await db.runTransaction(async (tx) => {
    const refs = ids.map((id) => db.collection('ai_usage').doc(id));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const used = (snaps[0].data()?.count as number) || 0;
    if (limited && used >= limit)
      throw new HttpsError(
        'resource-exhausted',
        `You can use Generate with AI ${limit} times a day. Try again tomorrow.`
      );
    const lastUsed = admin.firestore.FieldValue.serverTimestamp();
    snaps.forEach((snap, i) =>
      tx.set(
        refs[i],
        {
          count: ((snap.data()?.count as number) || 0) + 1,
          email: token.email ?? null,
          lastUsed,
        },
        { merge: true }
      )
    );
  });
  return ids;
}

function defaultDeps(db: Firestore): DetailsDeps {
  const email = (token: Token) =>
    token.email_verified === true ? (token.email ?? '').toLowerCase() : '';
  return {
    isAdmin: (token) => resolveCallerIsAdmin(db, token),
    canWriteItem: async (token, orgId) => {
      const caller = email(token);
      if (!caller) return false;
      if (await isStrictSuperAdmin(db, caller)) return true;
      if (typeof orgId !== 'string' || !orgId || orgId.includes('/'))
        return false;
      return (await db.doc(`organizations/${orgId}/members/${caller}`).get())
        .exists;
    },
    flagsOn: async (token) => {
      const docs = await Promise.all(
        ['gemini-functions', HELP_CENTER_AI_FEATURE_ID].map((id) =>
          db.collection('global_permissions').doc(id).get()
        )
      );
      return docs.every(
        (d) =>
          d.data()?.enabled !== false && !isExcludedFrom(d.data(), token.email)
      );
    },
    loadItem: async (itemId) => {
      const snap = await db.collection('help_resources').doc(itemId).get();
      return snap.exists ? (snap.data() ?? null) : null;
    },
    loadSet: async (setId) =>
      (await db.collection('building_guided_learning').doc(setId).get()).data(),
    loadCategories: async () =>
      parseCategories((await db.doc('help_center/config').get()).data()),
    charge: (token, uid) => chargeDaily(db, token, uid),
    refund: (docIds) => refundAiUsage(db, { docIds }),
    generate: async (prompt, schema) => {
      const result = await generateAi(db, {
        integration: 'help-center-details',
        parts: [{ text: prompt }],
        systemInstruction: HELP_DETAILS_SYSTEM_PROMPT,
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

export const generateHelpDetailsV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    await assertViewAsAllowed(request, { outward: true });
    if (!request.auth?.uid)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    return runHelpDetails(
      parseDetailsRequest(request.data),
      request.auth.uid,
      request.auth.token,
      defaultDeps(admin.firestore())
    );
  }
);
