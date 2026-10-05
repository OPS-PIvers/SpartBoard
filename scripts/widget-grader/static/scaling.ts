import ts from 'typescript';
import type { Level } from '../types.ts';
import {
  importRecords,
  parseSource,
  stringLiterals,
  walk,
  type SourceFileText,
} from './source.ts';

const ICON_LIBS = [
  'lucide-react',
  'react-icons',
  '@heroicons',
  '@tabler/icons-react',
  '@radix-ui/react-icons',
  '@mui/icons-material',
  '@fortawesome',
  'phosphor-react',
];

export const isIconLib = (spec: string): boolean =>
  ICON_LIBS.some((lib) => spec === lib || spec.startsWith(`${lib}/`));

const NUM = String.raw`\d+(?:\.\d+)?`;
const LEN = String.raw`\[${NUM}(?:px|rem|em)\]`;
const FIXED_CLASS: [string, RegExp][] = [
  ['text', new RegExp(`^text-(?:xs|sm|base|lg|xl|[2-9]xl|${LEN})$`)],
  [
    'size',
    new RegExp(
      `^(?:w|h|size|min-w|min-h|max-w|max-h)-(?:${NUM}|px|${LEN})$|^max-w-(?:xs|sm|md|lg|xl|[2-7]xl)$`
    ),
  ],
  ['gap', new RegExp(`^(?:gap(?:-[xy])?|space-[xy])-(?:${NUM}|px|${LEN})$`)],
  ['padding', new RegExp(`^p[xytblrse]?-(?:${NUM}|px|${LEN})$`)],
];

const INLINE_PROPS =
  /^(fontSize|width|height|minWidth|minHeight|maxWidth|maxHeight|gap|rowGap|columnGap|padding|paddingTop|paddingRight|paddingBottom|paddingLeft)$/;
const CQ_RE = /cq(?:min|w|h)\b/;

export interface ScalingScan {
  files: number;
  fixedText: number;
  fixedSize: number;
  fixedGap: number;
  fixedPadding: number;
  fixedInline: number;
  fixedIconProps: number;
  iconsTotal: number;
  /** String literals that carry a container-query unit. */
  scaledLiterals: number;
}

export const stripVariants = (token: string): string =>
  token.replace(/^(?:[a-z0-9-]+:|\[[^\]]+\]:)+/i, '').replace(/^[!-]+/, '');

export const classifyFixedClass = (token: string): string | null => {
  const bare = stripVariants(token);
  if (CQ_RE.test(bare) || bare.includes('min(') || bare.includes('clamp(')) {
    return null;
  }
  return FIXED_CLASS.find(([, re]) => re.test(bare))?.[0] ?? null;
};

const isFixedInlineValue = (node: ts.Expression): boolean => {
  if (ts.isNumericLiteral(node)) return Number(node.text) > 0;
  if (ts.isStringLiteralLike(node)) {
    const parts = node.text.trim().split(/\s+/);
    return parts.every((p) => new RegExp(`^${NUM}(?:px|rem|em)$`).test(p));
  }
  return false;
};

const sizeAttrIsFixed = (init: ts.JsxAttribute['initializer']): boolean => {
  if (!init) return false;
  if (ts.isStringLiteral(init)) return /^\d+(?:\.\d+)?$/.test(init.text);
  if (ts.isJsxExpression(init) && init.expression) {
    return ts.isNumericLiteral(init.expression);
  }
  return false;
};

export function scanScaling(files: SourceFileText[]): ScalingScan {
  const scan: ScalingScan = {
    files: files.length,
    fixedText: 0,
    fixedSize: 0,
    fixedGap: 0,
    fixedPadding: 0,
    fixedInline: 0,
    fixedIconProps: 0,
    iconsTotal: 0,
    scaledLiterals: 0,
  };
  for (const file of files) {
    const sf = parseSource(file.path, file.text);
    const icons = new Set<string>();
    for (const rec of importRecords(sf)) {
      if (isIconLib(rec.spec) && !rec.typeOnly) {
        for (const name of rec.names) icons.add(name);
      }
    }
    for (const literal of stringLiterals(sf)) {
      if (CQ_RE.test(literal)) scan.scaledLiterals += 1;
      for (const token of literal.split(/\s+/)) {
        const kind = classifyFixedClass(token);
        if (kind === 'text') scan.fixedText += 1;
        else if (kind === 'size') scan.fixedSize += 1;
        else if (kind === 'gap') scan.fixedGap += 1;
        else if (kind === 'padding') scan.fixedPadding += 1;
      }
    }
    walk(sf, (n) => {
      if (
        ts.isPropertyAssignment(n) &&
        (ts.isIdentifier(n.name) || ts.isStringLiteralLike(n.name)) &&
        INLINE_PROPS.test(n.name.text) &&
        isFixedInlineValue(n.initializer)
      ) {
        scan.fixedInline += 1;
      }
      const el = ts.isJsxSelfClosingElement(n)
        ? n
        : ts.isJsxOpeningElement(n)
          ? n
          : null;
      if (el && icons.has(el.tagName.getText(sf))) {
        scan.iconsTotal += 1;
        const size = el.attributes.properties.find(
          (a): a is ts.JsxAttribute =>
            ts.isJsxAttribute(a) && a.name.getText(sf) === 'size'
        );
        if (size && sizeAttrIsFixed(size.initializer)) {
          scan.fixedIconProps += 1;
        }
      }
    });
  }
  return scan;
}

/** At or below this share of fixed sizing (or this many fixed sizes) the face counts as level 3. */
export const S4_MAX_FIXED_SHARE_L3 = 0.1;
export const S4_MAX_FIXED_COUNT_L3 = 3;
export const S4_MAX_FIXED_SHARE_L2 = 0.6;

export const fixedTotal = (s: ScalingScan): number =>
  s.fixedText +
  s.fixedSize +
  s.fixedGap +
  s.fixedPadding +
  s.fixedInline +
  s.fixedIconProps;

/** Level 4 needs the hero/secondary/tertiary check, so the script stops at 3. */
export function impliedScalingLevel(
  s: ScalingScan,
  skipScaling: boolean | null
): Level | null {
  if (skipScaling === false) return null;
  const fixed = fixedTotal(s);
  const total = fixed + s.scaledLiterals;
  if (total === 0) return null;
  const share = fixed / total;
  if (fixed <= S4_MAX_FIXED_COUNT_L3 || share <= S4_MAX_FIXED_SHARE_L3)
    return 3;
  return share <= S4_MAX_FIXED_SHARE_L2 ? 2 : 1;
}
