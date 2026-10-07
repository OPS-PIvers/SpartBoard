import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyProblem } from '@/scripts/widget-grader/static/copyGuard.ts';
import {
  scanCopyAndIcons,
  impliedCopyLevel,
} from '@/scripts/widget-grader/static/copyIcons.ts';
import {
  classifyEffect,
  impliedCodeHealthLevel,
  scanCodeHealth,
} from '@/scripts/widget-grader/static/codeHealth.ts';
import {
  impliedConsistencyLevel,
  scanConsistency,
} from '@/scripts/widget-grader/static/consistency.ts';
import {
  anchorsIn,
  impliedHelpLevel,
  parseTourAnchorIds,
} from '@/scripts/widget-grader/static/ecosystem.ts';
import {
  DEFAULT_REPO_ROOT,
  STATIC_CRITERIA,
  buildContext,
  parseArgs,
  runStatic,
  summaryRow,
  scanWidget,
  summaryTable,
} from '@/scripts/widget-grader/static/index.ts';
import {
  classifyFixedClass,
  fixedTotal,
  impliedScalingLevel,
  scanScaling,
} from '@/scripts/widget-grader/static/scaling.ts';
import { parseSource } from '@/scripts/widget-grader/static/source.ts';
import {
  parseRegistry,
  resolveWidgetFiles,
} from '@/scripts/widget-grader/widgetFiles.ts';

const file = (text: string, path = 'components/widgets/X/Widget.tsx') => ({
  path,
  text,
});

describe('S4 scaling detector', () => {
  it('classifies fixed Tailwind text, size, gap and padding classes', () => {
    expect(classifyFixedClass('text-sm')).toBe('text');
    expect(classifyFixedClass('md:text-[14px]')).toBe('text');
    expect(classifyFixedClass('w-12')).toBe('size');
    expect(classifyFixedClass('max-w-md')).toBe('size');
    expect(classifyFixedClass('gap-4')).toBe('gap');
    expect(classifyFixedClass('space-y-2')).toBe('gap');
    expect(classifyFixedClass('px-3')).toBe('padding');
    expect(classifyFixedClass('hover:p-[8px]')).toBe('padding');
  });

  it('ignores fluid and non-sizing classes', () => {
    for (const token of [
      'w-full',
      'h-auto',
      'flex-1',
      'text-center',
      'text-white',
      'w-[min(48px,12cqmin)]',
      'p-[clamp(4px,2cqmin,12px)]',
      'font-bold',
    ]) {
      expect(classifyFixedClass(token)).toBeNull();
    }
  });

  it('counts fixed classes, fixed inline px, fixed icon sizes and cq literals', () => {
    const scan = scanScaling([
      file(`
        import { Clock, Star } from 'lucide-react';
        export const W = () => (
          <div className="p-4 gap-2 text-sm w-12" style={{ fontSize: 'min(14px, 5cqmin)', width: 48, height: '2rem' }}>
            <Clock size={24} />
            <Star size={iconSize} />
            <span style={{ padding: 'min(8px, 2cqmin)' }} />
          </div>
        );
      `),
    ]);
    expect(scan).toMatchObject({
      fixedText: 1,
      fixedSize: 1,
      fixedGap: 1,
      fixedPadding: 1,
      fixedInline: 2,
      fixedIconProps: 1,
      iconsTotal: 2,
      scaledLiterals: 2,
    });
    expect(fixedTotal(scan)).toBe(7);
  });

  it('derives the implied level and leaves transform widgets to the judge', () => {
    const base = {
      files: 1,
      fixedText: 0,
      fixedSize: 0,
      fixedGap: 0,
      fixedPadding: 0,
      fixedInline: 0,
      fixedIconProps: 0,
      iconsTotal: 0,
      scaledLiterals: 0,
    };
    expect(
      impliedScalingLevel({ ...base, scaledLiterals: 20, fixedText: 2 }, true)
    ).toBe(3);
    expect(
      impliedScalingLevel({ ...base, scaledLiterals: 10, fixedText: 10 }, true)
    ).toBe(2);
    expect(
      impliedScalingLevel({ ...base, scaledLiterals: 2, fixedText: 20 }, true)
    ).toBe(1);
    expect(impliedScalingLevel(base, true)).toBeNull();
    expect(impliedScalingLevel({ ...base, fixedText: 30 }, false)).toBeNull();
  });
});

