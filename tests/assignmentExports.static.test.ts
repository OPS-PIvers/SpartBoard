import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when an assignment widget builds its results export by hand instead of on the shared sheet builder.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX =
  'Results exports go through buildResultsSheetData (utils/assignmentExportShared.ts): QuizDriveService.exportResultsToSheet for Sheets, buildQuizResultsCsv + downloadCsv for CSV. Write a small adapter like utils/miniAppResultsExport.ts instead of a new column loop.';

// Each kind's export adapter, and the file that must call it.
const KIND_EXPORTS: Record<string, { adapter: string; caller: string }> = {
  quiz: {
    adapter: 'utils/quizDriveService.ts',
    caller: 'components/widgets/QuizWidget/components/QuizResults.tsx',
  },
  'video-activity': {
    adapter: 'utils/quizDriveService.ts',
    caller: 'components/widgets/VideoActivityWidget/components/Results.tsx',
  },
  flashcards: {
    adapter: 'utils/quizDriveService.ts',
    caller: 'components/widgets/Flashcards/results/FlashcardResultsScreen.tsx',
  },
  'mini-app': {
    adapter: 'utils/miniAppResultsExport.ts',
    caller: 'components/widgets/MiniApp/components/SubmissionsModal.tsx',
  },
  'guided-learning': {
    adapter: 'utils/guidedLearningResultsExport.ts',
    caller:
      'components/widgets/GuidedLearning/components/GuidedLearningResults.tsx',
  },
  writing: {
    adapter: 'utils/writingResultsExport.ts',
    caller: 'components/widgets/Writing/components/results/WritingResults.tsx',
  },
};

// Hand-built CSV downloads that are not a results export.
const CSV_ALLOWED = new Set([
  // Learning-target stats table.
  'components/widgets/QuizWidget/components/QuizTargetResults.tsx',
  // Drive picker file-type filter.
  'hooks/useGooglePicker.ts',
  // Rubric template and rubric export.
  'components/widgets/QuizWidget/components/RubricBuilderPanel.tsx',
]);

const ASSIGNMENT_DIRS = [
  'components/widgets/QuizWidget',
  'components/widgets/VideoActivityWidget',
  'components/widgets/Flashcards',
  'components/widgets/MiniApp',
  'components/widgets/GuidedLearning',
  'components/widgets/Writing',
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [full]
      : [];
  });

const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

describe('assignment results exports use the shared sheet builder', () => {
  it.each(Object.entries(KIND_EXPORTS))(
    '%s exports through buildResultsSheetData',
    (_kind, { adapter, caller }) => {
      expect(read(adapter), FIX).toMatch(
        /buildResultsSheetData|exportResultsToSheet/
      );
      const callerSrc = read(caller);
      const adapterName = adapter.replace(/^utils\/|\.ts$/g, '');
      expect(
        callerSrc.includes(adapterName) ||
          callerSrc.includes('exportResultsToSheet'),
        `${caller} must export through ${adapter}.\n${FIX}`
      ).toBe(true);
    }
  );

  it('no assignment widget or hook writes its own CSV', () => {
    const files = [
      ...ASSIGNMENT_DIRS.flatMap((d) => walk(join(repoRoot, d))),
      ...walk(join(repoRoot, 'hooks')),
    ].map((f) => relative(repoRoot, f));
    const offenders = files.filter((rel) => {
      if (CSV_ALLOWED.has(rel)) return false;
      const src = read(rel);
      return /text\/csv/.test(src) || /function build\w*(CSV|Csv)\b/.test(src);
    });
    expect(offenders, FIX).toEqual([]);
  });
});
