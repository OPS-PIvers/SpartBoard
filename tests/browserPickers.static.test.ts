import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when the app stops opening dropdowns, date and time fields and suggestion lists with its own panels instead of the browser's.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

// The fallbacks for phones, tablets and controls the app's panels skip.
const SHOW_PICKER_FILES = [
  'components/tours/editor/TourAnchorPicker.tsx',
  'utils/datePicker.ts',
];

const INSTALLS = [
  ['installSelectMenus', 'utils/selectMenu', 'every <select>'],
  ['installDatePickers', 'utils/datePicker', 'every date and time field'],
  ['installSuggestionLists', 'utils/suggestionList', 'every <datalist>'],
] as const;

describe('browser picker guard', () => {
  it('calls showPicker() only in the app panels and their fallbacks', () => {
    const files = execFileSync(
      'git',
      [
        'grep',
        '-l',
        String.raw`\.showPicker(`,
        '--',
        '*.ts',
        '*.tsx',
        ':!*.test.*',
        ':!extension/',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(
      files,
      'showPicker() opens the browser picker. Use openSelectMenu() (utils/selectMenu) for a <select> or openFieldPicker() (utils/datePicker) for a date or time field.'
    ).toEqual(SHOW_PICKER_FILES);
  });

  it.each(INSTALLS)('installs %s at startup', (fn, file, what) => {
    expect(
      read('index.tsx'),
      `index.tsx must call ${fn}() from ${file} so ${what} opens the app's panel, not the browser's.`
    ).toMatch(new RegExp(`^${fn}\\(\\);$`, 'm'));
  });

  it('opens a select from the tour picker with the app list first', () => {
    const picker = read('components/tours/editor/TourAnchorPicker.tsx');
    expect(
      picker.indexOf('openSelectMenu(select)'),
      'Open a <select> with openSelectMenu() from utils/selectMenu; showPicker() shows the browser list.'
    ).toBeGreaterThan(-1);
    expect(picker.indexOf('openSelectMenu(select)')).toBeLessThan(
      picker.indexOf('select.showPicker()')
    );
  });
});