describe('V4 consistency detector', () => {
  it('counts shared component imports, raw controls and one-off colors and radii', () => {
    const scan = scanConsistency(
      [
        file(`
          import { Button } from '@/components/common/Button';
          import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
          import { resolveLabel } from '@/components/settings/schema/labels';
          export const W = () => (
            <div className="bg-[#ff0000] rounded-[7px]" style={{ borderRadius: 6, color: 'rgb(1,2,3)' }}>
              <button />
              <input />
            </div>
          );
        `),
      ],
      []
    );
    expect(scan.sharedNames).toEqual(['Button', 'ScaledEmptyState']);
    expect(scan.sharedImports).toBe(2);
    expect(scan.usesScaledEmptyState).toBe(true);
    expect(scan.rawControls).toBe(2);
    expect(scan.oneOffColors).toBe(2);
    expect(scan.oneOffRadii).toBe(2);
  });

  it('only sets level 1 when nothing is shared and one-offs pile up', () => {
    const none = {
      sharedImports: 0,
      sharedNames: [],
      usesScaledEmptyState: false,
    };
    expect(
      impliedConsistencyLevel({
        ...none,
        rawControls: 3,
        oneOffColors: 2,
        oneOffRadii: 0,
      })
    ).toBe(1);
    expect(
      impliedConsistencyLevel({
        ...none,
        rawControls: 1,
        oneOffColors: 0,
        oneOffRadii: 0,
      })
    ).toBeNull();
    expect(
      impliedConsistencyLevel({
        ...none,
        sharedImports: 2,
        rawControls: 9,
        oneOffColors: 9,
        oneOffRadii: 9,
      })
    ).toBeNull();
  });
});

describe('V6 copy and icon detector', () => {
  it('applies the copy guard rules', () => {
    expect(copyProblem('Saved — reload')).toBe('em dash');
    expect(copyProblem('Tip: drag')).toBe('Tip/Note prefix');
    expect(copyProblem('Add a student')).toBeNull();
  });

  it('flags copy violations and mixed icon libraries', () => {
    const scan = scanCopyAndIcons([
      file(`
        import { A } from 'lucide-react';
        import { FaB } from 'react-icons/fa';
        export const W = () => (
          <div>
            <p>Tip: drag to reorder</p>
            <span title="x">Add a student</span>
            <svg />
          </div>
        );
      `),
    ]);
    expect(scan.copyViolations).toBe(1);
    expect(scan.copyExamples).toEqual(['Tip: drag to reorder']);
    expect(scan.iconLibraries).toEqual(['lucide-react', 'react-icons']);
    expect(scan.inlineSvgs).toBe(1);
    expect(impliedCopyLevel(scan)).toBe(1);
  });

  it('leaves clean files to the judge', () => {
    const scan = scanCopyAndIcons([
      file(
        `import { A } from 'lucide-react'; export const W = () => <p>Add a student</p>;`
      ),
    ]);
    expect(scan.copyViolations).toBe(0);
    expect(impliedCopyLevel(scan)).toBeNull();
  });
});

describe('E2 help and tour detector', () => {
  const index = parseTourAnchorIds(`
    export const TOUR_ANCHORS = {
      'widget.window': { label: 'Window' },
      'widget-settings.poll.export-csv': { label: 'Export' },
    } as const;
  `);

  it('reads registered ids from the registry source', () => {
    expect([...index.ids]).toEqual([
      'widget.window',
      'widget-settings.poll.export-csv',
    ]);
    const real = buildContext(DEFAULT_REPO_ROOT).anchors;
    expect(real.ids.has('widget.window')).toBe(true);
  });

  it('finds registered anchors used as string literals only', () => {
    const found = anchorsIn(
      [
        file(
          `const a = tourAttr('widget-settings.poll.export-csv'); const b = 'not.registered';`
        ),
      ],
      index
    );
    expect(found).toEqual(['widget-settings.poll.export-csv']);
  });

  it('is unknown without a help index and graded with one', () => {
    expect(impliedHelpLevel(undefined, 3)).toBeNull();
    expect(impliedHelpLevel({ article: false }, 0)).toBe(1);
    expect(impliedHelpLevel({ article: true }, 0)).toBe(2);
    expect(impliedHelpLevel({ article: false }, 2)).toBe(2);
    expect(impliedHelpLevel({ article: true }, 2)).toBe(3);
    expect(impliedHelpLevel({ article: true, liveTour: true }, 2)).toBe(4);
  });
});

