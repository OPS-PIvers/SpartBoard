/**
 * One key-merge step for both readers and both key sources
 * (docs/plans/QUIZ_IMPORT_RELIABILITY.md R10–R13).
 *
 * A key matches by section, item and part when both the test and the key
 * print sections; otherwise by item number when the test's numbers are unique,
 * and by position when they restart. Nothing the key says is dropped quietly:
 * an entry with no question, an answer that doesn't fit, a rubric the importer
 * can't carry, each becomes a row note or a quiz note.
 */

import { applyKeyAnswer, type KeySource } from './answerKey';
import type {
  ExtractedQuestion,
  ExtractedQuiz,
  KeyItem,
  ReaderOptions,
} from './types';

const RUBRIC_NOTE =
  'The key has a scoring rubric for this item — add it in the editor.';
const NOT_SCORED_NOTE = 'The answer key says this item isn’t scored.';

const note = (q: ExtractedQuestion, text: string): ExtractedQuestion => ({
  ...q,
  warnings: [...q.warnings, text],
});

/** How the key's entries find their questions. */
type Matcher = (item: KeyItem, index: number) => number[];

const partMatches = (item: KeyItem, q: ExtractedQuestion): boolean =>
  !item.part || !q.ref?.part || item.part === q.ref.part;

function matcherFor(
  questions: readonly ExtractedQuestion[],
  items: readonly KeyItem[]
): Matcher {
  const byPosition: Matcher = (item) =>
    questions.flatMap((q, i) => (q.number === item.item ? [i] : []));
  if (!questions.every((q) => q.ref)) return byPosition;

  const refs = questions.map((q) => q.ref as NonNullable<typeof q.ref>);
  const quizSections = [...new Set(refs.map((r) => r.section))].sort(
    (a, b) => a - b
  );
  const keySections = [
    ...new Set(items.flatMap((k) => (k.section ? [k.section.ordinal] : []))),
  ].sort((a, b) => a - b);

  if (quizSections.length > 1 && keySections.length > 1) {
    // A key's "Section 2" is the test's Section 2 by printed number, else by order.
    const sectionFor = (item: KeyItem): number | undefined => {
      const printed = item.section?.printed;
      const byNumber =
        printed !== undefined
          ? refs.find((r) => r.sectionNumber === printed)?.section
          : undefined;
      if (byNumber !== undefined) return byNumber;
      const at = keySections.indexOf(item.section?.ordinal ?? -1);
      return at === -1 ? undefined : quizSections[at];
    };
    return (item) => {
      const section = sectionFor(item);
      return questions.flatMap((q, i) =>
        refs[i].section === section &&
        refs[i].item === item.item &&
        partMatches(item, q)
          ? [i]
          : []
      );
    };
  }

  const printed = refs.map((r) => `${r.item}${r.part ?? ''}`);
  if (new Set(printed).size === printed.length) {
    if (keySections.length > 1) {
      // A key that restarts against a test that doesn't: take the key in order.
      return (_item, index) => (index < questions.length ? [index] : []);
    }
    return (item) =>
      questions.flatMap((q, i) =>
        q.ref?.item === item.item && partMatches(item, q) ? [i] : []
      );
  }
  return byPosition;
}

/** Indexes of the questions some answer-bearing key entry resolves to. */
export function keyedQuestionIndexes(
  questions: readonly ExtractedQuestion[],
  items: readonly KeyItem[]
): Set<number> {
  const match = matcherFor(questions, items);
  return new Set(
    items.flatMap((item, index) =>
      item.answer || item.ordering?.length ? match(item, index) : []
    )
  );
}

const comparable = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** An ordering key's items matched to the question's own by their text. */
function applyOrdering(
  q: ExtractedQuestion,
  ordering: readonly string[]
): ExtractedQuestion {
  if (q.type !== 'Ordering') {
    return note(
      q,
      `The answer key gives an order for this question (${ordering.join(', ')}), but it didn’t come in as an ordering question.`
    );
  }
  const left = [...q.options];
  const ordered: string[] = [];
  for (const text of ordering) {
    const want = comparable(text);
    const at = left.findIndex((o) => {
      const have = comparable(o.text);
      return have === want || have.startsWith(want) || want.startsWith(have);
    });
    if (at === -1 || !want) break;
    ordered.push(left[at].text);
    left.splice(at, 1);
  }
  if (left.length > 0 || ordered.length !== ordering.length) {
    return note(
      q,
      'The answer key’s order doesn’t match this question’s items, so put them in order in the editor.'
    );
  }
  return { ...q, correctAnswer: ordered.join('|') };
}

