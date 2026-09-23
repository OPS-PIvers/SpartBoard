import type { GuidedLearningSet } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';

// Library source-filter value that lists only the Help Center's own sets.
export const HELP_CENTER_SOURCE = 'help';

// Building sets any help item points at; covers sets published before the helpCenter flag existed.
export const helpCenterSetIdsOf = (
  items: readonly HelpResourceItem[]
): ReadonlySet<string> =>
  new Set(
    items.flatMap((item) =>
      item.kind === 'guided-learning' && item.setId ? [item.setId] : []
    )
  );

export const isHelpCenterSet = (
  set: Pick<GuidedLearningSet, 'id' | 'helpCenter'>,
  referencedIds: ReadonlySet<string>
): boolean => set.helpCenter === true || referencedIds.has(set.id);
