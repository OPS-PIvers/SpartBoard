import React, { useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { usePlcs } from '@/hooks/usePlcs';
import {
  publishScoredWorkToPlc,
  withdrawScoredWorkFromPlc,
} from '@/hooks/useScoredWork';
import { Button } from '@/components/common/Button';
import type { ScoredWork, ScoredWorkScore } from '@/types';

interface ShareStepProps {
  work: ScoredWork;
  scores: readonly ScoredWorkScore[];
}

export const ShareStep: React.FC<ShareStepProps> = ({ work, scores }) => {
  const { addToast } = useDashboard();
  const { plcs } = usePlcs();
  const [plcId, setPlcId] = useState(work.plc?.plcId ?? '');
  const [label, setLabel] = useState(work.plc?.seriesLabel ?? work.title);
  const [busy, setBusy] = useState(false);
  const linked = plcs.find((p) => p.id === work.plc?.plcId);

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

  return (
    <div className="space-y-4 max-w-xl">
      {work.plc && (
        <p className="text-sm text-slate-700">
          Shared with {linked?.name ?? 'your group'} as {work.plc.seriesLabel}.
          Share again to update it.
        </p>
      )}

      <label className="block text-sm">
        <span className="block font-semibold text-slate-700 mb-1">Group</span>
        <select
          value={plcId}
          onChange={(e) => setPlcId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="">Choose a group</option>
          {plcs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span
          className="block font-semibold text-slate-700 mb-1"
          title="Teachers who use the same name are pooled together."
        >
          Series name
        </span>
        <input
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      <p className="text-xs text-slate-600">
        Shares counts per rubric level for {scores.length} scored students. No
        names or scans.
      </p>

      <div className="flex gap-2">
        <Button
          disabled={busy || !plcId || !label.trim() || scores.length === 0}
          isLoading={busy}
          onClick={() =>
            void run(
              () =>
                publishScoredWorkToPlc({
                  workId: work.id,
                  plcId,
                  seriesLabel: label.trim(),
                }),
              'Shared with your group.'
            )
          }
        >
          Share with group
        </Button>
        {work.plc && (
          <Button
            variant="secondary"
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
        )}
      </div>
    </div>
  );
};
