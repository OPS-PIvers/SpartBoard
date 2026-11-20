import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';

const CODES = new Set(['failed-precondition', 'aborted']);
const OP_SHAPE = /^(get|set|update|delete) [\w{}/-]{1,200}$/;
const PAGE = /^\/[\w-]{0,40}$/;
const MAX_OPS = 12;

export interface TransactionFailureReport {
  code: string;
  ops: string[];
  count: number;
  page: string;
}

/** Keeps a well-formed report, trimmed to known codes and id-free path shapes; null otherwise. */
export function sanitizeTransactionFailure(
  raw: unknown
): TransactionFailureReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string' || !CODES.has(r.code)) return null;
  if (!Array.isArray(r.ops)) return null;
  const ops = r.ops
    .slice(0, MAX_OPS)
    .filter((op): op is string => typeof op === 'string' && OP_SHAPE.test(op));
  if (ops.length === 0) return null;
  return {
    code: r.code,
    ops,
    count:
      typeof r.count === 'number' && Number.isFinite(r.count)
        ? Math.max(0, Math.min(9999, Math.floor(r.count)))
        : 0,
    page: typeof r.page === 'string' && PAGE.test(r.page) ? r.page : '',
  };
}

/** Logs which client transaction keeps failing in one tab, so a failed-commit spike names its call site. */
export const reportTransactionFailureV1 = onCall(
  { memory: '256MiB', invoker: 'public', cors: ALLOWED_ORIGINS },
  async (request) => {
    await assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const report = sanitizeTransactionFailure(request.data);
    if (!report) return { logged: false };
    const token = request.auth.token;
    logger.warn('[transactionFailure] a client transaction keeps failing', {
      uid: request.auth.uid,
      studentRole: token.studentRole === true,
      ...report,
    });
    return { logged: true };
  }
);
