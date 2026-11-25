import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Library items share one Duplicate runner (useLibraryDuplicate) and one copy title (suggestDuplicateTitle).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX =
  'Run Duplicate through useLibraryDuplicate (components/common/library/useLibraryDuplicate.ts) and title the copy with suggestDuplicateTitle.';

const SCANNED = ['components', 'hooks', 'utils', 'context'];
const RUNNER = 'components/common/library/useLibraryDuplicate.ts';
const TITLER = 'components/common/library/libraryDuplicate.ts';

const sourceFiles = (): string[] =>
  execFileSync('git', ['ls-files', ...SCANNED], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe('library duplicate path', () => {
  const files = sourceFiles().map((f) => ({
    file: f,
    text: readFileSync(resolve(repoRoot, f), 'utf8'),
  }));

  it('only the shared runner writes the Duplicated toast', () => {
    const offenders = files
      .filter(
        ({ file, text }) => file !== RUNNER && text.includes('Duplicated as')
      )
      .map(({ file }) => file);
    expect(offenders, FIX).toEqual([]);
  });

  it('no hand-built "(Copy)" title suffix', () => {
    const offenders = files
      .filter(
        ({ file, text }) => file !== TITLER && /\} \((?:c|C)opy\)`/.test(text)
      )
      .map(({ file }) => file);
    expect(offenders, FIX).toEqual([]);
  });
});

describe('library delete path', () => {
  // Writing's assigned-record delete is an assignment, not a library item.
  const CONFIRM_CALLERS = new Set([
    'components/common/library/useLibraryDelete.ts',
    'components/widgets/Writing/components/WritingManager.tsx',
  ]);

  it('library items delete through useLibraryDelete', () => {
    const offenders = sourceFiles()
      .filter((file) => !CONFIRM_CALLERS.has(file))
      .filter((file) =>
        readFileSync(resolve(repoRoot, file), 'utf8').includes(
          'useLibraryDeleteConfirm()'
        )
      );
    expect(
      offenders,
      'Delete library items with useLibraryDelete (components/common/library/useLibraryDelete.ts): one policy per kind for single, bulk and folder deletes.'
    ).toEqual([]);
  });
});
