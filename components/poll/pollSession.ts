/**
 * Public-poll session orchestration: minting the sticky join code, deriving the
 * `poll_sessions` doc key, aggregating the live votes subcollection client-side,
 * and starting/stopping a session (the server-enforced `active` flag). Shared by
 * the widget (Settings + board), the phone remote, and the participant app so
 * all four drive the same state.
 */

import { arrayUnion, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
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
  /** Server write time of a typed answer, in ms; absent on answers from older phones. */
  answeredAt?: number;
}

/** Newest-first sort time for a typed answer: the server's clock, or a student clock capped at now. */
export const answerTime = (a: PollVoteEntry, now = Date.now()): number =>
  a.answeredAt ?? Math.min(a.votedAt ?? 0, now);

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
  questions: PollQuestion[]
): PollSessionQuestion[] =>
  questions.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options.map((o) => ({ id: o.id, label: o.label })),
    ...(q.kind === 'scale'
      ? {
          kind: 'scale' as const,
          scaleLow: q.scaleLow ?? '',
          scaleHigh: q.scaleHigh ?? '',
        }
      : {}),
    ...(q.kind === 'words' || q.kind === 'text' ? { kind: q.kind } : {}),
  }));

/** The session-doc mirror of the teacher's reveal and lock choices, keyed by question index. */
export const toSessionResultsState = (
  config: PollConfig
): Pick<
  PollSessionDoc,
  'hideResults' | 'revealedQuestions' | 'lockedQuestions' | 'shownAnswers'
