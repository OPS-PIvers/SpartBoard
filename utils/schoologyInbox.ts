// Turns Schoology import inbox entries (docs/plans/SCHOOLOGY_QUIZ_IMPORT.md Q8) into review rows and saved copies.

import type {
  ImportSource,
  QuizBehaviorSettings,
  QuizQuestion,
  QuizQuestionType,
} from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { importSourceKey } from '@/utils/importSource';
import { SCHOOLOGY_REVIEW_PARAM } from '@/utils/schoologyReviewProtocol';
import {
  questionNeedsKey,
  type ExtractedQuestion,
  type ExtractedQuiz,
} from '@/utils/quizDocumentImport/types';

export const SCHOOLOGY_INBOX_COLLECTION = 'schoology_import_inbox';

export type SchoologyItemKind = ImportSource['kind'];

export interface SchoologyInboxSource {
  kind: SchoologyItemKind;
  itemId: string;
  sectionId?: string;
  collectionId?: string;
  url?: string;
}

export interface SchoologyInboxImage {
  id: string;
  /** Firebase Storage path; only the owner can read it. */
  path: string;
  contentType: string;
  name: string;
}

export interface SchoologyInboxSettings {
  shuffleQuestions?: boolean;
  timeLimitMinutes?: number;
  attempts?: number;
}

export interface SchoologyInboxItem {
  /** Doc id, `{kind}_{itemId}`. */
  id: string;
  source: SchoologyInboxSource;
  folderPath: string[];
  /** Questions point at `images` by id; `quiz.images` stays empty until the pictures are downloaded. */
  quiz: ExtractedQuiz;
  unsupported: number[];
  settings: SchoologyInboxSettings;
  images: SchoologyInboxImage[];
  receivedAt: number;
}

