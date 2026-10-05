import ts from 'typescript';
import type { Level } from '../types.ts';
import { copyProblemTexts } from './copyGuard.ts';
import { isIconLib } from './scaling.ts';
import {
  importRecords,
  parseSource,
  walk,
  type SourceFileText,
} from './source.ts';

export interface CopyIconScan {
  copyViolations: number;
  /** First few offending strings, trimmed, for the scorecard evidence. */
  copyExamples: string[];
  iconLibraries: string[];
  inlineSvgs: number;
}

const libraryOf = (spec: string): string => {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

export function scanCopyAndIcons(files: SourceFileText[]): CopyIconScan {
  const libs = new Set<string>();
  const examples: string[] = [];
  let copyViolations = 0;
  let inlineSvgs = 0;
  for (const file of files) {
    const sf = parseSource(file.path, file.text);
    for (const text of copyProblemTexts(sf)) {
      copyViolations += 1;
      if (examples.length < 3) {
        examples.push(text.replace(/\s+/g, ' ').trim().slice(0, 60));
      }
    }
    for (const rec of importRecords(sf)) {
      if (isIconLib(rec.spec) && !rec.typeOnly && rec.names.length > 0) {
        libs.add(libraryOf(rec.spec));
      }
    }
    walk(sf, (n) => {
      if (
        (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
        n.tagName.getText(sf) === 'svg'
      ) {
        inlineSvgs += 1;
      }
    });
  }
  return {
    copyViolations,
    copyExamples: examples,
    iconLibraries: [...libs].sort(),
    inlineSvgs,
  };
}

/** Level 1 is the only level the descriptors let a script decide (violations or mixed icon styles). */
export function impliedCopyLevel(s: CopyIconScan): Level | null {
  return s.copyViolations > 0 || s.iconLibraries.length > 1 ? 1 : null;
}
