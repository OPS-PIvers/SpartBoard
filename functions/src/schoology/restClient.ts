// Schoology REST API v1 client: grading categories, column categories and
// exception flags, which AGS can't reach. Two-legged OAuth 1.0a with a PLAINTEXT
// signature over HTTPS, against one hard-coded host. Never log the key, a signed
// header, or a response body (they hold student grades).

import { randomBytes } from 'node:crypto';

export const SCHOOLOGY_API_ORIGIN = 'https://api.schoology.com';
const API_BASE = `${SCHOOLOGY_API_ORIGIN}/v1`;
const NET_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;
const MAX_PAGES = 20;
const PAGE_LIMIT = 200;
const ID_RE = /^\d{1,20}$/;

/** Schoology grade exception codes. */
export const SCHOOLOGY_EXCEPTION = {
  NONE: 0,
  EXCUSED: 1,
  INCOMPLETE: 2,
  MISSING: 3,
} as const;

export interface SchoologyApiCredentials {
  consumerKey: string;
  consumerSecret: string;
}

/** A failed REST call. `status` is 0 for a network failure or a refused redirect. */
export class SchoologyRestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SchoologyRestError';
  }
}

const enc = (s: string): string =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

/** The two-legged OAuth 1.0a `Authorization` header (PLAINTEXT, no token). */
export function schoologyOAuthHeader(
  creds: SchoologyApiCredentials,
  nonce: string = randomBytes(8).toString('hex'),
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_token: '',
    oauth_nonce: nonce,
    oauth_timestamp: String(timestamp),
    oauth_signature_method: 'PLAINTEXT',
    oauth_version: '1.0',
    // PLAINTEXT signature is `secret&tokenSecret`; the token secret is empty.
    oauth_signature: `${enc(creds.consumerSecret)}&`,
  };
  return (
    'OAuth realm="Schoology API", ' +
    Object.entries(params)
      .map(([k, v]) => `${k}="${enc(v)}"`)
      .join(', ')
  );
}

/** True only for an https URL on the Schoology API host. */
export function isSchoologyApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.host === 'api.schoology.com' &&
      u.username === '' &&
      u.password === ''
    );
  } catch {
    return false;
  }
}

function assertId(id: string, what: string): void {
  if (!ID_RE.test(id)) throw new SchoologyRestError(`Invalid ${what}.`, 0);
}

type Method = 'GET' | 'POST' | 'PUT';

async function sgyFetch(
  creds: SchoologyApiCredentials,
  method: Method,
  pathOrUrl: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  let url = pathOrUrl.startsWith('/') ? `${API_BASE}${pathOrUrl}` : pathOrUrl;
  let currentMethod: Method = method;
  let currentBody = body;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSchoologyApiUrl(url)) {
      throw new SchoologyRestError('Refused a non-Schoology API URL.', 0);
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method: currentMethod,
        headers: {
          Authorization: schoologyOAuthHeader(creds),
          Accept: 'application/json',
          ...(currentBody !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        body:
          currentBody !== undefined ? JSON.stringify(currentBody) : undefined,
        signal: AbortSignal.timeout(NET_TIMEOUT_MS),
        redirect: 'manual',
      });
    } catch (err) {
      console.warn(`[schoologyRest] ${currentMethod} failed (network):`, err);
      throw new SchoologyRestError(`Schoology ${currentMethod} failed.`, 0);
    }
    if (res.status === 302 || res.status === 303) {
      // Schoology answers some calls with a See Other to the same host.
      await res.text().catch(() => '');
      const location = res.headers.get('location') ?? '';
      if (!location || !isSchoologyApiUrl(location)) {
        throw new SchoologyRestError('Refused a Schoology redirect.', 0);
      }
      url = location;
      currentMethod = 'GET';
      currentBody = undefined;
      continue;
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new SchoologyRestError(
        `Schoology ${currentMethod} failed (${res.status}).`,
        res.status
      );
    }
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, json };
  }
  throw new SchoologyRestError('Too many Schoology redirects.', 0);
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asIdString = (v: unknown): string =>
  typeof v === 'number' || (typeof v === 'string' && ID_RE.test(v))
    ? String(v)
    : '';
const asNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const isOkCode = (v: unknown): boolean => {
  const n = asNumber(v);
  return n >= 200 && n < 300;
};

/** GET every page of a list endpoint, following `links.next` on the same host. */
async function listAll(
  creds: SchoologyApiCredentials,
  path: string,
  key: string
): Promise<unknown[]> {
  const out: unknown[] = [];
  const sep = path.includes('?') ? '&' : '?';
  let next: string | null = `${path}${sep}start=0&limit=${PAGE_LIMIT}`;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const { json }: { json: unknown } = await sgyFetch(creds, 'GET', next);
    const rec = asRecord(json);
    out.push(...asArray(rec[key]));
    const link = asRecord(rec.links).next;
    next = typeof link === 'string' && isSchoologyApiUrl(link) ? link : null;
  }
  return out;
}

export interface GradingCategory {
  id: string;
  title: string;
  weight: number;
}

function toCategory(raw: unknown): GradingCategory | null {
  const r = asRecord(raw);
  const id = asIdString(r.id);
  if (!id) return null;
  return {
    id,
    title: typeof r.title === 'string' ? r.title : '',
    weight: asNumber(r.weight),
  };
}

/** The section's grading categories. Weights read 0 while weighting is off. */
export async function listGradingCategories(
  creds: SchoologyApiCredentials,
  sectionId: string
): Promise<GradingCategory[]> {
  assertId(sectionId, 'section id');
  const { json } = await sgyFetch(
    creds,
    'GET',
    `/sections/${sectionId}/grading_categories`
  );
  return asArray(asRecord(json).grading_category)
    .map(toCategory)
    .filter((c): c is GradingCategory => c !== null);
}

