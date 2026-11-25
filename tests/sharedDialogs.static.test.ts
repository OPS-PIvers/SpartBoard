import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import baseline from './fixtures/centeredOverlayBaseline.json';

// Confirms go through useDialog() and centered dialogs through components/common/Modal.tsx.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['components', 'context', 'hooks', 'utils', 'config'];

const listFiles = (dir: string): string[] =>
  readdirSync(join(repoRoot, dir)).flatMap((name) => {
    const child = join(dir, name);
    if (statSync(join(repoRoot, child)).isDirectory()) return listFiles(child);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [child] : [];
  });

const files = ROOTS.flatMap(listFiles).map((f) => f.replace(/\\/g, '/'));
const read = (file: string) => readFileSync(join(repoRoot, file), 'utf8');

// TourEditorPanel falls back to the browser confirm when it runs outside DialogProvider.
const BROWSER_DIALOG_ALLOWED = new Set([
  'components/tours/editor/TourEditorPanel.tsx',
]);
// The shared shells themselves.
const OVERLAY_SHELLS = new Set([
  'components/common/Modal.tsx',
  'components/common/DialogContainer.tsx',
]);

/** Counts string literals that build a full-viewport centered overlay. */
export const countCenteredOverlays = (source: string): number => {
  let count = 0;
  const re = /fixed inset-0/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let start = m.index;
    while (start > 0 && !`"'\``.includes(source[start - 1])) start--;
    const quote = source[start - 1];
    let end = m.index;
    while (end < source.length && source[end] !== quote) end++;
    const literal = source.slice(start, end);
    if (/\bitems-center\b/.test(literal) && /\bjustify-center\b/.test(literal))
      count++;
  }
  return count;
};

describe('shared dialogs', () => {
  it('uses useDialog() instead of the browser confirm, prompt and alert', () => {
    const offenders = files.filter(
      (file) =>
        !BROWSER_DIALOG_ALLOWED.has(file) &&
        !file.startsWith('components/dev/') &&
        /\b(window|globalThis)\.(confirm|prompt|alert)\s*(\?\.)?\(/.test(
          read(file)
        )
    );
    expect(
      offenders,
      'Use useDialog().showConfirm, showPrompt or showAlert.'
    ).toEqual([]);
  });

  it('builds no new centered overlay outside the shared Modal', () => {
    const known = baseline as Record<string, number>;
    const grown: string[] = [];
    const shrunk: string[] = [];
    for (const file of files) {
      if (OVERLAY_SHELLS.has(file)) continue;
      const count = countCenteredOverlays(read(file));
      const allowed = known[file] ?? 0;
      if (count > allowed) grown.push(`${file} (${count} > ${allowed})`);
      if (count < allowed) shrunk.push(`${file} (${count} < ${allowed})`);
    }
    for (const file of Object.keys(known)) {
      if (!files.includes(file)) shrunk.push(`${file} (gone)`);
    }
    expect(
      grown,
      'Use components/common/Modal.tsx (variant="bare" for custom chrome).'
    ).toEqual([]);
    expect(
      shrunk,
      'Lower or remove these entries in tests/fixtures/centeredOverlayBaseline.json.'
    ).toEqual([]);
  });

  it('counts a centered overlay class string', () => {
    expect(
      countCenteredOverlays(
        '<div className="fixed inset-0 z-modal flex items-center justify-center" />'
      )
    ).toBe(1);
    expect(
      countCenteredOverlays('<div className="fixed inset-0 bg-black/40" />')
    ).toBe(0);
  });
});
