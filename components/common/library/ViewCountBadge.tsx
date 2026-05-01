/**
 * ViewCountBadge — inline metadata chip for view-only assignment cards.
 *
 * Shows "👁 N views" next to the title on Shared / Archive rows for
 * view-only assignments across Quiz / Video Activity / Mini App / Guided
 * Learning. Render via `AssignmentArchiveCard.meta`.
 *
 * `count === null` (loading or unavailable) renders nothing — we'd rather
 * show no metric at all than flicker a "0 views" placeholder.
 */

import React from 'react';
import { Eye } from 'lucide-react';

interface ViewCountBadgeProps {
  count: number | null;
}

export const ViewCountBadge: React.FC<ViewCountBadgeProps> = ({ count }) => {
  if (count === null) return null;
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
