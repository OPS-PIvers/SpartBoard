/**
 * The Launch control a substitute gets on a shared activity (plan §3.6, D8).
 *
 * Renders nothing unless the org switch is on and the share carries a roster,
 * so a board looks exactly as it did before this shipped everywhere the
 * feature is not turned on. Once a run starts, the panel becomes the join code
 * the substitute reads to the class; monitoring it is the teacher's Results
 * view, which the sub reaches for the run they started (PR #3324).
 */

import React, { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { useSubLaunch } from '@/hooks/useSubLaunch';
import { useSubLaunchAsTeacherSettings } from '@/hooks/useSubLaunchAsTeacherSettings';
import { useSubShareRosters } from '@/hooks/useShareContent';
import type { SubShareContentKind } from '@/types';

interface SubLaunchPanelProps {
  kind: SubShareContentKind;
  widgetId: string;
  itemId: string | null | undefined;
  /** What the substitute is starting, for the button's own words. */
  label: string;
}

export const SubLaunchPanel: React.FC<SubLaunchPanelProps> = ({
  kind,
  widgetId,
  itemId,
  label,
}) => {
  const rosters = useSubShareRosters();
  const { enabled } = useSubLaunchAsTeacherSettings();
  const { status, result, error, launch, reset } = useSubLaunch(
    kind,
    widgetId,
    itemId
  );
  const [picking, setPicking] = useState(false);

  // No switch, no item, or no class the teacher shared: there is nothing this
  // panel could legitimately start, so it stays absent rather than disabled.
  if (!enabled || !itemId || rosters.length === 0) return null;

  if (status === 'launched' && result) {
    return (
      <div className="px-3 py-2 text-center">
        <p className="text-xs text-slate-300">Students join with this code</p>
        <p className="text-2xl font-bold tracking-widest text-white tabular-nums">
          {result.code}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Running in the teacher&apos;s account. Their results will show it was
          started by you.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="px-3 py-2 text-center">
        <p className="text-xs text-slate-200">{error}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-1 text-xs font-medium text-slate-300 underline hover:text-white"
        >
          Back
        </button>
      </div>
    );
  }

  if (status === 'launching') {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Starting {label}…
      </div>
    );
  }

  // One roster is the common case on a sub day, so it launches in one press
  // rather than making the substitute pick from a list of one.
  if (!picking) {
    return (
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() =>
            rosters.length === 1
              ? void launch([rosters[0].id])
              : setPicking(true)
          }
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {rosters.length === 1
            ? `Start ${label} with ${rosters[0].name}`
            : `Start ${label}`}
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <p className="mb-1 text-xs text-slate-300">Which class?</p>
      <div className="flex flex-col gap-1">
        {rosters.map((roster) => (
          <button
            key={roster.id}
            type="button"
            onClick={() => void launch([roster.id])}
            className="rounded-lg bg-slate-700 px-3 py-2 text-left text-sm font-medium text-white hover:bg-slate-600"
          >
            {roster.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPicking(false)}
        className="mt-1 text-xs font-medium text-slate-300 underline hover:text-white"
      >
        Cancel
      </button>
    </div>
  );
};
