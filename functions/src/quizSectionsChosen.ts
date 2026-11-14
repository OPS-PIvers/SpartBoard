/**
 * Choose-N quiz sections on the server (docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md E14).
 * Mirrors `utils/quizSections.ts` `notChosenQuestionIds`, which functions/
 * can't import: the answered questions count first N in section order, topped
 * up with unanswered ones; the rest leave the student's total.
 */

export interface ChooseSection {
  id?: string;
  chooseCount?: number;
  questionIds: string[];
}

interface SectionAnswer {
  questionId: string;
  answer?: string;
  unresponded?: unknown;
}

/** Tolerant parse of `session.sections`; absent or malformed yields nothing. */
export function parseChooseSections(raw: unknown): ChooseSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s): ChooseSection[] => {
    if (typeof s !== 'object' || s === null) return [];
    const r = s as Record<string, unknown>;
    const ids = Array.isArray(r.questionIds)
      ? r.questionIds.filter((id): id is string => typeof id === 'string')
      : [];
    const count =
      typeof r.chooseCount === 'number' &&
      Number.isInteger(r.chooseCount) &&
      r.chooseCount > 0
        ? r.chooseCount
        : undefined;
    return ids.length > 0
      ? [
          {
            ...(typeof r.id === 'string' ? { id: r.id } : {}),
            questionIds: ids,
            ...(count ? { chooseCount: count } : {}),
          },
        ]
      : [];
  });
}

// Unlike the client mirror, recordings don't count: PLC math drops `artifacts` and never scores media.
const hasContent = (a: SectionAnswer): boolean =>
  !a.unresponded && stripTags(a.answer ?? '').trim().length > 0;

// Repeats until stable so a tag split by another tag can't survive one pass.
function stripTags(html: string): string {
  let text = html;
  let prev;
  do {
    prev = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== prev);
  return text;
}

/** The response's teacher picks by section id, kept only when they belong to its current attempt. */
export function parseCountedChoices(
  response: Record<string, unknown>
): Record<string, string[]> | undefined {
  const raw = response.countedChoices;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const attempt =
    typeof response.completedAttempts === 'number'
      ? response.completedAttempts
      : 0;
  if (r.attempt !== attempt) return undefined;
  if (typeof r.bySection !== 'object' || r.bySection === null) return undefined;
  const out: Record<string, string[]> = {};
  for (const [id, ids] of Object.entries(r.bySection)) {
    if (!Array.isArray(ids)) continue;
    const list = ids.filter((x): x is string => typeof x === 'string');
    if (list.length > 0) out[id] = list;
  }
  return out;
}

/** Question ids this student left out of a choose-N section; the teacher's picks count first. */
export function notChosenIds(
  sections: readonly ChooseSection[] | undefined,
  answers: readonly SectionAnswer[],
  servedIds?: readonly string[],
  picked?: Record<string, string[]>
): Set<string> {
  const out = new Set<string>();
  const served =
    servedIds && servedIds.length > 0 ? new Set(servedIds) : undefined;
  for (const section of sections ?? []) {
    const ids = served
      ? section.questionIds.filter((id) => served.has(id))
      : section.questionIds;
    const count = section.chooseCount;
    if (!count || count >= ids.length) continue;
    const answered = ids.filter((id) =>
      answers.some((a) => a.questionId === id && hasContent(a))
    );
    const chosen = new Set<string>();
    const add = (list: readonly string[]) => {
      for (const id of list) {
        if (chosen.size >= count) return;
        chosen.add(id);
      }
    };
    const teacherPicks = section.id ? picked?.[section.id] : undefined;
    // A pick counts only while its question still holds an answer.
    if (teacherPicks) {
      add(answered.filter((id) => teacherPicks.includes(id)));
    }
    add(answered);
    add(ids);
    for (const id of ids) if (!chosen.has(id)) out.add(id);
  }
  return out;
}
