/**
 * Turning a share's `sections` / `boards` into what the sub navigates.
 *
 * Pure — no Firestore, no React — so the grouping and ordering rules are
 * testable on their own. Shares made before the v2 fields existed carry only
 * `boardIds`, so they collapse to one unnamed group in that order; the caller
 * supplies the label for a board whose name was never recorded.
 */

import type { SharedCollection } from '@/types';

export interface SubShareNavBoard {
  id: string;
  name: string;
}

export interface SubShareNavSection {
  id: string;
  /** Empty for the pre-v2 single group, and for a share's root section. */
  name: string;
  boards: SubShareNavBoard[];
}

export interface SubShareNav {
  /** Groups in tree order, each holding its boards in walk order. */
  sections: SubShareNavSection[];
  /** The grouped boards flattened — what prev/next steps through. */
  order: string[];
  defaultBoardId: string | null;
}

/** The board to open: the teacher's pick when it is still here, else the first. */
export function pickLandingBoard(
  order: string[],
  defaultBoardId: string | null | undefined
): string | null {
  if (defaultBoardId && order.includes(defaultBoardId)) return defaultBoardId;
  return order[0] ?? null;
}

/** The share fields the nav is built from — all the loader has to carry. */
export type SubShareNavSource = Pick<
  SharedCollection,
  'boardIds' | 'boards' | 'sections' | 'defaultBoardId'
>;

export function buildSubShareNav(
  share: SubShareNavSource,
  /** Label for a board carrying no recorded name (pre-v2 shares). */
  fallbackName: (boardId: string) => string
): SubShareNav {
  const rawIds = Array.isArray(share.boardIds) ? share.boardIds : [];
  const entries = Array.isArray(share.boards) ? share.boards : [];
  const defaultBoardId = share.defaultBoardId ?? null;

  // `boardIds` is the walk order and the only list guaranteed to match the
  // board sub-docs, so it decides what is navigable; `boards` only names and
  // groups them.
  const walk = rawIds.filter((id, i) => rawIds.indexOf(id) === i);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const nameFor = (id: string) => {
    const recorded = byId.get(id)?.name?.trim();
    if (recorded !== undefined && recorded.length > 0) return recorded;
    return fallbackName(id);
  };

  const flatten = (sections: SubShareNavSection[]) =>
    sections.flatMap((s) => s.boards.map((b) => b.id));

  if (entries.length === 0 || !Array.isArray(share.sections)) {
    const sections = [
      {
        id: '',
        name: '',
        boards: walk.map((id) => ({ id, name: nameFor(id) })),
      },
    ];
    return { sections, order: flatten(sections), defaultBoardId };
  }

  const sectionOrder = share.sections.map((s) => s.id);
  const grouped = new Map<string, SubShareNavBoard[]>();
  for (const id of walk) {
    // A board whose section is missing from `sections` still has to appear, so
    // it joins the first group rather than vanishing from the nav.
    const raw = byId.get(id)?.sectionId ?? '';
    const sectionId = sectionOrder.includes(raw)
      ? raw
      : (sectionOrder[0] ?? '');
    const board = { id, name: nameFor(id) };
    const bucket = grouped.get(sectionId);
    if (bucket) bucket.push(board);
    else grouped.set(sectionId, [board]);
  }

  const sections = share.sections
    .map((s) => ({
      id: s.id,
      name: s.name ?? '',
      boards: grouped.get(s.id) ?? [],
    }))
    .filter((s) => s.boards.length > 0);

  // Flattened from the groups, not from `boardIds`, so prev/next can never
  // step in an order different from the one the sub is looking at.
  return { sections, order: flatten(sections), defaultBoardId };
}