> => {
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

const CALL_TIMEOUT = { timeout: 8000 };

/** Mint a code no other session is already using; the server picks and reserves it. */
const mintUniquePollCode = async (): Promise<string> => {
  // The auth-bypass harness has no real token or functions backend.
  if (isAuthBypass) return generatePollCode();
  const { data } = await httpsCallable<Record<string, never>, { code: string }>(
    functions,
    'mintPollCodeV1',
    CALL_TIMEOUT
  )({});
  return data.code;
};

/** On a shared board, let this teacher's session take over a colleague's code; the server checks the board. */
const claimSharedPollCode = async (
  code: string,
  boardShareId: string
): Promise<void> => {
  if (isAuthBypass) return;
  try {
    await httpsCallable<
      { code: string; shareId: string },
      { claimed: boolean }
    >(
      functions,
      'claimPollCodeV1',
      CALL_TIMEOUT
    )({ code, shareId: boardShareId });
  } catch (err: unknown) {
    // The session still starts; joiners keep reaching the colleague's session until a claim lands.
    console.warn('[pollSession] code claim failed', err);
  }
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
    textQuestions: questions.flatMap((q, i) => (isTextQuestion(q) ? [i] : [])),
    currentQuestionIndex,
    active: state.active,
    startedAt: state.startedAt,
    updatedAt: Date.now(),
    ...toSessionResultsState(config),
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
 * code rather than a patched config: the caller must merge it (with
 * `joinCodeOwnerUid`) onto whatever config is current when this resolves, or a
 * concurrent edit is lost.
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

/** A device's place in a session: the session id and the voter id that keys its votes. */
export interface PollJoin {
  sessionId: string;
  voterId: string;
}

// undefined when the call failed, null when no session was found.
const resolveCode = async (
  code: string
): Promise<PollJoin | null | undefined> => {
  try {
    const { data } = await httpsCallable<
      { code: string },
      { sessionId: string | null; voterId?: string | null }
    >(
      functions,
      'resolvePollCodeV1',
      CALL_TIMEOUT
    )({ code });
    // A server deployed before voter ids answers without one; votes then fall back to the uid.
    return data.sessionId
      ? { sessionId: data.sessionId, voterId: data.voterId ?? '' }
      : null;
  } catch (err: unknown) {
    console.warn('[pollSession] code lookup failed', err);
    return undefined;
  }
};

/** Resolve a participant-entered code to its session doc and this device's voter id. */
export const lookupPollSessionByCode = async (
  rawCode: string
): Promise<(PollJoin & { data: PollSessionDoc }) | null> => {
  const code = normalizePollCode(rawCode);
  if (!code || isAuthBypass) return null;
  let join = await resolveCode(code);
  // The pointer lands just after Start, so a quick scan can beat it; a failed call gets the same retries.
  for (const wait of POINTER_RETRY_MS) {
    if (join) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    join = await resolveCode(code);
  }
  if (!join) return null;
  const snap = await getDoc(doc(db, POLL_SESSIONS, join.sessionId));
  if (!snap.exists()) return null;
  return { ...join, data: snap.data() as PollSessionDoc };
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
  boardShareId?: string | null
): Promise<PollConfig> => {
  // A copied board carries another teacher's code; a live share is vetted by the server instead.
  const foreignCode =
    !boardShareId &&
    !!config.joinCodeOwnerUid &&
    config.joinCodeOwnerUid !== teacherUid &&
    config.lastPollSessionOwnerUid !== teacherUid;
  const freshState = mode === 'fresh' || foreignCode;
  const rotate = mode === 'fresh' && !!config.lastPollSessionId;
  const reuse = !rotate && !foreignCode && !!config.joinCode;
  const code =
    reuse && config.joinCode ? config.joinCode : await mintUniquePollCode();
  // A shared board's code may have been minted by a colleague.
  if (reuse && boardShareId && config.lastPollSessionOwnerUid !== teacherUid) {
    await claimSharedPollCode(code, boardShareId);
  }
  // A fresh start hides and unlocks every question again; resume keeps them.
  const base: PollConfig = freshState
    ? {
        ...config,
        revealedQuestionIds: [],
        lockedQuestionIds: [],
        answerShownQuestionIds: [],
        hiddenResponses: [],
      }
    : config;
  const currentQuestionIndex = await writeSessionDoc(teacherUid, code, base, {
    active: true,
    startedAt: Date.now(),
  });
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
    // A code we minted, or an unstamped one whose last session we ran on our own board, is ours.
    ...(!reuse ||
    (!boardShareId &&
      !config.joinCodeOwnerUid &&
      config.lastPollSessionOwnerUid === teacherUid)
      ? { joinCodeOwnerUid: teacherUid }
      : {}),
    activePollSessionId: code,
    activePollSessionOwnerUid: teacherUid,
    currentQuestionIndex,
    // On a fresh start the old lastPollSessionId belongs to an abandoned
    // session. Clear it so the UI doesn't offer to "Resume" the stale session
    // once the teacher stops and then clicks Start again. On 'resume' mode the
    // id matches lastPollSessionId already, so this is always a no-op there.
    lastPollSessionId: freshState ? null : (config.lastPollSessionId ?? null),
    ...(foreignCode ? { lastPollSessionOwnerUid: null } : {}),
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
        joinCodeOwnerUid: null,
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

// Hidden word cloud words are student text, so they live in an owner-only doc, never in shared board config.
const hiddenWordsDoc = (
  teacherUid: string,
  sessionId: string,
  questionId: string
) =>
  doc(
    db,
    POLL_SESSIONS,
    makePollSessionId(teacherUid, sessionId),
    'hidden_words',
    questionId
  );

/** Hide a word cloud word (already a cloudKey) from the board and results. */
export const hidePollWord = async (
  teacherUid: string,
  sessionId: string,
  questionId: string,
  word: string
): Promise<void> => {
  await setDoc(
    hiddenWordsDoc(teacherUid, sessionId, questionId),
    { words: arrayUnion(word) },
    { merge: true }
  );
};

/** Bring back every word hidden on one question. */
export const showPollHiddenWords = async (
  teacherUid: string,
  sessionId: string,
  questionId: string
): Promise<void> => {
  await deleteDoc(hiddenWordsDoc(teacherUid, sessionId, questionId));
};
