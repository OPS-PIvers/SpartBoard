// Hands the Program Hub the shell's card and hero registries, which it can't import without a cycle.

import type { ComponentType } from 'react';
import type { TeamHeroRef } from '@/types';
import { registerMentoringForeignViews } from './mentoring/teamRegistryBridge';
import { TEAM_CARD_REGISTRY } from './cardRegistry';
import { TEAM_HERO_BY_KIND } from './heroes/heroRegistry';
import type { TeamHeroProps } from './types';

const heroComponents = new Map<
  TeamHeroRef['kind'],
  ComponentType<TeamHeroProps>
>();

function heroComponent(
  kind: TeamHeroRef['kind']
): ComponentType<TeamHeroProps> | null {
  const entry = TEAM_HERO_BY_KIND[kind];
  if (!entry) return null;
  let component = heroComponents.get(kind);
  if (!component) {
    const render = entry.render;
    component = (props: TeamHeroProps) => render(props);
    heroComponents.set(kind, component);
  }
  return component;
}

registerMentoringForeignViews({
  card: (id) => TEAM_CARD_REGISTRY[id].Component,
  hero: heroComponent,
});
