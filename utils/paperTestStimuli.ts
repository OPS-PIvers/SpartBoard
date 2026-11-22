// The stimuli a printed test paper carries: inside a question, or once on a lettered resource page.
import type {
  QuizQuestion,
  QuizStimulus,
  QuizStimulusPaperPlacement,
} from '@/types';
import { parseWordBank, wordBankColumns } from './quizWordBank';

/** One stimulus as the test paper prints it. */
export type PaperTestStimulus =
  | { kind: 'text'; title?: string; text: string }
  | {
      kind: 'word-bank';
      title?: string;
      groups: string[][];
      columns: 1 | 2 | 3;
    }
  | { kind: 'image'; title?: string; src: string }
  | { kind: 'pages'; title?: string; srcs: string[] }
  | { kind: 'link'; title: string; url: string };

/** Pictures fetched before the print window opens, by stimulus id. */
export interface PaperTestStimulusFiles {
  images: Readonly<Record<string, string>>;
  /** A PDF, Doc or Slides file rendered page by page. */
  pages: Readonly<Record<string, readonly string[]>>;
}

/** Stimuli whose content has to be fetched and drawn before printing. */
export function isFetchedStimulus(s: QuizStimulus): boolean {
  if (s.type === 'image' || s.type === 'pdf') return !!s.driveFileId || !!s.url;
  return s.type === 'gdoc-embed' && !!s.driveFileId;
}

const GDOC_KIND = /docs\.google\.com\/(document|presentation|spreadsheets)\//i;

/** What a stimulus that can't print on paper is called next to its link. */
export function stimulusLinkTitle(s: QuizStimulus): string {
  const named = s.tabLabel?.trim();
  if (named) return named;
  switch (s.type) {
    case 'video':
    case 'youtube':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'image':
      return 'Image';
    case 'pdf':
      return 'PDF';
    case 'gdoc-embed': {
      const kind = GDOC_KIND.exec(s.url)?.[1]?.toLowerCase();
      if (kind === 'presentation') return 'Google Slides';
      if (kind === 'spreadsheets') return 'Google Sheets';
      return 'Google Doc';
    }
    default:
      return 'Link';
  }
}

/** A link a student can type: the Drive file's address when the stimulus has no URL of its own. */
function stimulusLink(s: QuizStimulus): string {
  if (s.url && !/^(data|blob):/i.test(s.url)) return s.url;
  return s.driveFileId
    ? `https://drive.google.com/file/d/${s.driveFileId}/view`
    : '';
}

/** How one stimulus prints; null for one with nothing to put on paper. */
export function paperTestStimulus(
  s: QuizStimulus,
  files: PaperTestStimulusFiles
): PaperTestStimulus | null {
  const title = s.tabLabel?.trim();
  const withTitle = title ? { title } : {};
  switch (s.type) {
    case 'text': {
      const text = s.text?.trim();
      return text ? { kind: 'text', ...withTitle, text } : null;
    }
    case 'word-bank': {
      const groups = parseWordBank(s.text);
      return groups.length
        ? {
            kind: 'word-bank',
            ...withTitle,
            groups,
            columns: wordBankColumns(s.wordBankColumns),
          }
        : null;
    }
    // A calculator is a device tool, so paper has nothing to show for it.
    case 'calculator':
      return null;
    default:
      break;
  }
  const image = files.images[s.id];
  if (image) return { kind: 'image', ...withTitle, src: image };
  const pages = files.pages[s.id];
  if (pages?.length) return { kind: 'pages', ...withTitle, srcs: [...pages] };
  const url = stimulusLink(s);
  return url ? { kind: 'link', title: stimulusLinkTitle(s), url } : null;
}

/** A printed question as `attachPaperTestStimuli` needs it. */
export interface PrintedQuestionRef {
  questionId: string;
  row: number | string;
}

/** Per printed question: stimuli printed inside it and the resources it points to. */
export interface PrintedQuestionStimuli {
  stimuli?: PaperTestStimulus[];
  /** Resource letters, as in "Use Resource A." */
  resources?: string[];
}

/** One resource page section: "Resource A" and what it prints. */
export interface PaperTestResource {
  letter: string;
  item: PaperTestStimulus;
}

/** Where a stimulus prints when the teacher hasn't picked: with its one question, else as a resource. */
export function defaultPaperPlacement(
  s: Pick<QuizStimulus, 'type' | 'placement'>,
  questionCount: number
): QuizStimulusPaperPlacement {
  // A picture the teacher put in the question stays in it, as students see it.
  if (s.type === 'image' && s.placement === 'inline') return 'question';
  return questionCount > 1 ? 'resource' : 'question';
}

export function paperPlacementOf(
  s: Pick<QuizStimulus, 'type' | 'placement' | 'paperPlacement'>,
  questionCount: number
): QuizStimulusPaperPlacement {
  return s.paperPlacement ?? defaultPaperPlacement(s, questionCount);
}

