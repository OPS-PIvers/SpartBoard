/**
 * SharePlcResultsModal — retroactively pool an existing assignment's results
 * with a PLC (docs/plans/PLC_ASSESSMENT_DATA.md D12).
 *
 * Step 1 picks the PLC (skipped when the teacher belongs to exactly one).
 * Step 2 picks the pool: the PLC's live quiz assessments ranked by source
 * quiz, then exact title, plus a "Create new pool" option keyed on the
 * assignment's own sync group (or quiz id).
 */

import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Users2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { Plc, PlcCommonAssessment } from '@/types';
import { usePlcAssessments } from '@/hooks/usePlcAssessments';
import { getPlcMembers } from '@/utils/plc';
import { rankPoolCandidates } from '@/utils/plcPooling';

interface SharePlcResultsModalProps {
  /** PLCs the teacher belongs to; the caller only opens this with ≥ 1. */
  plcs: Plc[];
  assignment: {
    id: string;
    quizId: string;
    quizTitle: string;
    /** The assignment's own synced group; seeds the "Create new pool" key. */
    syncGroupId?: string;
  };
  onConfirm: (plc: Plc, poolSyncGroupId: string) => Promise<void>;
  onClose: () => void;
}

const NEW_POOL = '__new__';

export const SharePlcResultsModal: React.FC<SharePlcResultsModalProps> = ({
  plcs,
  assignment,
  onConfirm,
  onClose,
}) => {
  const [plcId, setPlcId] = useState<string>(
    plcs.length === 1 ? plcs[0].id : ''
  );
  const [step, setStep] = useState<'plc' | 'pool'>(
    plcs.length === 1 ? 'pool' : 'plc'
  );
  const [poolKey, setPoolKey] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlc = plcs.find((p) => p.id === plcId) ?? null;
  const { assessments, loading } = usePlcAssessments(
    step === 'pool' && selectedPlc ? selectedPlc.id : null
  );

  const ranked = useMemo(
    () =>
      rankPoolCandidates(
        assessments.filter((a) => a.kind === 'quiz'),
        { quizId: assignment.quizId, title: assignment.quizTitle }
      ),
    [assessments, assignment.quizId, assignment.quizTitle]
  );

  const newPoolKey = assignment.syncGroupId ?? assignment.quizId;
  // A pool that already exists under the new-pool key is the same choice.
  const existingForNewKey = ranked.find((a) => a.syncGroupId === newPoolKey);

  const resolvedPoolKey =
    poolKey === NEW_POOL ? newPoolKey : poolKey || undefined;
  const canSubmit = !!selectedPlc && !!resolvedPoolKey && !submitting;

  const handleSubmit = async () => {
    if (!selectedPlc || !resolvedPoolKey || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedPlc, resolvedPoolKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share results.');
      setSubmitting(false);
    }
  };

  const describe = (a: PlcCommonAssessment): string => {
    if (a.sourceQuizId && a.sourceQuizId === assignment.quizId)
      return 'Same quiz';
    return a.unitLabel ?? 'Existing pool';
  };

  return (
    <Modal
      isOpen
      onClose={submitting ? () => undefined : onClose}
      ariaLabel="Share results with PLC"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Users2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Share results with PLC
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {assignment.quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-4">
        {step === 'plc' && (
          <>
            <p className="text-xs text-slate-600">
              Pick which PLC should pool this assignment&apos;s results. No
              student names are shared.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar -mx-1 px-1">
              {plcs.map((plc) => (
                <label
                  key={plc.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                    plcId === plc.id
                      ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="share-results-plc"
                    value={plc.id}
                    checked={plcId === plc.id}
                    onChange={() => setPlcId(plc.id)}
                    className="h-4 w-4 accent-brand-blue-primary"
                    aria-label={plc.name}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">
                      {plc.name}
                    </div>
                    <div className="text-xxs text-slate-500">
                      {getPlcMembers(plc).length} members
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('pool')}
                disabled={!selectedPlc}
                className="px-4 py-2 text-xs font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 'pool' && selectedPlc && (
          <>
            <p className="text-xs text-slate-600">
              Choose which {selectedPlc.name} assessment these results belong
              to. Teammates running the same quiz should share one pool.
            </p>
            {loading ? (
              <div
                className="flex items-center gap-2 text-xs text-slate-500"
                role="status"
              >
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
                Loading assessments…
              </div>
            ) : (
              <div
                className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar -mx-1 px-1"
                role="radiogroup"
                aria-label="Pool"
              >
                {ranked.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                      poolKey === a.syncGroupId
                        ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="share-results-pool"
                      value={a.syncGroupId}
                      checked={poolKey === a.syncGroupId}
                      onChange={() => setPoolKey(a.syncGroupId)}
                      className="h-4 w-4 accent-brand-blue-primary"
                      disabled={submitting}
                      aria-label={a.title}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">
                        {a.title}
                      </div>
                      <div className="text-xxs text-slate-500">
                        {describe(a)}
                      </div>
                    </div>
                  </label>
                ))}
                {!existingForNewKey && (
                  <label
                    className={`flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 cursor-pointer transition-colors ${
                      poolKey === NEW_POOL
                        ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="share-results-pool"
                      value={NEW_POOL}
                      checked={poolKey === NEW_POOL}
                      onChange={() => setPoolKey(NEW_POOL)}
                      className="h-4 w-4 accent-brand-blue-primary"
                      disabled={submitting}
                      aria-label={`Create new pool: ${assignment.quizTitle}`}
                    />
                    <Plus
                      className="w-4 h-4 text-slate-500 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">
                        Create new pool: {assignment.quizTitle}
                      </div>
                      <div className="text-xxs text-slate-500">
                        Start a fresh assessment for this quiz
                      </div>
                    </div>
                  </label>
                )}
              </div>
            )}

            {error && (
              <div className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {plcs.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep('plc')}
                  disabled={submitting}
                  className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                  className="px-4 py-2 text-xs font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                >
                  {submitting && (
                    <Loader2
                      className="w-3.5 h-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  Share results
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
