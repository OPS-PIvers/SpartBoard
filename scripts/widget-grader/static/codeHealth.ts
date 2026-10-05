import ts from 'typescript';
import type { Level } from '../types.ts';
import { lineCount, parseSource, walk, type SourceFileText } from './source.ts';

export const E3_LARGE_FILE_LINES = 800;

export interface CodeHealthScan {
  sourceFiles: number;
  totalLines: number;
  maxLines: number;
  maxLinesFile: string;
  largeFiles: number;
  anyCount: number;
  useDashboardCalls: number;
  derivedStateEffects: number;
  refSyncEffects: number;
}

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect']);
const SETTER_RE = /^set[A-Z]/;

const calleeName = (call: ts.CallExpression): string | null =>
  ts.isIdentifier(call.expression) ? call.expression.text : null;

interface EffectShape {
  derivedState: boolean;
  refSync: boolean;
}

/** Heuristic: an effect that only calls state setters, or only assigns `.current`, has no external system. */
export function classifyEffect(fn: ts.Node): EffectShape {
  let setters = 0;
  let otherCalls = 0;
  let refAssigns = 0;
  let otherAssigns = 0;
  let cleanup = false;
  let asyncy = false;
  const visit = (n: ts.Node) => {
    if (n !== fn && (ts.isFunctionLike(n) || ts.isClassLike(n))) {
      otherCalls += 1;
      return;
    }
    if (ts.isReturnStatement(n) && n.expression) cleanup = true;
    if (ts.isAwaitExpression(n) || ts.isNewExpression(n)) asyncy = true;
    if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      if (name && SETTER_RE.test(name)) setters += 1;
      else otherCalls += 1;
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      if (
        ts.isPropertyAccessExpression(n.left) &&
        n.left.name.text === 'current'
      ) {
        refAssigns += 1;
      } else {
        otherAssigns += 1;
      }
    }
    ts.forEachChild(n, visit);
  };
  const body =
    ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) ? fn.body : fn;
  visit(body);
  const pure = !cleanup && !asyncy && otherCalls === 0 && otherAssigns === 0;
  return {
    derivedState: pure && setters > 0 && refAssigns === 0,
    refSync: pure && setters === 0 && refAssigns > 0,
  };
}

export function scanCodeHealth(
  files: SourceFileText[],
  hotPathPaths: ReadonlySet<string>
): CodeHealthScan {
  const scan: CodeHealthScan = {
    sourceFiles: files.length,
    totalLines: 0,
    maxLines: 0,
    maxLinesFile: '',
    largeFiles: 0,
    anyCount: 0,
    useDashboardCalls: 0,
    derivedStateEffects: 0,
    refSyncEffects: 0,
  };
  for (const file of files) {
    const lines = lineCount(file.text);
    scan.totalLines += lines;
    if (lines > scan.maxLines) {
      scan.maxLines = lines;
      scan.maxLinesFile = file.path;
    }
    if (lines > E3_LARGE_FILE_LINES) scan.largeFiles += 1;
    const sf = parseSource(file.path, file.text);
    const hot = hotPathPaths.has(file.path);
    walk(sf, (n) => {
      if (n.kind === ts.SyntaxKind.AnyKeyword) scan.anyCount += 1;
      if (!ts.isCallExpression(n)) return;
      const name = calleeName(n);
      if (hot && name === 'useDashboard') scan.useDashboardCalls += 1;
      if (name && EFFECT_HOOKS.has(name) && n.arguments.length > 0) {
        const shape = classifyEffect(n.arguments[0]);
        if (shape.derivedState) scan.derivedStateEffects += 1;
        if (shape.refSync) scan.refSyncEffects += 1;
      }
    });
  }
  return scan;
}

export interface TestCounts {
  folderTests: number;
  externalTests: number;
}

/** Ceiling only: whether tests cover the main behavior and whether a harness exists is judge work. */
export function impliedCodeHealthLevel(
  s: CodeHealthScan,
  t: TestCounts
): Level | null {
  if (t.folderTests + t.externalTests === 0) return 1;
  const violations =
    s.useDashboardCalls + s.derivedStateEffects + s.refSyncEffects;
  return violations > 0 || s.largeFiles > 0 ? 2 : null;
}
