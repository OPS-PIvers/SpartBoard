import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  TOUR_ANCHOR_PREREQUISITES,
  TOUR_ANCHORS,
  type TourAnchorDef,
} from '@/config/tourAnchors';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['components', 'context', 'App.tsx'];
const SOURCE_EXT = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

interface SourceFile {
  path: string;
  text: string;
}

// Every anchor use in source: tourAttr('id'…, tourTypeAttr('id'…, tourFieldAttr('id'…, or a data-tour="id" literal.
const ANCHOR_USE =
  /(?:\btourAttr\(\s*|\btourTypeAttr\(\s*|\btourFieldAttr\(\s*|\bdata-tour=\{?\s*)(['"`])([^'"`]+)\1/g;

const findAnchorProblems = (
  registry: readonly string[],
  files: readonly SourceFile[]
) => {
  const used = new Map<string, string[]>();
  for (const file of files) {
    for (const match of file.text.matchAll(ANCHOR_USE)) {
      const id = match[2];
      used.set(id, [...(used.get(id) ?? []), file.path]);
    }
  }
  const known = new Set(registry);
  return {
    missing: registry.filter((id) => !used.has(id)),
    unregistered: [...used.entries()]
      .filter(([id]) => !known.has(id))
      .map(([id, paths]) => `${id} (${[...new Set(paths)].join(', ')})`),
  };
};

const collectSources = (): SourceFile[] => {
  const out: SourceFile[] = [];
  const walk = (abs: string) => {
    if (statSync(abs).isDirectory()) {
      for (const entry of readdirSync(abs)) walk(join(abs, entry));
      return;
    }
    if (!SOURCE_EXT.test(abs) || TEST_FILE.test(abs)) return;
    out.push({
      path: relative(repoRoot, abs),
      text: readFileSync(abs, 'utf8'),
    });
  };
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root));
  return out;
};

describe('tour anchor registry', () => {
  const registry = Object.keys(TOUR_ANCHORS);

  it('renders every registered anchor somewhere in the app source', () => {
    const { missing } = findAnchorProblems(registry, collectSources());
    expect(
      missing,
      `Registered in config/tourAnchors.ts but no longer rendered: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('uses no data-tour id that is missing from the registry', () => {
    const { unregistered } = findAnchorProblems(registry, collectSources());
    expect(
      unregistered,
      `Add these to config/tourAnchors.ts or remove them: ${unregistered.join('; ')}`
    ).toEqual([]);
  });

  it('gives every anchor a label and at most one scope', () => {
    for (const [id, def] of Object.entries(TOUR_ANCHORS)) {
      expect(def.label.trim(), id).not.toBe('');
      const scopes = ['perWidget', 'perWidgetType', 'perField'].filter(
        (k) => k in def
      );
      expect(scopes.length, id).toBeLessThanOrEqual(1);
    }
  });

  it('gives every prerequisite a known value, and widget ones a widget scope', () => {
    for (const [id, def] of Object.entries(TOUR_ANCHORS)) {
      const requires = (def as TourAnchorDef).requires;
      if (requires === undefined) continue;
      expect(TOUR_ANCHOR_PREREQUISITES, id).toContain(requires);
      if (requires.startsWith('widget-')) {
        expect('perWidget' in def || 'perWidgetType' in def, id).toBe(true);
      }
    }
  });
});

describe('findAnchorProblems', () => {
  const registry = ['dock.open-tools', 'widget.close'];

  it('reports a registered anchor whose tag was removed', () => {
    const files = [
      { path: 'a.tsx', text: "<button {...tourAttr('dock.open-tools')} />" },
    ];
    expect(findAnchorProblems(registry, files).missing).toEqual([
      'widget.close',
    ]);
  });

  it('reports an unregistered data-tour literal', () => {
    const files = [
      {
        path: 'a.tsx',
        text: `<button {...tourAttr('dock.open-tools')} />
<button {...tourAttr("widget.close", widget.id)} />
<div data-tour="ghost.anchor" />`,
      },
    ];
    expect(findAnchorProblems(registry, files)).toEqual({
      missing: [],
      unregistered: ['ghost.anchor (a.tsx)'],
    });
  });

  it('counts tourTypeAttr, tourFieldAttr and braced data-tour literals as uses', () => {
    const files = [
      {
        path: 'a.tsx',
        text: `<b {...tourTypeAttr('dock.open-tools', tool.type)} /><b {...tourFieldAttr('widget.close', type, key)} /><b data-tour={'widget.close'} />`,
      },
    ];
    expect(findAnchorProblems(registry, files).missing).toEqual([]);
  });

  it('ignores the other data-tour-* attributes', () => {
    const files = [
      {
        path: 'a.tsx',
        text: `<b data-tour-widget="w1" data-tour-ignore="" {...tourAttr('dock.open-tools')} {...tourAttr('widget.close')} />`,
      },
    ];
    expect(findAnchorProblems(registry, files).unregistered).toEqual([]);
  });
});
