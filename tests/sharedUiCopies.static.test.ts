import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a new copy of a shared UI piece appears: toasts, clipboard copy, the class picker, CSV parsing, MM:SS.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const filesMatching = (pattern: string): string[] => {
  try {
    return execFileSync(
      'git',
      [
        'grep',
        '-lE',
        pattern,
        '--',
        '*.ts',
        '*.tsx',
        ':!*.test.*',
        ':!tests/',
        ':!extension/',
        ':!functions/',
        ':!scripts/',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
};

describe('shared UI pieces', () => {
  it('copies to the clipboard through copyText or copyLinkWithToast', () => {
    expect(
      filesMatching(String.raw`clipboard\.writeText\(`),
      'Use copyText (utils/copyText) or copyLinkWithToast (hooks/useCopyShortLink) instead of navigator.clipboard.writeText.'
    ).toEqual(['utils/copyText.ts']);
  });

  it('shows toasts through addToast, not a local toast', () => {
    expect(
      filesMatching(
        String.raw`common/Toast'|function \w*Toast\b.*React\.FC|const \w*Toast: React\.FC`
      ),
      "Use addToast from useDashboard() (pass an action for Undo, persist for a loading toast). Don't render a local toast."
    ).toEqual([]);
  });

  it('picks classes with ClassChecklist', () => {
    expect(
      filesMatching(String.raw`AssignClassPicker'|library/PeriodSelector'`),
      'Use ClassChecklist (components/common/library/assignStepper/ClassChecklist).'
    ).toEqual([]);
  });

  it('splits CSV only in utils/csv', () => {
    expect(
      filesMatching(String.raw`function splitLogicalRows|split\(/,\(\?=`),
      'Use parseCsvLines/parseCsvRecords/csvDataRows (utils/csv).'
    ).toEqual([]);
  });

  it('parses CSV and MM:SS in one place', () => {
    expect(
      filesMatching(
        String.raw`function (parseCsvRecords|mmSsToSeconds|secondsToMmSs)\b`
      ),
      'Use parseCsvRecords/csvDataRows (utils/csv) and mmSsToSeconds/secondsToMmSs (utils/videoTimestamp).'
    ).toEqual(['utils/csv.ts', 'utils/videoTimestamp.ts']);
  });
});