const KINDS = new Set<string>(['testQuiz', 'assessment', 'questionBank']);
const TYPES = new Set<string>([
  'MC',
  'MA',
  'FIB',
  'Matching',
  'Ordering',
  'free-response',
]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

function parseQuestion(v: unknown, index: number): ExtractedQuestion | null {
  if (!isObj(v) || !TYPES.has(str(v.type))) return null;
  const options = Array.isArray(v.options)
    ? v.options.filter(isObj).map((o) => ({
        letter: str(o.letter),
        text: str(o.text),
      }))
    : [];
  const points = num(v.points);
  const distractors = strs(v.matchingDistractors);
  // `{answers}` maps, the shape ExtractedQuestion and QuizQuestion share.
  const blankAlternates = Array.isArray(v.blankAlternates)
    ? v.blankAlternates.map((b) => ({
        answers: isObj(b) ? strs(b.answers) : [],
      }))
    : undefined;
  return {
    number: num(v.number) ?? index + 1,
    text: str(v.text),
    type: str(v.type) as QuizQuestionType,
    options,
    correctAnswer: str(v.correctAnswer),
    imageIds: strs(v.imageIds),
    warnings: strs(v.warnings),
    ...(points !== undefined ? { points } : {}),
    ...(distractors.length ? { matchingDistractors: distractors } : {}),
    ...(v.allowPartialCredit === true ? { allowPartialCredit: true } : {}),
    ...(blankAlternates?.some((b) => b.answers.length)
      ? { blankAlternates }
      : {}),
  };
}

function parseSettings(v: unknown): SchoologyInboxSettings {
  if (!isObj(v)) return {};
  const minutes = num(v.timeLimitMinutes);
  const attempts = num(v.attempts);
  return {
    ...(typeof v.shuffleQuestions === 'boolean'
      ? { shuffleQuestions: v.shuffleQuestions }
      : {}),
    ...(minutes !== undefined && minutes > 0
      ? { timeLimitMinutes: minutes }
      : {}),
    ...(attempts !== undefined && attempts > 0 ? { attempts } : {}),
  };
}

/** An inbox doc as the review screen uses it; null when its shape is unusable. */
export function parseInboxItem(
  id: string,
  data: unknown
): SchoologyInboxItem | null {
  if (!isObj(data) || !isObj(data.source) || !isObj(data.quiz)) return null;
  const { source, quiz } = data;
  const kind = str(source.kind);
  const itemId = str(source.itemId);
  if (!KINDS.has(kind) || !itemId) return null;
  const questions = Array.isArray(quiz.questions)
    ? quiz.questions
        .map(parseQuestion)
        .filter((q): q is ExtractedQuestion => q !== null)
    : [];
  const images = Array.isArray(data.images)
    ? data.images
        .filter(isObj)
        .map((img) => ({
          id: str(img.id),
          path: str(img.path),
          contentType: str(img.contentType),
          name: str(img.name),
        }))
        .filter((img) => img.id && img.path)
    : [];
  return {
    id,
    source: {
      kind: kind as SchoologyItemKind,
      itemId,
      ...(str(source.sectionId) ? { sectionId: str(source.sectionId) } : {}),
      ...(str(source.collectionId)
        ? { collectionId: str(source.collectionId) }
        : {}),
      ...(str(source.url) ? { url: str(source.url) } : {}),
    },
    folderPath: strs(data.folderPath).filter((s) => s.trim()),
    quiz: {
      title: str(quiz.title).trim() || 'Untitled Schoology quiz',
      questions,
      images: [],
      warnings: strs(quiz.warnings),
    },
    unsupported: Array.isArray(data.unsupported)
      ? data.unsupported.filter((n): n is number => typeof n === 'number')
      : [],
    settings: parseSettings(data.settings),
    images,
    receivedAt: num(data.receivedAt) ?? 0,
  };
}

export const isBankItem = (item: SchoologyInboxItem): boolean =>
  item.source.kind === 'questionBank';

/** The provenance a saved copy records (Q11). */
export const importSourceFor = (
  item: SchoologyInboxItem,
  now = Date.now()
): ImportSource => ({
  system: 'schoology',
  kind: item.source.kind,
  itemId: item.source.itemId,
  ...(item.source.sectionId ? { sectionId: item.source.sectionId } : {}),
  ...(item.source.collectionId
    ? { collectionId: item.source.collectionId }
    : {}),
  importedAt: now,
});

/** Where an item lands when Schoology sent no course or folder name. */
export const FALLBACK_FOLDER = 'From Schoology';

/** A library entry a re-import could update. */
export interface SourcedLibraryItem {
  id: string;
  title: string;
  driveFileId: string;
  sourceKey?: string;
}

export interface InboxRow {
  item: SchoologyInboxItem;
  /** Folder names under the library root (Q9). */
  path: string[];
  questionCount: number;
  /** Questions carrying a note the teacher should check, placeholders included. */
  flaggedCount: number;
  needsKeyCount: number;
  /** The copy an earlier import made, which Update replaces (Q10). */
  existing: SourcedLibraryItem | null;
}

export function planInboxRows(
  items: readonly SchoologyInboxItem[],
  quizzes: readonly SourcedLibraryItem[],
  banks: readonly SourcedLibraryItem[]
): InboxRow[] {
  const bySource = (list: readonly SourcedLibraryItem[]) =>
    new Map(
      list.filter((m) => m.sourceKey).map((m) => [m.sourceKey as string, m])
    );
  const quizBySource = bySource(quizzes);
  const bankBySource = bySource(banks);
  return [...items]
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .map((item) => {
      const key = importSourceKey({ system: 'schoology', ...item.source });
      const { questions } = item.quiz;
      return {
        item,
        path: item.folderPath.length ? item.folderPath : [FALLBACK_FOLDER],
        questionCount: questions.length,
        flaggedCount: questions.filter(
          (q) => q.warnings.length > 0 || questionNeedsKey(q)
        ).length,
        needsKeyCount: questions.filter(questionNeedsKey).length,
        existing:
          (isBankItem(item) ? bankBySource : quizBySource).get(key) ?? null,
      };
    });
}

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** The quiz settings that come across, in words, for the review row (Q12). */
export function settingsSummary(settings: SchoologyInboxSettings): string[] {
  return [
    ...(settings.timeLimitMinutes
      ? [`${plural(settings.timeLimitMinutes, 'minute')} time limit`]
      : []),
    ...(settings.attempts ? [plural(settings.attempts, 'attempt')] : []),
    ...(settings.shuffleQuestions ? ['Shuffled questions'] : []),
  ];
}

/** The quiz's saved settings, or undefined when Schoology set nothing SpartBoard has. */
export function behaviorFromSettings(
  settings: SchoologyInboxSettings
): QuizBehaviorSettings | undefined {
  if (settingsSummary(settings).length === 0) return undefined;
  const base = structuredClone(DEFAULT_QUIZ_BEHAVIOR);
  return {
    ...base,
    sessionOptions: {
      ...base.sessionOptions,
      ...(settings.shuffleQuestions ? { shuffleQuestions: true } : {}),
      ...(settings.timeLimitMinutes
        ? { timeLimitMinutes: settings.timeLimitMinutes }
        : {}),
    },
    ...(settings.attempts ? { attemptLimit: settings.attempts } : {}),
  };
}

const promptKey = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

/** Update keeps learning-target tags on every question whose prompt didn't change (Q10). */
export function keepQuestionTags(
  previous: readonly QuizQuestion[],
  next: readonly QuizQuestion[]
): QuizQuestion[] {
  const tags = new Map<string, QuizQuestion['targets']>();
  for (const q of previous) {
    const key = promptKey(q.text);
    if (q.targets?.length && key && !tags.has(key)) tags.set(key, q.targets);
  }
  return next.map((q) => {
    const kept = tags.get(promptKey(q.text));
    return kept && !q.targets?.length ? { ...q, targets: kept } : q;
  });
}

let reviewRequested: boolean | null = null;
const reviewListeners = new Set<() => void>();

const urlAsksForReview = (): boolean =>
  typeof window !== 'undefined' &&
  new URL(window.location.href).searchParams.has(SCHOOLOGY_REVIEW_PARAM);

/** True while a review request (the URL parameter or the extension's event) waits for a Quiz widget to open it. */
export function schoologyReviewPending(): boolean {
  reviewRequested ??= urlAsksForReview();
  return reviewRequested;
}

const notifyReview = () => {
  for (const listener of [...reviewListeners]) listener();
};

export function requestSchoologyReview(): void {
  reviewRequested = true;
  notifyReview();
}

export function subscribeSchoologyReview(listener: () => void): () => void {
  reviewListeners.add(listener);
  return () => reviewListeners.delete(listener);
}

/** True for the one Quiz widget that takes a waiting request; strips the URL parameter. */
export function claimSchoologyReview(): boolean {
  if (!schoologyReviewPending()) return false;
  reviewRequested = false;
  if (urlAsksForReview()) {
    const url = new URL(window.location.href);
    url.searchParams.delete(SCHOOLOGY_REVIEW_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  }
  notifyReview();
  return true;
}
