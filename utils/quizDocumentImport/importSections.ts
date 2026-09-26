/** Printed section headings as quiz sections (docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md E16). */

import type { ExtractedQuestion } from './types';

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** `PICK TWO (2)`, `answer any 3`, `choose 2 of the following`; not "select one answer". */
const CHOOSE =
  /\b(?:pick|choose|select|answer|complete|do)\s+(?:any\s+|only\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b(?!(?:\s*\(\s*\d{1,2}\s*\))?\s*(?:best\s+|correct\s+)?(?:answers?|choices?|options?|letters?|responses?|words?|terms?)\b)/i;

/** `5 points`, `(3 pts each)`, `-3 points each`. */
const POINTS =
  /\s*[-–—:,]?\s*\(?\s*\d{1,3}(?:\.\d+)?\s*(?:pts?|points?)\.?(?:\s*each)?\s*\)?/gi;

const SEPARATOR = /\s*[-–—:]\s*/;

/** The count a heading or its directions ask students to answer. */
export function chooseCountOf(text: string | undefined): number | undefined {
  const m = CHOOSE.exec(text ?? '');
  if (!m) return undefined;
  const raw = m[1].toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  return n && n > 0 ? n : undefined;
}

/** A heading split into its title and any directions printed on the same line. */
export function headingParts(name: string): {
  title: string;
  directions?: string;
} {
  const withoutPoints = name.replace(POINTS, '').trim();
  const pieces = withoutPoints
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  const chooseAt = pieces.findIndex((p) => CHOOSE.test(p));
  if (chooseAt <= 0) return { title: withoutPoints || name.trim() };
  return {
    title: pieces.slice(0, chooseAt).join(' – '),
    directions: pieces.slice(chooseAt).join(' – '),
  };
}

/** Items in a section, counting Part A and Part B of one item once. */
const itemCount = (
  questions: readonly ExtractedQuestion[],
  indexes: readonly number[]
): number => new Set(indexes.map((i) => questions[i].ref?.item ?? i)).size;

export interface ImportSection {
  title: string;
  directions?: string;
  chooseCount?: number;
  /** Indexes into the extracted questions, in order. */
  questionIndexes: number[];
}

/** One section per printed heading, or none when the test printed no headings. */
export function importSections(
  questions: readonly ExtractedQuestion[]
): ImportSection[] {
  if (!questions.some((q) => q.ref?.sectionName)) return [];
  const out: ImportSection[] = [];
  let ordinal: number | undefined;
  questions.forEach((q, index) => {
    const ref = q.ref;
    if (!ref) {
      out.at(-1)?.questionIndexes.push(index);
      return;
    }
    if (ref.section === ordinal) {
      out.at(-1)?.questionIndexes.push(index);
      return;
    }
    ordinal = ref.section;
    const parts = ref.sectionName
      ? headingParts(ref.sectionName)
      : { title: `Section ${ref.section}` };
    const directions = [parts.directions, ref.sectionDirections]
      .filter(Boolean)
      .join('\n');
    out.push({
      title: parts.title,
      ...(directions ? { directions } : {}),
      questionIndexes: [index],
    });
  });
  // A count only means something when it leaves students a choice.
  return out.map((s) => {
    const count =
      chooseCountOf(s.directions) ??
      chooseCountOf(questions[s.questionIndexes[0]].ref?.sectionName);
    return count && count < itemCount(questions, s.questionIndexes)
      ? { ...s, chooseCount: count }
      : s;
  });
}

/** Review notes for choose-N headings a teacher without sections can't enforce. */
export function unenforcedChooseNotes(
  questions: readonly ExtractedQuestion[]
): string[] {
  return importSections(questions).flatMap((s) =>
    s.chooseCount
      ? [
          `Question ${questions[s.questionIndexes[0]].number}: Students choose ${s.chooseCount} of these ${itemCount(questions, s.questionIndexes)}; turn on sections to enforce it.`,
        ]
      : []
  );
}