/** Create categories, then return the section's categories as Schoology now reports them. */
export async function createGradingCategories(
  creds: SchoologyApiCredentials,
  sectionId: string,
  categories: { title: string; weight: number }[]
): Promise<GradingCategory[]> {
  assertId(sectionId, 'section id');
  const { json } = await sgyFetch(
    creds,
    'POST',
    `/sections/${sectionId}/grading_categories`,
    {
      grading_categories: {
        grading_category: categories.map((c) => ({
          title: c.title,
          weight: c.weight,
          // 2 = the category's grade is total points earned over total possible.
          calculation_type: 2,
        })),
      },
    }
  );
  const rows = asArray(asRecord(json).grading_category);
  const failed = rows.filter((r) => !isOkCode(asRecord(r).response_code));
  if (failed.length > 0) {
    throw new SchoologyRestError(
      `Schoology refused ${failed.length} grading categor${failed.length === 1 ? 'y' : 'ies'}.`,
      207
    );
  }
  return listGradingCategories(creds, sectionId);
}

/** Move a gradebook column (an AGS line item's REST id) into a category. */
export async function setColumnCategory(
  creds: SchoologyApiCredentials,
  sectionId: string,
  columnId: string,
  categoryId: string
): Promise<void> {
  assertId(sectionId, 'section id');
  assertId(columnId, 'column id');
  assertId(categoryId, 'category id');
  await sgyFetch(
    creds,
    'PUT',
    `/sections/${sectionId}/assignments/${columnId}`,
    {
      grading_category: Number(categoryId),
    }
  );
}

/** A column's category id ('0' for none), or null when the column isn't in the section. */
export async function getColumnCategory(
  creds: SchoologyApiCredentials,
  sectionId: string,
  columnId: string
): Promise<string | null> {
  assertId(sectionId, 'section id');
  assertId(columnId, 'column id');
  const items = await listAll(
    creds,
    `/sections/${sectionId}/grade_items`,
    'assignment'
  );
  const item = items.find((i) => asIdString(asRecord(i).id) === columnId);
  if (!item) return null;
  return asIdString(asRecord(item).grading_category) || '0';
}

export interface ColumnGrade {
  enrollmentId: string;
  grade: number | null;
  exception: number;
  comment: string;
}

/** Every cell of one column, with any exception flag the teacher set. */
export async function listColumnGrades(
  creds: SchoologyApiCredentials,
  sectionId: string,
  columnId: string
): Promise<ColumnGrade[]> {
  assertId(sectionId, 'section id');
  assertId(columnId, 'column id');
  const { json } = await sgyFetch(
    creds,
    'GET',
    `/sections/${sectionId}/grades?assignment_id=${columnId}`
  );
  const out: ColumnGrade[] = [];
  for (const raw of asArray(asRecord(asRecord(json).grades).grade)) {
    const r = asRecord(raw);
    const enrollmentId = asIdString(r.enrollment_id);
    if (!enrollmentId) continue;
    const grade =
      r.grade === null || r.grade === undefined || r.grade === ''
        ? null
        : asNumber(r.grade);
    out.push({
      enrollmentId,
      grade,
      exception: asNumber(r.exception),
      comment: typeof r.comment === 'string' ? r.comment : '',
    });
  }
  return out;
}

export interface ExceptionWrite {
  columnId: string;
  enrollmentId: string;
  exception: number;
}

/** Set exception flags; returns whether each row (in order) was accepted. */
export async function setExceptions(
  creds: SchoologyApiCredentials,
  sectionId: string,
  rows: ExceptionWrite[]
): Promise<boolean[]> {
  assertId(sectionId, 'section id');
  if (rows.length === 0) return [];
  for (const r of rows) {
    assertId(r.columnId, 'column id');
    assertId(r.enrollmentId, 'enrollment id');
  }
  const { json } = await sgyFetch(
    creds,
    'PUT',
    `/sections/${sectionId}/grades`,
    {
      grades: {
        grade: rows.map((r) => ({
          type: 'assignment',
          assignment_id: Number(r.columnId),
          enrollment_id: Number(r.enrollmentId),
          exception: r.exception,
        })),
      },
    }
  );
  const results = asArray(asRecord(asRecord(json).grades).grade);
  return rows.map((_, i) => isOkCode(asRecord(results[i]).response_code));
}

export interface Enrollment {
  enrollmentId: string;
  /** The Schoology user id; the prefix of the LTI `sub`. */
  uid: string;
  isAdmin: boolean;
}

/** The section's enrollments (teachers have `isAdmin`). Carries no email. */
export async function listEnrollments(
  creds: SchoologyApiCredentials,
  sectionId: string
): Promise<Enrollment[]> {
  assertId(sectionId, 'section id');
  const rows = await listAll(
    creds,
    `/sections/${sectionId}/enrollments`,
    'enrollment'
  );
  const out: Enrollment[] = [];
  for (const raw of rows) {
    const r = asRecord(raw);
    const enrollmentId = asIdString(r.id);
    const uid = asIdString(r.uid);
    if (!enrollmentId || !uid) continue;
    out.push({ enrollmentId, uid, isAdmin: String(r.admin) === '1' });
  }
  return out;
}

/** The Schoology user id in an LTI `sub` (`{uid}::{hash}`), or null for any other shape. */
export function schoologyUidFromSub(sub: string): string | null {
  const sep = sub.indexOf('::');
  if (sep < 0) return null;
  const prefix = sub.slice(0, sep);
  return ID_RE.test(prefix) ? prefix : null;
}
