// Pure analyzers: turn FaceSnapshots into gate results and per-render metrics. No browser needed.

import type { Box, ControlInfo, FaceSnapshot, TextInfo } from './snapshotTypes';
import { worstContrast } from './contrast';
import { PROTECTED_PATTERNS, type Thresholds } from './constants';

export type Values = Record<string, number | string | boolean>;

export interface Check {
  pass: boolean;
  values: Values;
}

const EDGE_TOLERANCE_PX = 1.5;
// Text boxes include ascent and descent, so a tight line box may cut this much of the em (top and bottom together) without cutting ink.
const TEXT_VERTICAL_SLACK_EM = 0.25;
const MAX_OFFENDERS = 5;

const area = (b: Box | null): number => (b ? b.w * b.h : 0);

const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const cutAmounts = (
  box: Box,
  clip: Box | null
): { x: number; y: number } => {
  if (!clip) return { x: box.w, y: box.h };
  return {
    x:
      Math.max(0, clip.x - box.x) +
      Math.max(0, box.x + box.w - (clip.x + clip.w)),
    y:
      Math.max(0, clip.y - box.y) +
      Math.max(0, box.y + box.h - (clip.y + clip.h)),
  };
};

const list = (items: string[]): string =>
  items.slice(0, MAX_OFFENDERS).join(' | ') +
  (items.length > MAX_OFFENDERS
    ? ` | +${items.length - MAX_OFFENDERS} more`
    : '');

const visibleControls = (s: FaceSnapshot): ControlInfo[] =>
  s.controls.filter((c) => !c.transparent);

/** G1: a front-face control is clipped, covered, or outside the card. */
export function analyzeG1(s: FaceSnapshot): Check {
  const controls = visibleControls(s);
  const offenders: string[] = [];
  let clipped = 0;
  let covered = 0;
  let outside = 0;
  for (const c of controls) {
    const hiddenShare =
      area(c.box) > 0 ? 1 - area(c.nonScrollBox) / area(c.box) : 0;
    const cut = cutAmounts(c.box, c.nonScrollBox);
    const isClipped =
      c.centerHit === 'clipped' ||
      (hiddenShare > 0.1 &&
        (cut.x > EDGE_TOLERANCE_PX || cut.y > EDGE_TOLERANCE_PX));
    if (c.centerHit === 'offscreen') {
      outside++;
      offenders.push(`outside: ${c.label || c.path}`);
    } else if (isClipped) {
      clipped++;
      offenders.push(
        `clipped ${Math.round(hiddenShare * 100)}%: ${c.label || c.path}`
      );
    } else if (c.centerHit === 'covered') {
      covered++;
      offenders.push(`covered by ${c.coveredBy}: ${c.label || c.path}`);
    }
  }
  return {
    pass: offenders.length === 0,
    values: {
      controls: controls.length,
      clipped,
      covered,
      outside,
      offenders: list(offenders),
    },
  };
}

const textCut = (t: TextInfo): boolean => {
  const cut = cutAmounts(t.box, t.nonScrollBox);
  return (
    cut.x > EDGE_TOLERANCE_PX ||
    cut.y > Math.max(EDGE_TOLERANCE_PX, t.fontPx * TEXT_VERTICAL_SLACK_EM)
  );
};

/** G2: text or media cut off by a box that does not scroll. */
export function analyzeG2(s: FaceSnapshot): Check {
  const offenders: string[] = [];
  let clippedText = 0;
  let clippedMedia = 0;
  for (const t of s.texts) {
    if (t.truncated || !textCut(t)) continue;
    clippedText++;
    offenders.push(`text "${t.text.slice(0, 30)}" in ${t.path}`);
  }
  for (const m of s.media) {
    const hidden = area(m.box) > 0 ? 1 - area(m.nonScrollBox) / area(m.box) : 0;
    if (hidden <= 0.1) continue;
    clippedMedia++;
    offenders.push(`media ${Math.round(hidden * 100)}% hidden: ${m.path}`);
  }
  return {
    pass: offenders.length === 0,
    values: {
      texts: s.texts.length,
      clippedText,
      clippedMedia,
      truncatedText: s.texts.filter((t) => t.truncated).length,
      offenders: list(offenders),
    },
  };
}

/** G3: any console error, uncaught error or unhandled rejection. */
export function analyzeG3(
  errors: string[],
  networkFailures: string[] = []
): Check {
  const unique = [
    ...new Set(errors.map((e) => e.split('\n')[0].slice(0, 200))),
  ];
  return {
    pass: unique.length === 0,
    values: {
      errors: unique.length,
      offenders: list(unique),
      networkFailures: networkFailures.length,
      network: list([...new Set(networkFailures)]),
    },
  };
}

const normalize = (text: string): string =>
  text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 4 && !/^\d+$/.test(t))
  );

export interface G4Input {
  /** Face text of the typical fixture on first load and after a reload. */
  beforeReload: string;
  afterReload: string;
  /** Face text of the empty fixture, so default wording isn't counted as fixture content. */
  emptyText: string;
  typicalText: string;
  /** Face text of a second instance added on default config beside the typical one. */
  secondText: string;
  /** Words both instances may show legitimately, such as the board's shared roster names. */
  sharedText?: string;
}

