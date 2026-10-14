/** Stop checkpoints between quiz parts (QUIZ_IMPORT_VERSIONS.md V20–V23). */

import type {
  QuizPartsOpen,
  QuizResponse,
  QuizSession,
  QuizSessionSection,
} from '@/types';

type Sections = readonly Pick<QuizSessionSection, 'id' | 'stopAfter'>[];

/** Ids of sections that end a part; a Stop on the last section has nothing after it. */
function stopIds(sections: Sections | undefined): Set<string> {
  const list = sections ?? [];
  return new Set(
    list
      .slice(0, -1)
      .filter((s) => s.stopAfter === true)
      .map((s) => s.id)
  );
}

/** How many parts the Stops split the quiz into; 1 when there are none. */
export function totalParts(sections: Sections | undefined): number {
  return stopIds(sections).size + 1;
}

/** Stops apply only to self-paced sessions (D14). */
export function sessionHasStops(
  session: Pick<QuizSession, 'sessionMode' | 'sections'>
): boolean {
  return session.sessionMode === 'student' && totalParts(session.sections) > 1;
}

/** The part a question belongs to; questions before the first section are in part 1. */
export function partOfQuestion(
  sections:
    | readonly Pick<QuizSessionSection, 'id' | 'stopAfter' | 'questionIds'>[]
    | undefined,
  questionId: string
): number {
  const stops = stopIds(sections);
  let part = 1;
  for (const section of sections ?? []) {
    if (section.questionIds.includes(questionId)) return part;
    if (stops.has(section.id)) part++;
  }
  return 1;
}

/** The class period a response belongs to, by name. */
export function periodOfResponse(
  session: Pick<QuizSession, 'classPeriodByClassId'>,
  response: Pick<QuizResponse, 'classPeriod' | 'classId'>
): string | undefined {
  return (
    response.classPeriod ??
    (response.classId
      ? session.classPeriodByClassId?.[response.classId]
      : undefined)
  );
}

const asPart = (v: unknown): number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 1;

/** Highest part open to one student: the session, their period or them alone. */
export function openedPartFor(
  partsOpen: QuizPartsOpen | undefined,
  period: string | undefined,
  responseKey: string | undefined
): number {
  if (!partsOpen) return 1;
  return Math.max(
    asPart(partsOpen.all),
    period ? asPart(partsOpen.periods?.[period]) : 1,
    responseKey ? asPart(partsOpen.students?.[responseKey]) : 1
  );
}

/** Parts this student has submitted; absent on every response written before Stops. */
export function partsDoneOf(response: Pick<QuizResponse, 'partsDone'>): number {
  const n = response.partsDone;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
}

/** True while a student waits at a Stop for a part that isn't open yet. */
export function isWaitingAtStop(
  response: Pick<QuizResponse, 'partsDone' | 'partHeld' | 'status'>,
  openedPart: number,
  parts: number
): boolean {
  const done = partsDoneOf(response);
  return (
    response.status !== 'completed' &&
    response.partHeld === true &&
    done > 0 &&
    done < parts &&
    openedPart <= done
  );
}

/** The part the teacher opens next for these waiting students; null when none wait. */
export function nextPartToOpen(
  waiting: readonly Pick<QuizResponse, 'partsDone'>[]
): number | null {
  if (waiting.length === 0) return null;
  return Math.min(...waiting.map((r) => partsDoneOf(r) + 1));
}
