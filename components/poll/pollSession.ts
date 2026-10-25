/**
 * Public-poll session orchestration: minting the sticky join code, deriving the
 * `poll_sessions` doc key, aggregating the live votes subcollection client-side,
 * and starting/stopping a session (the server-enforced `active` flag). Shared by
 * the widget (Settings + board), the phone remote, and the participant app so
 * all four drive the same state.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  PollConfig,
  PollQuestion,
  PollSessionDoc,
  PollSessionQuestion,
} from '@/types';
import { generatePollCode, normalizePollCode } from '@/utils/pollCode';
import {
  clampQuestionIndex,
  getPollQuestions,
  isTextQuestion,
} from '@/utils/pollQuestions';

const POLL_SESSIONS = 'poll_sessions';
const POLL_CODES = 'poll_codes';
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
  /** Absent on word cloud and open response answers. */
  optionIndex?: number;
  text?: string;
  votedAt?: number;
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
  const explicit = new Map<string, number | undefined>();
  const legacy = new Map<string, number | undefined>();

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
      optionIndex !== undefined &&
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
  questions: PollQuestion[],
  /** Without the poll-pro flag phones get plain options, matching the board. */
  pollPro = true
): PollSessionQuestion[] =>
  questions.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options.map((o) => ({ id: o.id, label: o.label })),
    ...(pollPro && q.kind === 'scale'
      ? {
          kind: 'scale' as const,
          scaleLow: q.scaleLow ?? '',
          scaleHigh: q.scaleHigh ?? '',
        }
      : {}),
    ...(pollPro && (q.kind === 'words' || q.kind === 'text')
      ? { kind: q.kind }
      : {}),
  }));

/** The session-doc mirror of the teacher's reveal and lock choices, keyed by question index. */
export const toSessionResultsState = (
  config: PollConfig,
  /** Without the poll-pro flag the session always shows results and never locks. */
  pollPro = true
): Pick<
  PollSessionDoc,
  'hideResults' | 'revealedQuestions' | 'lockedQuestions' | 'shownAnswers'
> => {
  if (!pollPro) {
    return {
      hideResults: false,
      revealedQuestions: [],
      lockedQuestions: [],
      shownAnswers: [],
    };
  }
  const questions = getPollQuestions(config);
  const indexesOf = (ids: string[] | undefined): number[] => {
    const wanted = new Set(ids ?? []);
    return questions.flatMap((q, i) => (wanted.has(q.id) ? [i] : []));
  };
  return {
    hideResults: config.hideResults === true,
    revealedQuestions: indexesOf(config.revealedQuestionIds),
    lockedQuestions: indexesOf(config.lockedQuestionIds),
    // Answers stay off the session doc until shown, since phones can read it.
    shownAnswers: indexesOf(config.answerShownQuestionIds).flatMap((i) =>
      questions[i].options.flatMap((o) =>
        o.correct ? [`${questions[i].id}:${o.id}`] : []
      )
    ),
  };
};

/** Mint a code no other session is already using. */
const mintUniquePollCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < CODE_MINT_RETRIES; attempt += 1) {
    const candidate = generatePollCode();
    const taken = await getDoc(doc(db, POLL_CODES, candidate)).then(
      (snap) => snap.exists(),
      // Offline: treat as free; the server never moves a live session's code.
      (err: unknown) => {
        if ((err as { code?: string })?.code === 'unavailable') return false;
        throw err;
      }
    );
    if (!taken) return candidate;
  }
  throw new Error('Could not generate a unique poll join code.');
};