/** G4: content lost on reload, content following the type to another instance, or protected data on the face. */
export function analyzeG4(input: G4Input): Check {
  const reloadKeeps =
    normalize(input.beforeReload) === normalize(input.afterReload);
  const empty = new Set([
    ...tokens(input.emptyText),
    ...tokens(input.sharedText ?? ''),
  ]);
  const own = [...tokens(input.typicalText)].filter((t) => !empty.has(t));
  const second = tokens(input.secondText);
  const leaked = own.filter((t) => second.has(t));
  const leaks = own.length >= 3 && leaked.length / own.length >= 0.5;
  const protectedHits = PROTECTED_PATTERNS.filter((p) =>
    p.pattern.test(input.typicalText)
  ).map((p) => p.name);
  const offenders: string[] = [];
  if (!reloadKeeps) offenders.push('face text changed after reload');
  if (leaks)
    offenders.push(
      `second instance shows ${leaked.length}/${own.length} fixture words`
    );
  if (protectedHits.length)
    offenders.push(`protected data on face: ${protectedHits.join(', ')}`);
  return {
    pass: offenders.length === 0,
    values: {
      reloadKeepsContent: reloadKeeps,
      fixtureWords: own.length,
      leakedWords: leaked.length,
      protectedHits: protectedHits.join(','),
      offenders: list(offenders),
    },
  };
}

export interface RenderMetrics {
  contentFraction: number;
  primaryPx: number;
  minFontPx: number;
  textCount: number;
  minContrast: number;
  /** Texts under 3:1, and texts under their R16 threshold (4.5:1, or 3:1 when large). */
  contrastUnder3: number;
  contrastFailures: number;
  contrastUnknown: number;
  controls: number;
  minTargetPx: number;
  targetsUnder32: number;
  targetsUnderDefault: number;
  minSpacingPx: number;
  scrollers: number;
  nestedScroll: boolean;
  wholeCardScroll: boolean;
  dragFraction: number;
  stripsCovered: number;
  toolbarOverlaps: number;
}

const isLarge = (t: TextInfo): boolean =>
  t.fontPx >= 24 || (t.fontPx >= 18.66 && t.fontWeight >= 700);

const gap = (a: Box, b: Box): number => {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.max(dx, dy);
};

const contains = (a: Box, b: Box): boolean =>
  a.x <= b.x + 0.5 &&
  a.y <= b.y + 0.5 &&
  a.x + a.w >= b.x + b.w - 0.5 &&
  a.y + a.h >= b.y + b.h - 0.5;

export function renderMetrics(s: FaceSnapshot, t: Thresholds): RenderMetrics {
  const cardArea = area(s.card);
  const readable = s.texts.filter(
    (x) => x.nonScrollBox !== null && /[\p{L}\p{N}]/u.test(x.text)
  );
  const fonts = readable.map((x) => x.fontPx);
  const maxFont = fonts.length ? Math.max(...fonts) : 0;
  const mediaSide = s.media.length
    ? Math.max(...s.media.map((m) => Math.min(m.box.w, m.box.h)))
    : 0;
  let minContrast = Infinity;
  let under3 = 0;
  let failures = 0;
  let unknown = 0;
  for (const x of readable) {
    const ratio = worstContrast(x.color, x.layers);
    if (ratio === null) {
      unknown++;
      continue;
    }
    minContrast = Math.min(minContrast, ratio);
    if (ratio < t.largeTextContrast) under3++;
    if (ratio < (isLarge(x) ? t.largeTextContrast : t.textContrast)) failures++;
  }
  const controls = visibleControls(s);
  const sides = controls.map((c) => Math.min(c.box.w, c.box.h));
  let minSpacing = Infinity;
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i].box;
      const b = controls[j].box;
      if (contains(a, b) || contains(b, a)) continue;
      minSpacing = Math.min(minSpacing, gap(a, b));
    }
  }
  const toolbar = s.toolbar;
  return {
    contentFraction: cardArea > 0 ? area(s.contentBox) / cardArea : 0,
    primaryPx: Math.max(maxFont, mediaSide),
    minFontPx: fonts.length ? Math.min(...fonts) : 0,
    textCount: readable.length,
    minContrast: Number.isFinite(minContrast) ? minContrast : 0,
    contrastUnder3: under3,
    contrastFailures: failures,
    contrastUnknown: unknown,
    controls: controls.length,
    minTargetPx: sides.length ? Math.min(...sides) : 0,
    targetsUnder32: sides.filter((v) => v < t.touchHitAreaMinimumPx).length,
    targetsUnderDefault: sides.filter((v) => v < t.touchHitAreaDefaultPx)
      .length,
    minSpacingPx: Number.isFinite(minSpacing) ? minSpacing : -1,
    scrollers: s.scrollers.length,
    nestedScroll: s.scrollers.some((x) => x.nested),
    wholeCardScroll: s.scrollers.some(
      (x) => x.path === '' || area(x.box) >= 0.98 * cardArea
    ),
    dragFraction: s.drag.samples ? s.drag.draggable / s.drag.samples : 0,
    stripsCovered: s.strips.filter(
      (x) => x.samples > 0 && x.covered / x.samples >= 0.5
    ).length,
    toolbarOverlaps: toolbar
      ? controls.filter(
          (c) => c.visibleBox && intersects(c.visibleBox, toolbar)
        ).length
      : 0,
  };
}
