// Who pinned the landing hero: written on pin, kept on re-pin, dropped on Follow default.

import type { TeamHero, TeamHeroRef } from '@/types';

export type TeamHeroPinner = NonNullable<TeamHero['pinnedBy']>;

export function heroPinner(
  user: { uid: string; displayName: string | null; email: string | null } | null
): TeamHeroPinner | undefined {
  if (!user?.uid) return undefined;
  return { uid: user.uid, name: user.displayName ?? user.email ?? '' };
}

export const sameHeroRef = (a: TeamHeroRef, b: TeamHeroRef): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** A pinned hero; re-pinning the same item keeps whoever pinned it first. */
export function pinnedHero(
  ref: TeamHeroRef,
  pinner: TeamHeroPinner | undefined,
  previous?: TeamHero
): TeamHero {
  const pinnedBy =
    previous?.mode === 'pinned' &&
    previous.ref &&
    previous.pinnedBy &&
    sameHeroRef(previous.ref, ref)
      ? previous.pinnedBy
      : pinner;
  return pinnedBy ? { mode: 'pinned', ref, pinnedBy } : { mode: 'pinned', ref };
}
