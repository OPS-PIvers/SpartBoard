import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a file hand-builds a search box instead of using components/common/SearchField.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Search boxes that are not plain filters. This list only shrinks.
const OWN_SEARCH_BOXES = [
  // Find button with a search icon, no search box.
  'components/classes/SchoologyFindCourses.tsx',
  // Dev-only harness page.
  'components/dev/DistrictFoldersDevHarness.tsx',
  // Combobox with its own suggestion list and keyboard.
  'components/plc/search/PlcSearchBox.tsx',
  // Combobox with its own suggestion list and keyboard.
  'components/tours/editor/TourAnchorList.tsx',
  // Spotify search that slides open from the widget's tab bar.
  'components/widgets/MusicWidget/PersonalSpotifyDefaultTabBar.tsx',
];

const filesMatching = (pattern: string) =>
  execFileSync(
    'git',
    ['grep', '-lE', pattern, '--', 'components/*.tsx', ':!*.test.*'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean);

const SHARED = 'components/common/SearchField.tsx';

describe('search field guard', () => {
  it('builds every search box with the shared SearchField', () => {
    const inputs = new Set(filesMatching(String.raw`<input\b`));
    const own = [
      ...new Set([
        ...filesMatching('type="search"'),
        ...filesMatching(String.raw`<Search\b`).filter((f) => inputs.has(f)),
      ]),
    ]
      .filter((f) => f !== SHARED)
      .sort();
    expect(
      own,
      'A hand-built search box. Use SearchField from components/common/SearchField (icon, clear button and Escape-clears are built in; pass its tour anchor as anchor).'
    ).toEqual([...OWN_SEARCH_BOXES].sort());
  });

  it('keeps one SearchField component', () => {
    expect(filesMatching(String.raw`export const SearchField\b`)).toEqual([
      SHARED,
    ]);
  });
});
