import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { OverflowMenu } from '@/components/common/OverflowMenu';

export interface StudioMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shortcut hint shown on the right, e.g. "Ctrl+D". */
  hint?: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Small action menu for Studio rows; portalled above the full-screen Studio. */
export const StudioMenu: React.FC<{
  label: string;
  items: StudioMenuItem[];
  triggerClassName: string;
  testId?: string;
  iconClassName?: string;
  anchor?: TourAnchorAttrs;
  itemAnchor?: (itemId: string) => TourAnchorAttrs;
}> = ({
  label,
  items,
  triggerClassName,
  testId,
  iconClassName = 'h-3.5 w-3.5',
  anchor,
  itemAnchor,
}) => (
  <OverflowMenu
    items={items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      hint: item.hint,
      disabled: item.disabled,
      onClick: item.onSelect,
      anchor: itemAnchor?.(item.id),
    }))}
    ariaLabel={label}
    triggerTitle={label}
    triggerAnchor={anchor}
    triggerTestId={testId}
    triggerClassName={triggerClassName}
    triggerContent={
      <MoreHorizontal className={iconClassName} aria-hidden="true" />
    }
    destructiveLast={false}
  />
);
