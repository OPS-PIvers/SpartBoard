// Draft state for the team layout editor (T2, T5): rows the lead reorders and switches, then a stored layout.

import type {
  PlcGroupType,
  PlcTeamLayout,
  TeamCardId,
  TeamHeroRef,
  TeamPageId,
  TeamPageSetting,
} from '@/types';
import {
  TEAM_LANDING_CARD_CATALOG,
  isTeamLandingPage,
  teamTypeAvailablePages,
} from '@/config/teamTypePresets';

export interface CardRow {
  id: TeamCardId;
  on: boolean;
}

export interface LayoutDraft {
  pages: TeamPageSetting[];
  landing: TeamPageId;
  cards: CardRow[];
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

/** Enabled cards in layout order, then the rest of the landing's catalog switched off; the hero is fixed. */
export function cardRows(
  landing: TeamPageId,
  cards: readonly TeamCardId[]
): CardRow[] {
  const catalog = (TEAM_LANDING_CARD_CATALOG[landing] ?? []).filter(
    (id) => id !== 'hero'
  );
  const on = cards.filter((id) => id !== 'hero' && catalog.includes(id));
  return [
    ...on.map((id) => ({ id, on: true })),
    ...catalog
      .filter((id) => !on.includes(id))
      .map((id) => ({ id, on: false })),
  ];
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
    cards: cardRows(layout.landing, layout.cards),
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

/** A card that shows updates needs the Updates page on. */
export function cardBlocked(
  id: TeamCardId,
  pages: readonly TeamPageSetting[]
): boolean {
  return (
    id === 'latestUpdates' &&
    !pages.some((p) => p.id === 'updates' && p.enabled)
  );
}

export function layoutFromDraft(
  draft: LayoutDraft,
  refByKey: ReadonlyMap<string, TeamHeroRef>
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
        .filter((c) => c.on && !cardBlocked(c.id, draft.pages))
        .map((c) => c.id),
    ],
    hero: ref ? { mode: 'pinned', ref } : { mode: 'default' },
  };
}

export function moveRow<T>(list: readonly T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
