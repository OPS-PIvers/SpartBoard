import type { WidgetType } from '@/types';
import type { ImportTarget } from '@/utils/import/contract';
import { guessTargets, type ImportSource } from '@/utils/import/guessTargets';
import type { PendingSource } from './importHandoff';

export interface ImportRoute {
  label: string;
  /** The widget that hosts the review screen or the placed material. */
  widgetType: WidgetType;
  /** 'review' opens the widget's own review screen and saves a Library item; 'place' puts Reference material on the board. */
  landing: 'review' | 'place';
  /** True when this route can read the Source today (a target can be feasible before its Conversion exists). */
  accepts: (source: PendingSource) => boolean;
}

const GOOGLE_SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\//i;
const QUIZ_DOCUMENT = /\.(pdf|docx|odt|rtf|tst|imscc|zip)$/i;

const hasExt = (s: PendingSource, re: RegExp): boolean =>
  re.test(s.file?.name ?? '');
const isCsv = (s: PendingSource): boolean => hasExt(s, /\.csv$/i);
const isSheet = (s: PendingSource): boolean =>
  !s.file && !s.text && !!s.url && GOOGLE_SHEET.test(s.url);
const isWebUrl = (s: PendingSource): boolean =>
  !s.file &&
  !!s.url &&
  /^https?:\/\//i.test(s.url) &&
  !s.inboxItem?.selectionOnly;
const isImage = (s: PendingSource): boolean =>
  !!s.file && s.file.type.startsWith('image/');
const hasTabbedRows = (s: PendingSource): boolean =>
  !s.file && !!s.text && /\t|,/.test(s.text);

/** Targets Import can route to today; later slices add their Conversions here. */
export const IMPORT_ROUTES: Partial<Record<ImportTarget, ImportRoute>> = {
  quiz: {
    label: 'Quiz',
    widgetType: 'quiz',
    landing: 'review',
    accepts: (s) =>
      hasExt(s, QUIZ_DOCUMENT) || isCsv(s) || isSheet(s) || isImage(s),
  },
  questionBank: {
    label: 'Question bank',
    widgetType: 'quiz',
    landing: 'review',
    accepts: (s) => isCsv(s) || isSheet(s) || hasExt(s, /\.(imscc|zip)$/i),
  },
  flashcards: {
    label: 'Flashcards',
    widgetType: 'flashcards',
    landing: 'review',
    accepts: (s) => isCsv(s) || isSheet(s) || hasTabbedRows(s),
  },
  guidedLearning: {
    label: 'Guided Learning',
    widgetType: 'guided-learning',
    landing: 'review',
    accepts: (s) => hasExt(s, /\.json$/i),
  },
  miniApp: {
    label: 'Mini App',
    widgetType: 'miniApp',
    landing: 'review',
    accepts: (s) => hasExt(s, /\.html?$/i),
  },
  notebook: {
    label: 'Notebook',
    widgetType: 'smartNotebook',
    landing: 'place',
    accepts: (s) => hasExt(s, /\.(notebook|olf|spartnb)$/i),
  },
  pdf: {
    label: 'PDF',
    widgetType: 'pdf',
    landing: 'place',
    accepts: (s) => hasExt(s, /\.pdf$/i),
  },
  embed: {
    label: 'Embed',
    widgetType: 'embed',
    landing: 'place',
    accepts: (s) => isWebUrl(s) && !isSheet(s),
  },
  links: {
    label: 'Link',
    widgetType: 'url',
    landing: 'place',
    accepts: (s) => isWebUrl(s),
  },
};

export function importRoute(target: ImportTarget): ImportRoute | null {
  return IMPORT_ROUTES[target] ?? null;
}

/** The S1 guess input for a live Source; a sheet link reads as a spreadsheet, not a page. */
export function toGuessSource(source: PendingSource): ImportSource {
  if (source.file)
    return {
      kind: 'file',
      fileName: source.file.name,
      mimeType: source.file.type,
      ...(source.text ? { text: source.text } : {}),
    };
  if (source.inboxItem) return { kind: 'send', item: source.inboxItem };
  if (source.text) return { kind: 'text', text: source.text };
  if (source.url && isSheet(source))
    return { kind: 'file', fileName: 'sheet.csv', mimeType: 'text/csv' };
  return { kind: 'url', url: source.url ?? '' };
}

export interface TargetChoices {
  targets: ImportTarget[];
  guess: ImportTarget | null;
}

/** Feasible targets (D2) that a route can read today, with the no-AI guess preselected. */
export function targetChoices(
  source: PendingSource,
  allowed: (target: ImportTarget) => boolean = () => true
): TargetChoices {
  const { targets: feasible, guess } = guessTargets(toGuessSource(source));
  const targets = feasible.filter((t) => {
    const route = IMPORT_ROUTES[t];
    return !!route && allowed(t) && route.accepts(source);
  });
  // .imscc reads as both, but the guess only names the quiz; a sheet can also be a bank.
  if (
    IMPORT_ROUTES.questionBank?.accepts(source) &&
    allowed('questionBank') &&
    !targets.includes('questionBank') &&
    targets.includes('quiz')
  )
    targets.splice(targets.indexOf('quiz') + 1, 0, 'questionBank');
  return {
    targets,
    guess: targets.includes(guess) ? guess : (targets[0] ?? null),
  };
}