describe('E3 code health detector', () => {
  const effectOf = (code: string) => {
    const sf = parseSource('x.tsx', code);
    let fn: ReturnType<typeof classifyEffect> | null = null;
    const visit = (n: import('typescript').Node) => {
      if (fn) return;
      const call = n as import('typescript').CallExpression;
      if (
        call.expression &&
        call.arguments &&
        call.expression.getText(sf) === 'useEffect'
      ) {
        fn = classifyEffect(call.arguments[0]);
        return;
      }
      n.forEachChild(visit);
    };
    visit(sf);
    return fn as unknown as ReturnType<typeof classifyEffect>;
  };

  it('flags effects that only set state or only sync a ref', () => {
    expect(effectOf(`useEffect(() => { setX(props.x); }, [props.x]);`)).toEqual(
      { derivedState: true, refSync: false }
    );
    expect(
      effectOf(`useEffect(() => { if (a) { setX(1); setY(2); } }, [a]);`)
        .derivedState
    ).toBe(true);
    expect(
      effectOf(`useEffect(() => { ref.current = value; }, [value]);`)
    ).toEqual({ derivedState: false, refSync: true });
  });

  it('leaves effects that touch an external system alone', () => {
    for (const body of [
      `window.addEventListener('x', h); return () => window.removeEventListener('x', h);`,
      `const id = setTimeout(() => setX(1), 10); return () => clearTimeout(id);`,
      `setX(localStorage.getItem('k'));`,
      `fetchThing().then((r) => setX(r));`,
      `updateWidget(id, { config });`,
    ]) {
      expect(effectOf(`useEffect(() => { ${body} }, []);`)).toEqual({
        derivedState: false,
        refSync: false,
      });
    }
  });

  it('counts any, hot-path useDashboard calls, large files and effect smells', () => {
    const hot = file(
      `
      export const W = () => {
        const { x } = useDashboard();
        const [a, setA] = useState<any>(null);
        useEffect(() => { setA(x); }, [x]);
        return null;
      };
    `,
      'a/Widget.tsx'
    );
    const cold = file(
      `const v = useDashboard(); const w = 1 as any;`,
      'a/helper.ts'
    );
    const scan = scanCodeHealth([hot, cold], new Set(['a/Widget.tsx']));
    expect(scan).toMatchObject({
      sourceFiles: 2,
      anyCount: 2,
      useDashboardCalls: 1,
      derivedStateEffects: 1,
      largeFiles: 0,
    });
    expect(scan.maxLinesFile).toBe('a/Widget.tsx');
  });

  it('sets level 1 without tests and 2 with violations, else leaves it to the judge', () => {
    const clean = scanCodeHealth([file('export const a = 1;')], new Set());
    expect(
      impliedCodeHealthLevel(clean, { folderTests: 0, externalTests: 0 })
    ).toBe(1);
    expect(
      impliedCodeHealthLevel(clean, { folderTests: 1, externalTests: 0 })
    ).toBeNull();
    expect(
      impliedCodeHealthLevel(
        { ...clean, useDashboardCalls: 1 },
        { folderTests: 1, externalTests: 0 }
      )
    ).toBe(2);
    expect(
      impliedCodeHealthLevel(
        { ...clean, largeFiles: 1 },
        { folderTests: 0, externalTests: 2 }
      )
    ).toBe(2);
  });
});