const writeSessionDoc = async (
  teacherUid: string,
  code: string,
  config: PollConfig,
  state: { active: boolean; startedAt: number | null },
  pollPro = false
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
    questions: toSessionQuestions(questions, pollPro),
    optionCounts: questions.map((q) => q.options.length),
    textQuestions: pollPro
      ? questions.flatMap((q, i) => (isTextQuestion(q) ? [i] : []))
      : [],
    currentQuestionIndex,
    active: state.active,
    startedAt: state.startedAt,
    updatedAt: Date.now(),
    ...toSessionResultsState(config, pollPro),
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
 * session doc so the link is shareable before voting ever opens. Returns the
 * minted code, or null when one already exists. Deliberately returns only the
 * code rather than a patched config: the caller must merge it onto whatever
 * config is current when this resolves, or a concurrent edit is lost.
 */
export const ensurePollJoinCode = async (
  config: PollConfig,
  teacherUid: string
): Promise<string | null> => {
  if (config.joinCode) return null;
  const code = await mintUniquePollCode();
  await writeSessionDoc(teacherUid, code, config, {
    active: false,
    startedAt: null,
  });
  return code;
};

const POINTER_RETRY_MS = [1500, 3000];

/** Resolve a participant-entered code to its session doc. */
export const lookupPollSessionByCode = async (
  rawCode: string
): Promise<{ sessionId: string; data: PollSessionDoc } | null> => {
  const code = normalizePollCode(rawCode);
  if (!code) return null;
  let pointer = await getDoc(doc(db, POLL_CODES, code));
  // The server writes the pointer just after Start, so a quick scan can beat it.
  for (const wait of POINTER_RETRY_MS) {
    if (pointer.exists()) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    pointer = await getDoc(doc(db, POLL_CODES, code));
  }
  if (!pointer.exists()) return null;
  const sessionId = (pointer.data() as { sessionId?: string }).sessionId;
  if (!sessionId) return null;
  const snap = await getDoc(doc(db, POLL_SESSIONS, sessionId));
  if (!snap.exists()) return null;
  return { sessionId: snap.id, data: snap.data() as PollSessionDoc };
};

/** Blank an abandoned session's questions (roster-derived labels); the server then drops its code pointer. */
export const retirePollSession = async (
  teacherUid: string,
  code: string
): Promise<void> => {
  try {
    await setDoc(
      doc(db, POLL_SESSIONS, makePollSessionId(teacherUid, code)),
      {
        questions: [],
        optionCounts: [],
        textQuestions: [],
        active: false,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch {
    // Best effort: the new session must still start.
  }
};

/**
 * Open (or reopen) a public voting session. `mode: 'resume'` reuses the sticky
 * code and its prior votes; `mode: 'fresh'` rotates to a new code (and a new,
 * empty session doc) — but only once a previous session has actually run, so a
 * link shared before the first Start keeps working.
 *
 * A rotation blanks the previous session doc's questions and drops its code
 * pointer; its votes are left in place.
 */
export const startPollSession = async (
  config: PollConfig,
  teacherUid: string,
  mode: 'fresh' | 'resume',
  /** Name the starter on the board, so members of a Synced or View-Only board see its votes. */
  stampOwner = false,
  /** The starter has the poll-pro flag, so hidden results and locks reach phones. */
  pollPro = false
): Promise<PollConfig> => {
  const rotate = mode === 'fresh' && !!config.lastPollSessionId;
  const code =
    rotate || !config.joinCode ? await mintUniquePollCode() : config.joinCode;
  // A fresh start hides and unlocks every question again; resume keeps them.
  const base: PollConfig =
    mode === 'fresh'
      ? {
          ...config,
          revealedQuestionIds: [],
          lockedQuestionIds: [],
          answerShownQuestionIds: [],
          hiddenResponses: [],
        }
      : config;
  const currentQuestionIndex = await writeSessionDoc(
    teacherUid,
    code,
    base,
    { active: true, startedAt: Date.now() },
    pollPro
  );
  const previousCode = config.joinCode;
  const previousOwner = config.lastPollSessionOwnerUid ?? teacherUid;
  if (
    rotate &&
    previousCode &&
    previousCode !== code &&
    previousOwner === teacherUid
  ) {
    await retirePollSession(teacherUid, previousCode);
  }
  return {
    ...base,
    joinCode: code,
    activePollSessionId: code,
    activePollSessionOwnerUid: stampOwner ? teacherUid : null,
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
    activePollSessionOwnerUid: null,
    lastPollSessionId: active ?? config.lastPollSessionId ?? null,
    lastPollSessionOwnerUid: active
      ? (config.activePollSessionOwnerUid ?? null)
      : (config.lastPollSessionOwnerUid ?? null),
  };
};

/** Drop a stopped session and its join code, so a later Start can't bring its votes back. */
export const withStoppedSessionEnded = (config: PollConfig): PollConfig =>
  config.activePollSessionId || !config.lastPollSessionId
    ? config
    : {
        ...config,
        joinCode: null,
        lastPollSessionId: null,
        lastPollSessionOwnerUid: null,
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

/** Push the teacher's reveal and lock choices to every joined device (and the vote rules). */
export const syncSessionResultsState = async (
  teacherUid: string,
  sessionId: string,
  config: PollConfig
): Promise<void> => {
  await setDoc(
    doc(db, POLL_SESSIONS, makePollSessionId(teacherUid, sessionId)),
    { ...toSessionResultsState(config), updatedAt: Date.now() },
    { merge: true }
  );
};