/** A, B ... Z, then AA, AB. */
export function resourceLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Splits a test's stimuli between questions and resource pages. A resource is
 * lettered in the order students first meet it.
 */
export function attachPaperTestStimuli(
  printed: readonly PrintedQuestionRef[],
  questionsById: ReadonlyMap<string, Pick<QuizQuestion, 'id' | 'stimulusIds'>>,
  stimuli: readonly QuizStimulus[],
  files: PaperTestStimulusFiles
): {
  questions: Map<string, PrintedQuestionStimuli>;
  resources: PaperTestResource[];
} {
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  const uses = new Map<string, number>();
  for (const p of printed)
    for (const id of new Set(questionsById.get(p.questionId)?.stimulusIds))
      uses.set(id, (uses.get(id) ?? 0) + 1);
  const items = new Map<string, PaperTestStimulus | null>();
  const itemOf = (s: QuizStimulus) => {
    if (!items.has(s.id)) items.set(s.id, paperTestStimulus(s, files));
    return items.get(s.id) ?? null;
  };
  const letters = new Map<string, string>();
  const resources: PaperTestResource[] = [];
  const questions = new Map<string, PrintedQuestionStimuli>();
  for (const p of printed) {
    const inQuestion: PaperTestStimulus[] = [];
    const refs: string[] = [];
    for (const id of new Set(questionsById.get(p.questionId)?.stimulusIds)) {
      const s = byId.get(id);
      const item = s ? itemOf(s) : null;
      if (!s || !item) continue;
      if (paperPlacementOf(s, uses.get(id) ?? 0) === 'question') {
        inQuestion.push(item);
        continue;
      }
      let letter = letters.get(id);
      if (!letter) {
        letter = resourceLetter(resources.length);
        letters.set(id, letter);
        resources.push({ letter, item });
      }
      refs.push(letter);
    }
    if (inQuestion.length || refs.length)
      questions.set(p.questionId, {
        ...(inQuestion.length ? { stimuli: inQuestion } : {}),
        ...(refs.length ? { resources: refs } : {}),
      });
  }
  return { questions, resources };
}

/** "Use Resource A." or "Use Resources A and B." */
export function resourceLine(letters: readonly string[]): string {
  if (letters.length === 0) return '';
  if (letters.length === 1) return `Use Resource ${letters[0]}.`;
  const head = letters.slice(0, -1).join(', ');
  return `Use Resources ${head} and ${letters[letters.length - 1]}.`;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** A teammate's copy of the owner's quiz stimuli, checked because it arrives untyped. */
export interface TeammateQuizStimuli {
  stimuli: QuizStimulus[];
  questionsById: Map<string, Pick<QuizQuestion, 'id' | 'stimulusIds'>>;
}

export function teammateQuizStimuli(
  quiz:
    | { questions: readonly unknown[]; stimuli?: readonly unknown[] }
    | null
    | undefined
): TeammateQuizStimuli {
  const stimuli = (quiz?.stimuli ?? []).filter(
    (s): s is QuizStimulus =>
      isRecord(s) &&
      typeof s.id === 'string' &&
      typeof s.type === 'string' &&
      (s.url === undefined || typeof s.url === 'string') &&
      (s.text === undefined || typeof s.text === 'string') &&
      (s.tabLabel === undefined || typeof s.tabLabel === 'string')
  );
  const questionsById = new Map<
    string,
    Pick<QuizQuestion, 'id' | 'stimulusIds'>
  >();
  for (const q of quiz?.questions ?? []) {
    if (!isRecord(q) || typeof q.id !== 'string') continue;
    const ids = Array.isArray(q.stimulusIds)
      ? q.stimulusIds.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.length) questionsById.set(q.id, { id: q.id, stimulusIds: ids });
  }
  const used = new Set(
    [...questionsById.values()].flatMap((q) => q.stimulusIds ?? [])
  );
  return {
    stimuli: stimuli
      .filter((s) => used.has(s.id))
      .map((s) => ({ ...s, url: s.url ?? '' })),
    questionsById,
  };
}

/** Adds the owner's stimuli to the test paper rows the server built; rows from an older server print as before. */
export function teammateTestPaper<
  Row extends { row: number | string; questionId?: string },
>(
  rows: readonly Row[],
  quiz: TeammateQuizStimuli,
  files: PaperTestStimulusFiles
): {
  questions: (Omit<Row, 'questionId'> & PrintedQuestionStimuli)[];
  resources: PaperTestResource[];
} {
  const printed = rows.flatMap((r) =>
    r.questionId ? [{ questionId: r.questionId, row: r.row }] : []
  );
  const placed = attachPaperTestStimuli(
    printed,
    quiz.questionsById,
    quiz.stimuli,
    files
  );
  return {
    questions: rows.map(({ questionId, ...rest }) => ({
      ...rest,
      ...(questionId ? placed.questions.get(questionId) : undefined),
    })),
    resources: placed.resources,
  };
}
