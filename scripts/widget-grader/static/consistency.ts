import ts from 'typescript';
import type { Level } from '../types.ts';
import { isIconLib } from './scaling.ts';
import {
  importRecords,
  parseSource,
  stringLiterals,
  walk,
  type SourceFileText,
} from './source.ts';

const SHARED_PREFIXES = ['@/components/common/', '@/components/settings/'];
const RAW_CONTROLS = new Set(['button', 'input', 'select', 'textarea']);
const COLOR_RE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(|\b(?:bg|text|border|ring|fill|stroke|from|to|via)-\[(?:#|rgb|hsl|color:)/;
const RADIUS_CLASS_RE = /(?:^|\s)rounded(?:-[a-z]+)?-\[[^\]]+\]/;
const RADIUS_PROP_RE = /^(?:borderRadius|border-radius)$/;

export interface ConsistencyScan {
  sharedImports: number;
  sharedNames: string[];
  usesScaledEmptyState: boolean;
  rawControls: number;
  oneOffColors: number;
  oneOffRadii: number;
}

const isShared = (spec: string): boolean =>
  SHARED_PREFIXES.some((p) => spec.startsWith(p));

/** `faceFiles` get the control and color checks; every file counts toward shared imports. */
export function scanConsistency(
  faceFiles: SourceFileText[],
  otherFiles: SourceFileText[]
): ConsistencyScan {
  const names = new Set<string>();
  let sharedImports = 0;
  let usesScaledEmptyState = false;
  for (const file of [...faceFiles, ...otherFiles]) {
    const sf = parseSource(file.path, file.text);
    for (const rec of importRecords(sf)) {
      if (rec.typeOnly || rec.dynamic || !isShared(rec.spec)) continue;
      if (isIconLib(rec.spec)) continue;
      for (const name of rec.names.filter((n) => /^[A-Z]/.test(n))) {
        names.add(name);
        sharedImports += 1;
        if (name === 'ScaledEmptyState') usesScaledEmptyState = true;
      }
    }
  }
  let rawControls = 0;
  let oneOffColors = 0;
  let oneOffRadii = 0;
  for (const file of faceFiles) {
    const sf = parseSource(file.path, file.text);
    walk(sf, (n) => {
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        RAW_CONTROLS.has(n.tagName.getText(sf))
      ) {
        rawControls += 1;
      }
      if (
        ts.isPropertyAssignment(n) &&
        (ts.isIdentifier(n.name) || ts.isStringLiteralLike(n.name)) &&
        RADIUS_PROP_RE.test(n.name.text) &&
        (ts.isNumericLiteral(n.initializer) ||
          (ts.isStringLiteralLike(n.initializer) &&
            /^\d+(?:\.\d+)?px$/.test(n.initializer.text)))
      ) {
        oneOffRadii += 1;
      }
    });
    for (const literal of stringLiterals(sf)) {
      if (COLOR_RE.test(literal)) oneOffColors += 1;
      if (RADIUS_CLASS_RE.test(literal)) oneOffRadii += 1;
    }
  }
  return {
    sharedImports,
    sharedNames: [...names].sort(),
    usesScaledEmptyState,
    rawControls,
    oneOffColors,
    oneOffRadii,
  };
}

/** The script only sets a ceiling: no shared components and a pile of one-offs is level 1. */
export const V4_MIN_ONE_OFFS_FOR_L1 = 5;

export function impliedConsistencyLevel(s: ConsistencyScan): Level | null {
  const oneOffs = s.rawControls + s.oneOffColors + s.oneOffRadii;
  return s.sharedImports === 0 && oneOffs >= V4_MIN_ONE_OFFS_FOR_L1 ? 1 : null;
}
