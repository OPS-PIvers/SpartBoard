/**
 * Public-poll session orchestration: minting the sticky join code, deriving the
 * `poll_sessions` doc key, aggregating the live votes subcollection client-side,
 * and starting/stopping a session (the server-enforced `active` flag). Shared by
 * the widget (Settings + board), the phone remote, and the participant app so
 * all four drive the same state.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  PollConfig,
  PollQuestion,
  PollSessionDoc,
  PollSessionQuestion,
} from '@/types';
import { generatePollCode, normalizePollCode } from '@/utils/pollCode';
import { clampQuestionIndex, getPollQuestions } from '@/utils/pollQuestions';

const POLL_SESSIONS = 'poll_sessions';
const CODE_MINT_RETRIES = 5;

/** `poll_sessions` doc id: `{teacherUid}_{pollSessionId}`. */
export const makePollSessionId = (
  teacherUid: string,
  pollSessionId: string
): string => `${teacherUid}_${pollSessionId}`;

/** A vote doc plus its id — the id carries the voter uid and question index. */
export interface PollVoteEntry {
  id: string;
  questionIndex?: number;
  optionIndex: number;
}

/**
 * Tally one question's votes into a count-per-option-index array. Votes for
 * other questions are ignored, so a single listener can serve every question.
 */
export const aggregateVotes = (
  votes: PollVoteEntry[],
  questionIndex: number,
  optionCount: number
): number[] => {
  const explicit = new Map<string, number>();
  const legacy = new Map<string, number>();

  for (const vote of votes) {
    // Pre-multi-question docs are keyed by uid alone and carry no
    // questionIndex; they belong to question 0.
    const hasIndex = Number.isInteger(vote.questionIndex);
    if ((hasIndex ? vote.questionIndex : 0) !== questionIndex) continue;
    if (!vote.id) continue;
    const separator = vote.id.indexOf('_');
    const voterUid =
      hasIndex && separator !== -1 ? vote.id.slice(separator + 1) : vote.id;
    (hasIndex ? explicit : legacy).set(voterUid, vote.optionIndex);
  }

  // A voter who has re-voted since the upgrade has both docs — count once.
  for (const [voterUid, optionIndex] of legacy) {
    if (!explicit.has(voterUid)) explicit.set(voterUid, optionIndex);
  }

  const tally = new Array<number>(optionCount).fill(0);
  for (const optionIndex of explicit.values()) {
    if (
      Number.isInteger(optionIndex) &&
      optionIndex >= 0 &&
      optionIndex < optionCount
    ) {
      tally[optionIndex] += 1;
    }
  }
  return tally;
};

/** Strip vote counts — participants never need them to render their ballot. */
export const toSessionQuestions = (
  questions: PollQuestion[]
): PollSessionQuestion[] =>
  questions.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options.map((o) => ({ id: o.id, label: o.label })),
  }));

/** Mint a code no other session is already using. */
const mintUniquePollCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < CODE_MINT_RETRIES; attempt += 1) {
    const candidate = generatePollCode();
    const snap = await getDocs(
      query(
        collection(db, POLL_SESSIONS),
        where('code', '==', candidate),
        limit(1)
      )
    );
    if (snap.empty) return candidate;
  }
  throw new Error('Could not generate a unique poll join code.');
};

const writeSessionDoc = async (
  teacherUid: string,
  code: string,
  config: PollConfig,
  state: { active: boolean; startedAt: number | null }
): Promise<number> => {
  const questions = getPollQuestions(config);
  const currentQuestionIndex = clampQuestionIndex(
    config.currentQuestionIndex,
    questions.length
  );
  const payload: PollSessionDoc = {
    id: code,
    teacherUid,
    code,
    questions: toSessionQuestions(questions),
    optionCounts: questions.map((q) => q.options.length),
    currentQuestionIndex,
    active: state.active,
    startedAt: state.startedAt,
    updatedAt: Date.now(),
  };
  await setDoc(
    doc(db, POLL_SESSIONS, makePollSessionId(teacherUid, code)),
    payload,
    {
      merge: true,
    }
  );
  return currentQuestionIndex;
};

