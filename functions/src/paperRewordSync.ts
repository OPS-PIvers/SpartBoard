// Keeps scanned paper answers, stored as choice text, matching a teacher's pure rewords.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { assertViewAsAllowed } from './viewAsGuard';

export const PAPER_REWORD_SYNC_FEATURE = 'paper-reword-sync';

const MAX_QUESTIONS = 500;
const MAX_CHOICES = 8;
const MAX_ID_LENGTH = 128;
const MAX_CHOICE_LENGTH = 5000;

export interface PaperRewordCaller {
  uid: string;
  studentRole: boolean;
  anonymous: boolean;
}

export interface PaperRewordQuestion {
  questionId: string;
  choices: string[];
}

export interface PaperRewordInput {
  quizId: string;
  questions: PaperRewordQuestion[];
}

export interface PaperRewordResult {
  answersUpdated: number;
  responsesUpdated: number;
  batchesUpdated: number;
}

interface Slots {
  from: string[];
  to: string[];
}

interface AnswerEntry {
  questionId?: unknown;
  answer?: unknown;
  [extra: string]: unknown;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** True when every choice kept its letter: each is unchanged, or new text replaced old. */
export function isRewordOnly(
  recorded: readonly string[],
  current: readonly string[]
): boolean {
  if (recorded.length !== current.length || recorded.length === 0) return false;
  const was = recorded.map(norm);
  const now = current.map(norm);
  if (now.some((t) => t === '') || new Set(now).size !== now.length) {
    return false;
  }
  return now.every(
    (text, i) =>
      text === was[i] || (!was.includes(text) && !now.includes(was[i]))
  );
}

const invalid = (message: string): never => {
  throw new HttpsError('invalid-argument', message);
};

const parseId = (raw: unknown, name: string): string => {
  if (
    typeof raw !== 'string' ||
    !raw ||
    raw.length > MAX_ID_LENGTH ||
    raw.includes('/')
  ) {
    return invalid(`${name} is invalid.`);
  }
  return raw;
};

export function parsePaperRewordInput(raw: unknown): PaperRewordInput {
  const data = (raw ?? {}) as { quizId?: unknown; questions?: unknown };
  const quizId = parseId(data.quizId, 'quizId');
  if (!Array.isArray(data.questions) || data.questions.length > MAX_QUESTIONS) {
    return invalid('questions is invalid.');
  }
  const questions = (data.questions as unknown[]).map((q) => {
    const item = (q ?? {}) as { questionId?: unknown; choices?: unknown };
    const choices = item.choices;
    if (
      !Array.isArray(choices) ||
      choices.length === 0 ||
      choices.length > MAX_CHOICES ||
      choices.some((c) => typeof c !== 'string' || c.length > MAX_CHOICE_LENGTH)
    ) {
      return invalid('choices is invalid.');
    }
    return {
      questionId: parseId(item.questionId, 'questionId'),
      choices: choices as string[],
    };
  });
  return { quizId, questions };
}

/** The questions on this batch whose wording really changed. */
function slotsFor(
  choiceOrder: Record<string, string[]> | undefined,
  questions: readonly PaperRewordQuestion[]
): Map<string, Slots> {
  const out = new Map<string, Slots>();
  for (const { questionId, choices } of questions) {
    const from = choiceOrder?.[questionId];
    if (!from || !isRewordOnly(from, choices)) continue;
    if (from.every((text, i) => norm(text) === norm(choices[i]))) continue;
    out.set(questionId, { from, to: choices.map((c) => c.trim()) });
  }
  return out;
}

function rewrite(
  answers: AnswerEntry[],
  slots: ReadonlyMap<string, Slots>
): { answers: AnswerEntry[]; changes: Array<Record<string, string>> } {
  const changes: Array<Record<string, string>> = [];
  const next = answers.map((entry) => {
    const plan =
      typeof entry.questionId === 'string'
        ? slots.get(entry.questionId)
        : undefined;
    if (!plan || typeof entry.answer !== 'string' || !entry.answer) {
      return entry;
    }
    const given = norm(entry.answer);
    const at = plan.from.findIndex((text) => norm(text) === given);
    if (at < 0 || norm(plan.to[at]) === given) return entry;
    changes.push({
      questionId: entry.questionId as string,
      from: entry.answer,
      to: plan.to[at],
    });
    return { ...entry, answer: plan.to[at] };
  });
  return { answers: next, changes };
}

export async function handlePaperRewordSync(
  db: admin.firestore.Firestore,
  caller: PaperRewordCaller | null,
  raw: unknown,
  now: number,
  granted: () => Promise<boolean>
): Promise<PaperRewordResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.studentRole || caller.anonymous) {
    throw new HttpsError('permission-denied', 'Teacher account required.');
  }
  const input = parsePaperRewordInput(raw);
  if (!(await granted())) {
    throw new HttpsError('permission-denied', 'This feature is not enabled.');
  }

  const userRef = db.collection('users').doc(caller.uid);
  const [batchSnaps, assignmentSnaps] = await Promise.all([
    userRef
      .collection('paper_batches')
      .where('quizId', '==', input.quizId)
      .get(),
    userRef
      .collection('quiz_assignments')
      .where('quizId', '==', input.quizId)
      .get(),
  ]);

  const plans = new Map<string, Map<string, Slots>>();
  for (const batch of batchSnaps.docs) {
    const slots = slotsFor(
      batch.data().choiceOrder as Record<string, string[]> | undefined,
      input.questions
    );
    if (slots.size > 0) plans.set(batch.id, slots);
  }
  const result: PaperRewordResult = {
    answersUpdated: 0,
    responsesUpdated: 0,
    batchesUpdated: 0,
  };
  if (plans.size === 0) return result;

  for (const assignment of assignmentSnaps.docs) {
    const sessionRef = db.collection('quiz_sessions').doc(assignment.id);
    const session = await sessionRef.get();
    if (!session.exists || session.data()?.teacherUid !== caller.uid) continue;
    const responses = await sessionRef.collection('responses').get();
    for (const response of responses.docs) {
      const batchId = response.data().paperBatchId as string | undefined;
      if (!batchId || !plans.has(batchId)) continue;
      const count = await db.runTransaction(async (tx) => {
        const snap = await tx.get(response.ref);
        const data = snap.data() ?? {};
        const slots = plans.get(data.paperBatchId as string);
        if (!slots || !Array.isArray(data.answers)) return 0;
        const { answers, changes } = rewrite(
          data.answers as AnswerEntry[],
          slots
        );
        if (changes.length === 0) return 0;
        tx.update(response.ref, { answers });
        // Old values, so a change can be undone.
        tx.set(response.ref.collection('paper_reword_log').doc(String(now)), {
          at: now,
          changes,
        });
        return changes.length;
      });
      if (count > 0) {
        result.answersUpdated += count;
        result.responsesUpdated += 1;
      }
    }
  }

  // Last, so a run that stops early is finished by the next save.
  for (const batch of batchSnaps.docs) {
    const slots = plans.get(batch.id);
    if (!slots) continue;
    const fields: Record<string, string[]> = {};
    for (const [questionId, { to }] of slots) {
      fields[`choiceOrder.${questionId}`] = to;
    }
    await batch.ref.update(fields);
    result.batchesUpdated += 1;
  }
  return result;
}

export const paperRewordSyncV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    await assertViewAsAllowed(request);
    const caller: PaperRewordCaller | null = request.auth
      ? {
          uid: request.auth.uid,
          studentRole: request.auth.token.studentRole === true,
          anonymous:
            request.auth.token.firebase?.sign_in_provider === 'anonymous',
        }
      : null;
    const email =
      request.auth?.token.email_verified === true &&
      typeof request.auth.token.email === 'string'
        ? request.auth.token.email.toLowerCase()
        : null;
    return handlePaperRewordSync(
      admin.firestore(),
      caller,
      request.data,
      Date.now(),
      async () => {
        if (!caller) return false;
        const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
        return isGlobalFeatureGranted(
          admin.firestore(),
          PAPER_REWORD_SYNC_FEATURE,
          email,
          caller.uid
        );
      }
    );
  }
);
