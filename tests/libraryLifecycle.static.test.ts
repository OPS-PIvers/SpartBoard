import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Library items share one Duplicate runner (useLibraryDuplicate) and one copy title (suggestDuplicateTitle).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX =
  'Run Duplicate through useLibraryDuplicate (components/common/library/useLibraryDuplicate.ts) and title the copy with suggestDuplicateTitle.';

const SCANNED = ['components/widgets', 'components/common/library', 'hooks'];
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
