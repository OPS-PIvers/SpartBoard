import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';

// Collections the student assignments page listens to; anything else is dropped.
const COLLECTIONS = new Set([
  'quiz_sessions',
  'video_activity_sessions',
  'guided_learning_sessions',
  'mini_app_sessions',
  'activity_wall_sessions',
  'flashcard_sessions',
  'project_runs',
  'student_assignments',
]);
const SOURCES = new Set(['class', 'pointer', 'hydrate']);
const MAX_ISSUES = 10;

export interface StudentLoadIssue {
  source: string;
  collection: string;
  channel: string;
  code: string;
  attempt: number;
  gaveUp: boolean;
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.slice(0, max) : '';

/** Keeps only well-formed issues, trimmed to known values and short strings. */
export function sanitizeLoadIssues(raw: unknown): StudentLoadIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: StudentLoadIssue[] = [];
  for (const item of raw.slice(0, MAX_ISSUES)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const source = str(r.source, 16);
    const collection = str(r.collection, 64);
    if (!SOURCES.has(source) || !COLLECTIONS.has(collection)) continue;
    const channel = str(r.channel, 16);
    out.push({
      source,
      collection,
      channel: channel === 'active' || channel === 'ended' ? channel : '',
      code: str(r.code, 64).replace(/[^\w/-]/g, '') || 'unknown',
      attempt:
        typeof r.attempt === 'number' && Number.isFinite(r.attempt)
          ? Math.max(0, Math.min(99, Math.floor(r.attempt)))
          : 0,
      gaveUp: r.gaveUp === true,
    });
  }
  return out;
}

/** Logs student assignment-list load failures so a "students couldn't see it" report has evidence. */
export const reportStudentLoadIssueV1 = onCall(
  { memory: '256MiB', invoker: 'public', cors: ALLOWED_ORIGINS },
  (request) => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const token = request.auth.token;
    if (token.studentRole !== true) {
      throw new HttpsError('permission-denied', 'Student role required.');
    }
    const issues = sanitizeLoadIssues(
      (request.data as { issues?: unknown } | undefined)?.issues
    );
    if (issues.length === 0) return { logged: 0 };
    const classIds: unknown = token.classIds;
    logger.warn('[studentLoadIssue] student assignment list failed to load', {
      uid: request.auth.uid,
      orgId: typeof token.orgId === 'string' ? token.orgId : '',
      sso: token.sso === true,
      pinLogin: token.pinLogin === true,
      classIds: Array.isArray(classIds) ? classIds.slice(0, 20) : [],
      issues,
    });
    return { logged: issues.length };
  }
);
