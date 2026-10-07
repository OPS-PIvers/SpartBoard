// Draft state for the team layout editor (T2, T5): rows the lead reorders and switches, then a stored layout.

import type {
  PlcGroupType,
  PlcTeamLayout,
  TeamCardId,
  TeamHero,
  TeamHeroRef,
  TeamPageId,
  TeamPageSetting,
} from '@/types';
import {
  pinnedHero,
  type TeamHeroPinner,
} from '@/components/plc/teams/heroes/heroPin';
import { TEAM_CARD_ROWS } from './cardRows';
import {
  TEAM_LANDING_CARD_CATALOG,
  isTeamLandingPage,
  teamTypeAvailablePages,
} from '@/config/teamTypePresets';

/** One editor row; a row can switch two cards together. */
export interface CardRow {
  key: string;
  ids: readonly TeamCardId[];
  on: boolean;
}

export interface LayoutDraft {
  pages: TeamPageSetting[];
  landing: TeamPageId;
  cards: CardRow[];
  extraCards: TeamCardId[];
  heroMode: 'default' | 'pinned';
  heroKey: string | null;
}

export function heroRefKey(ref: TeamHeroRef): string {
  switch (ref.kind) {
    case 'assessment':
      return `assessment:${ref.assessmentId}`;
    case 'target':
      return `target:${ref.targetId}`;
    case 'goal':
      return `goal:${ref.goalId}`;
    case 'doc':
      return `doc:${ref.docId}`;
    case 'note':
      return `note:${ref.noteId}`;
    case 'update':
      return `update:${ref.updateId}`;
    case 'calendar':
      return 'calendar';
  }
}

/** Rows on in layout order, then the type's other rows off; cards outside the rows stay as saved. */
export function cardRows(
  groupType: PlcGroupType,
  landing: TeamPageId,
  cards: readonly TeamCardId[]
): CardRow[] {
  const catalog = TEAM_LANDING_CARD_CATALOG[landing] ?? [];
  const defs = TEAM_CARD_ROWS[groupType].filter((ids) =>
    ids.every((id) => catalog.includes(id))
  );
  const position = (ids: readonly TeamCardId[]) =>
    Math.min(
      ...ids.map((id) => {
        const i = cards.indexOf(id);
        return i < 0 ? Infinity : i;
      })
    );
  const on = defs
    .filter((ids) => position(ids) !== Infinity)
    .sort((a, b) => position(a) - position(b));
  const off = defs.filter((ids) => position(ids) === Infinity);
  return [
    ...on.map((ids) => ({ key: ids.join('+'), ids, on: true })),
    ...off.map((ids) => ({ key: ids.join('+'), ids, on: false })),
  ];
}

/** Saved cards no editor row covers (other than the hero), kept after the rows. */
function uncoveredCards(
  groupType: PlcGroupType,
  cards: readonly TeamCardId[]
): TeamCardId[] {
  const covered = new Set(TEAM_CARD_ROWS[groupType].flat());
  return cards.filter((id) => id !== 'hero' && !covered.has(id));
}

export function draftFromLayout(
  layout: PlcTeamLayout,
  groupType: PlcGroupType
): LayoutDraft {
  const available = teamTypeAvailablePages(groupType);
  const pages = layout.pages.filter((p) => available.includes(p.id));
  return {
    pages,
    landing: layout.landing,
    cards: cardRows(groupType, layout.landing, layout.cards),
    extraCards: uncoveredCards(groupType, layout.cards),
    heroMode:
      layout.hero.mode === 'pinned' && layout.hero.ref ? 'pinned' : 'default',
    heroKey: layout.hero.ref ? heroRefKey(layout.hero.ref) : null,
  };
}

export function landingOptions(
  pages: readonly TeamPageSetting[]
): TeamPageId[] {
  return pages
    .filter((p) => p.enabled && isTeamLandingPage(p.id))
    .map((p) => p.id);
}

/** A row that shows updates needs the Updates page on. */
export function cardBlocked(
  ids: readonly TeamCardId[],
  pages: readonly TeamPageSetting[]
): boolean {
  return (
    ids.includes('latestUpdates') &&
    !pages.some((p) => p.id === 'updates' && p.enabled)
  );
}

export function layoutFromDraft(
  draft: LayoutDraft,
  refByKey: ReadonlyMap<string, TeamHeroRef>,
  pinner?: TeamHeroPinner,
  previous?: TeamHero
): PlcTeamLayout {
  const ref =
    draft.heroMode === 'pinned' && draft.heroKey
      ? refByKey.get(draft.heroKey)
      : undefined;
  return {
    pages: draft.pages.map((p) =>
      p.id === draft.landing ? { ...p, enabled: true } : p
    ),
    landing: draft.landing,
    cards: [
      'hero',
      ...draft.cards
        .filter((c) => c.on && !cardBlocked(c.ids, draft.pages))
        .flatMap((c) => c.ids),
      ...draft.extraCards,
    ],
    hero: ref ? pinnedHero(ref, pinner, previous) : { mode: 'default' },
  };
}

export function moveRow<T>(list: readonly T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
