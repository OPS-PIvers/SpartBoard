import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TOUR_ANCHORS } from '@/config/tourAnchors';
import {
  addedLines,
  brokenInUse,
  inUseAnchors,
  registryIds,
  removedIds,
  scansFile,
  unanchoredControls,
  type InUseSnapshot,
} from '@/scripts/checkTourAnchors.ts';
import { tourAnchors } from '@/scripts/snapshot-tour-anchors.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');
const snapshot = JSON.parse(
  read('config/tourAnchorsInUse.json')
) as InUseSnapshot;

describe('tour anchors saved tours use', () => {
  it('reads the same ids from source as the registry exports', () => {
    expect(registryIds(read('config/tourAnchors.ts'))).toEqual(
      Object.keys(TOUR_ANCHORS)
    );
  });

  it('keeps every anchor in config/tourAnchorsInUse.json registered', () => {
    const broken = brokenInUse(
      Object.keys(TOUR_ANCHORS),
      inUseAnchors(snapshot)
    );
    expect(
      broken,
      `Saved live tours use these. Keep the id on the control, or update the tours and refresh the snapshot: ${broken.join('; ')}`
    ).toEqual([]);
  });

  it('names the tours an in-use removal would break', () => {
    const inUse = inUseAnchors({
      prod: {
        refreshed: '2026-10-12',
        tours: [
          { id: 'a', title: 'Tour A', anchors: ['dock.open-tools'] },
          { id: 'b', title: 'Tour B', anchors: ['dock.open-tools', 'x.y'] },
        ],
      },
    });
    expect(brokenInUse(['x.y'], inUse)).toEqual([
      'dock.open-tools: "Tour A" (prod), "Tour B" (prod)',
    ]);
    expect(removedIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });
});

describe('unanchored control warning', () => {
  it('parses added lines from a zero-context diff', () => {
    const diff = `diff --git a/components/A.tsx b/components/A.tsx
+++ b/components/A.tsx
@@ -3 +4,2 @@
+x
+y
@@ -10,0 +12 @@
+z`;
    expect(addedLines(diff).get('components/A.tsx')).toEqual(
      new Set([4, 5, 12])
    );
  });

  it('flags only new, unanchored buttons, selects, tabs and switches', () => {
    const text = [
      '<div>', // 1
      '  <button onClick={() => a > b}>Go</button>', // 2
      "  <button {...tourAttr('dock.open-tools')}>Ok</button>", // 3
      '  <div', // 4
      '    role="tab"', // 5
      '    className="[&>svg]:w-4"', // 6
      '  />', // 7
      '  <select {...anchorProps}>', // 8
      '  <span role="switch" data-tour="x" />', // 9
      '  <button>old</button>', // 10
      '</div>',
    ].join('\n');
    expect(
      unanchoredControls(text, new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))
    ).toEqual([
      { line: 2, tag: 'button' },
      { line: 4, tag: 'div' },
    ]);
  });

  it('skips student apps, dev harnesses and tests', () => {
    expect(scansFile('components/quiz/QuizEditor.tsx')).toBe(true);
    expect(scansFile('App.tsx')).toBe(true);
    expect(scansFile('components/student/Landing.tsx')).toBe(false);
    expect(scansFile('components/quiz/QuizStudentApp.tsx')).toBe(false);
    expect(scansFile('components/dev/Harness.tsx')).toBe(false);
    expect(scansFile('components/quiz/QuizEditor.test.tsx')).toBe(false);
    expect(scansFile('context/AuthContext.ts')).toBe(false);
  });
});

describe('snapshot-tour-anchors', () => {
  it('keeps registered ids without their widget or field suffix', () => {
    const known = new Set(['dock.item', 'widget.close']);
    const steps = [
      { tour: { anchor: 'dock.item:clock' } },
      { tour: { anchor: 'widget.close' } },
      { tour: { anchor: 'gone.anchor#f' } },
      { tour: { anchor: '' } },
      {},
    ];
    expect(tourAnchors({ steps }, known)).toEqual({
      anchors: ['dock.item', 'widget.close'],
      unknown: ['gone.anchor'],
    });
  });
});
