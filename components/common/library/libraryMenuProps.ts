import { tourFieldAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import type { OverflowMenuProps } from '@/components/common/OverflowMenu';

/** Library card and assignment-row look and tour tags for the shared OverflowMenu. */
export function libraryMenuProps({
  rowKey,
  widgetType,
  archive = false,
  anchor,
}: {
  /** `row-${index+1}` for the owning card, or undefined to skip tour tagging. */
  rowKey?: string;
  widgetType: string;
  /** Assignment rows keep their own tour anchor ids and a slightly smaller trigger. */
  archive?: boolean;
  /** Tour anchor for the trigger when the menu has no rowKey. */
  anchor?: TourAnchorAttrs;
}): Partial<OverflowMenuProps> {
  const box = archive ? 'min(30px, 8cqmin)' : 'min(32px, 9cqmin)';
  return {
    triggerAnchor: !rowKey
      ? anchor
      : archive
        ? tourFieldAttr('library-shell.archive-menu', widgetType, rowKey)
        : tourFieldAttr('library-shell.card-menu', widgetType, rowKey),
    itemAnchor: !rowKey
      ? undefined
      : archive
        ? (path) =>
            tourFieldAttr(
              'library-shell.archive-menu-item',
              widgetType,
              `${rowKey}-item-${path}`
            )
        : (path) =>
            tourFieldAttr(
              'library-shell.card-menu-item',
              widgetType,
              `${rowKey}-item-${path}`
            ),
    triggerClassName:
      'rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    triggerStyle: { width: box, height: box },
    iconStyle: { width: 'min(16px, 4.5cqmin)', height: 'min(16px, 4.5cqmin)' },
  };
}