/**
 * Reserve the widget's sticky join code, writing an inert (`startedAt: null`)
 * session doc so the link is shareable before voting ever opens. No-op once a
 * code exists.
 */
export const ensurePollJoinCode = async (
  config: PollConfig,
  teacherUid: string
): Promise<PollConfig> => {
  if (config.joinCode) return config;
  const code = await mintUniquePollCode();
  await writeSessionDoc(teacherUid, code, config, {
    active: false,
    startedAt: null,
  });
  return { ...config, joinCode: code };
};

/** Resolve a participant-entered code to its session doc. */
export const lookupPollSessionByCode = async (
  rawCode: string
): Promise<{ sessionId: string; data: PollSessionDoc } | null> => {
  const code = normalizePollCode(rawCode);
  if (!code) return null;
  const snap = await getDocs(
    query(collection(db, POLL_SESSIONS), where('code', '==', code), limit(5))
  );
  if (snap.empty) return null;
  // Codes are unique at mint time, but a stale doc can survive a rotation —
  // prefer an open session, then the most recently touched one.
  const ranked = snap.docs.slice().sort((a, b) => {
    const left = a.data() as PollSessionDoc;
    const right = b.data() as PollSessionDoc;
    if ((left.active === true) !== (right.active === true)) {
      return left.active === true ? -1 : 1;
    }
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  });
  return {
    sessionId: ranked[0].id,
    data: ranked[0].data() as PollSessionDoc,
  };
};

/**
 * Open (or reopen) a public voting session. `mode: 'resume'` reuses the sticky
 * code and its prior votes; `mode: 'fresh'` rotates to a new code (and a new,
 * empty session doc) — but only once a previous session has actually run, so a
 * link shared before the first Start keeps working.
 *
 * Note: a rotation abandons the previous session's doc (left at
 * `active: false`, which blocks further votes server-side). Those inert docs +
 * their votes are intentionally left in place — no TTL/cleanup — which is an
 * accepted cost trade-off for this classroom-scale feature.
 */
export const startPollSession = async (
  config: PollConfig,
  teacherUid: string,
  mode: 'fresh' | 'resume'
): Promise<PollConfig> => {
  const rotate = mode === 'fresh' && !!config.lastPollSessionId;
  const code =
    rotate || !config.joinCode ? await mintUniquePollCode() : config.joinCode;
  const currentQuestionIndex = await writeSessionDoc(teacherUid, code, config, {
    active: true,
    startedAt: Date.now(),
  });
  return {
    ...config,
    joinCode: code,
    activePollSessionId: code,
    currentQuestionIndex,
    // On a fresh start the old lastPollSessionId belongs to an abandoned
    // session. Clear it so the UI doesn't offer to "Resume" the stale session
    // once the teacher stops and then clicks Start again. On 'resume' mode the
    // id matches lastPollSessionId already, so this is always a no-op there.
    lastPollSessionId:
      mode === 'fresh' ? null : (config.lastPollSessionId ?? null),
  };
};

/**
 * Close the active session: flips the session doc to `active: false`
 * (blocking further votes server-side) and parks the id in
 * `lastPollSessionId` so it can be resumed.
 */
export const stopPollSession = async (
  config: PollConfig,
  teacherUid: string
): Promise<PollConfig> => {
  const active = config.activePollSessionId ?? null;
  if (active) {
    await setDoc(
      doc(db, POLL_SESSIONS, makePollSessionId(teacherUid, active)),
      { active: false, updatedAt: Date.now() },
      { merge: true }
    );
  }
  return {
    ...config,
    activePollSessionId: null,
    lastPollSessionId: active ?? config.lastPollSessionId ?? null,
  };
};

/** Push the teacher's presentation cursor to every joined device. */
export const setSessionQuestionIndex = async (
  teacherUid: string,
  sessionId: string,
  questionIndex: number
): Promise<void> => {
  await setDoc(
    doc(db, POLL_SESSIONS, makePollSessionId(teacherUid, sessionId)),
    { currentQuestionIndex: questionIndex, updatedAt: Date.now() },
    { merge: true }
  );
};