describe('widget file resolution', () => {
  it('parses the registry for components, settings schemas and scaling mode', () => {
    const info = parseRegistry(`
      export const WIDGET_COMPONENTS = {
        clock: lazyNamed(() => import('./ClockWidget/Widget'), 'ClockWidget'),
        'time-tool': lazyNamed(() => import('./TimeTool/TimeToolWidget'), 'TimeToolWidget'),
        traffic: lazy(() => import('./TrafficLightWidget')),
      };
      export const WIDGET_SETTINGS_SCHEMAS = {
        clock: () => import('./ClockWidget/settings.schema').then((m) => m.default),
      };
      export const WIDGET_SCALING_CONFIG = {
        clock: { baseWidth: 1, skipScaling: true },
        drawing: { baseWidth: 1 },
      };
    `);
    expect(info.components).toEqual({
      clock: './ClockWidget/Widget',
      'time-tool': './TimeTool/TimeToolWidget',
      traffic: './TrafficLightWidget',
    });
    expect(info.settingsSchemas).toEqual({
      clock: './ClockWidget/settings.schema',
    });
    expect(info.skipScaling).toEqual({ clock: true, drawing: false });
  });

  const files = resolveWidgetFiles(DEFAULT_REPO_ROOT);

  it('maps the clock widget to front-face, settings and test files', () => {
    const clock = files.clock;
    expect(clock.folder).toBe('components/widgets/ClockWidget');
    expect(clock.frontFace).toContain(
      'components/widgets/ClockWidget/Widget.tsx'
    );
    expect(clock.frontFace.every((f) => !/settings|\.test\./i.test(f))).toBe(
      true
    );
    expect(clock.settings).toContain(
      'components/widgets/ClockWidget/settings.schema.ts'
    );
    expect(clock.tests.length).toBeGreaterThan(0);
    expect(clock.skipScaling).toBe(true);
  });

  it('keeps seating-chart and drawing on transform scaling', () => {
    expect(files['seating-chart'].skipScaling).toBe(false);
    expect(files.drawing.skipScaling).toBe(false);
  });

  it('covers every scorecard widget type', () => {
    const scorecards = readdirSync(
      join(DEFAULT_REPO_ROOT, 'docs/widget-rubric/scorecards')
    )
      .filter((f) => f.endsWith('.json'))
      .map(
        (f) =>
          (
            JSON.parse(
              readFileSync(
                join(DEFAULT_REPO_ROOT, 'docs/widget-rubric/scorecards', f),
                'utf8'
              )
            ) as { widgetType: string }
          ).widgetType
      );
    expect(scorecards.filter((t) => !files[t])).toEqual([]);
  });
});

describe('CLI', () => {
  it('reads argv directly, including pnpm literal -- and --flag=value', () => {
    expect(parseArgs(['--', '--type', 'clock']).types).toEqual(['clock']);
    expect(parseArgs(['--type=clock,poll']).types).toEqual(['clock', 'poll']);
    expect(parseArgs(['--out', 'x', '--help-index=h.json'])).toMatchObject({
      outDir: 'x',
      helpIndexPath: 'h.json',
      types: null,
    });
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });

  it('writes Measurement[] json for one widget and rejects unknown types', () => {
    const out = mkdtempSync(join(tmpdir(), 'grader-static-'));
    try {
      const rows = runStatic({
        types: ['clock'],
        outDir: out,
        helpIndexPath: null,
      });
      expect(rows).toHaveLength(1);
      const written = JSON.parse(
        readFileSync(join(out, 'clock.json'), 'utf8')
      ) as {
        widgetType: string;
        criterionId: string;
        size: null;
        fixture: null;
      }[];
      expect(written.map((m) => m.criterionId)).toEqual([...STATIC_CRITERIA]);
      expect(
        written.every(
          (m) =>
            m.widgetType === 'clock' && m.size === null && m.fixture === null
        )
      ).toBe(true);
      expect(() =>
        runStatic({ types: ['nope'], outDir: out, helpIndexPath: null })
      ).toThrow(/nope/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);

  it('scans every widget without throwing', () => {
    const ctx = buildContext(DEFAULT_REPO_ROOT);
    const all = resolveWidgetFiles(DEFAULT_REPO_ROOT);
    const rows = Object.values(all).map((w) => {
      const ms = scanWidget(w, ctx);
      expect(ms.map((m) => m.criterionId)).toEqual([...STATIC_CRITERIA]);
      return summaryRow(w.type, ms);
    });
    expect(rows.length).toBeGreaterThan(60);
    expect(summaryTable(rows)).toContain('| clock |');
  }, 60_000);
});
