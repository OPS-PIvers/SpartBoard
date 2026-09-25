import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  markHelpCenterSets,
  useGuidedLearning,
} from '@/hooks/useGuidedLearning';
import { isHelpCenterSet } from '@/components/widgets/GuidedLearning/utils/helpCenterSets';

interface LinkedLibrarySetsProps {
  /** Building sets the help items link to. */
  linkedSetIds: ReadonlySet<string>;
  onError: (message: string) => void;
}

/** Linked activities still listed in every teacher's library, with a way to keep them in Help only. */
export const LinkedLibrarySets: React.FC<LinkedLibrarySetsProps> = ({
  linkedSetIds,
  onError,
}) => {
  const { buildingSets } = useGuidedLearning(undefined);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const inLibrary = buildingSets.filter(
    (set) => linkedSetIds.has(set.id) && !isHelpCenterSet(set)
  );
  if (inLibrary.length === 0) return null;

  const keepInHelp = async (setIds: string[]) => {
    setBusy(new Set(setIds));
    try {
      await markHelpCenterSets(setIds);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(new Set());
    }
  };

  return (
    <section
      aria-label="Linked activities in the Guided Learning library"
      className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-700">
          These also appear in teachers&apos; libraries.
        </p>
        {inLibrary.length > 1 && (
          <button
            type="button"
            disabled={busy.size > 0}
            onClick={() => void keepInHelp(inLibrary.map((set) => set.id))}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Move all to Help only
          </button>
        )}
      </div>
      <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
        {inLibrary.map((set) => (
          <li
            key={set.id}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm text-slate-700">
              {set.title || 'Untitled activity'}
            </span>
            <button
              type="button"
              disabled={busy.size > 0}
              onClick={() => void keepInHelp([set.id])}
              aria-label={`Move ${set.title || 'Untitled activity'} to Help only`}
              className="flex shrink-0 items-center gap-1 px-2 py-1 rounded-md text-sm font-semibold text-brand-blue-primary hover:bg-slate-100 disabled:opacity-50"
            >
              {busy.has(set.id) && (
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
              )}
              Help only
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
