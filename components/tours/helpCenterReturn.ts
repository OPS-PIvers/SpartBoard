import type { Toast } from '@/types';
import type { TourAnchorId } from '@/config/tourAnchors';
import { requestOpenHelpCenter, type TourOrigin } from './tourState';

const openTourId = 'board.help-center-toast-open' satisfies TourAnchorId;

// Help Center items the recorder filed in this tab, by set id, for the editor's Done.
const filed = new Map<string, string>();

/** Remembers the item a recording filed, so ending its edit selects or announces it. */
export const noteFiledHelpItem = (setId: string, itemId: string): void => {
  filed.set(setId, itemId);
};

/** Takes the item a recording filed for this set, once. */
export const takeFiledHelpItem = (setId: string): string | undefined => {
  const itemId = filed.get(setId);
  filed.delete(setId);
  return itemId;
};

/** The H2 toast button: opens Admin Settings > Help Center on the item. */
export const openInHelpCenterAction = (
  itemId: string,
  label: string
): NonNullable<Toast['action']> => ({
  label,
  tourId: openTourId,
  onClick: () => requestOpenHelpCenter({ selectId: itemId }),
});

/** Ends a recorded or edited tour: a Help Center start goes back there (H13), a widget recording toasts (H2). */
export function endTourSession(
  origin: TourOrigin | undefined,
  setId: string,
  announce: (itemId: string) => void
): void {
  const itemId = takeFiledHelpItem(setId);
  if (origin === 'help-center')
    requestOpenHelpCenter(itemId ? { selectId: itemId } : {});
  else if (origin === 'widget' && itemId) announce(itemId);
}
