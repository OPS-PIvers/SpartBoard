import type {
  GuidedLearningBuildingSetIndex,
  GuidedLearningSet,
} from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';

// Library source-filter value that lists only the Help Center's own sets.
export const HELP_CENTER_SOURCE = 'help';

export const helpCenterSetIdsOf = (
  items: readonly HelpResourceItem[]
): ReadonlySet<string> =>
  new Set(
    items.flatMap((item) =>
      item.kind === 'guided-learning' && item.setId ? [item.setId] : []
    )
  );

// Only the explicit flag counts: a shared building set a help item links to stays in the library.
export const isHelpCenterSet = (
  set:
    | Pick<GuidedLearningSet, 'helpCenter'>
    | Pick<GuidedLearningBuildingSetIndex, 'isHelpCenter'>
): boolean =>
  ('helpCenter' in set && set.helpCenter === true) ||
  ('isHelpCenter' in set && set.isHelpCenter === true);
