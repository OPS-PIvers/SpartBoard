import type { WidgetType } from '@/types';
import type { ImportTarget } from '@/utils/import/contract';
import {
  guessTargets,
  looksLikeTwoColumns,
  type ImportSource,
} from '@/utils/import/guessTargets';
import {
  conversionInputFromSource,
  type ConversionInput,
} from '@/utils/import/aiConversion';
import type { PendingSource } from './importHandoff';

export interface ImportRoute {
  label: string;
  /** The widget that hosts the review screen or the placed material; none for a new board. */
  widgetType?: WidgetType;
  /** 'review' opens the widget's own review screen and saves a Library item; 'place' puts Reference material on the board; 'board' plans a new board. */
  landing: 'review' | 'place' | 'board';
  /** True when this route can read the Source today without AI. */
  accepts: (source: PendingSource) => boolean;
  /** True when an AI Conversion can read the Source (D8, D10, D11); offered only when AI is on for the teacher. */
  ai?: (source: PendingSource) => boolean;
}

const QUIZ_DOCUMENT = /\.(pdf|docx|odt|rtf|tst|imscc)$/i;

const hasExt = (s: PendingSource, re: RegExp): boolean =>
  re.test(s.file?.name ?? '');
const isCsv = (s: PendingSource): boolean => hasExt(s, /\.csv$/i);
const isWebUrl = (s: PendingSource): boolean =>
  !s.file &&
  !!s.url &&
  /^https?:\/\//i.test(s.url) &&
  !s.inboxItem?.selectionOnly;
const hasTabbedRows = (s: PendingSource): boolean =>
  !s.file && !!s.text && /\t|,/.test(s.text);

/** The text an AI Conversion would read; null when there is none yet (a bare link or an unread file). */
export function conversionInputFor(
  source: PendingSource
): ConversionInput | null {
  const input = conversionInputFromSource(toGuessSource(source));
  if (!input) return null;
  return input.title || !source.title
    ? input
    : { ...input, title: source.title };
}
const hasConversionText = (s: PendingSource): boolean =>
  !s.conversion && !!conversionInputFor(s);

/** Targets Import can route to today; later slices add their Conversions here. */
export const IMPORT_ROUTES: Partial<Record<ImportTarget, ImportRoute>> = {
  quiz: {
    label: 'Quiz',
    widgetType: 'quiz',
    landing: 'review',
    // Photos are read only through the wizard's own picture picker, so they aren't offered here yet.
    accepts: (s) => hasExt(s, QUIZ_DOCUMENT) || isCsv(s),
  },
  questionBank: {
    label: 'Question bank',
    widgetType: 'quiz',
    landing: 'review',
    accepts: (s) => isCsv(s) || hasExt(s, /\.imscc$/i),
  },
  flashcards: {
    label: 'Flashcards',
    widgetType: 'flashcards',
    landing: 'review',
    accepts: (s) => isCsv(s) || hasTabbedRows(s),
    ai: hasConversionText,
  },
  activityWall: {
    label: 'Activity Wall',
    widgetType: 'activity-wall',
    landing: 'review',
    accepts: () => false,
    ai: hasConversionText,
  },
  board: {
    label: 'New board',
    landing: 'board',
    accepts: () => false,
    ai: hasConversionText,
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
    accepts: (s) => hasExt(s, /\.pdf$/i) || s.file?.type === 'application/pdf',
  },
  embed: {
    label: 'Embed',
    widgetType: 'embed',
    landing: 'place',
    accepts: (s) => isWebUrl(s),
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

/** The S1 guess input for a live Source. */
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
  return { kind: 'url', url: source.url ?? '' };
}

/** True when picking this target runs AI: rows and sheets read without it, anything else needs the Conversion. */
export function usesAi(
  target: ImportTarget,
  source: PendingSource,
  aiOn: boolean
): boolean {
  const route = IMPORT_ROUTES[target];
  if (!aiOn || !route?.ai?.(source)) return false;
  if (!route.accepts(source)) return true;
  // Flashcards: a CSV or a page of term/definition rows still reads without AI.
  if (isCsv(source)) return false;
  return !looksLikeTwoColumns(
    (source.text ?? '').split(/\r?\n/),
    source.inboxItem?.blocks ?? []
  );
}

export interface TargetChoices {
  targets: ImportTarget[];
  guess: ImportTarget | null;
}

/** Feasible targets (D2) that a route can read today, with the no-AI guess preselected; `aiOn` adds the AI Conversions. */
export function targetChoices(
  source: PendingSource,
  allowed: (target: ImportTarget, source: PendingSource) => boolean = () =>
    true,
  aiOn = false
): TargetChoices {
  const { targets: feasible, guess } = guessTargets(toGuessSource(source));
  const targets = feasible.filter((t) => {
    const route = IMPORT_ROUTES[t];
    return (
      !!route &&
      allowed(t, source) &&
      (route.accepts(source) || (aiOn && !!route.ai?.(source)))
    );
  });
  // .imscc and CSV read as both, but the guess only names the quiz.
  if (
    IMPORT_ROUTES.questionBank?.accepts(source) &&
    allowed('questionBank', source) &&
    !targets.includes('questionBank') &&
    targets.includes('quiz')
  )
    targets.splice(targets.indexOf('quiz') + 1, 0, 'questionBank');
  return {
    targets,
    guess: targets.includes(guess) ? guess : (targets[0] ?? null),
  };
}
