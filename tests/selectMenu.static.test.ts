import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when the app stops opening dropdowns as its own list (utils/selectMenu.ts) instead of the browser's.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

// Date and time inputs; showPicker() on a <select> would show the browser list.
const SHOW_PICKER_FILES = [
  'components/plc/notes/NoteActionItems.tsx',
  'components/plc/teams/notes/NoteBlockViews.tsx',
  'components/plc/teams/notes/TeamActionItemList.tsx',
  'components/tours/editor/TourAnchorPicker.tsx',
];

describe('dropdown list guard', () => {
  it('calls showPicker() only where it opens a date or time field', () => {
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
      'A new showPicker() call: if it opens a <select>, use openSelectMenu() from utils/selectMenu instead; otherwise add the file to SHOW_PICKER_FILES.'
    ).toEqual(SHOW_PICKER_FILES);
  });

  it('installs the app list for every <select> at startup', () => {
    expect(
      read('index.tsx'),
      'index.tsx must call installSelectMenus() from utils/selectMenu so every <select> opens the app list, not the browser one.'
    ).toMatch(/^installSelectMenus\(\);$/m);
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