/** The printed name of a key entry, for a note. */
export function keyItemLabel(item: KeyItem): string {
  const section = item.section
    ? `${item.section.printed ?? item.section.ordinal}·`
    : '';
  return `${section}${item.item}${item.part ?? ''}`;
}

const listed = (labels: string[]): string =>
  labels.length === 1
    ? `question ${labels[0]}`
    : `questions ${labels.join(', ')}`;

/** Points for a question, split evenly when the key gave them for the whole item. */
function withPoints(
  q: ExtractedQuestion,
  points: number,
  shares: number
): ExtractedQuestion {
  if (shares <= 1) return { ...q, points };
  const each = Math.round((points / shares) * 100) / 100;
  return note(
    { ...q, points: each },
    `The key gives ${points} points for this item, split evenly between its ${shares} parts.`
  );
}

/**
 * Merges a key onto the questions. Called once for a key printed in the test
 * and again for a key file, so the file's answers land last and win.
 */
export function mergeAnswerKey(
  quiz: ExtractedQuiz,
  items: readonly KeyItem[],
  source: KeySource = 'file',
  options: ReaderOptions = {}
): ExtractedQuiz {
  if (items.length === 0) return quiz;
  const multi = options.multiAnswer === true;
  const questions = [...quiz.questions];
  const match = matcherFor(questions, items);
  const unmatched: string[] = [];
  let entries = 0;
  let matched = 0;
  let conflicts = 0;

  items.forEach((item, index) => {
    const targets = match(item, index);
    const hasAnswer = Boolean(item.answer) || Boolean(item.ordering?.length);
    if (hasAnswer) entries += 1;
    if (hasAnswer && targets.length > 0) matched += 1;
    if (targets.length === 0) {
      if (hasAnswer) unmatched.push(keyItemLabel(item));
      return;
    }
    if (targets.length > 1 && hasAnswer) {
      // One answer for an item printed as Part A and Part B.
      for (const t of targets) {
        questions[t] = note(
          questions[t],
          `The answer key has one answer (${item.answer || item.ordering?.join(', ')}) for this whole item, so check which part it belongs to.`
        );
      }
    }
    for (const t of targets) {
      let q = questions[t];
      if (targets.length === 1 && item.ordering?.length) {
        q = applyOrdering(q, item.ordering);
      } else if (targets.length === 1 && item.answer) {
        const before = q.correctAnswer.trim();
        q = applyKeyAnswer(q, item.answer, source, multi);
        if (source === 'file' && before && q.correctAnswer.trim() !== before) {
          conflicts += 1;
        }
      }
      if (item.points !== undefined) {
        const shares = item.pointsForItem
          ? questions.filter(
              (other) =>
                other.ref &&
                q.ref &&
                other.ref.section === q.ref.section &&
                other.ref.item === q.ref.item
            ).length
          : targets.length;
        q = withPoints(q, item.points, shares);
      }
      if (item.rubric) q = note(q, RUBRIC_NOTE);
      if (item.notScored && !q.suggestUntick) {
        q = { ...q, suggestUntick: NOT_SCORED_NOTE };
      }
      questions[t] = q;
    }
  });

  const warnings = [...quiz.warnings];
  if (unmatched.length > 0) {
    const verb = unmatched.length === 1 ? 'isn’t' : 'aren’t';
    warnings.push(
      source === 'file'
        ? `The answer key has an answer for ${listed(unmatched)}, which ${verb} in this test.`
        : `The answer key at the end of the document has an answer for ${listed(unmatched)}, which ${verb} among the questions read.`
    );
  }
  return {
    ...quiz,
    questions,
    warnings,
    keySummary: {
      source,
      entries,
      matched,
      unmatchedLabels: unmatched,
      conflicts,
    },
  };
}

/** A key as answers by number, for callers that have only that. */
export function applyAnswerKey(
  quiz: ExtractedQuiz,
  key: ReadonlyMap<number, string>,
  source: KeySource = 'file',
  options: ReaderOptions = {}
): ExtractedQuiz {
  const items = [...key].map(([item, answer]) => ({ item, answer }));
  return mergeAnswerKey(quiz, items, source, options);
}
