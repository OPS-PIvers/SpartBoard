/**
 * The Launch control a substitute gets on a shared activity (plan §3.6, D8).
 *
 * Renders nothing unless the org switch is on and the share carries a roster,
 * so a board looks exactly as it did before this shipped everywhere the
 * feature is not turned on. Once a run starts, the panel becomes the join code
 * the substitute reads to the class; monitoring it is the teacher's Results
 * view, which the sub reaches for the run they started (PR #3324).
 *
 * Sizes are container-query units because this mounts on a widget front face
 * (components/widgets/CLAUDE.md), and the join code has to carry to the back
 * of a classroom.
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

const PAD = 'min(8px, 2cqmin) min(12px, 3cqmin)';
const NOTE = 'min(11px, 3.5cqmin)';
const BODY = 'min(13px, 4cqmin)';
const ICON = 'min(16px, 4.5cqmin)';

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

  // A video activity has no code: students find it in their assignments, the
  // same way they would if the teacher had started it.
  if (status === 'launched' && result && !result.code) {
    return (
      <div className="text-center" style={{ padding: PAD }}>
        <p className="font-semibold text-white" style={{ fontSize: BODY }}>
          Started
        </p>
        <p
          className="text-slate-300"
          style={{ fontSize: NOTE, marginTop: 'min(4px, 1cqmin)' }}
        >
          Students will find it in their assignments. Running in the
          teacher&apos;s account, and their results will show it was started by
          you.
        </p>
      </div>
    );
  }

  if (status === 'launched' && result) {
    return (
      <div className="text-center" style={{ padding: PAD }}>
        <p className="text-slate-300" style={{ fontSize: NOTE }}>
          Students join with this code
        </p>
        <p
          className="font-bold tracking-widest text-white tabular-nums"
          style={{ fontSize: 'clamp(20px, 12cqmin, 64px)' }}
        >
          {result.code}
        </p>
        <p
          className="text-slate-300"
          style={{ fontSize: NOTE, marginTop: 'min(4px, 1cqmin)' }}
        >
          Running in the teacher&apos;s account. Their results will show it was
          started by you.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center" style={{ padding: PAD }}>
        <p className="text-slate-200" style={{ fontSize: NOTE }}>
          {error}
        </p>
        <button
          type="button"
          onClick={reset}
          className="font-medium text-slate-300 underline hover:text-white"
          style={{ fontSize: NOTE, marginTop: 'min(4px, 1cqmin)' }}
        >
          Back
        </button>
      </div>
    );
  }

  if (status === 'launching') {
    return (
      <div
        className="flex items-center justify-center text-slate-200"
        style={{ padding: PAD, gap: 'min(8px, 2cqmin)', fontSize: NOTE }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: ICON, height: ICON }}
          aria-hidden="true"
        />
        Starting {label}…
      </div>
    );
  }

  // One roster is the common case on a sub day, so it launches in one press
  // rather than making the substitute pick from a list of one.
  if (!picking) {
    return (
      <div style={{ padding: PAD }}>
        <button
          type="button"
          onClick={() =>
            rosters.length === 1
              ? void launch([rosters[0].id])
              : setPicking(true)
          }
          className="flex w-full items-center justify-center rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
          style={{ gap: 'min(8px, 2cqmin)', padding: PAD, fontSize: BODY }}
        >
          <Play style={{ width: ICON, height: ICON }} aria-hidden="true" />
          {rosters.length === 1
            ? `Start ${label} with ${rosters[0].name}`
            : `Start ${label}`}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: PAD }}>
      <p
        className="text-slate-300"
        style={{ fontSize: NOTE, marginBottom: 'min(4px, 1cqmin)' }}
      >
        Which class?
      </p>
      <div className="flex flex-col" style={{ gap: 'min(4px, 1cqmin)' }}>
        {rosters.map((roster) => (
          <button
            key={roster.id}
            type="button"
            onClick={() => void launch([roster.id])}
            className="rounded-lg bg-slate-700 text-left font-medium text-white hover:bg-slate-600"
            style={{ padding: PAD, fontSize: BODY }}
          >
            {roster.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPicking(false)}
        className="font-medium text-slate-300 underline hover:text-white"
        style={{ fontSize: NOTE, marginTop: 'min(4px, 1cqmin)' }}
      >
        Cancel
      </button>
    </div>
  );
};
