import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CriterionId, Level, Measurement } from '../types.ts';
import { resolveWidgetFiles, type WidgetFiles } from '../widgetFiles.ts';
import {
  impliedCodeHealthLevel,
  scanCodeHealth,
  E3_LARGE_FILE_LINES,
} from './codeHealth.ts';
import { impliedConsistencyLevel, scanConsistency } from './consistency.ts';
import { impliedCopyLevel, scanCopyAndIcons } from './copyIcons.ts';
import {
  anchorsIn,
  impliedHelpLevel,
  parseTourAnchorIds,
  type HelpIndex,
  type TourAnchorIndex,
} from './ecosystem.ts';
import { fixedTotal, impliedScalingLevel, scanScaling } from './scaling.ts';
import type { SourceFileText } from './source.ts';

export const STATIC_CRITERIA = ['S4', 'V4', 'V6', 'E2', 'E3'] as const;

export const DEFAULT_REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
export const DEFAULT_OUT_DIR = 'scripts/widget-grader/out/static';

export interface ScanContext {
  repoRoot: string;
  anchors: TourAnchorIndex;
  helpIndex: HelpIndex | null;
}

export const buildContext = (
  repoRoot: string,
  helpIndex: HelpIndex | null = null
): ScanContext => ({
  repoRoot,
  anchors: parseTourAnchorIds(
    readFileSync(join(repoRoot, 'config/tourAnchors.ts'), 'utf8')
  ),
  helpIndex,
});

const readAll = (repoRoot: string, paths: string[]): SourceFileText[] =>
  paths.map((path) => ({
    path,
    text: readFileSync(join(repoRoot, path), 'utf8'),
  }));

const measurement = (
  widgetType: string,
  criterionId: CriterionId,
  values: Measurement['values'],
  impliedLevel: Level | null
): Measurement => ({
  widgetType,
  criterionId,
  size: null,
  fixture: null,
  values,
  impliedLevel,
});

export function scanWidget(
  files: WidgetFiles,
  ctx: ScanContext
): Measurement[] {
  const { repoRoot, anchors, helpIndex } = ctx;
  const front = readAll(repoRoot, files.frontFace);
  const settings = readAll(repoRoot, files.settings);
  const other = readAll(repoRoot, files.other);
  const type = files.type;
  const mode =
    files.skipScaling === null
      ? 'unknown'
      : files.skipScaling
        ? 'container-query'
        : 'transform';

  const scaling = scanScaling(front);
  const s4 = measurement(
    type,
    'S4',
    {
      scalingMode: mode,
      frontFaceFiles: scaling.files,
      fixedText: scaling.fixedText,
      fixedSize: scaling.fixedSize,
      fixedGap: scaling.fixedGap,
      fixedPadding: scaling.fixedPadding,
      fixedInline: scaling.fixedInline,
      fixedIconProps: scaling.fixedIconProps,
      iconsTotal: scaling.iconsTotal,
      fixedTotal: fixedTotal(scaling),
      scaledLiterals: scaling.scaledLiterals,
      levelCeiling: 3,
    },
    impliedScalingLevel(scaling, files.skipScaling)
  );

  const consistency = scanConsistency(front, [...settings, ...other]);
  const v4 = measurement(
    type,
    'V4',
    {
      sharedImports: consistency.sharedImports,
      sharedNames: consistency.sharedNames.join(','),
      usesScaledEmptyState: consistency.usesScaledEmptyState,
      rawControls: consistency.rawControls,
      oneOffColors: consistency.oneOffColors,
      oneOffRadii: consistency.oneOffRadii,
    },
    impliedConsistencyLevel(consistency)
  );

  const copy = scanCopyAndIcons([...front, ...settings, ...other]);
  const v6 = measurement(
    type,
    'V6',
    {
      copyViolations: copy.copyViolations,
      copyExamples: copy.copyExamples.join(' | '),
      iconLibraries: copy.iconLibraries.join(','),
      mixedIconLibraries: copy.iconLibraries.length > 1,
      inlineSvgs: copy.inlineSvgs,
    },
    impliedCopyLevel(copy)
  );

  const frontAnchors = anchorsIn(front, anchors);
  const allAnchors = anchorsIn([...front, ...settings, ...other], anchors);
  const help = helpIndex?.[type];
  const e2 = measurement(
    type,
    'E2',
    {
      helpArticle: help ? help.article : 'unknown',
      liveTour: help ? Boolean(help.liveTour) : 'unknown',
      anchorsOnFrontFace: frontAnchors.length,
      anchorsTotal: allAnchors.length,
      anchorIds: allAnchors.join(','),
    },
    impliedHelpLevel(help, allAnchors.length)
  );

  const health = scanCodeHealth(
    [...front, ...settings, ...other],
    new Set(files.frontFace)
  );
  const testCounts = {
    folderTests: files.tests.length,
    externalTests: files.externalTests.length,
  };
  const e3 = measurement(
    type,
    'E3',
    {
      folderTests: testCounts.folderTests,
      externalTests: testCounts.externalTests,
      sourceFiles: health.sourceFiles,
      totalLines: health.totalLines,
      maxLines: health.maxLines,
      maxLinesFile: health.maxLinesFile,
      largeFiles: health.largeFiles,
      largeFileLines: E3_LARGE_FILE_LINES,
      anyCount: health.anyCount,
      useDashboardCalls: health.useDashboardCalls,
      derivedStateEffects: health.derivedStateEffects,
      refSyncEffects: health.refSyncEffects,
      levelCeiling: 3,
    },
    impliedCodeHealthLevel(health, testCounts)
  );

  return [s4, v4, v6, e2, e3];
}

