import type {
  VideoActivityLiveState,
  VideoActivityQuestion,
  VideoActivitySession,
} from '@/types';

type LiveSessionFields = Pick<VideoActivitySession, 'sessionMode' | 'live'>;

export const isLiveVideoActivitySession = (
  session: LiveSessionFields | null | undefined
): boolean => session?.sessionMode === 'teacher';

export const initialVideoActivityLiveState = (
  now: number
): VideoActivityLiveState => ({
  currentQuestionId: null,
  questionPhase: 'closed',
  resultsShown: false,
  answerRevealed: false,
  askedQuestionIds: [],
  skippedQuestionIds: [],
  playheadSeconds: 0,
  updatedAt: now,
});

/** The questions a response is scored over: every question, or only the asked ones in a live session (D11). */
export function scoredVideoActivityQuestions<
  Q extends Pick<VideoActivityQuestion, 'id'>,
>(session: LiveSessionFields | null | undefined, questions: Q[]): Q[] {
  if (!isLiveVideoActivitySession(session)) return questions;
  const asked = new Set(session?.live?.askedQuestionIds ?? []);
  return questions.filter((q) => asked.has(q.id));
}

type TimedQuestion = Pick<VideoActivityQuestion, 'id' | 'timestamp'>;
type LivePacing = Pick<
  VideoActivityLiveState,
  'askedQuestionIds' | 'skippedQuestionIds'
>;

/** Asked/skipped lists after a seek: unopened questions in (prev, next] become skipped (D12). */
export function computeSkippedOnSeek(
  prevSeconds: number,
  nextSeconds: number,
  questions: TimedQuestion[],
  live: LivePacing
): LivePacing {
  const askedQuestionIds = [...live.askedQuestionIds];
  const skippedQuestionIds = [...live.skippedQuestionIds];
  if (nextSeconds <= prevSeconds)
    return { askedQuestionIds, skippedQuestionIds };
  const asked = new Set(askedQuestionIds);
  const skipped = new Set(skippedQuestionIds);
  const passed = questions
    .filter((q) => q.timestamp > prevSeconds && q.timestamp <= nextSeconds)
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const q of passed) {
    if (asked.has(q.id) || skipped.has(q.id)) continue;
    skipped.add(q.id);
    skippedQuestionIds.push(q.id);
  }
  return { askedQuestionIds, skippedQuestionIds };
}

/** The first unasked, unskipped question forward playback crossed in (prev, next], or null. */
export function questionCrossed<Q extends TimedQuestion>(
  prevSeconds: number,
  nextSeconds: number,
  questions: Q[],
  live: LivePacing
): Q | null {
  if (nextSeconds <= prevSeconds) return null;
  const done = new Set([...live.askedQuestionIds, ...live.skippedQuestionIds]);
  let first: Q | null = null;
  for (const q of questions) {
    if (done.has(q.id)) continue;
    if (q.timestamp <= prevSeconds || q.timestamp > nextSeconds) continue;
    if (!first || q.timestamp < first.timestamp) first = q;
  }
  return first;
}

export type LiveQuestionState = 'upcoming' | 'open' | 'closed' | 'skipped';

/** Jump-list chip state for one question. */
export function liveQuestionState(
  questionId: string,
  live: Pick<
    VideoActivityLiveState,
    | 'currentQuestionId'
    | 'questionPhase'
    | 'askedQuestionIds'
    | 'skippedQuestionIds'
  >
): LiveQuestionState {
  if (live.currentQuestionId === questionId && live.questionPhase === 'open')
    return 'open';
  if (live.askedQuestionIds.includes(questionId)) return 'closed';
  if (live.skippedQuestionIds.includes(questionId)) return 'skipped';
  return 'upcoming';
}

interface RosterStudentName {
  firstName: string;
  lastName: string;
  pin: string;
}

interface LiveResponseLike {
  pin?: string;
  name?: string;
  studentUid: string;
  answers: { questionId: string }[];
}

const nameKey = (s: string): string =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Who hasn't answered the open question: joined without an answer, and roster students not joined (D15). */
export function whoHasntAnswered(
  questionId: string,
  responses: LiveResponseLike[],
  rosterStudents: RosterStudentName[],
  byStudentUid: Map<string, { givenName: string; familyName: string }>
): { notAnswered: string[]; notJoined: string[] } {
  const joinedPins = new Set<string>();
  const joinedNames = new Set<string>();
  const notAnswered: string[] = [];
  for (const r of responses) {
    const resolved = byStudentUid.get(r.studentUid);
    const rosterName = resolved
      ? `${resolved.givenName} ${resolved.familyName}`.trim()
      : '';
    const pinStudent = r.pin
      ? rosterStudents.find((s) => s.pin === r.pin)
      : undefined;
    const pinName = pinStudent
      ? `${pinStudent.firstName} ${pinStudent.lastName}`.trim()
      : '';
    const label =
      [rosterName, pinName, r.name].find(Boolean) ??
      (r.pin ? `PIN ${r.pin}` : 'Student');
    if (r.pin) joinedPins.add(r.pin);
    if (rosterName) joinedNames.add(nameKey(rosterName));
    if (!r.answers.some((a) => a.questionId === questionId))
      notAnswered.push(label);
  }
  const notJoined = rosterStudents
    .filter(
      (s) =>
        !joinedPins.has(s.pin) &&
        !joinedNames.has(nameKey(`${s.firstName} ${s.lastName}`))
    )
    .map((s) => `${s.firstName} ${s.lastName}`.trim());
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    notAnswered: notAnswered.sort(byName),
    notJoined: notJoined.sort(byName),
  };
}
