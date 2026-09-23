import React from 'react';
import { UserCheck } from 'lucide-react';
import type { SubLaunchedSessionFields } from '@/types';
import { launchedBySubLabel } from '@/utils/launchedBySub';

interface LaunchedBySubTagProps {
  /** The session's own stamp. Absent on every run the teacher started. */
  launchedBy: SubLaunchedSessionFields['launchedBy'];
  /** When the run started: `startedAt` on a quiz, `createdAt` on the rest. */
  at?: number | null;
  /** Set on a dark results surface, where slate-600 falls below AA. */
  onDark?: boolean;
}

/**
 * Says who started a run the teacher did not start themselves
 * (docs/plans/SUB_SHARE_COLLECTIONS.md §3.6). Renders nothing on the teacher's
 * own runs, which is every run without the stamp.
 */
export const LaunchedBySubTag: React.FC<LaunchedBySubTagProps> = ({
  launchedBy,
  at,
  onDark = false,
}) => {
  const label = launchedBySubLabel(launchedBy, at);
  if (!label) return null;
  return (
    <span
      data-testid="launched-by-sub"
      className={`inline-flex min-w-0 items-center font-medium ${
        onDark ? 'text-slate-300' : 'text-slate-600'
      }`}
      style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(11px, 3.2cqmin)' }}
    >
      <UserCheck
        aria-hidden="true"
        className="shrink-0"
        style={{ width: 'min(12px, 3.6cqmin)', height: 'min(12px, 3.6cqmin)' }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
};
