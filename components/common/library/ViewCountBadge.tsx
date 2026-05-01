/**
 * ViewCountBadge — inline metadata chip for view-only assignment cards.
 *
 * Shows "👁 N views" next to the title on Shared / Archive rows for
 * view-only assignments across Quiz / Video Activity / Mini App / Guided
 * Learning. Render via `AssignmentArchiveCard.meta`.
 *
 * While the count is in flight (`count === null` from `useSessionViewCount`)
 * we render a width-stable invisible placeholder so the meta line doesn't
 * jump width when the real count arrives. The placeholder is `aria-hidden`
 * and unselectable so screen readers don't announce a phantom value.
 */

import React from 'react';
import { Eye } from 'lucide-react';

interface ViewCountBadgeProps {
  count: number | null;
}

export const ViewCountBadge: React.FC<ViewCountBadgeProps> = ({ count }) => {
  if (count === null) {
    // Width-stable placeholder. Width matches "0 views" — close enough to
    // the typical resolved width that the layout shift is invisible. Using
    // `visibility: hidden` (not `display: none`) preserves the box.
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 select-none"
        style={{ visibility: 'hidden' }}
      >
        <Eye aria-hidden="true" className="w-3 h-3 shrink-0" />
        <span>0 views</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
      title={count === 1 ? 'Link opened 1 time' : `Link opened ${count} times`}
    >
      <Eye className="w-3 h-3 shrink-0" />
      <span>
        {count} {count === 1 ? 'view' : 'views'}
      </span>
    </span>
  );
};
