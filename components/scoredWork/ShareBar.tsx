import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { usePlcs } from '@/hooks/usePlcs';
import {
  publishScoredWorkToPlc,
  withdrawScoredWorkFromPlc,
} from '@/hooks/useScoredWork';
import { Button } from '@/components/common/Button';
import type { ScoredWork, ScoredWorkScore } from '@/types';

interface ShareBarProps {
  work: ScoredWork;
  scores: readonly ScoredWorkScore[];
}

/** One row: pick a group once, share counts only. Names and scans never leave Drive. */
export const ShareBar: React.FC<ShareBarProps> = ({ work, scores }) => {
  const { addToast } = useDashboard();
  const { plcs } = usePlcs();
  const [plcId, setPlcId] = useState(
    work.plc?.plcId ?? work.shareWith?.plcId ?? ''
  );
  const [busy, setBusy] = useState(false);
  const seriesLabel = work.plc?.seriesLabel ?? work.title;
  const sharedWith = plcs.find((p) => p.id === work.plc?.plcId);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      addToast(done, 'success');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'That did not go through.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  if (plcs.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2 text-slate-700">
        Share with
        <select // no-tour-anchor: preview feature, tours are added when it opens
          value={plcId}
          onChange={(e) => setPlcId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="">Choose a group</option>
          {plcs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={busy || !plcId || scores.length === 0}
        isLoading={busy}
        onClick={() =>
          void run(
            () =>
              publishScoredWorkToPlc({ workId: work.id, plcId, seriesLabel }),
            'Shared with your group.'
          )
        }
        icon={<Share2 className="w-4 h-4" aria-hidden="true" />}
        title="Shares counts only, with no names or scans. Teachers who use the same worksheet name are pooled."
      >
        {work.plc ? 'Update shared results' : 'Share'}
      </Button>
      {work.plc && (
        <>
          <span className="text-slate-600">
            Shared with {sharedWith?.name ?? 'your group'}
          </span>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(
                () => withdrawScoredWorkFromPlc(work.id),
                'Removed from your group.'
              )
            }
          >
            Stop sharing
          </Button>
        </>
      )}
    </div>
  );
};
