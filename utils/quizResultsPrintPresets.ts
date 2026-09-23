import type { QuizResultsPrintOptions } from './quizStudentReportPrint';

export type ResultsPrintPresetId =
  | 'student-copy'
  | 'graded-copy'
  | 'responses-only'
  | 'answer-key-review'
  | 'bubble-sheet';

export interface ResultsPrintPreset {
  id: ResultsPrintPresetId;
  label: string;
  options: QuizResultsPrintOptions;
}

const base: QuizResultsPrintOptions = {
  includeQuestions: true,
  markAnswers: true,
  keyMode: 'off',
  showScore: true,
  showClassDate: true,
  showTargets: true,
  showCommentBox: true,
  showWrittenFeedback: false,
  includeStimuli: false,
  duplexPadding: true,
  layout: 'report',
};

/** The table in docs/plans/QUIZ_RESULTS_PRINT.md D8. */
export const RESULTS_PRINT_PRESETS: readonly ResultsPrintPreset[] = [
  { id: 'student-copy', label: 'Student copy', options: base },
  {
    id: 'graded-copy',
    label: 'Graded copy',
    options: { ...base, keyMode: 'missed', showWrittenFeedback: true },
  },
  {
    id: 'responses-only',
    label: 'Responses only',
    options: {
      ...base,
      markAnswers: false,
      showScore: false,
      showTargets: false,
      showCommentBox: false,
    },
  },
  {
    id: 'answer-key-review',
    label: 'Answer key review',
    options: {
      ...base,
      keyMode: 'all',
      showTargets: false,
      showCommentBox: false,
    },
  },
  {
    id: 'bubble-sheet',
    label: 'Bubble sheet',
    options: {
      ...base,
      showTargets: false,
      showCommentBox: false,
      layout: 'sheet',
    },
  },
];

export const DEFAULT_RESULTS_PRINT_PRESET: ResultsPrintPresetId =
  'student-copy';

export function applyPreset(id: ResultsPrintPresetId): QuizResultsPrintOptions {
  const preset =
    RESULTS_PRINT_PRESETS.find((p) => p.id === id) ?? RESULTS_PRINT_PRESETS[0];
  return { ...preset.options };
}

export interface SavedResultsPrintChoice {
  /** Null once the teacher has changed a toggle away from the preset. */
  preset: ResultsPrintPresetId | null;
  options: QuizResultsPrintOptions;
}

const STORAGE_KEY = 'spartboard.quizResults.printOptions';

const BOOLEAN_KEYS = [
  'includeQuestions',
  'markAnswers',
  'showScore',
  'showClassDate',
  'showTargets',
  'showCommentBox',
  'showWrittenFeedback',
  'includeStimuli',
  'duplexPadding',
] as const;

/** The last preset and toggles on this browser, or the default preset (D11). */
export function loadResultsPrintChoice(): SavedResultsPrintChoice {
  const fallback: SavedResultsPrintChoice = {
    preset: DEFAULT_RESULTS_PRINT_PRESET,
    options: applyPreset(DEFAULT_RESULTS_PRINT_PRESET),
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SavedResultsPrintChoice> | null;
    const saved = parsed?.options as
      | Partial<QuizResultsPrintOptions>
      | undefined;
    if (!saved || typeof saved !== 'object') return fallback;
    const options = { ...fallback.options };
    for (const key of BOOLEAN_KEYS) {
      if (typeof saved[key] === 'boolean') options[key] = saved[key];
    }
    if (
      saved.keyMode === 'off' ||
      saved.keyMode === 'missed' ||
      saved.keyMode === 'all'
    ) {
      options.keyMode = saved.keyMode;
    }
    if (
      saved.layout === 'report' ||
      saved.layout === 'sheet' ||
      saved.layout === 'both'
    ) {
      options.layout = saved.layout;
    }
    const preset = RESULTS_PRINT_PRESETS.some((p) => p.id === parsed?.preset)
      ? (parsed?.preset as ResultsPrintPresetId)
      : null;
    return { preset, options };
  } catch {
    return fallback;
  }
}

export function saveResultsPrintChoice(choice: SavedResultsPrintChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}
