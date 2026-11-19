import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  FRAGMENT_DIR,
  compareVersions,
  loadChangelog,
  mergeChangelog,
  serializeChangelog,
  type Changelog,
} from '@/scripts/changelogFragments';

const committed = readFileSync(CHANGELOG, 'utf8');
const current = JSON.parse(committed) as Changelog;

const entry = (version: string, date = '2026-11-20') => ({
  version,
  date,
  title: version,
  details: [{ type: 'fix', text: version }],
});
const note = (id: string, date = '2026-11-20') => ({
  id,
  widget: 'quiz',
  date,
  text: id,
});

describe('changelog fragments', () => {
  it('serves the committed file byte for byte when there are no fragments', () => {
    expect(serializeChangelog(mergeChangelog(current, []))).toBe(committed);
  });

  it('rebuilds the committed file when its newest entries and notes arrive as fragments', () => {
    // Before: the top entries and notes were edited into the shared file. After: each came from its own PR file.
    const notes = current.widgetNotes ?? [];
    const base = {
      ...current,
      entries: current.entries.slice(2),
      widgetNotes: notes.slice(4),
    };
    const fragments = [
      { name: 'b.json', data: { entries: [current.entries[1]] } },
      {
        name: 'a.json',
        data: { entries: [current.entries[0]], widgetNotes: notes.slice(0, 4) },
      },
    ];
    expect(serializeChangelog(mergeChangelog(base, fragments))).toBe(committed);
  });

  it('slots an older-versioned entry newest-first and puts new notes on top', () => {
    const base = {
      entries: [entry('2026.11.19.2'), entry('2026.11.18.1')],
      widgetNotes: [note('old', '2026-11-01')],
    };
    const merged = mergeChangelog(base, [
      { name: 'x.json', data: { entries: [entry('2026.11.19.1')] } },
      {
        name: 'y.json',
        data: { entries: [entry('2026.11.20.1')], widgetNotes: [note('n1')] },
      },
    ]);
    expect(merged.entries.map((e) => e.version)).toEqual([
      '2026.11.20.1',
      '2026.11.19.2',
      '2026.11.19.1',
      '2026.11.18.1',
    ]);
    expect(merged.widgetNotes?.map((n) => n.id)).toEqual(['n1', 'old']);
  });

  it('compares versions numerically', () => {
    expect(compareVersions('2026.11.19.10', '2026.11.19.9')).toBeGreaterThan(0);
    expect(compareVersions('2026.11.19', '2026.11.19.1')).toBeLessThan(0);
  });

  it('renumbers a clash between PRs instead of failing the build', () => {
    const warnings: string[] = [];
    const merged = mergeChangelog(
      { entries: [entry('2026.11.19.1')], widgetNotes: [note('a')] },
      [
        {
          name: 'one.json',
          data: { entries: [entry('2026.11.19.2')], widgetNotes: [note('a')] },
        },
        {
          name: 'two.json',
          data: { entries: [entry('2026.11.19.2')], widgetNotes: [note('a')] },
        },
      ],
      (m) => warnings.push(m)
    );
    expect(merged.entries.map((e) => e.version)).toEqual([
      '2026.11.19.3',
      '2026.11.19.2',
      '2026.11.19.1',
    ]);
    expect(merged.widgetNotes?.map((n) => n.id)).toEqual(['a-2', 'a-3', 'a']);
    expect(warnings).toHaveLength(3);
  });

  it('renumbers a plain-date clash with a same-day counter, never the date', () => {
    const merged = mergeChangelog(
      { entries: [entry('2026.11.19')] },
      [{ name: 'a.json', data: { entries: [entry('2026.11.19')] } }],
      () => {}
    );
    expect(merged.entries.map((e) => e.version)).toEqual([
      '2026.11.19.2',
      '2026.11.19',
    ]);
  });

  it('warns when a new entry is older than the newest one', () => {
    const warnings: string[] = [];
    mergeChangelog(
      { entries: [entry('2026.11.19.1')] },
      [{ name: 'old.json', data: { entries: [entry('2026.11.15.4')] } }],
      (m) => warnings.push(m)
    );
    expect(warnings[0]).toMatch(/no update prompt/);
  });

  it('rejects stray keys, empty fragments and malformed items', () => {
    const base = { entries: [entry('2026.11.19.1')], widgetNotes: [note('a')] };
    const bad = (data: unknown) => () =>
      mergeChangelog(base, [{ name: 'bad.json', data }]);
    expect(bad({ entries: [entry('2026.11.20.1')], version: 'x' })).toThrow(
      /only hold/
    );
    expect(bad({})).toThrow(/no entries/);
    expect(bad({ widgetNotes: [{ id: 'z' }] })).toThrow(/needs string/);
    expect(bad({ entries: [{ title: 'no version' }] })).toThrow(
      /needs a string/
    );
  });

  it('loads every fragment in the repo without error', () => {
    expect(loadChangelog(process.cwd()).entries.length).toBeGreaterThan(0);
  });

  it('collect folds fragments into the file, matching what was served, and deletes them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
    mkdirSync(join(dir, 'public'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, FRAGMENT_DIR));
    cpSync(
      'scripts/changelogFragments.ts',
      join(dir, 'scripts/changelogFragments.ts')
    );
    writeFileSync(join(dir, CHANGELOG), committed);
    writeFileSync(
      join(dir, FRAGMENT_DIR, 'pr.json'),
      JSON.stringify({
        entries: [entry('2099.1.1.1')],
        widgetNotes: [note('collect-test')],
      })
    );
    writeFileSync(join(dir, FRAGMENT_DIR, 'README.md'), 'kept');
    const served = serializeChangelog(loadChangelog(dir));
    execFileSync(process.execPath, [
      join(dir, 'scripts/changelogFragments.ts'),
      'collect',
    ]);
    expect(readFileSync(join(dir, CHANGELOG), 'utf8')).toBe(served);
    expect(existsSync(join(dir, FRAGMENT_DIR, 'pr.json'))).toBe(false);
    expect(readdirSync(join(dir, FRAGMENT_DIR))).toEqual(['README.md']);
    expect(serializeChangelog(loadChangelog(dir))).toBe(served);
  });
});
