import ts from 'typescript';
import type { Level } from '../types.ts';
import {
  parseSource,
  stringLiterals,
  walk,
  type SourceFileText,
} from './source.ts';

export interface TourAnchorIndex {
  ids: ReadonlySet<string>;
}

/** Registered ids from config/tourAnchors.ts, read from source so nothing executes. */
export function parseTourAnchorIds(text: string): TourAnchorIndex {
  const sf = parseSource('config/tourAnchors.ts', text);
  const ids = new Set<string>();
  walk(sf, (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'TOUR_ANCHORS'
    ) {
      let init = n.initializer;
      while (
        init &&
        (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))
      ) {
        init = init.expression;
      }
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (
            p.name &&
            (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))
          ) {
            ids.add(p.name.text);
          }
        }
      }
    }
  });
  return { ids };
}

/** Registered anchor ids referenced as string literals in the given files. */
export function anchorsIn(
  files: SourceFileText[],
  index: TourAnchorIndex
): string[] {
  const found = new Set<string>();
  for (const file of files) {
    for (const literal of stringLiterals(parseSource(file.path, file.text))) {
      if (index.ids.has(literal)) found.add(literal);
    }
  }
  return [...found].sort();
}

export interface HelpEntry {
  article: boolean;
  liveTour?: boolean;
}

/** Help Center content lives in Firestore, so a widget's entry comes from an exported index or stays unknown. */
export type HelpIndex = Record<string, HelpEntry>;

export function impliedHelpLevel(
  entry: HelpEntry | undefined,
  anchorCount: number
): Level | null {
  if (!entry) return null;
  const hasAnchors = anchorCount > 0;
  if (entry.article && hasAnchors) return entry.liveTour ? 4 : 3;
  return entry.article || hasAnchors ? 2 : 1;
}