export interface CliOptions {
  types: string[] | null;
  outDir: string;
  helpIndexPath: string | null;
}

/** Reads argv directly so pnpm's literal `--` and `--flag=value` both work. */
export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    types: null,
    outDir: DEFAULT_OUT_DIR,
    helpIndexPath: null,
  };
  const args = argv.filter((a) => a !== '--');
  for (let i = 0; i < args.length; i += 1) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    const value = () => inline ?? args[++i];
    if (flag === '--type') {
      const v = value();
      if (!v) throw new Error('--type needs a widget type');
      opts.types = [...(opts.types ?? []), ...v.split(',').filter(Boolean)];
    } else if (flag === '--out') {
      opts.outDir = value() ?? opts.outDir;
    } else if (flag === '--help-index') {
      opts.helpIndexPath = value() ?? null;
    } else {
      throw new Error(`Unknown argument: ${args[i]}`);
    }
  }
  return opts;
}

export type SummaryRow = {
  type: string;
} & Partial<Record<(typeof STATIC_CRITERIA)[number], Level | null>>;

export const summaryRow = (
  type: string,
  measurements: Measurement[]
): SummaryRow => {
  const row: SummaryRow = { type };
  for (const m of measurements) {
    if (
      m.criterionId &&
      (STATIC_CRITERIA as readonly string[]).includes(m.criterionId)
    ) {
      row[m.criterionId as (typeof STATIC_CRITERIA)[number]] =
        m.impliedLevel ?? null;
    }
  }
  return row;
};

export const summaryTable = (rows: SummaryRow[]): string => {
  const cell = (v: Level | null | undefined) => (v == null ? '-' : String(v));
  const lines = [
    `| widget | ${STATIC_CRITERIA.join(' | ')} |`,
    `| --- | ${STATIC_CRITERIA.map(() => '---').join(' | ')} |`,
    ...rows.map(
      (r) =>
        `| ${r.type} | ${STATIC_CRITERIA.map((c) => cell(r[c])).join(' | ')} |`
    ),
  ];
  return lines.join('\n');
};

export function runStatic(
  opts: CliOptions,
  repoRoot: string = DEFAULT_REPO_ROOT
): SummaryRow[] {
  const helpIndex = opts.helpIndexPath
    ? (JSON.parse(
        readFileSync(resolve(repoRoot, opts.helpIndexPath), 'utf8')
      ) as HelpIndex)
    : null;
  const ctx = buildContext(repoRoot, helpIndex);
  const all = resolveWidgetFiles(repoRoot);
  const types = opts.types ?? Object.keys(all).sort();
  const unknown = types.filter((t) => !all[t]);
  if (unknown.length > 0) {
    throw new Error(
      `No front-face component registered for: ${unknown.join(', ')}`
    );
  }
  const outDir = resolve(repoRoot, opts.outDir);
  mkdirSync(outDir, { recursive: true });
  const rows: SummaryRow[] = [];
  for (const type of types) {
    const measurements = scanWidget(all[type], ctx);
    writeFileSync(
      join(outDir, `${type}.json`),
      `${JSON.stringify(measurements, null, 2)}\n`
    );
    rows.push(summaryRow(type, measurements));
  }
  writeFileSync(join(outDir, 'summary.md'), `${summaryTable(rows)}\n`);
  return rows;
}

export function main(argv: string[]): void {
  const opts = parseArgs(argv);
  const rows = runStatic(opts);
  console.log(summaryTable(rows));
  console.log(`\nWrote ${rows.length} widget file(s) to ${opts.outDir}`);
}
