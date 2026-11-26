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

// Checklist rows outside ChecklistSelect. This list only shrinks.
const CHECKLIST_COPIES = [
  // Inline rows inside a step's own popover, not a select-style menu.
  'components/connections/StepParamPicker.tsx',
  // Flag rows inside the gradebook cell popover.
  'components/gradebook/popovers/popoverParts.tsx',
  // Caps the picks at N and adds a reset row.
  'components/widgets/QuizWidget/components/results/CountedChoicesPicker.tsx',
];

// Hand-rolled single-choice lists. Typeahead fields and FontSelect (shows each font) only.
const LISTBOX_FILES = [
  'components/classroomAddon/AddonShell.tsx',
  'components/common/FontSelect.tsx',
  'components/common/StaffEmailInput.tsx',
  'components/plc/comments/PlcMentionPicker.tsx',
  'components/plc/search/PlcSearchBox.tsx',
  'components/tours/editor/TourAnchorList.tsx',
];

const gitGrep = (pattern: string) =>
  execFileSync(
    'git',
    ['grep', '-l', pattern, '--', 'components/*.tsx', ':!*.test.*'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .sort();

describe('browser picker guard', () => {
  it('builds every several-choice menu with ChecklistSelect', () => {
    expect(
      gitGrep('role="menuitemcheckbox"'),
      'Several choices open a checklist menu. Use ChecklistSelect from components/common/ChecklistSelect.'
    ).toEqual(
      ['components/common/ChecklistSelect.tsx', ...CHECKLIST_COPIES].sort()
    );
  });

  it('keeps single-choice dropdowns on a native <select>', () => {
    expect(
      gitGrep('role="listbox"'),
      'One choice is a native <select>; the app opens its own list for it (utils/selectMenu).'
    ).toEqual([...LISTBOX_FILES].sort());
  });

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

  it('mounts the app pickers switch in the auth provider', () => {
    expect(
      read('context/AuthContext.tsx'),
      'AuthProvider mounts the switch; routes without it keep the browser pickers.'
    ).toContain('<AppPickersSwitch');
  });
});
